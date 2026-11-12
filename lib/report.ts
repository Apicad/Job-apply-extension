/**
 * Pure report/validation helpers. Primarily trusted-side (background/popup);
 * the native page wrapper shares descriptor/job sanitizers for identical
 * canonical signatures. No storage, profile access or extension APIs here.
 * Two jobs:
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
 * every text and limits every size before anything is classified, shown or
 * stored. Text that is only shown is cut; text that decides an answer is
 * kept whole or left out (see "Limits" below).
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
//
// What happens to a text that is over its limit depends on what it is for:
//
// - Text that is only shown (job title, error message, placeholder) is cut.
// - Text that rules read is never cut. From a label, a name or a list of
//   options the classifier works out what a control asks for, and the answer
//   goes into an application. Half a question is a different question: cut
//   after 200 characters, "Do you have a disability … that would prevent you
//   from performing this job?" reads "Do you have a disability …", and the
//   profile's yes or no would answer it. So these texts are kept whole or
//   not at all, and their limits are "longer than any real one", not places
//   to cut. A control that is left out is not reported either: FrameScan has
//   no member that could say "one more control, which could not be read".
// - A list of options and an address are not cut either, for reasons of
//   their own: see sanitizeOptions and sanitizeAddress.
// ---------------------------------------------------------------------------

/** Controls kept per frame. */
const MAX_FIELDS = 400;
/** Options of one select or radio group. A full country list has 249 entries and a placeholder. */
const MAX_OPTIONS = 300;
/** Embedded frames remembered per document. */
const MAX_CHILD_ORIGINS = 100;

// Text lengths, in UTF-16 units (what String.length counts).
const MAX_URL = 2048;
/** A field's label and its group label. Questions on live Greenhouse forms run past 250 characters. */
const MAX_LABEL = 1000;
/** One option. Race options on live Greenhouse forms carry their definition: up to 255 characters. */
const MAX_OPTION_LABEL = 300;
/** The accept list of a file input. The type of a .docx file alone takes 71 characters. */
const MAX_ACCEPT = 1000;
/** Every other text: names, ids, placeholders, option values, job title, error message. */
const MAX_TEXT = 200;

/**
 * The answer for a text, a control or an address that has the right shape but
 * does not fit its limit. A symbol is a value of its own kind, so no text a
 * page sends can be mistaken for it.
 */
const TOO_LONG = Symbol('too long');
type TooLong = typeof TOO_LONG;

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

/** Text as a person would read it: nothing invisible, single spaces, no space at the ends. */
function tidy(text: string): string {
  return text.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/** Tidied text, at most `max` long. Only for text that is shown and never read by a rule. */
function cleanText(text: string, max: number): string {
  // Clean before cutting: invisible characters must not use up the limit.
  return cut(tidy(text), max);
}

// ---------------------------------------------------------------------------
// The result of the scan script
//
// Every sanitize… helper returns the clean value, or null when its input does
// not have the expected shape. One null anywhere makes the whole scan null:
// a scan that is wrong in one place is not trusted in the others.
//
// Some helpers have a third answer, TOO_LONG: the shape is right, but a text
// that rules read does not fit. That is the page's doing, not a broken scan,
// so only the control (or the address) it belongs to is left out.
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
  const url = sanitizeAddress(value.url);
  const job = sanitizeJob(value.job);
  const fields = sanitizeList(value.fields, MAX_FIELDS, sanitizeField);
  const childOrigins = sanitizeList(value.childOrigins, MAX_CHILD_ORIGINS, sanitizeAddress);
  const error = sanitizeText(value.error, MAX_TEXT);
  if (url === null || job === null || fields === null || childOrigins === null || error === null) return null;
  // '' for an address that could not be kept: no address names no site.
  return { url: url === TOO_LONG ? '' : url, top, shown, job, fields, childOrigins, error };
}

/** A text that is only shown: cleaned and cut to `max`. */
function sanitizeText(value: unknown, max: number): string | null {
  return typeof value === 'string' ? cleanText(value, max) : null;
}

/** A text that rules read: cleaned and kept whole, or TOO_LONG. Never cut. */
function sanitizeWholeText(value: unknown, max: number): string | TooLong | null {
  if (typeof value !== 'string') return null;
  const text = tidy(value);
  return text.length <= max ? text : TOO_LONG;
}

/**
 * The address of a frame, or the origin of a frame it embeds. Never cut: the
 * first 2048 characters of "https://<2026 letters>.greenhouse.io@evil.example/"
 * are an address on greenhouse.io, while the whole is a page on evil.example
 * (what stands before the "@" is a user name). An address that does not fit
 * is reduced to its origin, which is the part that says whose page it is.
 */
function sanitizeAddress(value: unknown): string | TooLong | null {
  if (typeof value !== 'string') return null;
  const address = tidy(value);
  if (address.length <= MAX_URL) return address;
  const origin = webOrigin(address);
  return origin !== null && origin.length <= MAX_URL ? origin : TOO_LONG;
}

/** "https://jobs.lever.co" for an http or https address; null for any other text. */
function webOrigin(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  // The same two schemes detectAts accepts. A blob: or data: page is not served by a site.
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
}

/**
 * The first `max` entries of a list, each sanitized. Entries past the limit
 * are not looked at, and an entry that is TOO_LONG is left out. The ones kept
 * stay in order.
 */
