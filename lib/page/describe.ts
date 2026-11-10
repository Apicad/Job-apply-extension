/**
 * Describes one control for the classifier: its label, the group it sits in, its options, and
 * whether the user has already answered it.
 *
 * Page side. It only reads, and it reads text the way a person sees it: nothing that markup hides,
 * no option lists, no button captions. What it returns is plain data; the profile never comes here.
 */
import type { ChoiceOption, Control, DescribeControl, IsEmpty } from '../types';
import { closestAcrossShadow, matchesSelector, ownLabels, ownWrappers, shadowHostOf } from './collect';
import { isHiddenByMarkup } from './visibility';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The data attributes sites use to name their fields, in the order they are reported. */
const HINT_ATTRIBUTES = ['data-automation-id', 'data-qa', 'data-testid', 'data-test', 'data-field', 'data-name'];

export const describeControl: DescribeControl = (control) => {
  const el = control.el;
  return {
    control: control.control,
    // `type` is the browser's reading of the attribute: lower case, "text" when absent or unknown
    inputType: el.localName === 'input' ? el.type : '',
    autocomplete: attribute(el, 'autocomplete').toLowerCase(),
    label: labelOf(control),
    groupLabel: groupLabelOf(control),
    name: attribute(el, 'name'),
    id: attribute(el, 'id'),
    placeholder: attribute(el, 'placeholder'),
    hints: HINT_ATTRIBUTES.map((name) => attribute(el, name))
      .filter((value) => value !== '')
      .join(' '),
    required: isRequired(control),
    options: optionsOf(control),
    accept: control.control === 'file' ? attribute(el, 'accept') : '',
  };
};

/** The "Empty means unanswered" rule of the project guide. */
export const isEmpty: IsEmpty = (control) => {
  switch (control.control) {
    case 'text':
    case 'textarea':
      return holdsNoText(control.el);
    case 'combobox':
      return holdsNoText(control.el) && !showsAnAnswer(control.el);
    case 'select':
      // every chosen option is a non-answer; true as well when nothing is chosen
      return Array.from(control.el.selectedOptions).every(isNoAnswer);
    case 'radio':
      return !control.radios.some((radio) => radio.checked);
    case 'file':
      return (control.el.files?.length ?? 0) === 0 && !showsAFile(control.el);
  }
};

// ---------------------------------------------------------------------------
// Reading nodes that may be a <form>
//
// A form answers for its controls by name, and those names win over the built-in properties: with
// <input name="childNodes"> inside it, `form.childNodes` is that input (see lib/page/collect.ts).
// A label, a legend or an element named by aria-labelledby can hold a form, or be one. So every
// read below goes through the prototype, where no page can replace it.
// ---------------------------------------------------------------------------

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;

function readThroughPrototype(node: Node, property: 'nodeType' | 'childNodes' | 'parentElement'): unknown {
  return Object.getOwnPropertyDescriptor(Node.prototype, property)?.get?.call(node);
}

function nodeTypeOf(node: Node): number {
  return readThroughPrototype(node, 'nodeType') as number;
}

function childNodesOf(node: Node): Node[] {
  return Array.from((readThroughPrototype(node, 'childNodes') as NodeListOf<ChildNode> | undefined) ?? []);
}

/** The parent element, or the host when `el` sits at the top of a shadow tree. */
function parentOf(el: Element): Element | null {
  return (readThroughPrototype(el, 'parentElement') as Element | null | undefined) ?? shadowHostOf(el);
}

function holds(container: Element, el: Element): boolean {
  return Node.prototype.contains.call(container, el);
}

/** An attribute's value, trimmed ('' when absent). */
function attribute(el: Element, name: string): string {
  return (Element.prototype.getAttribute.call(el, name) ?? '').trim();
}

/** The element with this id in the tree `from` lives in: its shadow root, or else the document. */
function elementById(from: Element, id: string): Element | null {
  const root = Node.prototype.getRootNode.call(from);
  switch (nodeTypeOf(root)) {
    case DOCUMENT_NODE:
      return Document.prototype.getElementById.call(root as Document, id);
    case DOCUMENT_FRAGMENT_NODE:
      return DocumentFragment.prototype.getElementById.call(root as DocumentFragment, id);
    default:
      return null; // a tree that is not on any page
  }
}

