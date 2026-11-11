import type { NativeOutcome } from './outcomes';
import { stableKey } from './identity';
import { classifyField } from '../classify';
import { textValueFor } from '../profile';
import { pickChoice } from '../choices';
import { acceptsFile, isStoredResume } from '../resume';
import type { FieldDescriptor, Profile, JobInfo, StoredResume } from '../types';
import type { NativeScan, NativeField, NativeAction } from './page';
export interface Frame { frameId: number; documentId: string; scan: NativeScan }
export interface Row { job: JobInfo; documentId: string; frameId: number; scanId: string; url: string; field: NativeField; action: NativeAction | null; status: string }
export interface NativePlan { id: string; tabId: number; url: string; profileKey: string; resumeKey?: string; rows: Row[]; state: 'preview' | 'executing' | 'finished' | 'invalidated'; answerBinding?: { id: string; revision: number; savedId?: string }; errors?: string[]; outcomes?: (NativeOutcome & { documentId: string })[] }
export const fieldSignature = (descriptor: FieldDescriptor, form: number, maxLength: number): string => stableKey({ descriptor, form, maxLength });
/** Scope automatic drafting to the same application group as basic autofill. */
export function eligibleApplicationRows(rows: Row[]): Row[] {
 const groups = [...new Set(rows.map(row => stableKey([row.documentId, row.field.form])))].map(id => {
  const members = rows.filter(row => stableKey([row.documentId, row.field.form]) === id);
  const kinds = members.map(row => classifyField(row.field.descriptor));
  const eligible = kinds.includes('resume') || (kinds.some(kind => kind === 'firstName' || kind === 'fullName') && kinds.includes('email') && new Set(kinds.filter(Boolean)).size >= 3);
  return { members, eligible, count: kinds.filter(Boolean).length };
 }).filter(group => group.eligible).sort((a, b) => b.count - a.count);
 return groups[0]?.members ?? [];
}
export function planNative(frames: Frame[], profile: Profile, resume: StoredResume | null = null): Row[] {
 const groups = frames.flatMap(frame => [...new Set(frame.scan.fields.map(f => f.form))].map(form => {
  const fields = frame.scan.fields.filter(f => f.form === form); const kinds = fields.map(f => classifyField(f.descriptor));
  const eligible = kinds.includes('resume') || (kinds.some(k => k === 'firstName' || k === 'fullName') && kinds.includes('email') && new Set(kinds.filter(Boolean)).size >= 3);
  return { frame, form, eligible, count: kinds.filter(Boolean).length };
 })).filter(g => g.frame.scan.shown && g.eligible).sort((a, b) => b.count - a.count);
 const best = groups[0];
 return frames.flatMap(frame => {
  const used = new Set<string>();
  return frame.scan.fields.map(field => {
   const d = field.descriptor; const kind = classifyField(d); let action: NativeAction | null = null;
   const usageKey = kind === 'email' && /^confirm e-?mail(?: address)?[.:]?$/i.test(d.label.trim()) ? 'confirmEmail' : kind;
   let status = !field.empty ? 'Kept existing answer' : 'Manual / unsupported';
   const unsafe = /signature|certif|attest|acknowledg|declar|consent/i.test([d.label, d.groupLabel, d.placeholder, d.name, d.id, d.hints].join(' '));
   if (!unsafe && field.empty && best?.frame.documentId === frame.documentId && best.form === field.form && kind && usageKey && !used.has(usageKey) && kind !== 'location') {
    const signature = fieldSignature(d, field.form, field.maxLength);
    if (d.control === 'text') { const value = textValueFor(kind, profile, d); if (value && (field.maxLength < 0 || value.length <= field.maxLength)) action = { ref: field.ref, type: 'text', value, signature }; }
    if (d.control === 'select' || d.control === 'radio') { const choice = pickChoice(kind, profile, d.options); if (choice.status === 'match') action = { ref: field.ref, type: d.control, index: choice.index, signature }; }
    if (d.control === 'file' && kind === 'resume' && isStoredResume(resume) && acceptsFile(d.accept, resume)) action = { ref: field.ref, type: 'file', resume: structuredClone(resume), signature };
    if (action) { used.add(usageKey); status = 'Ready for preview'; }
   }
   return { job: frame.scan.job, documentId: frame.documentId, frameId: frame.frameId, scanId: frame.scan.scanId, url: frame.scan.url, field, action, status };
  });
 });
}
