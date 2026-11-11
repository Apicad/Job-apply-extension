import { sanitizeNativeDescriptor, sanitizeJob } from '../report';
import type { NativeOutcome } from './outcomes';
import { stableKey } from './identity';
import { collectControls, formIndex } from '../page/collect';
import { describeControl, isEmpty } from '../page/describe';
import { isShown } from '../page/visibility';
import { rememberControls, recallControl } from '../page/refs';
import { fillText, fillSelect, fillRadio, fillFile } from '../page/fill';
import { acceptsFile, isStoredResume, resumeToFile } from '../resume';
import { classifyField } from '../classify';
import { extractJob } from '../page/job';
import { detectAts } from '../ats';
import { textReadbackMatches, rememberUpload, uploadedFileVisible, mayVerifyNativeUpload, type UploadWitness } from './readback';
import { fillGreenhouseCombobox, verifyGreenhouseCombobox, type GreenhouseTarget } from '../page/greenhouse';
import type { ScannedField, PageEnv, Control, JobInfo, StoredResume } from '../types';
export interface NativeField extends ScannedField { maxLength: number }
export interface NativeScan { scanId: string; url: string; shown: boolean; job: JobInfo; fields: NativeField[] }
export type NativeAction = { ref: number; signature: string; education?: { schoolRef: number; signature: string; value: string } } & ({ type: 'text' | 'answer'; value: string } | { type: 'select' | 'radio'; index: number } | { type: 'file'; resume: StoredResume } | { type: 'combobox'; target: GreenhouseTarget });
export interface NativeCommand { job?: JobInfo; scanId: string; url: string; actions: NativeAction[] }
const world = globalThis as typeof globalThis & { __jaaScan?: { id: string; url: string }; __jaaCommand?: NativeCommand };
const uploads = new Map<number, { scanId: string; signature: string; resume: StoredResume; witness: UploadWitness }>();
const maximum = (c: Control) => c.control === 'text' || c.control === 'textarea' ? c.el.maxLength : -1;
export const signature = (f: NativeField): string | null => { const descriptor = sanitizeNativeDescriptor(f.descriptor); return descriptor ? stableKey({ descriptor, form: f.form, maxLength: f.maxLength }) : null; };
function shownFrame(doc: Document, env: PageEnv): boolean {
 try { if (!doc.defaultView) return false; let w: Window = doc.defaultView; while (w.top !== w) { if (!w.frameElement || !env.isRendered(w.frameElement)) return false; w = w.parent; } return true; } catch { return false; }
}
export function scanNative(doc: Document, env: PageEnv): NativeScan {
 uploads.clear();
 const url = doc.location.href; const scanId = crypto.randomUUID(); world.__jaaScan = { id: scanId, url };
 const shown = shownFrame(doc, env);
 const controls = shown ? collectControls(doc).filter(c => isShown(c, env)).slice(0, 400) : [];
 const refs = rememberControls(controls);
 return { scanId, url, shown, job: sanitizeJob(extractJob(doc, detectAts(url)))!, fields: controls.flatMap((c, i) => { const descriptor = sanitizeNativeDescriptor(describeControl(c)); return descriptor ? [{ ref: refs[i]!, form: formIndex(c), descriptor, empty: isEmpty(c), maxLength: maximum(c) }] : []; }) };
}
function currentDocument(doc: Document, env: PageEnv, command: NativeCommand): boolean {
 return world.__jaaScan?.id === command.scanId && world.__jaaScan.url === command.url && doc.location.href === command.url && shownFrame(doc, env) && (!command.job || stableKey(sanitizeJob(extractJob(doc, detectAts(command.url)))) === stableKey(command.job));
}
/** Dates and qualifications belong only to the exact school selected for this row. */
function educationCurrent(action: NativeAction, target: Control | null, env: PageEnv): boolean {
 const dependency = action.education;
 if (!dependency) return true;
 if (!target || !Number.isInteger(dependency.schoolRef) || typeof dependency.value !== 'string') return false;
 const school = recallControl(dependency.schoolRef);
 if (!school || school.control !== 'combobox' || !isShown(school, env) || formIndex(school) !== formIndex(target)) return false;
 const descriptor = describeControl(school); const row = /^school--(\d+)$/.exec(descriptor.id);
 const child = /^(?:degree|discipline|end-(?:date-)?month|end-(?:date-)?year)--(\d+)$/.exec(describeControl(target).id);
 if (!row || !child || row[1] !== child[1] || classifyField(descriptor) !== 'school') return false;
 if (signature({ ref: dependency.schoolRef, form: formIndex(school), descriptor, empty: false, maxLength: maximum(school) }) !== dependency.signature) return false;
 return verifyGreenhouseCombobox(school.el, { kind: 'school', value: dependency.value }, env);
}
export function inspectNative(doc: Document, env: PageEnv, command: NativeCommand): boolean {
 return currentDocument(doc, env, command) && command.actions.every(a => { const c = recallControl(a.ref); return c && isShown(c, env) && isEmpty(c) && signature({ ref: a.ref, form: formIndex(c), descriptor: describeControl(c), empty: true, maxLength: maximum(c) }) === a.signature; });
}
export function verifyNative(doc: Document, env: PageEnv, command: NativeCommand): { ref: number; ok: boolean }[] {
 return command.actions.map(a => {
  if (!currentDocument(doc, env, command)) return { ref: a.ref, ok: false };
  if (!educationCurrent(a, recallControl(a.ref), env)) return { ref: a.ref, ok: false };
  if (a.type === 'file') {
   const upload = uploads.get(a.ref);
   if (upload && upload.scanId === command.scanId && upload.signature === a.signature && upload.resume === a.resume) {
    if (uploadedFileVisible(upload.witness, doc, env)) return { ref: a.ref, ok: true };
    if (!mayVerifyNativeUpload(upload.witness, doc, env)) return { ref: a.ref, ok: false };
   }
  }
  const c = recallControl(a.ref);
  if (!c || !isShown(c, env) || signature({ ref: a.ref, form: formIndex(c), descriptor: describeControl(c), empty: false, maxLength: maximum(c) }) !== a.signature) return { ref: a.ref, ok: false };
  const ok = 'value' in a ? ((c.control === 'text' || c.control === 'textarea') && textReadbackMatches(describeControl(c), a.value, c.el.value) && c.el.validity.valid) : a.type === 'select' ? c.control === 'select' && c.el.selectedIndex === a.index && c.el.validity.valid : a.type === 'radio' ? c.control === 'radio' && c.radios[a.index]?.checked === true && c.radios[a.index]?.validity.valid === true : a.type === 'combobox' ? c.control === 'combobox' && verifyGreenhouseCombobox(c.el, a.target, env) : a.type === 'file' && c.control === 'file' && fileMatches(c.el, a.resume);
  return { ref: a.ref, ok };
 });
}
function fileMatches(input: HTMLInputElement, resume: StoredResume): boolean {
 const file = input.files?.[0];
 return input.files?.length === 1 && !!file && file.name === resume.name && file.type === resume.type && file.size === resume.size && input.validity.valid;
}
export function applyNative(doc: Document, env: PageEnv, command: NativeCommand): NativeOutcome[] {
 return command.actions.map(action => {
  let written = false; let ok = false;
  const refused: NativeOutcome = { ref: action.ref, ok: false, status: 'refused' };
  if (!currentDocument(doc, env, command)) return refused;
  const c = recallControl(action.ref);
  if (!c || !collectControls(doc).some(current => current.el === c.el) || !isShown(c, env) || !isEmpty(c)) return refused;
  const current: NativeField = { ref: action.ref, form: formIndex(c), descriptor: describeControl(c), empty: true, maxLength: maximum(c) };
  if (signature(current) !== action.signature || !educationCurrent(action, c, env)) return refused;
  const onWrite = () => { written = true; };
  try {
   if ((action.type === 'text' && c.control === 'text') || (action.type === 'answer' && c.control === 'textarea')) {
    if (action.value && (maximum(c) < 0 || action.value.length <= maximum(c))) { fillText(c.el, action.value, onWrite); ok = textReadbackMatches(current.descriptor, action.value, c.el.value) && c.el.validity.valid; }
   } else if (action.type === 'select' && c.control === 'select') ok = fillSelect(c.el, action.index, onWrite) && c.el.validity.valid;
   else if (action.type === 'radio' && c.control === 'radio') { const radio = c.radios[action.index]; if (radio) ok = fillRadio(radio, onWrite) && radio.validity.valid; }
   else if (action.type === 'file' && c.control === 'file' && classifyField(current.descriptor) === 'resume' && isStoredResume(action.resume) && acceptsFile(c.el.accept, action.resume)) {
    const file = resumeToFile(action.resume);
    const witness = rememberUpload(c.el, current.descriptor, action.resume.name);
    if (witness) uploads.set(action.ref, { scanId: command.scanId, signature: action.signature, resume: action.resume, witness });
    ok = fillFile(c.el, file, (input, files) => { onWrite(); env.assignFiles(input, files); }) && fileMatches(c.el, action.resume);
   }
  } catch { /* A malformed file or hostile control cannot stop the remaining fields. */ }
  return { ref: action.ref, ok: written && ok, status: written ? ok ? 'verified' : 'written-unverified' : 'refused' };
 });
}
/** Custom lists are asynchronous; every action gets a fresh guard after the preceding one. */
export async function applyNativeAsync(doc: Document, env: PageEnv, command: NativeCommand): Promise<NativeOutcome[]> {
 const outcomes: NativeOutcome[] = [];
 for (const action of command.actions) {
  if (action.type !== 'combobox') { outcomes.push(...applyNative(doc, env, { ...command, actions: [action] })); continue; }
  let written = false; let ok = false;
  const c = recallControl(action.ref);
  const stillCurrent = () => !!c && c.control === 'combobox' && recallControl(action.ref)?.el === c.el && currentDocument(doc, env, command) && isShown(c, env) &&
   signature({ ref: action.ref, form: formIndex(c), descriptor: describeControl(c), empty: isEmpty(c), maxLength: maximum(c) }) === action.signature && educationCurrent(action, c, env);
  if (c?.control === 'combobox' && stillCurrent() && isEmpty(c) && collectControls(doc).some(current => current.el === c.el)) {
   try { ok = await fillGreenhouseCombobox(c.el, action.target, env, stillCurrent, () => { written = true; }); } catch { /* Fail closed after a partial interaction; no retries. */ }
  }
  outcomes.push({ ref: action.ref, ok: written && ok, status: written ? ok ? 'verified' : 'written-unverified' : 'refused' });
 }
 return outcomes;
}

/** Observe upload completion without clicking, retrying an upload, or rewriting a value. */
export async function settleNativeVerification(doc: Document, env: PageEnv, command: NativeCommand, written: NativeOutcome[]): Promise<NativeOutcome[]> {
 const started = Date.now();
 await new Promise(resolve => setTimeout(resolve, 100));
 let verified = verifyNative(doc, env, command);
 while (currentDocument(doc, env, command) && Date.now() - started < 5000 && command.actions.some(action => action.type === 'file' && written.some(outcome => outcome.ref === action.ref && outcome.status !== 'refused') && !verified.some(result => result.ref === action.ref && result.ok))) {
  await new Promise(resolve => setTimeout(resolve, 100));
  verified = verifyNative(doc, env, command);
 }
 return written.map(outcome => {
  const action = command.actions.find(item => item.ref === outcome.ref);
  const ok = outcome.status !== 'refused' && (outcome.ok || action?.type === 'file') && verified.some(result => result.ref === outcome.ref && result.ok);
  return { ...outcome, ok, status: outcome.status === 'refused' ? 'refused' : ok ? 'verified' : 'written-unverified' };
 });
}
export function consumeCommand(): NativeCommand | undefined { const c = world.__jaaCommand; delete world.__jaaCommand; return c; }