/** The elements a control is made of: every radio of a group, or the one element. */
function elementsOf(control: Control): FormControl[] {
  return control.control === 'radio' ? control.radios : [control.el];
}

// ---------------------------------------------------------------------------
// Text as a person reads it
// ---------------------------------------------------------------------------

/** What markup takes away from the reader, and what is code or a drawing rather than text. */
const NOT_SHOWN = 'script, style, template, noscript, svg, canvas, iframe, object, video, audio, [hidden], [aria-hidden="true" i]';

/**
 * What is shown but is not the label: the content of other controls (the options of a dropdown
 * would be glued to "Gender"), the caption of a button, a tooltip or an error message.
 */
const NOT_A_LABEL =
  `${NOT_SHOWN}, select, datalist, textarea, output, button, ` +
  '[role~="button" i], [role~="tooltip" i], [role~="alert" i]';

/**
 * Elements that run on in the line. Everything else starts and ends a line of its own, so its text
 * is set apart with a space: <div>Start</div><div>date</div> reads "Start date", while
 * "Portfolio (<a>what is this?</a>)" stays as written.
 */
const RUNS_ON =
  'a, abbr, acronym, b, bdi, bdo, big, cite, code, data, del, dfn, em, font, i, ins, kbd, label, mark, nobr, q, rp, rt, ruby, ' +
  's, samp, small, span, strike, strong, sub, sup, time, tt, u, var, wbr';

/** Deeper or larger than any real label; reaching either limit only cuts the text short. */
const MAX_TEXT_DEPTH = 40;
const MAX_TEXT_NODES = 3000;

interface TextAround {
  /** The text in front of the control (all of it when the control is not inside). */
  before: string;
  /** The text behind the control. */
  after: string;
}

interface Reading {
  /** The control's own elements: where "before" ends. */
  anchors: readonly Element[];
  /** Selector of the elements whose text is left out. */
  leaveOut: string;
  /** More elements to leave out: the options of a radio group, when its question is wanted. */
  isLeftOut?: (el: Element) => boolean;
  /**
   * Leaves out a link that wraps the control. Lever's upload is a link that holds the file input
   * and the caption "ATTACH RESUME/CV": that caption is the button, not the label.
   */
  withoutWrappingLink: boolean;
  /**
   * Sets the text of every element apart, not only of those on a line of their own. For looking
   * something up in a widget rather than reading a sentence: Lever prints the file name into one
   * <span> and the caption into the next, with nothing between them.
   */
  everyElementApart?: boolean;
}

function readText(root: Element, reading: Reading): TextAround {
  const before: string[] = [];
  const after: string[] = [];
  let seen = false;
  let nodesLeft = MAX_TEXT_NODES;
  const put = (text: string): void => {
    (seen ? after : before).push(text);
  };
  const holdsTheControl = (el: Element): boolean => reading.anchors.some((anchor) => holds(el, anchor));

  const visit = (parent: Node, depth: number): void => {
    for (const node of childNodesOf(parent)) {
      if (nodesLeft-- <= 0) return;
      const type = nodeTypeOf(node);
      if (type === TEXT_NODE) {
        put(node.nodeValue ?? '');
        continue;
      }
      if (type !== ELEMENT_NODE) continue;

      const el = node as Element;
      if (reading.anchors.includes(el)) {
        seen = true;
        continue;
      }
      const leftOut =
        matchesSelector(el, reading.leaveOut) ||
        reading.isLeftOut?.(el) === true ||
        (reading.withoutWrappingLink && matchesSelector(el, 'a') && holdsTheControl(el));
      if (leftOut) {
        // the control may be inside what is left out: what follows is still behind it
        if (holdsTheControl(el)) seen = true;
        continue;
      }

      const apart = reading.everyElementApart === true || !matchesSelector(el, RUNS_ON);
      if (apart) put(' ');
      if (depth < MAX_TEXT_DEPTH) visit(el, depth + 1);
      if (apart) put(' ');
    }
  };
  visit(root, 0);

  return { before: before.join(''), after: after.join('') };
}

