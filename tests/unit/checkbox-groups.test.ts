import { beforeEach, expect, it, vi } from 'vitest';
import { collectCheckboxGroups } from '../../lib/page/checkbox-groups';
import { sanitizeCheckboxGroups, checkboxGroupViews } from '../../lib/hackathon/checkbox-groups';
import { scanNative, applyNative, inspectNative } from '../../lib/hackathon/page';
import { planNative, planCheckboxGroups } from '../../lib/hackathon/engine';
import { normalizeProfile } from '../../lib/profile';
import { visibleAttentionFields } from '../../lib/sidebar/attention';

const env = { isRendered: (el: Element) => !el.hasAttribute('data-invisible'), assignFiles: () => {} };
const basics = '<label>First name<input></label><label>Email<input></label><label>Phone<input></label>';
const profile = normalizeProfile({ firstName: 'Ada', email: 'ada@example.com', phone: '555-0100' });
beforeEach(() => { document.body.innerHTML = `<form id="application">${basics}</form>`; });
function add(html: string) { document.querySelector('form')!.insertAdjacentHTML('beforeend', html); }
function frame(documentId = 'document-a') { return { frameId: 0, documentId, scan: scanNative(document, env) }; }

it('reports each Greenhouse fieldset once using its legend and aria-required, never choosing an option', () => {
  for (const [name, count] of [['Preferred location', 4], ['Export control declarations', 4], ['Conditional citizenship question', 9]] as const) {
    add(`<fieldset aria-required="true"><legend>${name} <span>*</span></legend>${Array.from({ length: count }, (_, i) => `<div><input type="checkbox" name="${name}[]" id="${name}-${i}" ${i === 1 ? 'checked' : ''}><label for="${name}-${i}">Option ${i}</label></div>`).join('')}</fieldset>`);
  }
  const click = vi.fn(); const change = vi.fn(); document.addEventListener('click', click); document.addEventListener('change', change);
  const groups = collectCheckboxGroups(document, env);
  expect(groups.map(({ label, required, optionCount, checkedCount }) => ({ label, required, optionCount, checkedCount }))).toEqual([
    { label: 'Preferred location', required: true, optionCount: 4, checkedCount: 1 },
    { label: 'Export control declarations', required: true, optionCount: 4, checkedCount: 1 },
    { label: 'Conditional citizenship question', required: true, optionCount: 9, checkedCount: 1 },
  ]);
  expect(click).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
  expect([...document.querySelectorAll<HTMLInputElement>('[type=checkbox]')].filter(input => input.checked)).toHaveLength(3);
});

it('groups separately named options under their labelled ARIA question, and standalone consent under its own label', () => {
  add('<div role="group" aria-labelledby="question"><h3 id="question">Select available locations</h3><label><input type="checkbox" name="north">North</label><label><input type="checkbox" name="south">South</label></div><label><input type="checkbox" checked>I consent to processing my application</label>');
  expect(collectCheckboxGroups(document, env).map(group => [group.label, group.optionCount, group.checkedCount])).toEqual([
    ['Select available locations', 2, 0], ['I consent to processing my application', 1, 1],
  ]);
});

it('keeps same-name groups separate by question, form owner and shadow root', () => {
  add('<fieldset><legend>First question</legend><label><input type="checkbox" name="same">One</label></fieldset><fieldset><legend>Second question</legend><label><input type="checkbox" name="same">Two</label></fieldset><label><input type="checkbox" name="fallback">A</label><label><input type="checkbox" name="fallback">B</label>');
  document.body.insertAdjacentHTML('beforeend', '<form><label><input type="checkbox" name="fallback">Other form</label></form><div id="shadow"></div>');
  document.querySelector('#shadow')!.attachShadow({ mode: 'open' }).innerHTML = '<label><input type="checkbox" name="fallback">Shadow</label>';
  expect(collectCheckboxGroups(document, env).map(group => group.optionCount)).toEqual([1, 1, 2, 1, 1]);
});

it('omits hidden/search/auth controls but includes a visible styled checkbox and a disabled visible choice for review', () => {
  add('<fieldset hidden><legend>Hidden</legend><input type="checkbox"></fieldset><div role="search"><label><input type="checkbox">Search filter</label></div><label><input type="checkbox" data-invisible>Styled visible label</label><label><input type="checkbox" disabled>Disabled visible choice</label><label hidden><input type="checkbox" data-invisible>Hidden label</label><details><summary>Collapsed</summary><input type="checkbox"></details>');
  document.body.insertAdjacentHTML('beforeend', '<form><input type="password"><label><input type="checkbox">Remember me</label></form>');
  expect(collectCheckboxGroups(document, env).map(group => group.label)).toEqual(['Styled visible label', 'Disabled visible choice']);
});

