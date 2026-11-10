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
export interface NativeCommand { scanId: string; url: string; actions: NativeAction[] }
const world = globalThis as typeof globalThis & { __jaaScan?: { id: string; url: string }; __jaaCommand?: NativeCommand };
const maximum = (c: Control) => c.control === 'text' || c.control === 'textarea' ? c.el.maxLength : -1;
export const signature = (f: NativeField): string => stableKey({ descriptor: f.descriptor, form: f.form, maxLength: f.maxLength });
function shownFrame(doc: Document, env: PageEnv): boolean {
 try { const w = doc.defaultView; if (!w || w.top === w) return true; return !!w.frameElement && env.isRendered(w.frameElement); } catch { return false; }
}
export function scanNative(doc: Document, env: PageEnv): NativeScan {
 const url = doc.location.href; const scanId = crypto.randomUUID(); world.__jaaScan = { id: scanId, url };
 const shown = shownFrame(doc, env);
 const controls = shown ? collectControls(doc).filter(c => isShown(c, env)).slice(0, 400) : [];
 const refs = rememberControls(controls);
 return { scanId, url, shown, job: extractJob(doc, detectAts(url)), fields: controls.map((c, i) => ({ ref: refs[i]!, form: formIndex(c), descriptor: describeControl(c), empty: isEmpty(c), maxLength: maximum(c) })) };
}
export function applyNative(doc: Document, env: PageEnv, command: NativeCommand): { ref: number; ok: boolean }[] {
 return command.actions.map(action => {
  let ok = false;
  if (world.__jaaScan?.id !== command.scanId || world.__jaaScan.url !== command.url || doc.location.href !== command.url || !shownFrame(doc, env)) return { ref: action.ref, ok };
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
