import { stableKey } from './identity';
import { collectControls, formIndex } from '../page/collect';
import { describeControl, isEmpty } from '../page/describe';
import { isShown } from '../page/visibility';
import { rememberControls, recallControl } from '../page/refs';
import { fillText, fillSelect, fillRadio } from '../page/fill';
import { extractJob } from '../page/job';
import { detectAts } from '../ats';
import type { ScannedField, PageEnv, Control, JobInfo } from '../types';
export interface NativeField extends ScannedField { maxLength: number }
export interface NativeScan { scanId: string; url: string; shown: boolean; job: JobInfo; fields: NativeField[] }
export type NativeAction = { ref: number; signature: string } & ({ type: 'text' | 'answer'; value: string } | { type: 'select' | 'radio'; index: number });
export interface NativeCommand { job?: JobInfo; scanId: string; url: string; actions: NativeAction[] }
const world = globalThis as typeof globalThis & { __jaaScan?: { id: string; url: string }; __jaaCommand?: NativeCommand };
const maximum = (c: Control) => c.control === 'text' || c.control === 'textarea' ? c.el.maxLength : -1;
export const signature = (f: NativeField): string => stableKey({ descriptor: f.descriptor, form: f.form, maxLength: f.maxLength });
function shownFrame(doc: Document, env: PageEnv): boolean {
 try { if (!doc.defaultView) return false; let w: Window = doc.defaultView; while (w.top !== w) { if (!w.frameElement || !env.isRendered(w.frameElement)) return false; w = w.parent; } return true; } catch { return false; }
}
export function scanNative(doc: Document, env: PageEnv): NativeScan {
 const url = doc.location.href; const scanId = crypto.randomUUID(); world.__jaaScan = { id: scanId, url };
 const shown = shownFrame(doc, env);
 const controls = shown ? collectControls(doc).filter(c => isShown(c, env)).slice(0, 400) : [];
 const refs = rememberControls(controls);
 return { scanId, url, shown, job: extractJob(doc, detectAts(url)), fields: controls.map((c, i) => ({ ref: refs[i]!, form: formIndex(c), descriptor: describeControl(c), empty: isEmpty(c), maxLength: maximum(c) })) };
}
function currentDocument(doc: Document, env: PageEnv, command: NativeCommand): boolean {
 return world.__jaaScan?.id === command.scanId && world.__jaaScan.url === command.url && doc.location.href === command.url && shownFrame(doc, env) && (!command.job || stableKey(extractJob(doc, detectAts(command.url))) === stableKey(command.job));
}
export function inspectNative(doc: Document, env: PageEnv, command: NativeCommand): boolean {
 return currentDocument(doc, env, command) && command.actions.every(a => { const c = recallControl(a.ref); return c && isShown(c, env) && isEmpty(c) && signature({ ref: a.ref, form: formIndex(c), descriptor: describeControl(c), empty: true, maxLength: maximum(c) }) === a.signature; });
}
export function verifyNative(doc: Document, env: PageEnv, command: NativeCommand): { ref: number; ok: boolean }[] {
 return command.actions.map(a => {
  const c = recallControl(a.ref);
  if (!c || !currentDocument(doc, env, command) || !isShown(c, env) || signature({ ref: a.ref, form: formIndex(c), descriptor: describeControl(c), empty: false, maxLength: maximum(c) }) !== a.signature) return { ref: a.ref, ok: false };
  const ok = 'value' in a ? ((c.control === 'text' || c.control === 'textarea') && c.el.value === a.value) : a.type === 'select' ? c.control === 'select' && c.el.selectedIndex === a.index : c.control === 'radio' && c.radios[a.index]?.checked === true;
  return { ref: a.ref, ok };
 });
}
export function applyNative(doc: Document, env: PageEnv, command: NativeCommand): { ref: number; ok: boolean }[] {
 return command.actions.map(action => {
  let ok = false;
  if (!currentDocument(doc, env, command)) return { ref: action.ref, ok };
  const c = recallControl(action.ref);
  if (!c || !collectControls(doc).some(current => current.el === c.el) || !isShown(c, env) || !isEmpty(c)) return { ref: action.ref, ok };
  const current: NativeField = { ref: action.ref, form: formIndex(c), descriptor: describeControl(c), empty: true, maxLength: maximum(c) };
  if (signature(current) !== action.signature) return { ref: action.ref, ok };
  if ((action.type === 'text' && c.control === 'text') || (action.type === 'answer' && c.control === 'textarea')) {
   if (action.value && (maximum(c) < 0 || action.value.length <= maximum(c))) { fillText(c.el, action.value); ok = c.el.value === action.value; }
  } else if (action.type === 'select' && c.control === 'select') ok = fillSelect(c.el, action.index);
  else if (action.type === 'radio' && c.control === 'radio') { const radio = c.radios[action.index]; if (radio) ok = fillRadio(radio); }
  return { ref: action.ref, ok };
 });
}
export function consumeCommand(): NativeCommand | undefined { const c = world.__jaaCommand; delete world.__jaaCommand; return c; }