it('keeps visible questions and their legends distinct when some options are hidden', () => {
  add('<fieldset><legend>First visible question</legend><label><input type="checkbox" name="shared">One</label><label hidden><input type="checkbox" name="shared" checked>Hidden</label></fieldset><fieldset><legend>Second visible question</legend><label><input type="checkbox" name="shared">Two</label><label hidden><input type="checkbox" name="shared">Hidden two</label></fieldset>');
  expect(collectCheckboxGroups(document, env).map(group => [group.label, group.optionCount, group.checkedCount])).toEqual([
    ['First visible question', 1, 0], ['Second visible question', 1, 0],
  ]);
});

it('only reports groups in the selected application and cannot influence application selection', () => {
  add('<label><input type="checkbox">Application agreement</label>');
  document.body.insertAdjacentHTML('beforeend', '<form><label><input type="checkbox">Newsletter</label></form>');
  const f = frame(); const rows = planNative([f], profile);
  expect(planCheckboxGroups([f], rows).map(group => group.label)).toEqual(['Application agreement']);
  expect(planCheckboxGroups([f], [])).toEqual([]);
  expect(rows.some(row => row.field.descriptor.inputType === 'checkbox')).toBe(false);
});

it('uses no writable handles for checkbox observations and refuses forged checkbox writes', () => {
  add('<label><input type="checkbox" id="consent">Consent</label>');
  const f = frame(); const groups = f.scan.checkboxGroups!;
  expect(groups).toHaveLength(1);
  const command = { scanId: f.scan.scanId, url: f.scan.url, actions: [{ ref: 99999, signature: '', type: 'radio' as const, index: 0 }] };
  expect(inspectNative(document, env, command)).toBe(false);
  expect(applyNative(document, env, command)).toEqual([{ ref: 99999, ok: false, status: 'refused' }]);
  expect((document.querySelector('#consent') as HTMLInputElement).checked).toBe(false);
  const previouslyText = document.querySelector<HTMLInputElement>('input')!;
  const savedField = f.scan.fields[0]!;
  previouslyText.type = 'checkbox';
  expect(applyNative(document, env, { ...command, actions: [{ ref: savedField.ref, signature: '', type: 'radio', index: 0 }] })[0]?.status).toBe('refused');
  expect(previouslyText.checked).toBe(false);
});

it('bounds and cleans display-only labels, rejects malformed observations, and tolerates an old scan', () => {
  const group = { id: 'checkbox-0', form: 0, label: '  Review\u202e this\n question  ', required: true, optionCount: 3, checkedCount: 1 };
  expect(sanitizeCheckboxGroups([group])?.[0]?.label).toBe('Review this question');
  expect(sanitizeCheckboxGroups([{ ...group, label: 'x'.repeat(2000) }])?.[0]?.label).toHaveLength(1000);
  expect(sanitizeCheckboxGroups(undefined)).toEqual([]);
  for (const invalid of [null, {}, [{ ...group, form: -2 }], [{ ...group, id: '__proto__' }], [{ ...group, checkedCount: 4 }], [{ ...group, optionCount: 0 }], [{ ...group, required: 'yes' }], [group, group]]) expect(sanitizeCheckboxGroups(invalid)).toBeNull();
  expect(sanitizeCheckboxGroups(Array.from({ length: 110 }, (_, i) => ({ ...group, id: `checkbox-${i}` })))?.length).toBe(100);
});

it('always shows empty, partial and checked groups as manual review with document-scoped IDs', () => {
  const groups = [0, 1, 2].map((checkedCount, i) => ({ id: `checkbox-${i}`, form: 0, label: `Question ${i}`, required: true, optionCount: 2, checkedCount, documentId: 'd' }));
  const views = checkboxGroupViews(groups);
  expect(views.map(view => view.status)).toEqual(['review', 'review', 'review']);
  expect(views[0]?.detail).toContain('Choose');
  expect(views[1]?.detail).toContain('Review');
  expect(views[2]?.detail).toContain('Review');
  expect(views[1]?.detail).toContain('not changed');
  expect(views[0]?.id).not.toBe(checkboxGroupViews([{ ...groups[0]!, documentId: 'other' }])[0]?.id);
});

it('does not hide a checkbox review question when an AI writing draft has the same label', () => {
  const [checkbox] = checkboxGroupViews([{ id: 'checkbox-0', form: 0, label: 'Describe your experience', required: true, optionCount: 2, checkedCount: 0, documentId: 'd' }]);
  expect(visibleAttentionFields([checkbox!, { id: 'textarea-d', label: checkbox!.label, status: 'review' }], [{ question: checkbox!.label }])).toEqual([checkbox]);
});
