/**
 * Choosing an option of a dropdown or a radio group for an answer in the
 * profile. Pure: no DOM.
 *
 * The rule (CLAUDE.md, product rule 2): an option is chosen only when it says
 * exactly what the profile says, and only when it is the one option that
 * does. Looking for the answer inside the option text is not enough: "male"
 * is inside "Female", "no" starts "None" and "Non-binary", and on real forms
 * all three veteran options contain "protected veteran". Zero matches or two
 * matches both mean: choose nothing and let the user decide.
 */
import { words } from './regions';
import type { ChoiceOption, ChoicePick, Disability, Gender, PickChoice, Race, Veteran, YesNo } from './types';

const MISSING: ChoicePick = { status: 'missing' };
const NO_OPTION: ChoicePick = { status: 'noOption' };

// ---------------------------------------------------------------------------
// Reading an option
// ---------------------------------------------------------------------------

/** An explanation in brackets after the answer: "White (Not Hispanic or Latino)". */
const IN_BRACKETS = /\([^()]*\)/g;

/**
 * The end of a first sentence that has more text after it. A full stop after
 * a single letter is an initial ("a U.S. citizen"), not the end of a sentence.
 */
const SENTENCE_END = /(?<!(?<![\p{L}\p{N}])\p{L})[.!?](?=\s+\S)/u;

/** The answer an option gives, without the explanations forms add: brackets, and anything after the first sentence. */
function answerPart(label: string): string {
  const text = withoutBrackets(label);
  const end = SENTENCE_END.exec(text);
  return end === null ? text : text.slice(0, end.index);
}

function withoutBrackets(text: string): string {
  const shorter = text.replace(IN_BRACKETS, ' ');
  // Brackets inside brackets go from the inside out, one round at a time.
  return shorter === text ? text : withoutBrackets(shorter);
}

/** A text as lower-case words with single spaces: the form in which texts are compared. */
function asWords(text: string): string {
  return words(text).join(' ');
}

/** Consent, agreement and attestation are never given for the user, however the question was understood. */
const NEVER_CHOSEN = /consent|agree|acknowledg|certif/;

/** What dropdowns show before anything is chosen: "Select...", "Please choose", "Click Here (...)". Not "Choose not to disclose". */
const PROMPT = /^(please )?(select|choose|pick|click here)\b(?! not\b)/;

/** An option that may be chosen: enabled, with text, not the dropdown's placeholder, not a consent. */
interface Readable {
  /** Position among all options of the control, placeholders and disabled ones included. */
  index: number;
  /** The text the user sees. */
  label: string;
  /** The whole text as words. */
  text: string;
  /** The answer part as words: "Non-binary (please specify)" reads "non binary". */
  phrase: string;
  /** Mentions consent, agreement or attestation: it counts as an option, but is never chosen. */
  neverChosen: boolean;
}

function readable(options: readonly ChoiceOption[]): Readable[] {
  const list: Readable[] = [];
  options.forEach((option, index) => {
    if (option.disabled) return;
    // Only the text the user sees counts. Values are internal ("on" for every
    // Ashby radio), and an option nobody can read is never chosen.
    const phrase = asWords(answerPart(option.label));
    if (phrase === '') return;
    if (index === 0 && PROMPT.test(phrase)) return;
    const text = asWords(option.label);
    list.push({ index, label: option.label, text, phrase, neverChosen: NEVER_CHOSEN.test(text) });
  });
  return list;
}

/** The one option that fits, or nothing: two fitting options are as bad as none. */
function only(fitting: readonly Readable[]): ChoicePick {
  const [first, ...others] = fitting;
  if (first === undefined || others.length > 0 || first.neverChosen) return NO_OPTION;
  return { status: 'match', index: first.index };
}

// ---------------------------------------------------------------------------
// Answers that forms word in their own ways
// ---------------------------------------------------------------------------

/** How forms word one answer of the profile. */
interface Wording {
  /** Accepted phrases, as words. The answer part of an option must be one of them, whole. */
  phrases: ReadonlySet<string>;
  /** Accepted patterns, for wordings with many variants. Each must cover the option from first word to last. */
  patterns: readonly RegExp[];
  /** Words that make the option a different answer wherever they stand, even inside brackets. */
  deny: readonly string[];
}

/** Phrases are written here as forms write them; they are compared as words, so capitals, hyphens and apostrophe styles do not matter. */
function wording(accept: readonly (string | RegExp)[], deny: readonly string[] = []): Wording {
  const phrases = new Set<string>();
  const patterns: RegExp[] = [];
  for (const accepted of accept) {
    if (typeof accepted === 'string') phrases.add(asWords(accepted));
    else patterns.push(accepted);
  }
  return { phrases, patterns, deny };
}

function says(option: Readable, answer: Wording): boolean {
  const all = option.text.split(' ');
  if (answer.deny.some((word) => all.includes(word))) return false;
  return answer.phrases.has(option.phrase) || answer.patterns.some((pattern) => pattern.test(option.phrase));
}

/**
 * Every way a form says "I would rather not answer": "Decline to
 * self-identify", "Prefer not to say", "I don't wish to answer", "I do not
 * want to answer". "I prefer to self-describe" is not one: it asks for more.
 */