function sanitizeList<T>(value: unknown, max: number, sanitizeEntry: (entry: unknown) => T | TooLong | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const clean: T[] = [];
  for (const entry of value.slice(0, max)) {
    const cleanEntry = sanitizeEntry(entry);
    if (cleanEntry === null) return null;
    if (cleanEntry !== TOO_LONG) clean.push(cleanEntry);
  }
  return clean;
}

export function sanitizeJob(value: unknown): JobInfo | null {
  if (!isRecord(value)) return null;
  const title = sanitizeText(value.title, MAX_TEXT);
  const company = sanitizeText(value.company, MAX_TEXT);
  if (title === null || company === null) return null;
  return { title, company };
}

/** One control, or TOO_LONG when its description does not fit: such a control is left out of the scan. */
function sanitizeField(value: unknown): ScannedField | TooLong | null {
  if (!isRecord(value)) return null;
  const { ref, form, empty } = value;
  if (!isInteger(ref) || !isInteger(form) || typeof empty !== 'boolean') return null;
  const descriptor = sanitizeDescriptor(value.descriptor);
  if (descriptor === null || descriptor === TOO_LONG) return descriptor;
  return { ref, form, descriptor, empty };
}

function sanitizeDescriptor(value: unknown): FieldDescriptor | TooLong | null {
  if (!isRecord(value)) return null;
  const { control, required } = value;
  if (!isControlType(control) || typeof required !== 'boolean') return null;
  const texts = sanitizeDescriptorTexts(value);
  // No rule reads the placeholder; it is only shown when a control has no label.
  const placeholder = sanitizeText(value.placeholder, MAX_TEXT);
  const options = sanitizeOptions(value.options);
  // The shape is judged first, all of it: a malformed scan is null even where it is also too long.
  if (texts === null || placeholder === null || options === null) return null;
  if (texts === TOO_LONG) return TOO_LONG;
  return { control, ...texts, placeholder, required, options };
}

/** Native plan signatures and page rechecks use the same canonical descriptor.
 * Unlike display-only sanitization, never cut placeholder safety cues or option
 * values used to bind an exact choice. Oversized fields remain manual.
 */
export function sanitizeNativeDescriptor(value: unknown): FieldDescriptor | null {
 if (!isRecord(value)) return null;
 const descriptor = sanitizeDescriptor(value);
 if (descriptor === null || descriptor === TOO_LONG) return null;
 const placeholder = sanitizeWholeText(value.placeholder, MAX_TEXT);
 if (typeof placeholder !== 'string' || !Array.isArray(value.options)) return null;
 for (const option of value.options) if (!isRecord(option) || typeof sanitizeWholeText(option.value, MAX_TEXT) !== 'string') return null;
 return { ...descriptor, placeholder };
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

/**
 * The text members of a descriptor that rules read, each with its limit.
 * None of them is ever cut. Two cases a cut at 200 would get wrong: hints
 * ending "… email-input-of-referrer" would end in "email-input", the name of
 * Lever's e-mail box; and a name with "signature" after the cut would lose
 * the word that marks a field we never fill.
 */
const DESCRIPTOR_TEXT_LIMITS = {
  label: MAX_LABEL,
  groupLabel: MAX_LABEL,
  inputType: MAX_TEXT,
  autocomplete: MAX_TEXT,
  name: MAX_TEXT,
  id: MAX_TEXT,
  hints: MAX_TEXT,
  accept: MAX_ACCEPT,
};
type DescriptorTextKey = keyof typeof DESCRIPTOR_TEXT_LIMITS;
type DescriptorTexts = Pick<FieldDescriptor, DescriptorTextKey>;

function sanitizeDescriptorTexts(source: Record<string, unknown>): DescriptorTexts | TooLong | null {
  const texts: Partial<DescriptorTexts> = {};
  let fits = true;
  // Object.keys() only promises string[]; these are exactly the keys listed above.
  for (const key of Object.keys(DESCRIPTOR_TEXT_LIMITS) as DescriptorTextKey[]) {
    const text = sanitizeWholeText(source[key], DESCRIPTOR_TEXT_LIMITS[key]);
    if (text === null) return null;
    // Keep going after a text that is too long: a later one may have the wrong shape.
    if (text === TOO_LONG) fits = false;
    else texts[key] = text;
  }
  return fits ? (texts as DescriptorTexts) : TOO_LONG; // when all fit, the loop has set every key
}

/**
 * The options of a select or radio group: all of them, or none. Rules choose
 * "the only option that says X" and name it by its position, which means
 * nothing on part of a list or on half an option. A list that does not fit
 * comes back empty. That is how a dropdown is described whose choices cannot
 * be seen: nothing is chosen from it, and its control is still reported.
 */
function sanitizeOptions(value: unknown): ChoiceOption[] | null {
  if (!Array.isArray(value)) return null;
  let fits = value.length <= MAX_OPTIONS;
  const options: ChoiceOption[] = [];
  // Entries past the limit are not looked at.
  for (const entry of value.slice(0, MAX_OPTIONS)) {
    const option = sanitizeOption(entry);
    if (option === null) return null;
    if (option === TOO_LONG) fits = false;
    else options.push(option);
  }
  return fits ? options : [];
}

function sanitizeOption(value: unknown): ChoiceOption | TooLong | null {
  if (!isRecord(value)) return null;
  const label = sanitizeWholeText(value.label, MAX_OPTION_LABEL);
  // Options are chosen by position; the value is never used to choose one.
  const optionValue = sanitizeText(value.value, MAX_TEXT);
  if (label === null || optionValue === null || typeof value.disabled !== 'boolean') return null;
  if (label === TOO_LONG) return TOO_LONG;
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
