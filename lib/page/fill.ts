/**
 * Writing one answer into one control, in a way the page notices.
 *
 * These helpers only know how to write, and each does only what a person
 * could do with the control in front of them: type into a text box that takes
 * typing and has room for the text, choose an option that can be chosen, click
 * a radio button that can be clicked, give a file to a file input. A script is
 * let through where a person is stopped, so each of these is checked here.
 *
 * Whether a control should be written at all (is it still empty, still
 * visible, the control that was planned?) is decided by the caller. Each
 * helper returns true when the control holds an answer afterwards, which is
 * checked on the control itself, never assumed.
 *
 * Nothing here focuses, blurs, selects or scrolls to a control. While the
 * popup is open the page does not have focus, so focusing would behave
 * differently for a real user than in any test, and some forms react badly
 * to it (Lever's location box wipes itself on blur).
 */
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
 * page put on the element itself: React does that to every controlled input,
 * and a write through it is one React then ignores. Walking, rather than
 * naming HTMLInputElement, finds the right setter for a textarea too, for an
 * element from another frame, and for a class the page built on top of input.
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

/**
 * The kinds of <input> a person types text into: the six the scan collects as
 * text fields (CLAUDE.md, "Never collected", lists the kinds that are left out).
 */
const TYPED_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'month']);

/** True for a box that text is typed into: a <textarea>, or an <input> of one of the typed kinds. */
function isTextBox(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  // `type` is the browser's reading of the attribute: lower case, "text" when absent or unknown.
  return el.localName === 'textarea' || (el.localName === 'input' && TYPED_INPUT_TYPES.has(el.type));
}

/**
 * True when the text is longer than the box takes. A browser stops a person's
 * typing at `maxlength`, but lets a script write past it and never complains.
 * What the site then does with the rest is its own affair, and a phone number
 * cut down to the ten characters it expected is a wrong answer.
 */
function isTooLongFor(el: HTMLInputElement | HTMLTextAreaElement, text: string): boolean {
  // `maxLength` is -1 when the page sets no limit, or one that is not a number.
  return el.maxLength >= 0 && text.length > el.maxLength;
}

/**
 * True when a person could type into the box right now. A script's write goes
 * through even when the page has switched the box off or made it read-only.
 */
function takesTyping(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  // :disabled also covers a box inside <fieldset disabled>, where `el.disabled` itself is false
  return !el.matches(':disabled') && !el.readOnly;
}

/** Types text into a text box. True when the box is not blank afterwards. */
export const fillText: FillText = (el, value) => {
  // Many things have a `value` a script can set, and only a text box takes an
  // answer that way. On a dropdown it would choose or clear an option; on a
  // radio button it would change what the form sends for that option.
  if (!isTextBox(el)) return false;

  const setValue = findValueSetter(el);
  // No setter to call (a page can delete it in a world it shares with us): nothing we know how to write.
  if (setValue === null) return false;

  // '' in the profile means "no answer"; writing it would only wipe the field.
  if (value.trim() !== '' && takesTyping(el) && !isTooLongFor(el, value)) {
    setValue.call(el, value);
    announceEdit(el);
  }
  // "Not blank" rather than "equal to what was written": a phone field with an
  // input mask rewrites the text, while a number field given words keeps nothing.
  return el.value.trim() !== '';
};

/**
 * Options a person cannot choose although a script can: disabled ones (also
 * through their <optgroup>), and ones the page has hidden, which a browser
 * leaves out of the list it opens.
 */
const NOT_ON_OFFER = ':disabled, [hidden], optgroup[hidden] > option';

/** Chooses the option at `index` of a dropdown. True when that option is the chosen one afterwards. */
export const fillSelect: FillSelect = (el, index) => {
  // A list that takes several answers has no single answer to set. The tag is
  // asked as well, because a link can give its type as "select-one" too.
  if (el.localName !== 'select' || el.type !== 'select-one') return false;

  // A position is a whole number from 0 to the last option. Anything else is
  // turned away before the lookup. `selectedIndex` takes whatever it is given:
  // a position past the end clears the choice already made. And a list of
  // options answers to names as well as positions: where an option has the id
  // "2.5" (a band of grades, say), `options[2.5]` finds it.
  if (!Number.isInteger(index) || index < 0 || index >= el.options.length) return false;

  const option = el.options[index];
  if (option === undefined || option.matches(NOT_ON_OFFER)) return false;
  // A list that is switched off as a whole offers a person nothing to choose,
  // though none of its options is marked as disabled.
  if (el.matches(':disabled')) return false;

  // By position, not `el.value = …`: option values repeat on real forms.
  el.selectedIndex = index;
  announceEdit(el);
  return el.selectedIndex === index;
};

/** Chooses one radio button of a group. True when it is the chosen one afterwards. */
export const fillRadio: FillRadio = (radio) => {
  // The one click in this extension, so it must be unable to land on anything
  // but a radio button: not a checkbox, not a button, not a link.
  if (radio.localName !== 'input' || radio.type !== 'radio') return false;

  // A real click, because React answers a radio's click event and nothing
  // else; the click brings its own input and change events. Never on a chosen
  // radio: on Ashby a second click un-chooses it.
  if (!radio.checked && !radio.matches(':disabled')) {
    radio.click();
  }
  return radio.checked;
};

function holdsOneFile(input: HTMLInputElement): boolean {
  return input.files !== null && input.files.length === 1;
}

/**
 * Attaches a file to a file input. True when the input holds exactly that one
 * file afterwards. `assignFiles` does the part only a real browser can do.
 */
export const fillFile: FillFile = (input, file, assignFiles) => {
  // On something that is not an input at all, `files = …` only sets an ordinary
  // property, which would then pass for an attached file.
  if (input.localName !== 'input' || input.type !== 'file') return false;
  // Switched off: a person could not choose a file here, so neither do we.
  if (input.matches(':disabled')) return holdsOneFile(input);

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
