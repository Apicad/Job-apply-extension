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

// ---------------------------------------------------------------------------
// Finding the controls of a document
// ---------------------------------------------------------------------------

/** Every control worth describing, in document order. Whether a person can see it is decided elsewhere. */
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

/** Which form a control belongs to, as a number that is the same for every control of that form. */
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

/**
 * Calls `visit` for every element of the document in document order, except <form> elements. The
 * content of an open shadow root comes right after its host. Closed roots stay closed: `shadowRoot`
 * is null for them.
 *
 * Forms are left out so that no property is ever read off one (see the next section): they cannot
 * host a shadow tree and are not controls, so nothing is lost. A document has the same weakness as
 * a form (<img name="querySelectorAll"> replaces `document.querySelectorAll`), hence the call
 * through the prototype.
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

/**
 * Every radio the browser groups with this one, whether it was collected or not. A group as
 * collected may lack some of them: an option inside a part of the question that the page collapsed
 * with aria-hidden is never collected, yet it can be the one that is checked.
 */
export function wholeRadioGroup(radio: HTMLInputElement): HTMLInputElement[] {
  const root: Node = Node.prototype.getRootNode.call(radio);
  let inputs: Element[] = [];
  if (isShadowRoot(root)) inputs = Array.from(root.querySelectorAll('input'));
  // through the prototype: <img name="querySelectorAll"> replaces the document's own
  else if (root.nodeType === Node.DOCUMENT_NODE) inputs = Array.from(Document.prototype.querySelectorAll.call(root as Document, 'input'));

  const group = [radio];
  for (const el of inputs) {
    // an <input> inside <svg> is no HTML input: it has no type, so it never passes as a radio
    const input = el as HTMLInputElement;
    if (input !== radio && input.type === 'radio' && sameRadioGroup(radio, input)) group.push(input);
  }
  return group;
}

/** True when the autocomplete attribute names a card, one-time-code or sign-in field. */
function hasPrivateAutocomplete(el: Element): boolean {
  // the attribute is a list of tokens ("billing cc-number"), so each one is looked at whole
  const tokens = lowerCaseAttribute(el, 'autocomplete').split(/\s+/);
  return tokens.some((token) => token.startsWith('cc-') || SIGN_IN_TOKENS.has(token));
}

/**
 * True for a text box that drives a custom dropdown or typeahead. Typing into one selects nothing:
 * on Greenhouse, where every dropdown is a React-Select, the text only filters a menu and is thrown away.
 */
function isCombobox(input: HTMLInputElement): boolean {
  const roles = lowerCaseAttribute(input, 'role').split(/\s+/);
  if (roles.includes('combobox') || roles.includes('listbox')) return true;

  const autocomplete = lowerCaseAttribute(input, 'aria-autocomplete');
  if (autocomplete === 'list' || autocomplete === 'both') return true;

  // "true", "listbox", "dialog"…: any value but "false" announces a popup
  return input.hasAttribute('aria-haspopup') && lowerCaseAttribute(input, 'aria-haspopup') !== 'false';
}

/** An attribute's value, trimmed and in lower case ('' when absent). */
function lowerCaseAttribute(el: Element, name: string): string {
  return (el.getAttribute(name) ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Asking questions about an element that may be a <form>
//
// A form cannot be trusted to answer for itself: it exposes its controls as properties named after
// them, and those names win over the built-in ones. On Lever's form `form.name` is the
// <input name="name">, and a control named "id", "elements" or "matches" does the same. The helpers
// below call the method straight from the prototype, where no page can replace it. Use them whenever
// the element comes from a search (`closest`, `querySelectorAll`) or from climbing through ancestors.
// Controls, labels and other elements known not to be forms can be used as usual.
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

/** The element with this id in the tree `near` is in: the ids of a shadow tree are private to it. */
export function elementById(near: Element, id: string): Element | null {
  const root: Node = Node.prototype.getRootNode.call(near);
  if (isShadowRoot(root)) return root.getElementById(id);
  // `root` is the document, unless `near` is not on the page at all
  return root.nodeType === Node.DOCUMENT_NODE ? Document.prototype.getElementById.call(root as Document, id) : null;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;
}

// ---------------------------------------------------------------------------
// What belongs to one control
//
// A label, a question or a button may be credited to a control only if it cannot belong to a
// neighbour. "Its own" therefore always means: inside something that holds no other field.
// ---------------------------------------------------------------------------

/**
 * Controls that count as a field of their own. Left out: hidden inputs (Lever keeps a hidden
 * `selectedLocation` beside its location box), button-type inputs, and helpers hidden from assistive
 * technology (React-Select's required-field input sits in the same wrapper as the dropdown it serves).
 */
const FIELD =
  'input:not([type="hidden" i], [type="submit" i], [type="button" i], [type="reset" i], [type="image" i], [aria-hidden="true" i]), ' +
  'select:not([aria-hidden="true" i]), textarea:not([aria-hidden="true" i])';

/**
 * Dropdowns that are drawn instead of native: something that opens a list of options. They are never
 * collected, but they are fields all the same. Workday's dropdown is a <button aria-haspopup="listbox">
 * with its own label, and the unlabelled text box beside it holds the key of the chosen option: that
 * box must not be taken for the field the label names.
 */
const DRAWN_DROPDOWN = '[aria-haspopup="listbox" i]:not([aria-hidden="true" i]), [role="combobox" i]:not([aria-hidden="true" i])';

/** How far up the upload widget around a file input may reach: as far as nearby label text is looked for. */
const UPLOAD_WIDGET_LEVELS = 4;

/**
 * True when `container` holds a field other than the ones in `own`. Open shadow trees inside it are
 * searched as well: a component library keeps the real <input> of each field in a shadow tree, so
 * a <fieldset> around two such fields holds no input at all when asked from outside, and its legend
 * would pass for the label of each of them.
 */
export function holdsAnotherField(container: Element, own: readonly Element[]): boolean {
  // A drawn box around an own control is that control's skin, not a neighbour: the older combobox
  // pattern is <div role="combobox"><input></div>.
  const isOwn = (field: Element): boolean => own.includes(field) || own.some((control) => isInside(field, control));

  const holdsOne = (search: (selector: string) => Iterable<Element>): boolean => {
    for (const field of search(`${FIELD}, ${DRAWN_DROPDOWN}`)) {
      if (!isOwn(field)) return true;
    }
    for (const el of search(NOT_A_FORM)) {
      const root = el.shadowRoot;
      if (root !== null && holdsOne((selector) => root.querySelectorAll(selector))) return true;
    }
    return false;
  };
  // `container` may be a form, hence the method from the prototype
  return holdsOne((selector) => Element.prototype.querySelectorAll.call(container, selector));
}

/** True when `el` is inside `container`, also when the edge of a shadow tree lies between them. */
function isInside(container: Element, el: Element): boolean {
  for (let node: Element | null = el; node !== null; node = shadowHostOf(node)) {
    if (Node.prototype.contains.call(container, node)) return true;
  }
  return false;
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
  // `own` holds controls, never a form, so their properties can be read
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
 * The upload widget around a file input: its outermost wrapper that holds no other field, or null.
 * The button a person clicks, and the file name shown after attaching, live in there.
 */
export function uploadWidgetOf(input: HTMLInputElement): Element | null {
  const wrappers = ownWrappers([input], UPLOAD_WIDGET_LEVELS);
  return wrappers[wrappers.length - 1] ?? null;
}