/** White space of every kind becomes one space; none is left at the ends. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A label without what forms hang on it: "(required)" and "(optional)", the stars that mark a
 * required field, and a colon at the end. What is part of the wording stays: "Rate 1*5 stars",
 * "Time (HH:MM)", "Note: this is optional".
 */
function cleanLabel(text: string): string {
  return collapse(text.replace(/\((required|optional)\)/gi, ' '))
    .replace(/^[\s*✱]+/, '')
    .replace(/[\s*✱:]+$/, '');
}

/** The label text of an element: what stands in front of the control, or else what stands behind it. */
function captionIn(root: Element, anchors: readonly Element[]): string {
  const text = readText(root, { anchors, leaveOut: NOT_A_LABEL, withoutWrappingLink: true });
  // A floating label puts its text after the input. Otherwise text after a control is a hint,
  // an error, or the suggestion list of a typeahead (Lever's location box).
  return cleanLabel(text.before) || cleanLabel(text.after);
}

/** All the text of an element, on both sides of the control: the text of an option. */
function allTextIn(root: Element, anchors: readonly Element[]): string {
  const text = readText(root, { anchors, leaveOut: NOT_A_LABEL, withoutWrappingLink: false });
  return collapse(`${text.before} ${text.after}`);
}

/**
 * The name ARIA gives an element: the elements listed in aria-labelledby, in the order given, or
 * else aria-label. Not cleaned yet. '' when neither says anything.
 */
function ariaName(el: Element, anchors: readonly Element[]): string {
  const ids = attribute(el, 'aria-labelledby').split(/\s+/);
  const named = ids.flatMap((id) => {
    const target = id === '' ? null : elementById(el, id);
    return target === null ? [] : [captionIn(target, anchors)];
  });
  return collapse(named.join(' ')) || attribute(el, 'aria-label');
}

// ---------------------------------------------------------------------------
// The label
// ---------------------------------------------------------------------------

/**
 * How far up the text that belongs to an unlabelled control may sit. Lever's custom questions need
 * three levels: the dropdown's own wrapper, the field block, and the block that also holds the question.
 */
const LABEL_WRAPPER_LEVELS = 4;

/** Any number of levels: every ancestor that holds this one radio and no other field is part of its option. */
const WHOLE_OPTION = 50;

function labelOf(control: Control): string {
  // The labels of a radio name its option. The question of the group stands in front of the options.
  if (control.control === 'radio') return captionFromWrappers(control.radios, optionBlocks(control.radios));

  const el = control.el;
  const own = [el];
  const named = cleanLabel(ariaName(el, own));
  if (named !== '') return named;

  const labels = Array.from(el.labels ?? []);
  const fromLabels = cleanLabel(labels.map((label) => captionIn(label, own)).join(' '));
  if (fromLabels !== '') return fromLabels;

  return captionFromWrappers(own, []);
}

/**
 * The text that can only be about these elements: it stands in front of them, inside a wrapper that
 * holds no other field. The nearest wrapper that says anything decides. A wrapper that is a named
 * group (a fieldset with its legend) is read by that name alone, so that a control which is alone
 * in its group gets the same text for its label and for its group.
 */
function captionFromWrappers(own: readonly FormControl[], options: readonly Element[]): string {
  for (const wrapper of ownWrappers(own, LABEL_WRAPPER_LEVELS)) {
    const name = matchesSelector(wrapper, GROUP) ? groupName(wrapper, own) : '';
    if (name !== '') return name;

    const text = readText(wrapper, {
      anchors: own,
      leaveOut: NOT_A_LABEL,
      isLeftOut: (el) => options.includes(el),
      withoutWrappingLink: true,
    });
    const caption = cleanLabel(text.before);
    if (caption !== '') return caption;
  }
  return '';
}

/**
 * What belongs to one option each: the labels of every radio, and the outermost block that holds
 * just that radio. Their text is "Yes" and "No", never the question.
 */
