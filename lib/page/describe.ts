import type { ChoiceOption, DescribeControl, IsEmpty } from '../types';
import {
  closestAcrossShadow,
  elementById,
  holdsAnotherField,
  matchesSelector,
  ownLabels,
  ownWrappers,
  uploadWidgetOf,
  wholeRadioGroup,
} from './collect';
import { isHiddenByMarkup } from './visibility';
import { isComboboxEmpty } from './greenhouse';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The data attributes sites use to name their fields, in the order they are reported. */
const HINT_ATTRIBUTES = ['data-automation-id', 'data-qa', 'data-testid', 'data-test', 'data-field', 'data-name'];

/**
 * Elements whose text is never part of a label: other controls and their options (the text of a
 * label around Lever's gender dropdown would otherwise read "GenderSelect ...MaleFemale"), buttons,
 * and anything the page hides from people or from assistive technology (Greenhouse's "*").
 */
const NOT_LABEL_TEXT =
  'select, textarea, datalist, button, [role="button" i], ' +
  'script, style, noscript, svg, [hidden], [aria-hidden="true" i]';

/** Elements whose text a person is not shown at all. */
const NOT_SHOWN = 'select, textarea, datalist, script, style, noscript, [hidden], [aria-hidden="true" i]';

/**
 * Elements that start a new block. Text in a block inside a radio's label is a description under
 * the option ("A person having origins in…" under Lever's race options), not the option itself.
 */
const BLOCK =
  'address, article, aside, blockquote, dd, details, div, dl, dt, fieldset, figure, footer, form, ' +
  'h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, ul';

/** What groups controls under one name: a fieldset with its legend, or an ARIA group. */
const GROUP = 'fieldset, [role="group" i], [role="radiogroup" i]';

/**
 * Field wrappers of job sites that give a control no label at all, with the element that holds the
 * question. Lever's custom questions keep the text in a sibling of the control; Ashby's question
 * title is a label whose `for` often matches no element.
 */
const QUESTION_WRAPPERS: [wrapper: string, title: string][] = [
  ['.application-question', '.application-label'],
  ['[data-field-path]', '.ashby-application-form-question-title'],
];

/** How many wrappers up nearby text may be taken from, and how long it may be before it is a paragraph. */
const NEARBY_LEVELS = 4;
const NEARBY_MAX_LENGTH = 300;

export const describeControl: DescribeControl = (control) => {
  const el = control.el;
  const group = closestAcrossShadow(el, GROUP);
  const groupLabel = group === null ? '' : groupName(group, el);
  const shared = {
    autocomplete: attribute(el, 'autocomplete').toLowerCase(),
    groupLabel,
    name: attribute(el, 'name'),
    hints: HINT_ATTRIBUTES.map((name) => attribute(el, name))
      .filter((value) => value !== '')
      .join(' '),
  };

  // A group that holds no other field is this control's own widget. Greenhouse marks an upload as
  // required on such a group (aria-required), not on the input inside it.
  const own = control.control === 'radio' ? control.radios : [el];
  const widget = group !== null && !holdsAnotherField(group, own) ? group : null;
  const widgetRequired = widget !== null && attribute(widget, 'aria-required') === 'true';

  if (control.control === 'radio') {
    return {
      ...shared,
      control: 'radio',
      inputType: 'radio',
      // the question of the whole group: a radio's own label names its option, never the question
      label: questionOf(control.radios),
      id: '', // an id belongs to one option, not to the question
      placeholder: '',
      required: control.radios.some(isRequired) || widgetRequired,
      options: control.radios.map(radioOption),
      accept: '',
    };
  }

  if (control.control === 'file') {
    return {
      ...shared,
      control: 'file',
      inputType: 'file',
      // An upload is named by its widget: on Greenhouse the résumé and the cover letter inputs both
      // carry the label "Attach", and only their groups say "Resume/CV" and "Cover Letter".
      label: widget !== null && groupLabel !== '' ? groupLabel : labelOf(el),
      id: attribute(el, 'id'),
      placeholder: '',
      required: isRequired(el) || widgetRequired,
      options: [],
      accept: attribute(el, 'accept'),
    };
  }

  return {
    ...shared,
    control: control.control,
    // `type` is the browser's reading of the attribute: lower case, "text" when absent or unknown
    inputType: el.localName === 'input' ? el.type : '',
    label: labelOf(el),
    id: attribute(el, 'id'),
    placeholder: attribute(el, 'placeholder'),
    required: isRequired(el),
    options: control.control === 'select' ? Array.from(control.el.options, selectOption) : [],
    accept: '',
  };
};

