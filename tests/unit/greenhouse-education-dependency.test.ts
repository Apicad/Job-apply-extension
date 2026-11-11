import { afterEach, expect, it, vi } from 'vitest';
import { applyNativeAsync, scanNative, signature, verifyNative, type NativeAction, type NativeCommand } from '../../lib/hackathon/page';
import type { PageEnv } from '../../lib/types';
const env: PageEnv = { isRendered: el => !el.hasAttribute('hidden'), assignFiles: () => {} };
afterEach(() => vi.useRealTimers());
function fixture(schools = ['Example College']) {
 const box = (id: string, label: string) => `<div class="select__container"><label for="${id}">${label}</label><div class="select__control"><div class="select__value-container"><input id="${id}" class="select__input" role="combobox" aria-expanded="false" aria-autocomplete="list"></div></div></div>`;
 document.body.innerHTML = `<form>${box('school--0', 'School')}${box('degree--0', 'Degree')}<label>End date year<input id="end-date-year--0" type="number"></label></form>`;
 const school = document.getElementById('school--0') as HTMLInputElement;
 const degree = document.getElementById('degree--0') as HTMLInputElement;
 const year = document.getElementById('end-date-year--0') as HTMLInputElement;
 const selected = (input: HTMLInputElement, value: string) => {
  input.closest('.select__container')!.querySelector('.select__single-value')?.remove();
  const pill = document.createElement('div'); pill.className = 'select__single-value'; pill.textContent = value;
  input.parentElement!.prepend(pill); input.value = ''; input.setAttribute('aria-expanded', 'false');
 };
 const wire = (input: HTMLInputElement, choices: string[]) => {
  input.addEventListener('input', () => {
   document.getElementById(`${input.id}-choices`)?.remove(); if (!input.value) return;
   const list = document.createElement('div'); list.id = `${input.id}-choices`; list.role = 'listbox';
   for (const label of choices) { const option = document.createElement('div'); option.role = 'option'; option.textContent = label; option.onclick = () => { selected(input, label); list.remove(); }; list.append(option); }
   document.body.append(list); input.setAttribute('aria-controls', list.id); input.setAttribute('aria-expanded', 'true');
  });
 };
 wire(school, schools); wire(degree, ['Associate of Science']);
 const scan = scanNative(document, env);
 const sf = scan.fields.find(field => field.descriptor.id === school.id)!;
 const df = scan.fields.find(field => field.descriptor.id === degree.id)!;
 const yf = scan.fields.find(field => field.descriptor.id === year.id)!;
 const education = { schoolRef: sf.ref, signature: signature(sf)!, value: 'Example College' };
 const actions: NativeAction[] = [
  { ref: sf.ref, signature: signature(sf)!, type: 'combobox', target: { kind: 'school', value: 'Example College' } },
  { ref: df.ref, signature: signature(df)!, education, type: 'combobox', target: { kind: 'degree', value: 'Associate of Science' } },
  { ref: yf.ref, signature: signature(yf)!, education, type: 'text', value: '2027' },
 ];
 const command: NativeCommand = { scanId: scan.scanId, url: scan.url, actions };
 return { command, school, degree, year, selected };
}

it('fills dependent fields only after the exact school is visibly selected', async () => {
 const f = fixture();
 expect((await applyNativeAsync(document, env, f.command)).map(outcome => outcome.ok)).toEqual([true, true, true]);
 expect(f.year.value).toBe('2027');
 expect(verifyNative(document, env, f.command).every(outcome => outcome.ok)).toBe(true);
});
it.each([{ choices: [] }, { choices: ['Example College', 'Example College'] }])('does not write degree or year when the school is missing or ambiguous: %j', async ({ choices }) => {
 vi.useFakeTimers(); const f = fixture(choices);
 const pending = applyNativeAsync(document, env, f.command); await vi.runAllTimersAsync(); const outcomes = await pending;
 expect(outcomes.map(outcome => outcome.ok)).toEqual([false, false, false]);
 expect(outcomes.slice(1).map(outcome => outcome.status)).toEqual(['refused', 'refused']);
 expect(f.degree.value).toBe(''); expect(f.year.value).toBe('');
});
it.each(['different school', 'detached school', 'hidden school', 'changed label', 'wrong row'])('rejects a stale school dependency: %s', async change => {
 const f = fixture(); f.selected(f.school, 'Example College');
 if (change === 'different school') f.selected(f.school, 'Different College');
 if (change === 'detached school') f.school.remove();
 if (change === 'hidden school') f.school.closest('.select__container')!.setAttribute('hidden', '');
 if (change === 'changed label') document.querySelector('label')!.textContent = 'Employer';
 if (change === 'wrong row') { f.degree.id = 'degree--1'; const fresh = scanNative(document, env); const sf = fresh.fields.find(field => field.descriptor.id === f.school.id)!; const df = fresh.fields.find(field => field.descriptor.id === f.degree.id)!; f.command.scanId = fresh.scanId; f.command.actions = [{ ref: df.ref, signature: signature(df)!, type: 'combobox', target: { kind: 'degree', value: 'Associate of Science' }, education: { schoolRef: sf.ref, signature: signature(sf)!, value: 'Example College' } }]; }
 else f.command.actions = f.command.actions.slice(1);
 expect((await applyNativeAsync(document, env, f.command)).every(outcome => outcome.status === 'refused')).toBe(true);
 expect(f.degree.value).toBe(''); expect(f.year.value).toBe('');
});
it('stops an in-progress dependent selection and subsequent year when the school changes', async () => {
 const f = fixture();
 f.degree.addEventListener('input', () => { if (f.degree.value) f.selected(f.school, 'Different College'); });
 const outcomes = await applyNativeAsync(document, env, f.command);
 expect(outcomes[0]?.ok).toBe(true); expect(outcomes[1]?.ok).toBe(false); expect(outcomes[2]?.status).toBe('refused');
 expect(f.degree.closest('.select__container')!.querySelector('.select__single-value')).toBeNull(); expect(f.year.value).toBe('');
});
it('does not verify earlier dependent fills if the school changes afterward', async () => {
 const f = fixture(); await applyNativeAsync(document, env, f.command); f.selected(f.school, 'Different College');
 expect(verifyNative(document, env, f.command).map(outcome => outcome.ok)).toEqual([false, false, false]);
});
