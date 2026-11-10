/**
 * Two jobs, both on the trusted side (background and popup), both pure:
 *
 * 1. `needsAttention` — which rows of a report the user still has to deal with.
 * 2. Guards for everything that reaches the background from outside it: a
 *    message from the popup (`isBackgroundRequest`) and the results of the
 *    scripts that ran in the page (`sanitizeFrameScan`, `sanitizeOutcomes`).
 *
 * Why guard the results of our own scripts? Their content is chosen by the
 * page: how many controls there are, how long a label is, which characters
 * it holds. TypeScript checks none of that at run time, and a script that
 * threw returns nothing at all. So the background checks the shape, cleans
 * every text and caps every size before anything is classified, shown or
 * stored.
 */
import type {
  BackgroundRequest,
  ChoiceOption,
  ControlType,
  FieldDescriptor,
  FieldStatus,
  FillOutcome,
  FrameScan,
  JobInfo,
  NeedsAttention,
  ScannedField,
} from './types';

// ---------------------------------------------------------------------------
// What still needs the user
// ---------------------------------------------------------------------------

/** Outcomes that leave a recognised field without an answer from us. */
const LEFT_FOR_USER: readonly FieldStatus[] = ['missing', 'noOption', 'unsupported', 'failed'];

/**
 * True for the rows the popup lists as still needing the user.
 *
 * `empty` is checked first so the list shrinks as the user works: a phone
 * field they typed into themselves is done, whatever we made of it.
 */
export const needsAttention: NeedsAttention = (result) => {
  if (!result.empty) return false;
  // An unrecognised field is only worth a mention when the form insists on it;
  // otherwise every optional "Anything else?" question would be listed.
  if (result.status === 'unknown') return result.required;
  return LEFT_FOR_USER.includes(result.status);
};

// ---------------------------------------------------------------------------
// Shape checks shared by the guards
// ---------------------------------------------------------------------------

/** A plain object, as JSON gives it: not null, not a list. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A whole number that JavaScript holds exactly: not 1.5, NaN, Infinity or '7'. */
function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

// ---------------------------------------------------------------------------
// Messages from the popup
// ---------------------------------------------------------------------------

/**
 * Guards chrome.runtime.onMessage in the background: a message arrives typed
 * `any`, and its tab id goes straight into chrome.scripting.
 */
export function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  if (!isRecord(value)) return false;
  if (value.type !== 'scan' && value.type !== 'fill') return false;
  // Real tabs have ids from 0 up; -1 is chrome.tabs.TAB_ID_NONE ("not a browser tab").
  return isInteger(value.tabId) && value.tabId >= 0;
}

// ---------------------------------------------------------------------------
// Limits. A page with a 6 MB heading or 50,000 inputs must not fill the
// extension's storage or freeze the popup.
// ---------------------------------------------------------------------------

/** Controls kept per frame. */
const MAX_FIELDS = 400;
/** Options kept per select or radio group. */
const MAX_OPTIONS = 200;
/** Embedded frames remembered per document. */
const MAX_CHILD_ORIGINS = 100;

// Text lengths, in UTF-16 units (what String.length counts).
const MAX_URL = 2048;
const MAX_OPTION_LABEL = 120;
/**
 * Labels and the group headings they sit under. Classification reads the whole question:
 * the word that makes an eligibility question unsafe ("without", "not", "any employer")
 * often comes after a long preamble. Cutting at the ordinary text limit would drop it
 * and the question would be answered. Still capped, so a page cannot hand us a megabyte.
 */
const MAX_LABEL = 4000;
/** Every other text: names, ids, placeholders, job title, error message. */
const MAX_TEXT = 200;

// ---------------------------------------------------------------------------
// Cleaning one text
// ---------------------------------------------------------------------------

/**
 * Characters nobody can see. A label must be the same text to the classifier
 * as to the person reading it.
 * - Control characters, except the five that act as white space (tab, line
 *   feed, vertical tab, form feed, carriage return), which `\s` handles.
 * - Soft hyphen, zero-width space, word joiner and byte-order mark: places
 *   where a line may or may not break. Hyphenation scripts put soft hyphens
 *   inside words, and "Acknowl-edgement" must still read as the word that
 *   marks a field we never fill.
 * - The characters that change writing direction. With a right-to-left
 *   override a label can show one thing in the popup and be another thing
 *   in memory.
 * Zero-width joiner and non-joiner stay: they shape emoji and Persian words.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u200b\u2060\ufeff\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** The first `max` units of a text, never ending on half a character or on a space. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  // Most emoji take two units, a "high" one and then a "low" one. When the
  // last unit we keep is a high one, its partner falls off: drop both.
  const lastKept = text.charCodeAt(max - 1);
  const splitsPair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, splitsPair ? max - 1 : max).trimEnd();
}

/** Text as a person would read it: nothing invisible, single spaces, no space at the ends, at most `max` long. */
function cleanText(text: string, max: number): string {
  // Clean before cutting: invisible characters must not use up the limit.
  return cut(text.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim(), max);
}

// ---------------------------------------------------------------------------
// The result of the scan script
//
// Every sanitize… helper returns the clean value, or null when its input does
// not have the expected shape. One null anywhere makes the whole scan null:
// a scan that is wrong in one place is not trusted in the others.
// ---------------------------------------------------------------------------