function optionBlocks(radios: readonly HTMLInputElement[]): Element[] {
  return radios.flatMap((radio) => {
    const wrappers = ownWrappers([radio], WHOLE_OPTION);
    const outermost = wrappers[wrappers.length - 1];
    return outermost === undefined ? ownLabels(radio) : [...ownLabels(radio), outermost];
  });
}

// ---------------------------------------------------------------------------
// The group
// ---------------------------------------------------------------------------

/** What groups controls under one heading. */
const GROUP = 'fieldset, [role~="group" i], [role~="radiogroup" i]';

/** More groups around one control than any real page nests. */
const MAX_GROUPS = 20;

/** The name of a group: what ARIA names it, or else the legend of a fieldset. '' when it has none. */
function groupName(group: Element, anchors: readonly Element[]): string {
  const named = cleanLabel(ariaName(group, anchors));
  if (named !== '' || !matchesSelector(group, 'fieldset')) return named;
  // only the first <legend> child is the caption of a fieldset
  const legend = Element.prototype.querySelector.call(group, ':scope > legend');
  return legend === null ? '' : captionIn(legend, anchors);
}

/** The name of the closest group around the control that has one. */
function groupLabelOf(control: Control): string {
  const own = elementsOf(control);
  let from = parentOf(control.el);
  for (let passed = 0; from !== null && passed < MAX_GROUPS; passed++) {
    const group = closestAcrossShadow(from, GROUP);
    if (group === null) return '';
    const name = groupName(group, own);
    if (name !== '') return name;
    from = parentOf(group);
  }
  return '';
}

/** How far up the group that marks a lone control as required may sit (five levels on Greenhouse's upload). */
const REQUIRED_GROUP_LEVELS = 8;

