/**
 * The handle table: how the fill script finds the controls the scan script
 * described. The scan remembers its controls here and reports only numbers
 * ("handles"); the fill turns a number back into the control.
 */
import type { Control, RecallControl, RememberControls } from '../types';

/**
 * The one global this extension adds to its own (isolated) world. The scan
 * and fill scripts are bundled separately, so each has its own copy of this
 * module; the global object of their shared world is all they have in common.
 */
const TABLE_KEY = '__jobApplyAssistantControls';

/**
 * An element held through WeakRef, with the document it was in. Job sites built
 * with React throw form elements away all the time; a table that held them
 * directly would keep every discarded copy of the form in memory.
 */
interface Kept<E extends Element> {
  el: WeakRef<E>;
  home: WeakRef<Document>;
}

/** A `Control` (see lib/types.ts) with each element swapped for a `Kept` one. */
type KeptControl =
  | { control: 'text' | 'combobox' | 'file'; el: Kept<HTMLInputElement> }
  | { control: 'textarea'; el: Kept<HTMLTextAreaElement> }
  | { control: 'select'; el: Kept<HTMLSelectElement> }
  | { control: 'radio'; el: Kept<HTMLInputElement>; radios: Kept<HTMLInputElement>[] };

/**
 * What is found under the table's name is `unknown` until checked. A browser
 * lets every script, this world included, reach the elements of the page by
 * their id as properties of the global object. Until a scan has put its table
 * here, a page with <form id="__jobApplyAssistantControls"> decides what the
 * name leads to, and `form[0]` is that form's first control.
 */
type WorldGlobals = typeof globalThis & { [TABLE_KEY]?: unknown };
const world: WorldGlobals = globalThis;

function isKept(value: unknown): value is Kept<Element> {
  if (typeof value !== 'object' || value === null) return false;
  const { el, home } = value as Record<string, unknown>;
  return el instanceof WeakRef && home instanceof WeakRef;
}

/** True for an entry that `keepControl` made: nothing else is ever turned back into a control. */
function isKeptControl(value: unknown): value is KeptControl {
  if (typeof value !== 'object' || value === null) return false;
  const { control, el, radios } = value as Record<string, unknown>;
  switch (control) {
    case 'text':
    case 'combobox':
    case 'file':
    case 'textarea':
    case 'select':
      return isKept(el);
    case 'radio':
      return isKept(el) && Array.isArray(radios) && radios.every(isKept);
    default:
      return false;
  }
}

function keep<E extends Element>(el: E): Kept<E> {
  return { el: new WeakRef(el), home: new WeakRef(el.ownerDocument) };
}

/**
 * The element again, or null when it no longer exists, is no longer on a page,
 * or is now on a different page than the one that was scanned.
 */
function onPage<E extends Element>(kept: Kept<E>): E | null {
  const el = kept.el.deref();
  if (el === undefined || !el.isConnected) return null;
  return el.ownerDocument === kept.home.deref() ? el : null;
}

function keepControl(control: Control): KeptControl {
  switch (control.control) {
    case 'text':
    case 'combobox':
    case 'file':
      return { control: control.control, el: keep(control.el) };
    case 'textarea':
      return { control: control.control, el: keep(control.el) };
    case 'select':
      return { control: control.control, el: keep(control.el) };
    case 'radio':
      return { control: control.control, el: keep(control.el), radios: control.radios.map(keep) };
  }
}

function withElement<K, E extends Element>(control: K, kept: Kept<E>): { control: K; el: E } | null {
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
    case 'select':
      return withElement(kept.control, kept.el);
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
 * order. Every call starts a new table, numbered from 0: handles from an
 * earlier scan stop meaning what they meant.
 */
export const rememberControls: RememberControls = (controls) => {
  world[TABLE_KEY] = controls.map(keepControl);
  return controls.map((_control, handle) => handle);
};

/** The control a handle stands for, or null when the handle is unknown or the control has left the page. */
export const recallControl: RecallControl = (ref) => {
  const table = world[TABLE_KEY];
  // Only a list can be the table: before the first scan the name may lead to an element of the page.
  // Handles are positions in it; anything else ("length", 0.5) names no control.
  if (!Array.isArray(table) || !Number.isInteger(ref)) return null;
  const kept: unknown = table[ref];
  return isKeptControl(kept) ? controlOnPage(kept) : null;
};
