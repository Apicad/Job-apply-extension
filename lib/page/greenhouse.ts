/** Greenhouse's single-value React-Select widgets. No page-wide menu guesses. */
import type { PageEnv } from '../types';
import { countryCode, stateCode } from '../regions';
import { elementById, holdsAnotherField, ownWrappers } from './collect';
import { fillText } from './fill';
import { isHiddenByMarkup, isShown } from './visibility';

export type GreenhouseTarget = {
 kind: 'country' | 'phoneCountry' | 'location' | 'school' | 'degree' | 'major' | 'graduationDate';
 value: string;
 /** Only phoneCountry: an explicit calling code, including its leading +. */
 dialCode?: string;
};
const KINDS = new Set<GreenhouseTarget['kind']>(['country','phoneCountry','location','school','degree','major','graduationDate']);
const SELECTED = '.select__single-value, [class*="-singleValue"]';
const chosen = new WeakMap<HTMLInputElement, { widget: Element; target: string; label: string }>();
const tidy = (text: string): string => text.normalize('NFKC').replace(/\s+/g, ' ').trim();
const key = (text: string): string => tidy(text).toLowerCase();
const safeText = (text: string): boolean => typeof text === 'string' && text.length > 0 && text.length <= 300 && !/[\u0000-\u001f\u007f-\u009f\u200b\u2060\ufeff\u202a-\u202e\u2066-\u2069]/.test(text);

function widgetOf(input: HTMLInputElement): Element | null {
 if (input.localName !== 'input' || input.type !== 'text' || input.getAttribute('role') !== 'combobox' || !input.classList.contains('select__input')) return null;
 const container = input.closest('.select__container');
 if (!container || !ownWrappers([input], 8).includes(container) || holdsAnotherField(container,[input])) return null;
 if (container.querySelector('.select__multi-value, .select__value-container--is-multi')) return null;
 return container;
}
export function isGreenhouseCombobox(input: HTMLInputElement): boolean { return widgetOf(input) !== null; }

function selectedLabels(input: HTMLInputElement): { element: Element; label: string }[] {
 const widget = widgetOf(input);
 if (!widget) return [];
 return Array.from(widget.querySelectorAll(SELECTED)).map(element => ({ element, label: tidy(element.textContent ?? '') })).filter(entry => entry.label !== '');
}
/** A blank search/filter input can still have a committed choice beside it. */
export function isComboboxEmpty(input: HTMLInputElement): boolean {
 if (input.value.trim() !== '' || (input.getAttribute('aria-valuetext') ?? '').trim() !== '') return false;
 if (selectedLabels(input).length > 0) return false;
 // Preserve chips too, even though this adapter never operates multi-selects.
 return !ownWrappers([input],8).some(wrapper => Array.from(wrapper.querySelectorAll('.select__multi-value, [class*="-multiValue"]')).some(el => (el.textContent ?? '').trim() !== ''));
}
function validTarget(target: GreenhouseTarget): boolean {
 return !!target && KINDS.has(target.kind) && safeText(target.value) && (target.kind !== 'phoneCountry' || typeof target.dialCode === 'string' && /^\+[1-9]\d{0,3}$/.test(target.dialCode));
}
function samePlace(actual: string, expected: string): boolean {
 const a = actual.split(',').map(tidy); const e = expected.split(',').map(tidy);
 // A bare city name does not identify which city the applicant selected.
 if (a.length !== 3 || e.length !== 3 || a.some(p => !p) || e.some(p => !p)) return false;
 const actualCountry = countryCode(a[2]!); const expectedCountry = countryCode(e[2]!);
 if (!actualCountry || actualCountry !== expectedCountry || key(a[0]!) !== key(e[0]!)) return false;
 const regionMatches = key(a[1]!) === key(e[1]!) || (actualCountry === 'US' && stateCode(a[1]!) !== null && stateCode(a[1]!) === stateCode(e[1]!));
 return regionMatches;
}
function phoneCountryMatches(label: string, target: GreenhouseTarget): boolean {
 const codes = Array.from(label.matchAll(/\+\s*([1-9]\d{0,3})\b/g));
 if (codes.length !== 1 || `+${codes[0]![1]}` !== target.dialCode) return false;
 const country = label.replace(codes[0]![0], '').replace(/[()]/g, '').trim();
 const expected = countryCode(target.value);
 return expected !== null && countryCode(country) === expected;
}
function matches(label: string, target: GreenhouseTarget): boolean {
 if (!safeText(label)) return false;
 if (target.kind === 'phoneCountry') return phoneCountryMatches(label,target);
 if (target.kind === 'country') { const expected=countryCode(target.value); return expected !== null && countryCode(label) === expected; }
 if (target.kind === 'location') return samePlace(label,target.value);
 return key(label) === key(target.value);
}
function targetKey(target: GreenhouseTarget): string { return JSON.stringify([target.kind,target.value,target.dialCode ?? '']); }

