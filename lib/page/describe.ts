import type { DescribeControl, IsEmpty } from '../types';

/** The data attributes sites use to name their fields, in the order they are reported. */
const HINT_ATTRIBUTES = ['data-automation-id', 'data-qa', 'data-testid', 'data-test', 'data-field', 'data-name'];

export const describeControl: DescribeControl = (control) => {
  const el = control.el;
  return {
    control: control.control,
    // `type` is the browser's reading of the attribute: lower case, "text" when absent or unknown
    inputType: el.localName === 'input' ? el.type : '',
    autocomplete: attribute(el, 'autocomplete').toLowerCase(),
    label: '',
    groupLabel: '',
    name: attribute(el, 'name'),
    id: attribute(el, 'id'),
    placeholder: attribute(el, 'placeholder'),
    hints: HINT_ATTRIBUTES.map((name) => attribute(el, name))
      .filter((value) => value !== '')
      .join(' '),
    required: el.required || el.getAttribute('aria-required') === 'true',
    options: [],
    accept: control.control === 'file' ? attribute(el, 'accept') : '',
  };
};

export const isEmpty: IsEmpty = () => true;

/** An attribute's value, trimmed ('' when absent). */
function attribute(el: Element, name: string): string {
  return (el.getAttribute(name) ?? '').trim();
}