/** Greenhouse marks its visible controls with aria-required only, so both spellings count. */
function isRequired(el: FormControl): boolean {
  return el.required || attribute(el, 'aria-required') === 'true';
}

// ---------------------------------------------------------------------------
// Options. One entry per <option> or radio, in DOM order, so that an index means the same thing here
// and in the page: placeholders and disabled options are listed too.
// ---------------------------------------------------------------------------

function selectOption(option: HTMLOptionElement): ChoiceOption {
  return {
    // the browser shows the label attribute, when there is one, instead of the text
    label: collapse(attribute(option, 'label') || (option.textContent ?? '')),
    value: option.getAttribute('value') ?? '',
    disabled: option.matches(':disabled'), // also true inside <optgroup disabled>
  };
}

function radioOption(radio: HTMLInputElement): ChoiceOption {
  return {
    label: radioOptionLabel(radio),
    // Ashby's radios have no value attribute; `radio.value` would then say "on"
    value: radio.getAttribute('value') ?? '',
    disabled: radio.matches(':disabled'), // also true inside <fieldset disabled>
  };
}

/** What the user reads next to one radio: the text of its own label, else its aria-label. */
function radioOptionLabel(radio: HTMLInputElement): string {
  const labels = ownLabels(radio);
  const withoutBlocks = { leaveOut: `${NOT_LABEL_TEXT}, ${BLOCK}` };
  const optionText = collapse(labels.map((label) => textIn(label, radio, withoutBlocks)).join(' '));
  if (optionText !== '') return optionText;

  // no text outside blocks: the option itself is written in one (<label><input><div>Yes</div></label>)
  const allText = collapse(labels.map((label) => textIn(label, radio)).join(' '));
  return allText !== '' ? allText : collapse(attribute(radio, 'aria-label'));
}

// ---------------------------------------------------------------------------
// Empty means unanswered (product rule 3: never overwrite what the user typed, chose or attached)
// ---------------------------------------------------------------------------

export const isEmpty: IsEmpty = (control) => {
  switch (control.control) {
    case 'radio':
      // The whole group as the browser sees it: a checked option that was never collected (it sits
      // in a part of the question collapsed with aria-hidden) is an answer all the same.
      return ![...control.radios, ...wholeRadioGroup(control.el)].some((radio) => radio.checked);
    case 'select':
      return isSelectEmpty(control.el);
    case 'file':
      return isFileInputEmpty(control.el);
    case 'combobox':
      return isComboboxEmpty(control.el);
    default:
      return control.el.value.trim() === '';
  }
};

/**
 * A dropdown is unanswered when nothing is selected, or when what is selected is not an answer: an
 * option with an empty value (Lever's "Select ..."), a disabled one (Ashby's placeholder), or a first
 * option that reads like a placeholder whatever its value. Anything else counts as an answer, so a
 * default the page chose is kept.
 */
function isSelectEmpty(select: HTMLSelectElement): boolean {
  const index = select.selectedIndex;
  const selected = select.options[index];
  if (selected === undefined) return true;
  if (selected.value === '' || selected.matches(':disabled')) return true;
  return index === 0 && readsLikePlaceholder(selectOption(selected).label);
}

/** "Select…", "-- Please choose --", "Pick one", or nothing but dashes. Not "Choose not to disclose". */
function readsLikePlaceholder(label: string): boolean {
  const text = label.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, ''); // drop leading dashes and brackets
  return text === '' || /^(please\s+)?(select|choose|pick)\b(?!\s+(not|to)\b)/.test(text);
}

/** A file name as an upload widget shows it: "Ada-Lovelace-Resume.pdf", but not the hint "(.pdf, .docx)". */
const FILE_NAME = /[\p{L}\p{N}_)\]]\.(pdf|docx?|rtf|txt|odt|pages)(?![\p{L}\p{N}])/iu;

/** The wording of a control that only exists once a file is attached. */
const REMOVES_FILE = /\b(replace|remove|delete)\b/i;