function isRequired(control: Control): boolean {
  const own = elementsOf(control);
  // To the browser one required radio makes its whole group required.
  if (own.some((el) => el.required || attribute(el, 'aria-required') === 'true')) return true;
  // Greenhouse marks the group around an upload, and ARIA a radiogroup, instead of the inputs.
  // A group that holds other fields as well does not speak for this one.
  const group = ownWrappers(own, REQUIRED_GROUP_LEVELS).find((wrapper) => matchesSelector(wrapper, GROUP));
  return group !== undefined && attribute(group, 'aria-required') === 'true';
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** How far up the styled block of a radio without a label may reach (as in lib/page/visibility.ts). */
const RADIO_WRAPPER_LEVELS = 3;

function optionsOf(control: Control): ChoiceOption[] {
  if (control.control === 'select') {
    return Array.from(control.el.options, (option) => ({
      label: shownText(option),
      value: option.getAttribute('value') ?? '',
      // :disabled also covers an option inside <optgroup disabled>
      disabled: option.matches(':disabled'),
    }));
  }
  if (control.control === 'radio') {
    return control.radios.map((radio) => ({
      label: radioText(radio),
      value: radio.getAttribute('value') ?? '',
      disabled: radio.matches(':disabled'),
    }));
  }
  return [];
}

/** What a dropdown shows for an option: its label attribute when that says something, else its text. */
function shownText(option: HTMLOptionElement): string {
  return collapse(option.label) || collapse(option.text);
}

/**
 * The text of one radio: what ARIA names it, its own labels, or else the styled block around it.
 * Never its value, which is internal ("on" for every Ashby radio): an option nobody can read stays ''.
 */
function radioText(radio: HTMLInputElement): string {
  const own = [radio];
  const named = collapse(ariaName(radio, own));
  if (named !== '') return named;

  const fromLabels = collapse(
    ownLabels(radio)
      .map((label) => allTextIn(label, own))
      .join(' '),
  );
  if (fromLabels !== '') return fromLabels;

  for (const wrapper of ownWrappers(own, RADIO_WRAPPER_LEVELS)) {
    const text = allTextIn(wrapper, own);
    if (text !== '') return text;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Empty means unanswered
// ---------------------------------------------------------------------------

function holdsNoText(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  // badInput: the user typed something the box cannot turn into a value (half a month, "1e" in a
  // number box). `value` is '' then, but the box is not empty.
  return el.value.trim() === '' && el.validity?.badInput !== true;
}

/**
 * What a dropdown shows before anything is chosen: nothing, dashes, "Select…", "-- Please choose --",
 * "Click here (…)". Not "Choose not to disclose", which is an answer. Kept in step with the same
 * rule in lib/choices.ts, which this side must not import.
 */
const PLACEHOLDER = /^[\s\-–—_.…]*$|^[\s\-–—]*(please\s+)?(select|choose|pick|click\s+here)\b(?!\s+not\b)/i;

function isNoAnswer(option: HTMLOptionElement): boolean {
  if (option.value.trim() === '' || option.matches(':disabled')) return true;
  return option.index === 0 && PLACEHOLDER.test(shownText(option));
}

/** How far up the box of a custom dropdown reaches from its search input. */
const DROPDOWN_LEVELS = 4;

/**
 * The block in which a React-Select prints what was chosen ("select__single-value" on Greenhouse,
 * "…-singleValue" without a class prefix). It is there only once there is an answer.
 */
const SHOWN_ANSWER = '[class*="single-value" i], [class*="singlevalue" i], [class*="multi-value" i], [class*="multivalue" i]';

/**
 * True when a custom dropdown shows an answer although its text box is empty. On Greenhouse every
 * dropdown is a React-Select, whose search box never holds the choice: it is printed beside it.
 */
function showsAnAnswer(input: HTMLInputElement): boolean {
  const wrappers = ownWrappers([input], DROPDOWN_LEVELS);
  const box = wrappers[wrappers.length - 1];
  if (box === undefined) return false;
  return Array.from(box.querySelectorAll(SHOWN_ANSWER)).some((shown) => !isHiddenByMarkup(shown) && allShownText(shown, [input]) !== '');
}

/** How far up the upload widget around a file input may reach (as in lib/page/visibility.ts). */
const FILE_WIDGET_LEVELS = 4;

/**
 * A file name: something, a dot, a document or picture extension. The character in front of the dot
 * has to belong to a name, which keeps out ".pdf, .doc" in a list of accepted types.
 */
const FILE_NAME = /[\p{L}\p{N}_)\]]\.(pdf|docx?|rtf|txt|odt|pages|png|jpe?g|gif|heic|webp)(?![\p{L}\p{N}])/iu;

/** What the control beside an attached file says: "Remove", "Replace", "Delete file", "Change". */
const TAKES_THE_FILE_AWAY = /^(remove|replace|delete|change|clear)(\s|$)/i;

const CLICKABLE = 'button, a, [role~="button" i], input[type="button" i]';

/**
 * True when the upload widget shows that a file is attached although the input holds none. Job
 * sites upload a file the moment it is chosen and often empty the input afterwards; what is left
 * is the file's name (Lever prints it into the upload link) or a button to take it away again.
 */
function showsAFile(input: HTMLInputElement): boolean {
  const own = [input];
  const wrappers = ownWrappers(own, FILE_WIDGET_LEVELS);
  const widget = wrappers[wrappers.length - 1];
  const places: Element[] = widget === undefined ? ownLabels(input) : [...ownLabels(input), widget];

  return places.some((place) => {
    if (FILE_NAME.test(allShownText(place, own))) return true;
    return Array.from(place.querySelectorAll(CLICKABLE)).some(
      (clickable) => !isHiddenByMarkup(clickable) && TAKES_THE_FILE_AWAY.test(clickableName(clickable, own)),
    );
  });
}

/** Everything an element shows, button captions and link texts included, piece by piece. */
function allShownText(root: Element, anchors: readonly Element[]): string {
  const text = readText(root, {
    anchors,
    leaveOut: `${NOT_SHOWN}, select, datalist, textarea`,
    withoutWrappingLink: false,
    everyElementApart: true,
  });
  return collapse(`${text.before} ${text.after}`);
}

/** What a button or link is called: its aria-label, its caption, or else its tooltip. */
function clickableName(clickable: Element, anchors: readonly Element[]): string {
  // the caption of <input type="button"> is its value; on a <button> the value is form data
  const caption = matchesSelector(clickable, 'input') ? attribute(clickable, 'value') : allShownText(clickable, anchors);
  return attribute(clickable, 'aria-label') || caption || attribute(clickable, 'title');
}
