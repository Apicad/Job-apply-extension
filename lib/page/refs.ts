/**
 * The handle table: how the fill script finds the controls the scan script
 * described. The scan remembers its controls here and reports only numbers
 * ("handles"); the fill turns a number back into the control. Nothing here
 * ever leaves the page.
 */
import type { Control, RecallControl, RememberControls } from '../types';

/**
 * The one global this extension adds to its own (isolated) world. The scan
 * and fill scripts are bundled separately, so each has its own copy of this
 * module; the global object of their shared world is all they have in common.
 */
const TABLE_KEY = '__jobApplyAssistantControls';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * An element held through a WeakRef, with the document it was in and what it
 * said about itself at the time (see `identityOf`). Job sites built with React
 * throw form elements away all the time; a table that held them directly would
 * keep every discarded copy of the form in memory.
 */
interface Kept<E extends FormControl> {
  el: WeakRef<E>;
  home: WeakRef<Document>;
  identity: string;
}

/**
 * A `Control` (see lib/types.ts) with each element swapped for a `Kept` one.
 * A dropdown is kept together with what it offered at the time: see `optionsOf`.
 */
type KeptControl =
  | { control: 'text' | 'combobox' | 'file'; el: Kept<HTMLInputElement> }
  | { control: 'textarea'; el: Kept<HTMLTextAreaElement> }
  | { control: 'select'; el: Kept<HTMLSelectElement>; options: string }
  | { control: 'radio'; el: Kept<HTMLInputElement>; radios: Kept<HTMLInputElement>[] };

type WorldGlobals = typeof globalThis & { [TABLE_KEY]?: KeptControl[] };
const world: WorldGlobals = globalThis;

/**
 * What an element says about itself that tells one question from the next: its
 * id, its name and its kind, written out as one text that is easy to compare.
 * A page built with React may hand the element of one question to another: a
 * follow-up question appears, and the box that was "LinkedIn Profile" is now
 * the box of the new question. The element is the same one, and only these
 * give the change away. The last three are how a text box announces that it
 * has become a custom dropdown, which is never typed into.
 */
function identityOf(el: FormControl): string {
  return JSON.stringify([
    el.id,
    el.name,
    el.type,
    el.getAttribute('role'),
    el.getAttribute('aria-autocomplete'),
    el.getAttribute('aria-haspopup'),
  ]);
}

function keep<E extends FormControl>(el: E): Kept<E> {
  return { el: new WeakRef(el), home: new WeakRef(el.ownerDocument), identity: identityOf(el) };
}

/**
 * The element again, or null when it no longer exists, is no longer on a page,
 * is now on a different page than the one that was scanned, or has become the
 * control of another question.
 */
function onPage<E extends FormControl>(kept: Kept<E>): E | null {
  const el = kept.el.deref();
  if (el === undefined || !el.isConnected) return null;
  if (el.ownerDocument !== kept.home.deref()) return null;
  return identityOf(el) === kept.identity ? el : null;
}

/**
 * What a dropdown offers: the value and the wording of every option, in order,
 * written out as one text so that two lists are easy to compare. Text, not the
 * option elements, because a page may build the same list again from scratch.
 */
function optionsOf(select: HTMLSelectElement): string {
  // `label` is what the browser shows for an option: its label attribute, else its text.
  return JSON.stringify(Array.from(select.options, (option) => [option.value, option.label]));
}

// The two functions below go through the kinds one by one, although some of
// the cases read the same. That is for the compiler: only in a case of its own
// does it know that a 'textarea' comes with a <textarea> element.

function keepControl(control: Control): KeptControl {
  switch (control.control) {
    case 'text':
    case 'combobox':
    case 'file':
      return { control: control.control, el: keep(control.el) };
    case 'textarea':
      return { control: control.control, el: keep(control.el) };
    case 'select':
      return { control: control.control, el: keep(control.el), options: optionsOf(control.el) };
    case 'radio':
      return { control: control.control, el: keep(control.el), radios: control.radios.map(keep) };
  }
}

function withElement<K, E extends FormControl>(control: K, kept: Kept<E>): { control: K; el: E } | null {
  const el = onPage(kept);
  return el === null ? null : { control, el };
}

function controlOnPage(kept: KeptControl): Control | null {
  switch (kept.control) {
    case 'text':
    case 'combobox':
    case 'file':
      return withElement(kept.control, kept.el);
    case 'textarea':
      return withElement(kept.control, kept.el);
    case 'select': {
      const found = withElement(kept.control, kept.el);
      // An action names an option by its position in the list, so a list that
      // is no longer the one that was scanned cannot be trusted either: when
      // a "Country" dropdown changes, the "State" one below it is refilled,
      // and the position that was Colorado may now be British Columbia.
      return found !== null && optionsOf(found.el) === kept.options ? found : null;
    }
    case 'radio': {
      const el = onPage(kept.el);
      if (el === null) return null;
      const radios: HTMLInputElement[] = [];
      for (const keptRadio of kept.radios) {
        const radio = onPage(keptRadio);
        // An action names a radio by its position in the group, so a group
        // that has lost a radio can no longer be trusted at all.
        if (radio === null) return null;
        radios.push(radio);
      }
      return { control: kept.control, el, radios };
    }
  }
}

/**
 * Remembers the controls of a scan and returns a handle for each, in the same
 * order. Every call starts a new table, numbered from 0, so a handle is only
 * good until the next scan: after that the same number means another control.
 */
export const rememberControls: RememberControls = (controls) => {
  world[TABLE_KEY] = controls.map(keepControl);
  return controls.map((_control, handle) => handle);
};

/**
 * The control a handle stands for. null when the handle is unknown, when the
 * control has left the page, and when it is no longer the control that was
 * scanned: a box that now carries another name, a radio group that has lost a
 * radio, a dropdown with other options. Call it just before writing, not ahead
 * of time: one answer can change the next control (choosing a country refills
 * the list of states; a "No" brings up a follow-up question).
 */
export const recallControl: RecallControl = (ref) => {
  // Until the first scan the name may not lead to our table at all: a page can
  // make any global name resolve to one of its elements by using it as an id.
  // Only a real array was put there by this module.
  const table: unknown = world[TABLE_KEY];
  if (!Array.isArray(table)) return null;

  // Handles are positions in the table; anything else ("length", 0.5) names no control.
  const kept: KeptControl | undefined = Number.isInteger(ref) ? table[ref] : undefined;
  return kept === undefined ? null : controlOnPage(kept);
};