/**
 * A file input is unanswered when it holds no file and its upload widget shows none. Ashby restores
 * a saved résumé as a file name with a "Replace" button while the input itself stays empty, so
 * `files` alone would have us replace the user's file.
 */
function isFileInputEmpty(input: HTMLInputElement): boolean {
  if ((input.files?.length ?? 0) > 0) return false;

  const widget = uploadWidgetOf(input);
  if (widget === null) return true;
  if (FILE_NAME.test(textIn(widget, input, { leaveOut: NOT_SHOWN }))) return false;

  const clickables = Array.from(widget.querySelectorAll('button, a, [role="button" i], input[type="button" i]'));
  return !clickables.some((el) => {
    if (isHiddenByMarkup(el)) return false;
    const wording = [
      textIn(el, input, { leaveOut: NOT_SHOWN }),
      attribute(el, 'aria-label'),
      attribute(el, 'title'),
      attribute(el, 'value'),
    ];
    return REMOVES_FILE.test(wording.join(' '));
  });
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * The label of a control: the first of these that is not empty.
 * 1. The elements named by aria-labelledby.
 * 2. aria-label. (On Greenhouse it reads "First Name" where the label element reads "First Name*".)
 * 3. Its label elements.
 * 4. The question it belongs to: see `questionOf`.
 */
function labelOf(el: FormControl): string {
  const byReference = textNamedBy(el, el);
  if (byReference !== '') return byReference;

  const ariaLabel = cleanLabel(attribute(el, 'aria-label'));
  if (ariaLabel !== '') return ariaLabel;

  const labels = Array.from(el.labels ?? []).map((label) => labelText(label, el));
  const byLabel = cleanLabel(labels.join(' '));
  if (byLabel !== '') return byLabel;

  return questionOf([el]);
}

/**
 * The question a control (or a whole radio group) answers when nothing labels it directly. Each
 * source is used only if it belongs to this control alone, so a neighbour's text is never borrowed:
 * (a) the name of its group, when the group holds no other field. A legend over several fields is a
 *     section title: Greenhouse's "Phone" stands over a country dropdown and a number box.
 * (b) the question title of a Lever or Ashby field wrapper.
 * (c) text shortly before it, inside a wrapper of its own.
 */
function questionOf(own: readonly FormControl[]): string {
  const first = own[0];
  if (first === undefined) return '';

  const group = closestAcrossShadow(first, GROUP);
  if (group !== null && !holdsAnotherField(group, own)) {
    const name = groupName(group, first);
    if (name !== '') return name;
  }

  for (const [wrapperSelector, titleSelector] of QUESTION_WRAPPERS) {
    const wrapper = first.closest(wrapperSelector);
    if (wrapper === null || holdsAnotherField(wrapper, own)) continue;
    // the wrapper came out of a search and may be a form: its own querySelector cannot be trusted
    const title = Element.prototype.querySelector.call(wrapper, titleSelector);
    const text = title === null ? '' : cleanLabel(textIn(title, first));
    if (text !== '') return text;
  }

  // the labels of the controls themselves are no question: for radios they are the options
  const optionLabels = own.flatMap((control) => ownLabels(control));
  const isQuestionText = (text: Text): boolean =>
    isBefore(text, first) && !optionLabels.some((label) => label.contains(text));
  for (const wrapper of ownWrappers(own, NEARBY_LEVELS)) {
    const text = cleanLabel(textIn(wrapper, first, { keep: isQuestionText }));
    // a long run of text is a paragraph, not a question (and wrappers further out only add to it)
    if (text !== '' && text.length <= NEARBY_MAX_LENGTH) return text;
  }
  return '';
}

/** The name of a group: its legend if it is a fieldset that has one, else aria-labelledby, else aria-label. */
function groupName(group: Element, control: FormControl): string {
  // `group` came out of a search and may even be a <form role="group">, so it is only handed to
  // the safe helpers. Once it is known to be a fieldset, its own methods can be used.
  const legend = matchesSelector(group, 'fieldset') ? group.querySelector(':scope > legend') : null;
  const byLegend = legend === null ? '' : cleanLabel(textIn(legend, control));
  if (byLegend !== '') return byLegend;

  const byReference = textNamedBy(group, control);
  return byReference !== '' ? byReference : cleanLabel(attribute(group, 'aria-label'));
}

/** Controls whose text is what they hold (options, typed text), never a name for anything. */
const HOLDS_AN_ANSWER = 'select, textarea, datalist';

/**
 * The cleaned text of the elements that `el` names in its aria-labelledby attribute, in that order.
 * A control named there adds nothing: a dropdown that names itself beside its label
 * (aria-labelledby="label self", so that a screen reader also reads the chosen value) would
 * otherwise put every one of its options into the label.
 */
function textNamedBy(el: Element, control: FormControl): string {
  const texts = attribute(el, 'aria-labelledby')
    .split(/\s+/)
    .map((id) => elementById(el, id))
    .map((target) => (target === null || matchesSelector(target, HOLDS_AN_ANSWER) ? '' : textIn(target, control)));
  return cleanLabel(texts.join(' '));
}

/** The text of one label element, read as the label of `control`. */
function labelText(label: HTMLLabelElement, control: FormControl): string {
  if (!label.contains(control)) return textIn(label, control);

  // A label around its control often holds more than the label. Lever's location box keeps its
  // suggestion list ("No location found…") inside the label, after the input; and its résumé input
  // sits inside the link the user clicks, whose caption ("ATTACH RESUME/CV") is a button, not a name.
  const isCaption = (text: Text): boolean => {
    const link = text.parentElement === null ? null : Element.prototype.closest.call(text.parentElement, 'a');
    return link !== null && link.contains(control);
  };
  const before = textIn(label, control, { keep: (text) => isBefore(text, control) && !isCaption(text) });
  if (cleanLabel(before) !== '') return before;
  // Floating labels put the text after the input: <label><input><span>Email</span></label>.
  return textIn(label, control, { keep: (text) => !isBefore(text, control) && !isCaption(text) });
}

function isBefore(node: Node, other: Node): boolean {
  return (node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

interface TextOptions {
  /** Selector of the elements whose text is left out (NOT_LABEL_TEXT when absent). */
  leaveOut?: string;
  /** Which of the remaining text nodes to keep (all of them when absent). */
  keep?: (text: Text) => boolean;
}

/**
 * The text inside `root`, gathered from its text nodes and joined with spaces. `textContent` would
 * glue blocks together ("Full nameRequired"), and the rendered-text property that browsers offer is
 * missing in jsdom. `control` is only asked for its document.
 */
function textIn(root: Element, control: FormControl, options: TextOptions = {}): string {
  const leaveOut = options.leaveOut ?? NOT_LABEL_TEXT;
  // through the prototype: a page element named "createTreeWalker" would replace the document's own
  const walker = Document.prototype.createTreeWalker.call(control.ownerDocument, root, NodeFilter.SHOW_TEXT);

  const parts: string[] = [];
  while (walker.nextNode() !== null) {
    const text = walker.currentNode as Text;
    // A text node's properties are its own; the element around it may be a form, so that element
    // is only handed to methods taken from the prototype.
    const parent = text.parentElement;
    if (parent === null) continue;
    const excluded = Element.prototype.closest.call(parent, leaveOut);
    // only elements inside `root` leave text out: `root` itself was asked for
    const isLeftOut = excluded !== null && excluded !== root && Node.prototype.contains.call(root, excluded);
    if (!isLeftOut && (options.keep === undefined || options.keep(text))) parts.push(text.data);
  }
  return parts.join(' ');
}

/**
 * Tidies label text: one space between words, no required markers ("*", "✱", "(required)",
 * "(optional)") and no colon at the end. "First Name*", "Full name✱" and "Phone:" become
 * "First Name", "Full name" and "Phone".
 */
function cleanLabel(text: string): string {
  const words = text
    .replace(/\((required|optional)\)/gi, ' ')
    .split(/\s+/)
    // a marker at either end of a word, never one inside it ("Rate 1*5")
    .map((word) => word.replace(/^[*✱]+|[*✱]+$/g, ''))
    .filter((word) => word !== '');
  // markers and colons at the very end come in any order: "Legal name*:"
  return words.join(' ').replace(/[\s:*✱]+$/, '');
}

/** One space between words, none at the ends. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** An attribute's value, trimmed ('' when absent). Read through the prototype, so it is safe on a form. */
function attribute(el: Element, name: string): string {
  return (Element.prototype.getAttribute.call(el, name) ?? '').trim();
}
