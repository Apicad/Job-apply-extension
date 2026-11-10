import type { CollectControls, Control, FormIndex } from '../types';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type RadioGroup = Extract<Control, { control: 'radio' }>;

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/**
 * The <input> types a person types text into. Radios and file inputs are handled on their own;
 * every other type (password, hidden, search, checkbox, date, range, the button types…) is never collected.
 */
const TEXT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'month']);

/** autocomplete tokens of sign-in and one-time-code fields; card fields (cc-…) are matched by their prefix. */
const SIGN_IN_TOKENS = new Set(['one-time-code', 'username', 'current-password', 'new-password']);

/**
 * Regions whose controls are not form fields for us: anything hidden from assistive technology or
 * inert (React-Select's invisible required-field helper on Greenhouse), and site search.
 */
const NEVER_INSIDE = '[aria-hidden="true" i], [inert], search, [role~="search" i]';

/** Every element except forms: see `eachElement`. */
const NOT_A_FORM = '*:not(form)';

export const collectControls: CollectControls = (doc) => {
  const candidates: FormControl[] = [];
  eachElement(doc, (el) => {
    if (isFormControl(el)) candidates.push(el);
  });

  // A form with a password field is a sign-in or sign-up form: none of its controls are ours to fill.
  const signInForms = new Set<HTMLFormElement>();
  for (const el of candidates) {
    if (el.localName === 'input' && el.type === 'password' && el.form !== null) signInForms.add(el.form);
  }

  const controls: Control[] = [];
  const radioGroups: RadioGroup[] = [];

  for (const el of candidates) {
    if (el.form !== null && signInForms.has(el.form)) continue;
    if (closestAcrossShadow(el, NEVER_INSIDE) !== null) continue;
    if (hasPrivateAutocomplete(el)) continue;

    if (el.localName === 'textarea') {
      controls.push({ control: 'textarea', el: el as HTMLTextAreaElement });
    } else if (el.localName === 'select') {
      controls.push({ control: 'select', el: el as HTMLSelectElement });
    } else {
      const input = el as HTMLInputElement;
      // `input.type` is the browser's own reading of the attribute: lower case, and "text" when absent or unknown
      if (input.type === 'radio') {
        const group = radioGroups.find((candidate) => sameRadioGroup(candidate.el, input));
        if (group === undefined) {
          const created: RadioGroup = { control: 'radio', el: input, radios: [input] };
          radioGroups.push(created);
          controls.push(created); // a group sits where its first radio is
        } else {
          group.radios.push(input);
        }
      } else if (input.type === 'file') {
        controls.push({ control: 'file', el: input });
      } else if (TEXT_TYPES.has(input.type)) {
        controls.push({ control: isCombobox(input) ? 'combobox' : 'text', el: input });
      }
    }
  }
  return controls;
};

export const formIndex: FormIndex = (control) => {
  const owner = control.el.form;
  if (owner === null) return -1;

  const doc = control.el.ownerDocument;
  // the same list as document.forms, which a <form name="forms"> would replace
  const forms: Element[] = Array.from(Document.prototype.querySelectorAll.call(doc, 'form'));
  const index = forms.indexOf(owner);
  if (index !== -1) return index;

  // A form inside an open shadow root is not one of document.forms. Such forms are numbered after
  // the document's own, so that their controls are not lumped together with form-less controls.
  const shadowForms: Element[] = [];
  eachElement(doc, (el) => {
    if (el.shadowRoot !== null) shadowForms.push(...el.shadowRoot.querySelectorAll('form'));
  });
  const shadowIndex = shadowForms.indexOf(owner);
  return shadowIndex === -1 ? -1 : forms.length + shadowIndex;
};

// ---------------------------------------------------------------------------
// Asking questions about an element that may be a <form>
//
// A form cannot be trusted to answer for itself: it exposes its controls as properties named after
// them, and those names win over the built-in ones. On Lever's form `form.name` is the
// <input name="name">, and a control named "id", "elements" or "matches" does the same. The helpers
// below call the method straight from the prototype, where no page can replace it. Use them whenever
// the element comes from a search (`closest`, `querySelectorAll`) or from climbing through ancestors.
// ---------------------------------------------------------------------------

/** `el.matches(selector)`, safe on a form. */
export function matchesSelector(el: Element, selector: string): boolean {
  return Element.prototype.matches.call(el, selector);
}

/**
 * Like `el.closest(selector)` (and safe on a form), but carries on from the host when it reaches the
 * top of a shadow tree: an inert or aria-hidden host hides everything inside its shadow root as well.
 */
export function closestAcrossShadow(el: Element, selector: string): Element | null {
  let from: Element | null = el;
  while (from !== null) {
    const found = Element.prototype.closest.call(from, selector);
    if (found !== null) return found;
    from = shadowHostOf(from);
  }
  return null;
}

/** The element that hosts the shadow tree `el` is in, or null when `el` is not in a shadow tree. */
export function shadowHostOf(el: Element): Element | null {
  const root: Node = Node.prototype.getRootNode.call(el);
  return isShadowRoot(root) ? root.host : null;
}

// ---------------------------------------------------------------------------
// What belongs to one control
// ---------------------------------------------------------------------------

