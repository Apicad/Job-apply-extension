import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillGreenhouseCombobox, isComboboxEmpty, isGreenhouseCombobox, verifyGreenhouseCombobox, type GreenhouseTarget } from '../../lib/page/greenhouse';
import { isEmpty } from '../../lib/page/describe';
import type { PageEnv } from '../../lib/types';

const env: PageEnv = { isRendered: el => !el.hasAttribute('data-invisible'), assignFiles: () => {} };
const school: GreenhouseTarget = { kind: 'school', value: 'Example College' };
function fixture(labels: string[], options: { delay?: number; selected?: string; commit?: string; foreign?: boolean; disabled?: boolean; keyupOnly?: boolean } = {}) {
 document.body.innerHTML = '<form><div class="select__container"><label for="school">School</label><div class="select__control"><div class="select__value-container"><input id="school" class="select__input" role="combobox" aria-autocomplete="list" aria-expanded="false" /></div></div></div><button id="submit" type="submit">Submit</button></form>';
 const input = document.querySelector<HTMLInputElement>('#school')!;
 const wrapper = document.querySelector<HTMLElement>('.select__value-container')!;
 let selected = '';
 let clicks = 0;
 if (options.selected) { const pill = document.createElement('div'); pill.className = 'select__single-value'; pill.textContent = options.selected; wrapper.prepend(pill); }
 const open = () => {
  document.querySelector('#choices')?.remove();
  const list = document.createElement('div'); list.id = 'choices'; list.role = 'listbox';
  labels.forEach(label => { const el = document.createElement('div'); el.role = 'option'; el.textContent = label; if (options.disabled) el.setAttribute('aria-disabled','true'); el.onclick = () => { clicks++; selected = label; const pill = document.createElement('div'); pill.className = 'select__single-value'; pill.textContent = options.commit ?? label; wrapper.prepend(pill); input.value = ''; input.setAttribute('aria-expanded','false'); list.remove(); }; list.append(el); });
  document.body.append(list);
  input.setAttribute('aria-expanded','true');
  input.setAttribute('aria-controls', options.foreign ? 'missing' : list.id);
 };
 input.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && !options.delay && !options.keyupOnly) open(); });
 input.addEventListener('keyup', e => { if (options.keyupOnly && e.code === 'ArrowDown') open(); });
 input.addEventListener('input', () => { if (input.value && !options.keyupOnly) { if (options.delay) setTimeout(open,options.delay); else open(); } });
 return { input, chosen: () => selected, clicks: () => clicks };
}
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('scoped Greenhouse dropdowns', () => {
 it('selects an exact unique school in its linked portal listbox', async () => {
  const f = fixture(['Other','Example College','Example College of Art']);
  expect(await fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{})).toBe(true);
  expect(f.chosen()).toBe('Example College'); expect(f.clicks()).toBe(1);
  expect(verifyGreenhouseCombobox(f.input,school,env)).toBe(true);
 });
 it('opens Greenhouse menus controlled by keyup instead of internal React-Select state', async () => {
  const f=fixture(['Example College'],{keyupOnly:true});
  expect(await fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{})).toBe(true);expect(f.chosen()).toBe('Example College');
 });
 it('waits for asynchronous suggestions and matches location with equivalent region names', async () => {
  const f = fixture(['Example City, CA, USA'],{delay:50});
  const target: GreenhouseTarget = {kind:'location',value:'Example City, California, United States'};
  expect(await fillGreenhouseCombobox(f.input,target,env,()=>true,()=>{})).toBe(true);
 });
 it('does not choose a city in a different state or country', async () => {
  vi.useFakeTimers(); const f=fixture(['Example City, Washington, United States']);
  const p=fillGreenhouseCombobox(f.input,{kind:'location',value:'Example City, California, United States'},env,()=>true,()=>{});
  await vi.runAllTimersAsync(); expect(await p).toBe(false); expect(f.clicks()).toBe(0); expect(f.input.value).toBe('');
 });
 it('preserves a pre-existing selection even when the filter input is blank', async () => {
  const f=fixture(['Example College'],{selected:'Another College'});
  expect(isComboboxEmpty(f.input)).toBe(false);
  expect(isEmpty({control:'combobox',el:f.input})).toBe(false);
  expect(await fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{})).toBe(false); expect(f.clicks()).toBe(0);
 });
 it('preserves a query the user had already typed', async () => {
  const f=fixture(['Example College']); f.input.value='User query';
  expect(await fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{})).toBe(false); expect(f.input.value).toBe('User query');
 });
 it.each([{foreign:true},{disabled:true}])('refuses unlinked or disabled options: %j', async opts => {
  vi.useFakeTimers(); const f=fixture(['Example College'],opts);
  const p=fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{});
  await vi.runAllTimersAsync(); expect(await p).toBe(false); expect(f.clicks()).toBe(0);
 });
 it('refuses duplicate exact matches', async () => {
  vi.useFakeTimers(); const f=fixture(['Example College','Example College']);
  const p=fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{});
  await vi.runAllTimersAsync(); expect(await p).toBe(false); expect(f.clicks()).toBe(0);
 });
 it('stops if context changes while suggestions are loading', async () => {
  vi.useFakeTimers(); const f=fixture(['Example College'],{delay:100}); let current=true;
  const p=fillGreenhouseCombobox(f.input,school,env,()=>current,()=>{}); current=false;
  await vi.runAllTimersAsync(); expect(await p).toBe(false); expect(f.clicks()).toBe(0);
 });
 it('does not overwrite a user selection made during the wait', async () => {
  vi.useFakeTimers(); const f=fixture(['Example College'],{delay:100});
  const p=fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{});
  const pill=document.createElement('div'); pill.className='select__single-value';pill.textContent='User College'; f.input.parentElement!.append(pill);
  await vi.runAllTimersAsync(); expect(await p).toBe(false); expect(f.clicks()).toBe(0); expect(pill.textContent).toBe('User College');
 });
 it('requires recognized widget markup and visible enabled input', async () => {
  const f=fixture(['Example College']); f.input.className='';
  expect(isGreenhouseCombobox(f.input)).toBe(false); expect(await fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{})).toBe(false);
 });
 it('never clicks a submit button disguised as a listbox option', async () => {
  vi.useFakeTimers(); const f=fixture(['Example College']); let submitted=false;
  document.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();submitted=true;});
  f.input.addEventListener('keydown',()=>{ const option=document.querySelector('[role=option]'); const button=document.createElement('button');button.type='submit';button.setAttribute('form',document.querySelector('form')!.id='application');button.role='option';button.textContent='Example College';option?.replaceWith(button); });
  const p=fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{});
  await vi.runAllTimersAsync();expect(await p).toBe(false);expect(submitted).toBe(false);
 });
 it('refuses hidden options and leaves the form unselected', async () => {
  vi.useFakeTimers();const f=fixture(['Example College']);
  f.input.addEventListener('keydown',()=>document.querySelector('[role=option]')?.setAttribute('data-invisible',''));
  const p=fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{});
  await vi.runAllTimersAsync();expect(await p).toBe(false);expect(f.clicks()).toBe(0);
 });
 it('does not erase a user query entered while suggestions load', async () => {
  vi.useFakeTimers();const f=fixture(['Example College'],{delay:100});
  const p=fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{});f.input.value='User changed this';
  await vi.runAllTimersAsync();expect(await p).toBe(false);expect(f.input.value).toBe('User changed this');expect(f.clicks()).toBe(0);
 });
 it('does not verify a selection when the page reports it invalid', async () => {
  const f=fixture(['Example College']);expect(await fillGreenhouseCombobox(f.input,school,env,()=>true,()=>{})).toBe(true);
  f.input.setAttribute('aria-invalid','true');expect(verifyGreenhouseCombobox(f.input,school,env)).toBe(false);
 });
 it('does not treat typed filter text as a committed answer', () => {
  const f=fixture([]);f.input.value=school.value;
  expect(verifyGreenhouseCombobox(f.input,school,env)).toBe(false);
 });
 it('chooses the exact country and confirms its dial-code-only display', async () => {
  const f=fixture(['Canada +1','United States +1'],{commit:'+1'});
  const target: GreenhouseTarget={kind:'phoneCountry',value:'United States',dialCode:'+1'};
  expect(await fillGreenhouseCombobox(f.input,target,env,()=>true,()=>{})).toBe(true);
  expect(f.chosen()).toBe('United States +1');
 });
 it('does not verify a dial-code-only selection that it did not choose', () => {
  const f=fixture([],{selected:'+1'});
  expect(verifyGreenhouseCombobox(f.input,{kind:'phoneCountry',value:'United States',dialCode:'+1'},env)).toBe(false);
 });
 it('refuses a country with a different calling code', async () => {
  vi.useFakeTimers(); const f=fixture(['United States +44']);
  const p=fillGreenhouseCombobox(f.input,{kind:'phoneCountry',value:'United States',dialCode:'+1'},env,()=>true,()=>{});
  await vi.runAllTimersAsync(); expect(await p).toBe(false);expect(f.clicks()).toBe(0);
 });
});
