import { detectAts } from '../ats';
import { stableKey } from './identity';
import { classifyField } from '../classify';
import { MONTH_NAMES, yearAndMonth, autofillAllowed } from '../profile';
import { countryCode } from '../regions';
import type { Profile } from '../types';
import type { NativeField, NativeAction } from './page';
import type { GreenhouseTarget } from '../page/greenhouse';

/** Real Greenhouse only; the production bundle contains no fixture exception. */
function supportedPage(url: string): boolean {
 if (detectAts(url) === 'greenhouse') return true;
 if (import.meta.env.MODE !== 'e2e') return false;
 try { const u = new URL(url); return ['localhost','127.0.0.1'].includes(u.hostname) && u.pathname === '/greenhouse-live.html'; } catch { return false; }
}
const label = (field: NativeField) => field.descriptor.label.trim().replace(/[*:]/g,'').trim().toLowerCase();
/** One saved education record maps to one blank school row. Existing school
 * selections carry no value in a scan, so their other fields stay untouched. */
const EDUCATION_ID = /^(school|degree|end-(?:date-)?month|end-(?:date-)?year|discipline)--(\d+)$/;
const safeEducationGroup = (field: NativeField): boolean => {
 const group=field.descriptor.groupLabel.trim().toLowerCase();
 return group === '' || /^(education|educational history|academic history)( \d+)?$/.test(group);
};
function educationPart(field: NativeField, fields: NativeField[]): 'school' | 'degree' | 'month' | 'year' | 'major' | null {
 const match=EDUCATION_ID.exec(field.descriptor.id);
 if (!match || !safeEducationGroup(field)) return null;
 const schools=fields.filter(f => f.form === field.form && /^school--\d+$/.test(f.descriptor.id) && classifyField(f.descriptor) === 'school' && f.empty && safeEducationGroup(f));
 const school=schools[0];
 if (!school || school.descriptor.id !== `school--${match[2]}` || schools.filter(f=>f.descriptor.id===school.descriptor.id).length !== 1) return null;
 const expected=match[1]!.startsWith('end-') ? `end date ${match[1]!.endsWith('month') ? 'month' : 'year'}` : match[1]!.replaceAll('-',' ');
 if (label(field) !== expected) return null;
 return match[1] === 'school' ? 'school' : match[1] === 'degree' ? 'degree' : match[1] === 'discipline' ? 'major' : match[1]!.endsWith('month') ? 'month' : 'year';
}
export function greenhouseAction(field: NativeField, fields: NativeField[], url: string, profile: Profile, signature: string): { action: NativeAction; usageKey: string } | null {
 if (!supportedPage(url) || !field.empty || !autofillAllowed(profile, classifyField(field.descriptor), field.descriptor)) return null;
 const d = field.descriptor; const part = educationPart(field,fields); const date = yearAndMonth(profile.graduationDate);
 if (EDUCATION_ID.test(d.id) && (!part || !profile.school.trim())) return null;
 const row=EDUCATION_ID.exec(d.id)?.[2];
 const school=part && part !== 'school' ? fields.find(f=>f.form===field.form && f.descriptor.id===`school--${row}` && classifyField(f.descriptor)==='school') : null;
 const education=school ? { schoolRef:school.ref, signature:stableKey({descriptor:school.descriptor,form:school.form,maxLength:school.maxLength}), value:profile.school.trim() } : undefined;
 if (part === 'year' && d.control === 'text' && date && (field.maxLength < 0 || date.year.length <= field.maxLength)) return { action: { ref: field.ref, signature, type: 'text', value: date.year, ...(education ? {education} : {}) }, usageKey:'graduationYear' };
 if (d.control !== 'combobox') return null;
 let target: GreenhouseTarget | null = null;
 let usageKey = classifyField(d) as string | null;
 if (label(field) === 'country' && d.groupLabel.trim().toLowerCase() === 'phone') {
  // A country of residence alone cannot establish an international dial code.
  // Only an unambiguous North American national/international number is used.
  const country = countryCode(profile.country); const phone = profile.phone.trim(); const digits = phone.replace(/[+\s().-]/g,'');
  if ((country === 'US' || country === 'CA') && /^[+\d\s().-]+$/.test(phone) && (!phone.startsWith('+') && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) || /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits))) {
   target = { kind:'phoneCountry', value:country === 'US' ? 'United States' : 'Canada', dialCode:'+1' }; usageKey='phoneCountry';
  }
 } else if (part === 'month' && date) { target={kind:'graduationDate',value:MONTH_NAMES[date.month-1]!}; usageKey='graduationMonth'; }
 else if (part === 'major' && profile.major.trim()) { target={kind:'major',value:profile.major.trim()}; usageKey='major'; }
 else {
  const kind=classifyField(d);
  if (kind === 'location' && profile.city.trim() && profile.state.trim() && profile.country.trim()) target={kind,value:[profile.city,profile.state,profile.country].map(v=>v.trim()).join(', ')};
  if (kind && ['country','school','degree','major'].includes(kind)) {
   const value=profile[kind as 'country'|'school'|'degree'|'major'].trim();
   if (value) target={kind:kind as GreenhouseTarget['kind'],value};
  }
 }
 return target && usageKey ? { action:{ref:field.ref,signature,type:'combobox',target,...(education ? {education} : {})},usageKey } : null;
}