export function verifyGreenhouseCombobox(input: HTMLInputElement, target: GreenhouseTarget, env: PageEnv): boolean {
 if (!validTarget(target) || !input.isConnected || !isShown({control:'combobox',el:input},env) || input.getAttribute('aria-invalid') === 'true' || input.getAttribute('aria-expanded') === 'true') return false;
 const labels = selectedLabels(input);
 if (labels.length !== 1 || isHiddenByMarkup(labels[0]!.element) || !env.isRendered(labels[0]!.element)) return false;
 const label=labels[0]!.label;
 if (matches(label,target)) return true;
 // Greenhouse renders only +1 after selecting United States +1. A pre-existing
 // +1 is preserved, never interpreted as a country. Only our exact scoped
 // option click establishes which country was chosen for this command.
 const proof=chosen.get(input);
 return target.kind === 'phoneCountry' && key(label).replace(/\s/g,'') === target.dialCode && proof?.widget === widgetOf(input) && proof.target === targetKey(target) && phoneCountryMatches(proof.label,target);
}
function linkedOptions(input: HTMLInputElement, env: PageEnv): HTMLElement[] {
 const ids=(input.getAttribute('aria-controls') || input.getAttribute('aria-owns') || '').trim().split(/\s+/).filter(Boolean);
 if (ids.length !== 1) return [];
 const list=elementById(input,ids[0]!);
 if (!list || list.getAttribute('role') !== 'listbox' || list.getAttribute('aria-busy') === 'true' || isHiddenByMarkup(list) || !env.isRendered(list)) return [];
 const all=Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
 if (all.length > 300) return [];
 return all.filter(option => {
  // Never operate buttons/links/inputs disguised as options, or an option
  // nested inside an unrelated listbox. Only ordinary option containers.
  return ['div','li','span'].includes(option.localName) && option.closest('[role="listbox"]') === list && !option.querySelector('button,a,input,select,textarea,[role="button"]') && option.getAttribute('aria-disabled') !== 'true' && !isHiddenByMarkup(option) && env.isRendered(option);
 });
}
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve,ms));

/**
 * The caller rechecks document, application, descriptor and ref identity before
 * every mutation. This helper additionally checks the original widget and any
 * intervening user choice. Filters may change; only one exact option is clicked.
 */
export async function fillGreenhouseCombobox(input: HTMLInputElement, target: GreenhouseTarget, env: PageEnv, stillCurrent: () => boolean, onWrite: () => void): Promise<boolean> {
 const widget=widgetOf(input);
 const current=(): boolean => input.isConnected && widgetOf(input) === widget && stillCurrent() && isShown({control:'combobox',el:input},env);
 if (!widget || !validTarget(target) || !current() || !isComboboxEmpty(input)) return false;
 const query=target.kind === 'location' ? tidy(target.value.split(',')[0]!) : target.value;
 if (!safeText(query) || input.maxLength >= 0 && query.length > input.maxLength) return false;
 chosen.delete(input);
 // Typing only filters; it is never counted as the selected answer.
 fillText(input,query,onWrite);
 if (!current() || selectedLabels(input).length > 0 || input.value !== query) return false;
 input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true}));
 const deadline=Date.now()+2500;
 while (Date.now() < deadline) {
  if (!current() || selectedLabels(input).length > 0 || input.value !== query) return false;
  const matching=linkedOptions(input,env).filter(option => matches(tidy(option.textContent ?? ''),target));
  if (matching.length === 1) {
   const option=matching[0]!; const label=tidy(option.textContent ?? '');
   // Re-read the association and full option list immediately before clicking.
   if (!current() || input.value !== query || selectedLabels(input).length > 0 || !linkedOptions(input,env).includes(option)) return false;
   chosen.set(input,{widget,target:targetKey(target),label});
   onWrite(); option.click();
   const settleUntil=Date.now()+600;
   do { if (!current()) return false; if (verifyGreenhouseCombobox(input,target,env)) return true; await pause(40); } while (Date.now()<settleUntil);
   return false;
  }
  if (matching.length > 1) break;
  await pause(80);
 }
 // Undo only the uncommitted filter we wrote, never a user edit or selection.
 if (current() && input.value === query && selectedLabels(input).length === 0) {
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  if (setter) { setter.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true,composed:true})); input.dispatchEvent(new Event('change',{bubbles:true})); }
  if (current()) input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
 }
 return false;
}
