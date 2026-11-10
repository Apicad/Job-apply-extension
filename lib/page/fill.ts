import type { FillFile, FillRadio, FillSelect, FillText } from '../types';

/**
 * Tells the page that a control was edited, with the same two events the
 * browser sends after a person edits it. `input` is `composed` so that it
 * leaves a shadow root, as the browser's own does: frameworks listen at the
 * document, and would never hear about a field inside a web component.
 */
function announceEdit(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

type ValueSetter = (this: unknown, value: string) => void;

/**
 * The browser's own `value` setter for this element, found by walking up its
 * prototype chain. Starting above the element skips a `value` property the
 * page put on the element itself (React does that to every controlled input).
 * Walking, rather than naming HTMLInputElement, finds the right setter for a
 * textarea too, and for an element from another frame.
 */
function findValueSetter(el: object): ValueSetter | null {
  let proto: object | null = Object.getPrototypeOf(el);
  while (proto !== null) {
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter !== undefined) return setter;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

export const fillText: FillText = (el, value) => {
  const setValue = findValueSetter(el);
  // Not a control with a value (a <div contenteditable>, say): nothing we know how to write.
  if (setValue === null) return false;

  // '' in the profile means "no answer"; writing it would only wipe the field.
  if (value.trim() !== '') {
    setValue.call(el, value);
    announceEdit(el);
  }
  return el.value.trim() !== '';
};

function holdsOneFile(input: HTMLInputElement): boolean {
  return input.files !== null && input.files.length === 1;
}

export const fillFile: FillFile = (input, file, assignFiles) => {
  assignFiles(input, [file]);
  // Job sites read `files[0]` in their change handler and upload it at once,
  // so they are only told when there is a file to read.
  if (holdsOneFile(input)) {
    announceEdit(input);
  }
  // Asked again after the events: the page may have refused the file. An input
  // the page has since removed still holds it (Greenhouse swaps the input for
  // the file name), and that counts.
  return holdsOneFile(input);
};

export const fillRadio: FillRadio = (radio) => {
  // The one click in this extension, so it must be unable to land on anything
  // but a radio button: not a checkbox, not a button, not a link.
  if (radio.localName !== 'input' || radio.type !== 'radio') return false;

  // A real click, because React answers a radio's click event and nothing else.
  // Never on a chosen radio: on Ashby a second click un-chooses it.
  if (!radio.checked && !radio.matches(':disabled')) {
    radio.click();
  }
  return radio.checked;
};

export const fillSelect: FillSelect = (el, index) => {
  // A list that takes several answers has no single answer to set.
  if (el.type !== 'select-one') return false;

  // Looked up first, because `selectedIndex` takes anything: -1 or a position
  // past the end clears the choice already made, and 2.5 quietly becomes 2.
  const option = el.options[index];
  if (option === undefined || option.matches(':disabled')) return false;

  // By position, not `el.value = …`: option values repeat on real forms.
  el.selectedIndex = index;
  announceEdit(el);
  return el.selectedIndex === index;
};