/**
 * Checks and cleans what the scan script returned for one frame. Returns a
 * new object holding only the members of FrameScan, or null when the value is
 * not a scan (the script threw, or returned something else).
 */
export function sanitizeFrameScan(value: unknown): FrameScan | null {
  if (!isRecord(value)) return null;
  const { top, shown } = value;
  // Strictly booleans: a missing `shown` must never be read as "shown".
  if (typeof top !== 'boolean' || typeof shown !== 'boolean') return null;
  const url = sanitizeText(value.url, MAX_URL);
  const job = sanitizeJob(value.job);
  const fields = sanitizeList(value.fields, MAX_FIELDS, sanitizeField);
  const childOrigins = sanitizeList(value.childOrigins, MAX_CHILD_ORIGINS, (origin) => sanitizeText(origin, MAX_URL));
  const error = sanitizeText(value.error, MAX_TEXT);
  if (url === null || job === null || fields === null || childOrigins === null || error === null) return null;
  return { url, top, shown, job, fields, childOrigins, error };
}

function sanitizeText(value: unknown, max: number): string | null {
  return typeof value === 'string' ? cleanText(value, max) : null;
}

/**
 * The first `max` entries of a list, each sanitized. Entries past the limit
 * are not looked at. The ones kept stay in order, so option indexes still
 * match the page.
 */
function sanitizeList<T>(value: unknown, max: number, sanitizeEntry: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const clean: T[] = [];
  for (const entry of value.slice(0, max)) {
    const cleanEntry = sanitizeEntry(entry);
    if (cleanEntry === null) return null;
    clean.push(cleanEntry);
  }
  return clean;
}

function sanitizeJob(value: unknown): JobInfo | null {
  if (!isRecord(value)) return null;
  const title = sanitizeText(value.title, MAX_TEXT);
  const company = sanitizeText(value.company, MAX_TEXT);
  if (title === null || company === null) return null;
  return { title, company };
}

function sanitizeField(value: unknown): ScannedField | null {
  if (!isRecord(value)) return null;
  const { ref, form, empty } = value;
  if (!isInteger(ref) || !isInteger(form) || typeof empty !== 'boolean') return null;
  const descriptor = sanitizeDescriptor(value.descriptor);
  if (descriptor === null) return null;
  return { ref, form, descriptor, empty };
}

function sanitizeDescriptor(value: unknown): FieldDescriptor | null {
  if (!isRecord(value)) return null;
  const { control, required } = value;
  if (!isControlType(control) || typeof required !== 'boolean') return null;
  const texts = sanitizeDescriptorTexts(value);
  const options = sanitizeList(value.options, MAX_OPTIONS, sanitizeOption);
  if (texts === null || options === null) return null;
  return { control, ...texts, required, options };
}

/** Every ControlType. Written as an object so the compiler notices when the union gains a member. */
const CONTROL_TYPES: Record<ControlType, true> = {
  text: true,
  textarea: true,
  select: true,
  radio: true,
  combobox: true,
  file: true,
};

function isControlType(value: unknown): value is ControlType {
  // hasOwn, not `in`: 'toString' and 'constructor' are "in" every object.
  return typeof value === 'string' && Object.hasOwn(CONTROL_TYPES, value);
}

/** The text members of a descriptor. They share one length limit. */
const DESCRIPTOR_TEXTS = [
  'inputType',
  'autocomplete',
  'label',
  'groupLabel',
  'name',
  'id',
  'placeholder',
  'hints',
  'accept',
] as const;
type DescriptorTexts = Pick<FieldDescriptor, (typeof DESCRIPTOR_TEXTS)[number]>;

function sanitizeDescriptorTexts(source: Record<string, unknown>): DescriptorTexts | null {
  const texts: Partial<DescriptorTexts> = {};
  for (const key of DESCRIPTOR_TEXTS) {
    const text = sanitizeText(source[key], key === 'label' || key === 'groupLabel' ? MAX_LABEL : MAX_TEXT);
    if (text === null) return null;
    texts[key] = text;
  }
  return texts as DescriptorTexts; // the loop has set every key
}

function sanitizeOption(value: unknown): ChoiceOption | null {
  if (!isRecord(value)) return null;
  const label = sanitizeText(value.label, MAX_OPTION_LABEL);
  const optionValue = sanitizeText(value.value, MAX_TEXT);
  if (label === null || optionValue === null || typeof value.disabled !== 'boolean') return null;
  return { label, value: optionValue, disabled: value.disabled };
}

// ---------------------------------------------------------------------------
// The result of the fill script
// ---------------------------------------------------------------------------

/**
 * What the fill script reported, reduced to the entries that mean something.
 * There is no "null" here: an entry that cannot be read is dropped, and its
 * control is then simply one we have no report for.
 */
export function sanitizeOutcomes(value: unknown): FillOutcome[] {
  if (!Array.isArray(value)) return [];
  const outcomes: FillOutcome[] = [];
  // A fill has at most one action per scanned field, so no more outcomes than that.
  for (const entry of value.slice(0, MAX_FIELDS)) {
    if (isRecord(entry) && isInteger(entry.ref) && typeof entry.ok === 'boolean') {
      outcomes.push({ ref: entry.ref, ok: entry.ok });
    }
  }
  return outcomes;
}
