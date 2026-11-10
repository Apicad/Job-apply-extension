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

type WorldGlobals = typeof globalThis & { [TABLE_KEY]?: KeptControl[] };
const world: WorldGlobals = globalThis;

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
  // Handles are positions in the table; anything else ("length", 0.5) names no control.
  const kept = Number.isInteger(ref) ? world[TABLE_KEY]?.[ref] : undefined;
  return kept === undefined ? null : controlOnPage(kept);
};
