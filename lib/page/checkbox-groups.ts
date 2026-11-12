import type { PageEnv } from '../types';
import { eachElement, closestAcrossShadow, formIndex, holdsAnotherField, matchesSelector } from './collect';
import { labelOf, questionOf } from './describe';
import { isRadioSeen } from './visibility';
import { sanitizeCheckboxGroups, type CheckboxGroup } from '../hackathon/checkbox-groups';

const GROUP = 'fieldset, [role~="group" i], .application-question, [data-field-path]';
const NEVER_INSIDE = 'search, [role~="search" i]';
const MAX_OPTIONS = 2000;
type Group = { anchor: Element | null; inputs: HTMLInputElement[] };

/** Checkboxes are observed separately; none ever enters the control handle table or fill engine. */
export function collectCheckboxGroups(doc: Document, env: PageEnv): CheckboxGroup[] {
  const inputs: HTMLInputElement[] = [];
  const authForms = new Set<HTMLFormElement>();
  eachElement(doc, el => {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || el.localName !== 'input') return;
    const input = el as HTMLInputElement;
    if (input.type === 'password' && input.form) authForms.add(input.form);
    if (input.type === 'checkbox' && inputs.length < MAX_OPTIONS) inputs.push(input);
  });
  const allowed = inputs.filter(input => (!input.form || !authForms.has(input.form)) &&
    !closestAcrossShadow(input, NEVER_INSIDE) &&
    !/(?:^|\s)(?:cc-\S+|one-time-code|username|current-password|new-password)(?:\s|$)/i.test(input.autocomplete) &&
    isRadioSeen(input, env));
  const groups: Group[] = [];
  for (const input of allowed) {
    const root = input.getRootNode();
    let anchor: Element | null = null;
    for (let parent = input.parentElement; parent && !matchesSelector(parent, 'form, body, html'); parent = parent.parentElement) {
      if (!matchesSelector(parent, GROUP)) continue;
      const candidate = parent;
      // Hidden options still belong to this question structurally. Counting
      // them as foreign controls would discard the legend and merge distinct
      // questions with a shared name. Only visible options are reported below.
      const members = inputs.filter(other => other.form === input.form && other.getRootNode() === root && candidate.contains(other));
      if (members.length && !holdsAnotherField(candidate, members)) { anchor = candidate; break; }
    }
    const group = groups.find(g => g.inputs[0]!.form === input.form && g.inputs[0]!.getRootNode() === root &&
      (anchor ? g.anchor === anchor : g.anchor === null && input.name !== '' && g.inputs[0]!.name === input.name));
    if (group) group.inputs.push(input);
    else groups.push({ anchor, inputs: [input] });
  }
  return sanitizeCheckboxGroups(groups.slice(0, 100).map((group, index) => {
    const first = group.inputs[0]!;
    const structuralMembers = group.anchor ? inputs.filter(input => input.form === first.form && input.getRootNode() === first.getRootNode() && group.anchor!.contains(input)) : group.inputs;
    return { id: `checkbox-${index}`, form: formIndex({ control: 'text', el: first }),
      label: questionOf(structuralMembers) || (group.inputs.length === 1 ? labelOf(first) : '') || `Checkbox group (${group.inputs.length} options)`,
      required: group.inputs.some(input => input.required || input.getAttribute('aria-required') === 'true') || group.anchor?.getAttribute('aria-required') === 'true',
      optionCount: group.inputs.length, checkedCount: group.inputs.filter(input => input.checked).length };
  })) ?? [];
}