/**
 * Controls that count as a field of their own. Left out: hidden inputs (Lever keeps a hidden
 * `selectedLocation` beside its location box), button-type inputs, and helpers hidden from assistive
 * technology (React-Select's required-field input sits in the same wrapper as the dropdown it serves).
 */
const FIELD =
  'input:not([type="hidden" i], [type="submit" i], [type="button" i], [type="reset" i], [type="image" i], [aria-hidden="true" i]), ' +
  'select:not([aria-hidden="true" i]), textarea:not([aria-hidden="true" i])';

/** True when `container` holds a field other than the ones in `own`. */
export function holdsAnotherField(container: Element, own: readonly Element[]): boolean {
  const fields = Array.from(Element.prototype.querySelectorAll.call(container, FIELD));
  return fields.some((field) => !own.includes(field));
}

/**
 * The labels that belong to this control alone. Lever wraps a whole radio question, options and all,
 * in one outer <label>: that one names the question, not the first option.
 */
export function ownLabels(el: FormControl): HTMLLabelElement[] {
  return Array.from(el.labels ?? []).filter((label) => !holdsAnotherField(label, [el]));
}

/**
 * The wrappers that belong to these elements alone, nearest first: at most `maxLevels` ancestors,
 * counted from the first one that holds all of them, and stopping before a <form>, the page body or
 * any ancestor that also holds another field. Text or a button inside such a wrapper can only be
 * about this control; anything further out could be about its neighbours.
 */
export function ownWrappers(own: readonly Element[], maxLevels: number): Element[] {
  const wrappers: Element[] = [];
  // `own` holds controls and labels, never a form, so their properties can be read
  let ancestor = own[0]?.parentElement ?? null;
  while (ancestor !== null && wrappers.length < maxLevels) {
    const candidate = ancestor;
    if (matchesSelector(candidate, 'form, body, html')) break;
    if (own.every((el) => candidate.contains(el))) {
      if (holdsAnotherField(candidate, own)) break;
      wrappers.push(candidate);
    }
    ancestor = candidate.parentElement; // safe: `candidate` is not a form
  }
  return wrappers;
}

/**
 * Calls `visit` for every element of the document in document order, except <form> elements. The
 * content of an open shadow root comes right after its host. Closed roots stay closed: `shadowRoot`
 * is null for them.
 *
 * Forms are left out because a form cannot be trusted to answer for itself: it exposes its controls
 * as properties named after them, and those names win. On Lever's form `form.name` is the
 * <input name="name">, and a control named "id", "elements" or "shadowRoot" does the same. So nothing
 * here ever reads a property off a form; forms are only compared with `===`. A document has the same
 * weakness (<img name="querySelectorAll">), hence the call through the prototype.
 */
function eachElement(doc: Document, visit: (el: Element) => void): void {
  const walk = (elements: Iterable<Element>): void => {
    for (const el of elements) {
      visit(el);
      if (el.shadowRoot !== null) walk(el.shadowRoot.querySelectorAll(NOT_A_FORM));
    }
  };
  walk(Document.prototype.querySelectorAll.call(doc, NOT_A_FORM));
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;
}

function isFormControl(el: Element): el is FormControl {
  // the namespace check keeps out <svg><input>, which is an SVG element with none of an input's properties
  return (
    el.namespaceURI === HTML_NAMESPACE &&
    (el.localName === 'input' || el.localName === 'select' || el.localName === 'textarea')
  );
}

/**
 * The browser's own rule for which radios exclude each other: the same name, and the same form owner
 * or, without one, the same tree. A radio without a name is a group of its own.
 */
function sameRadioGroup(a: HTMLInputElement, b: HTMLInputElement): boolean {
  if (a.name === '' || a.name !== b.name) return false;
  return a.form === b.form && a.getRootNode() === b.getRootNode();
}

/** True when the autocomplete attribute names a card, one-time-code or sign-in field. */
function hasPrivateAutocomplete(el: Element): boolean {
  // the attribute is a list of tokens ("billing cc-number"), so each one is looked at whole
  const tokens = attribute(el, 'autocomplete').split(/\s+/);
  return tokens.some((token) => token.startsWith('cc-') || SIGN_IN_TOKENS.has(token));
}

/**
 * True for a text box that drives a custom dropdown or typeahead. Typing into one selects nothing:
 * on Greenhouse, where every dropdown is a React-Select, the text only filters a menu and is thrown away.
 */
function isCombobox(input: HTMLInputElement): boolean {
  const roles = attribute(input, 'role').split(/\s+/);
  if (roles.includes('combobox') || roles.includes('listbox')) return true;

  const autocomplete = attribute(input, 'aria-autocomplete');
  if (autocomplete === 'list' || autocomplete === 'both') return true;

  // "true", "listbox", "dialog"…: any value but "false" announces a popup
  return input.hasAttribute('aria-haspopup') && attribute(input, 'aria-haspopup') !== 'false';
}

/** An attribute's value, trimmed and in lower case ('' when absent). */
function attribute(el: Element, name: string): string {
  return (el.getAttribute(name) ?? '').trim().toLowerCase();
}
