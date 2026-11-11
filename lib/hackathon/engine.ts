import type { NativeOutcome } from './outcomes';
import { stableKey } from './identity';
import { classifyField } from '../classify';
import { textValueFor, autofillAllowed } from '../profile';
import { pickChoice } from '../choices';
import { acceptsFile, isStoredResume } from '../resume';
import { greenhouseAction } from './greenhouse-plan';
import { countryCode, findCountries } from '../regions';
import type { FieldDescriptor, Profile, JobInfo, StoredResume } from '../types';
import type { NativeScan, NativeField, NativeAction } from './page';
import { sanitizeCheckboxGroups, type ApplicationCheckboxGroup } from './checkbox-groups';
import { sanitizeManualControls, type ApplicationManualControl } from './manual-controls';
export interface Frame { frameId: number; documentId: string; scan: NativeScan }
export interface Row { job: JobInfo; documentId: string; frameId: number; scanId: string; url: string; field: NativeField; action: NativeAction | null; status: string }
export interface NativePlan { id: string; tabId: number; url: string; profileKey: string; resumeKey?: string; rows: Row[]; checkboxGroups?: ApplicationCheckboxGroup[]; manualControls?: ApplicationManualControl[]; state: 'preview' | 'executing' | 'finished' | 'invalidated'; answerBinding?: { id: string; revision: number; savedId?: string }; errors?: string[]; outcomes?: (NativeOutcome & { documentId: string })[] }
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
/** Manual observations cannot nominate an application or create any action. */
export function planCheckboxGroups(frames: Frame[], rows: Row[]): ApplicationCheckboxGroup[] {
 const selected = eligibleApplicationRows(rows)[0];
 if (!selected) return [];
 return frames.filter(frame => frame.scan.shown && frame.documentId === selected.documentId).flatMap(frame =>
  (sanitizeCheckboxGroups(frame.scan.checkboxGroups) ?? []).filter(group => group.form === selected.field.form)
   .map(group => ({ ...group, documentId: frame.documentId })));
}
/** Unsupported semantic controls are display-only and cannot nominate an application. */
export function planManualControls(frames: Frame[], rows: Row[]): ApplicationManualControl[] {
 const selected = eligibleApplicationRows(rows)[0];
 if (!selected) return [];
 return frames.filter(frame => frame.scan.shown && frame.documentId === selected.documentId).flatMap(frame =>
  (sanitizeManualControls(frame.scan.manualControls) ?? []).filter(control => control.form === selected.field.form)
   .map(control => ({ ...control, documentId: frame.documentId })));
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
   const enabled = autofillAllowed(profile, kind, d);
   if (field.empty && !enabled) status = 'Section autofill disabled';
   const unsafe = /signature|certif|attest|acknowledg|declar|consent/i.test([d.label, d.groupLabel, d.placeholder, d.name, d.id, d.hints].join(' '));
   const eligibility = kind === 'workAuthorization' || kind === 'sponsorship';
   const savedCountry = countryCode(profile.country);
   const rightCountry = !eligibility || !!savedCountry && findCountries([d.label,d.groupLabel].join(' ')).every(code => code === savedCountry);
   const inApplication = enabled && !unsafe && rightCountry && field.empty && best?.frame.documentId === frame.documentId && best.form === field.form;
   if (inApplication) {
    const custom=greenhouseAction(field,frame.scan.fields,frame.scan.url,profile,fieldSignature(d,field.form,field.maxLength));
    if (custom && !used.has(custom.usageKey)) { action=custom.action; used.add(custom.usageKey); status='Ready for preview'; }
   }
   if (!action && inApplication && kind && usageKey && !used.has(usageKey) && kind !== 'location') {
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