const DECLINE =
  /^(i (would |'d )?)?(decline|prefer not|choose not|do not wish|don't wish|do not want|don't want) to (answer|say|disclose|respond|state|specify|identify|self identify)$/;

/** Brackets are dropped before an option is compared, so "Protected veteran (not ...)" needs this second check. */
const NEGATIONS = ['not', 'non', 'no', 'never'];

const DECLINING = wording([DECLINE]);

const GENDER: Record<Exclude<Gender, ''>, Wording> = {
  male: wording(['Male', 'Man']),
  female: wording(['Female', 'Woman']),
  nonbinary: wording(['Non-binary', 'Nonbinary', 'Non-binary or third gender']),
  decline: DECLINING,
};

// No "East Asian" under asian and no merged "Native American or Other Pacific
// Islander": a profile does not say which sub-group, and half an option is not an answer.
const RACE: Record<Exclude<Race, ''>, Wording> = {
  asian: wording(['Asian']),
  black: wording(['Black or African American', 'Black', 'African American', 'Black or of African descent']),
  hispanic: wording(['Hispanic or Latino', 'Hispanic', 'Latino', 'Hispanic/Latino']),
  white: wording(['White', 'White or European', 'Caucasian']),
  nativeAmerican: wording(['American Indian or Alaska Native', 'American Indian or Alaskan Native', 'Native American']),
  pacificIslander: wording(['Native Hawaiian or Other Pacific Islander', 'Native Hawaiian or Pacific Islander', 'Pacific Islander']),
  twoOrMore: wording(['Two or More Races', 'Two or more']),
  decline: DECLINING,
};

// US forms ask about "protected" veterans, and on the usual three-way
// question every option contains those two words. A veteran outside the
// protected classes, like somebody who never served, can only say "I am not
// a protected veteran" there.
const VETERAN: Record<Exclude<Veteran, ''>, Wording> = {
  notVeteran: wording(['I am not a protected veteran', 'I am not a veteran', 'Not a veteran', 'No military service']),
  protectedVeteran: wording(
    [
      'I identify as one or more of the classifications of protected veteran listed above',
      'I identify as one or more of the classifications of a protected veteran',
      'I identify as a protected veteran',
      'I am a protected veteran',
      'Protected veteran',
    ],
    NEGATIONS,
  ),
  veteranNotProtected: wording(['I am not a protected veteran', 'I identify as a non-protected veteran', 'Non-protected veteran']),
  decline: wording([DECLINE, 'I decline to self-identify for protected veteran status']),
};

function pickWorded<Answer extends string>(table: Record<Answer, Wording>, answer: Answer | '', options: readonly ChoiceOption[]): ChoicePick {
  // '' is "not answered". So is a value the table does not know: a profile
  // that skipped normalizeProfile may hold "Male" where "male" is meant.
  if (answer === '' || !Object.hasOwn(table, answer)) return MISSING;
  const wanted = table[answer];
  return only(readable(options).filter((option) => says(option, wanted)));
}

// ---------------------------------------------------------------------------
// Yes and no
// ---------------------------------------------------------------------------

/**
 * "Yes" or "No" alone, or followed by a clause after a comma or a dash:
 * "Yes, I am authorized", "No - I will need a visa". Not "None", "No-one",
 * "Not applicable" or "Yes with sponsorship".
 */
const YES_OR_NO = /^(yes|no)(?:\s*[,–—].*|\s+-.*|[\s.!]*)$/su;

function yesOrNo(option: Readable): YesNo {
  // "Yes, I consent" is a yes to something we never say yes to.
  if (option.neverChosen) return '';
  const said = YES_OR_NO.exec(answerPart(option.label).normalize('NFKC').trim().toLowerCase());
  if (said === null) return '';
  return said[1] === 'yes' ? 'yes' : 'no';
}

/**
 * A yes/no answer is given only when the options are exactly one "yes" and
 * one "no". Real lists that break this: ["Yes, no restriction.", "Yes, but I
 * will need sponsorship in the future.", "No, I need sponsorship now."] and
 * ["Yes", "No", "Unknown"]. There a bare yes or no is only close enough.
 *
 * `besides` names what may stand next to the yes and the no: the disability
 * question always offers a way to decline.
 */
function pickYesNo(answer: YesNo, options: readonly ChoiceOption[], besides?: Wording): ChoicePick {
  // Anything but the two stored answers is "not answered" - including "Yes"
  // from a hand-edited file, which must never be read as "not yes, so no".
  if (answer !== 'yes' && answer !== 'no') return MISSING;

  const found: { yes: Readable[]; no: Readable[] } = { yes: [], no: [] };
  for (const option of readable(options)) {
    const said = yesOrNo(option);
    if (said !== '') found[said].push(option);
    // A third kind of answer: this is not a plain yes/no question.
    else if (besides === undefined || !says(option, besides)) return NO_OPTION;
  }
  if (found.yes.length !== 1 || found.no.length !== 1) return NO_OPTION;
  return only(found[answer]);
}

/** "Yes, I have a disability, or have had one in the past" / "No, I do not have..." / "I do not want to answer". */
function pickDisability(answer: Disability, options: readonly ChoiceOption[]): ChoicePick {
  if (answer === 'decline') return only(readable(options).filter((option) => says(option, DECLINING)));
  return pickYesNo(answer, options, DECLINING);
}

// ---------------------------------------------------------------------------
// pickChoice
// ---------------------------------------------------------------------------

export const pickChoice: PickChoice = (kind, profile, options) => {
  switch (kind) {
    case 'workAuthorization':
      return pickYesNo(profile.workAuthorization, options);
    case 'sponsorship':
      return pickYesNo(profile.sponsorship, options);
    case 'gender':
      return pickWorded(GENDER, profile.gender, options);
    case 'race':
      return pickWorded(RACE, profile.race, options);
    case 'veteran':
      return pickWorded(VETERAN, profile.veteran, options);
    case 'disability':
      return pickDisability(profile.disability, options);
    default:
      return NO_OPTION;
  }
};
