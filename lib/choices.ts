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
 *
 * How texts are compared: as lower-case words (`words` in regions.ts), so
 * capitals, accents, punctuation, hyphens and apostrophe styles do not count.
 * For the answers that forms word themselves (yes/no, gender, race, veteran,
 * disability) the explanation an option carries is dropped first: anything in
 * brackets and anything after the first sentence. For what the user typed (a
 * school, a degree) nothing is dropped.
 *
 * The result names an option by its position in the list it was given, which
 * is its position on the page.
 */
import { MONTH_NAMES, yearAndMonth, autofillAllowed } from './profile';
import { countryCode, findCountries, stateCode, words } from './regions';
import type { ChoiceOption, ChoicePick, Disability, Gender, PickChoice, Race, Veteran, YesNo } from './types';

const MISSING: ChoicePick = { status: 'missing' };
const NO_OPTION: ChoicePick = { status: 'noOption' };

// ---------------------------------------------------------------------------
// Reading an option
// ---------------------------------------------------------------------------

/**
 * The end of a first sentence that has more text after it: "Yes. I can show
 * proof." A question mark ends no answer: "Yes? I am not sure." is a doubt.
 */
const SENTENCE_END = /[.!](?=\s+\S)/;

/** The answer an option gives, without the explanations forms add: brackets, and anything after the first sentence. */
function answerPart(label: string): string {
  const text = withoutBrackets(label);
  const end = SENTENCE_END.exec(text);
  return end === null ? text : text.slice(0, end.index);
}

/**
 * Drops explanations in brackets: "White (Not Hispanic or Latino)" reads
 * "White". A bracket that never closes is kept with all that follows: the
 * text was cut short somewhere, and what the cut hid is unknown.
 *
 * One pass over the text, whatever a page puts into it.
 */
function withoutBrackets(text: string): string {
  const kept: string[] = [];
  /** Where each bracket that is still open begins in `kept`. */
  const open: number[] = [];
  for (const character of text) {
    const start = character === ')' ? open.pop() : undefined;
    if (start !== undefined) {
      // The bracket closes: forget everything since it opened.
      kept.length = start;
      kept.push(' ');
      continue;
    }
    if (character === '(') open.push(kept.length);
    kept.push(character);
  }
  return kept.join('');
}

/** A text as lower-case words with single spaces: the form in which texts are compared. */
function asWords(text: string): string {
  return words(text).join(' ');
}

/** Consent, agreement and attestation are never given for the user, however the question was understood. */
const NEVER_CHOSEN = /consent|agree|acknowledg|certif/;

/**
 * What dropdowns show before anything is chosen: "Select...", "Please choose",
 * "Pick one", Lever's "Click Here (...)". Not "Choose not to disclose" or
 * "Choose to self-describe", which are answers.
 */
const PROMPT = /^(please )?(select|choose|pick|click here)\b(?! (not|to)\b)/;

/** An option the user could pick: enabled, with text, and not the dropdown's placeholder. */
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
    const text = asWords(option.label);
    if (text === '') return;
    if (index === 0 && PROMPT.test(text)) return;
    list.push({ index, label: option.label, text, phrase: asWords(answerPart(option.label)), neverChosen: NEVER_CHOSEN.test(text) });
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

/** How forms word one answer of the profile: what is accepted, and what is refused. */
interface Wording {
  /** Accepted phrases, as words. The answer part of an option must be one of them, whole. */
  phrases: ReadonlySet<string>;
  /** Accepted patterns, for wordings with many variants. Each must cover the option from first word to last. */
  patterns: readonly RegExp[];
  /** Words that make the option a different answer wherever they stand, even inside brackets. */
  deny: readonly string[];
}

/**
 * Phrases are written here the way forms write them. They are compared as
 * words, so capitals, hyphens and apostrophe styles do not matter.
 */
function wording(accept: readonly (string | RegExp)[], deny: readonly string[] = []): Wording {
  const phrases = new Set<string>();
  const patterns: RegExp[] = [];
  for (const accepted of accept) {
    if (typeof accepted === 'string') phrases.add(asWords(accepted));
    else patterns.push(accepted);
  }
  return { phrases, patterns, deny };
}

/** True when the option gives this answer: its answer part is an accepted wording and no deny word stands anywhere in its text. */
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
  /^(i |i'd |i would )?(decline|prefer not|choose not|do not wish|don't wish|do not want|don't want) to (answer|say|disclose|respond|state|specify|identify|self identify)$/;

/**
 * The deny-list of an answer that a negation turns into its opposite.
 * Brackets are dropped before an option is compared, so without this second
 * check "Protected veteran (not ...)" would read "Protected veteran".
 */
const NEGATIONS = ['not', 'non', 'no', 'never'];

const DECLINING = wording([DECLINE]);

const GENDER: Record<Exclude<Gender, ''>, Wording> = {
  male: wording(['Male', 'Man']),
  female: wording(['Female', 'Woman']),
  nonbinary: wording(['Non-binary', 'Nonbinary', 'Non-binary or third gender', 'Non-binary / third gender']),
  decline: DECLINING,
};

// No "East Asian" under asian and no merged "Native American or Other Pacific
// Islander": a profile does not say which sub-group, and half an option is not an answer.
const RACE: Record<Exclude<Race, ''>, Wording> = {
  asian: wording(['Asian']),
  black: wording(['Black or African American', 'Black/African American', 'Black', 'African American', 'Black or of African descent']),
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
const YES_OR_NO = /^(yes|no)(?:\s*[,–—].*|\s+-.*|[\s.!]*)$/s;

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

  // An option nobody can read ("?", an emoji, a radio button whose label the
  // scan did not find) may be a third answer. Only in first place is it the
  // empty line a dropdown starts with.
  const unreadable = options.some((option, index) => index > 0 && !option.disabled && asWords(option.label) === '');
  if (unreadable) return NO_OPTION;

  const found: { yes: Readable[]; no: Readable[] } = { yes: [], no: [] };
  for (const option of readable(options)) {
    const said = yesOrNo(option);
    if (said !== '') {
      found[said].push(option);
    } else if (besides === undefined || !says(option, besides)) {
      // A third kind of answer: this is not a plain yes/no question.
      return NO_OPTION;
    }
  }
  if (found.yes.length !== 1 || found.no.length !== 1) return NO_OPTION;
  return only(found[answer]);
}

/**
 * Work authorization and sponsorship: the answers are about the country the
 * user lives in (Profile in types.ts). Whether the question names another
 * country is for the planner to check, but some lists name one only in their
 * options: "No, I can work for any US employer without sponsorship (eg: US
 * citizen…)" stands under a question that names no country. Such a list is
 * answered only for somebody whose profile says they live there.
 */
function pickEligibility(answer: YesNo, country: string, options: readonly ChoiceOption[]): ChoicePick {
  const pick = pickYesNo(answer, options);
  if (pick.status !== 'match') return pick;
  const home = countryCode(country);
  const named = readable(options).flatMap((option) => findCountries(option.label));
  return named.every((code) => code === home) ? pick : NO_OPTION;
}

/** "Yes, I have a disability, or have had one in the past" / "No, I do not have..." / "I do not want to answer". */
function pickDisability(answer: Disability, options: readonly ChoiceOption[]): ChoicePick {
  if (answer === 'decline') return only(readable(options).filter((option) => says(option, DECLINING)));
  return pickYesNo(answer, options, DECLINING);
}

// ---------------------------------------------------------------------------
// Answers the user typed: places, schools, dates
// ---------------------------------------------------------------------------

/**
 * The option that reads exactly like one of the given texts, all of it.
 * Nothing is dropped here, brackets included: "University of California
 * (Berkeley)" and "(Davis)" differ only inside them, and the first full stop
 * of "St. John's University" does not end the name.
 */
function pickSameText(texts: readonly string[], options: readonly ChoiceOption[]): ChoicePick {
  const wanted = new Set(texts.map(asWords));
  return only(readable(options).filter((option) => wanted.has(option.text)));
}

/** A school, a degree, a major: the option must read as the user typed it. No guessing that a "Bachelor of Science" is a "Bachelor's Degree". */
function pickTyped(typed: string, options: readonly ChoiceOption[]): ChoicePick {
  return typed.trim() === '' ? MISSING : pickSameText([typed], options);
}

/**
 * A state or a country: the option that names the same place as the profile,
 * however either side writes it ("CA", "California", "CA - California").
 * `codeOf` is the lookup in regions.ts for the kind of place asked for, which
 * is what keeps Georgia the state and Georgia the country apart.
 */
function pickPlace(typed: string, codeOf: (value: string) => string | null, options: readonly ChoiceOption[]): ChoicePick {
  const wanted = codeOf(typed);
  // No place, or one the table does not know ("Ontario"): only an option that reads the same will do.
  if (wanted === null) return pickTyped(typed, options);
  const list = readable(options);
  // A list that offers a yes and a no is a question, not a list of places,
  // though "No" is also how ISO writes Norway.
  const offers = (answer: YesNo) => list.some((option) => yesOrNo(option) === answer);
  if (offers('yes') && offers('no')) return NO_OPTION;
  return only(list.filter((option) => codeOf(option.label) === wanted));
}

/** ISO codes of the United States and its territories: the places whose addresses use US postal codes. */
const USES_US_POSTAL_CODES: ReadonlySet<string> = new Set(['US', 'AS', 'GU', 'MP', 'PR', 'VI']);

/**
 * A state. The US table is right for somebody who lives in the United States
 * and wrong for everybody else: "TN" is Tamil Nadu to an applicant in Chennai,
 * "SC" is Santa Catarina in Brazil, "WA" is Western Australia. So once the
 * profile names another country, only an option that reads as typed will do.
 * A profile that names no country is taken to be American, as before.
 */
function pickState(typed: string, country: string, options: readonly ChoiceOption[]): ChoicePick {
  const home = countryCode(country);
  const mayLiveInTheUs = country.trim() === '' || (home !== null && USES_US_POSTAL_CODES.has(home));
  return mayLiveInTheUs ? pickPlace(typed, stateCode, options) : pickTyped(typed, options);
}

/**
 * A sign that turns a date into a range: "<2027", "2027+", "≥ May 2027".
 * Texts are compared as words, which drops signs, so the label itself is asked.
 */
const RANGE_SIGN = /[<>≤≥+~]/;

/**
 * The graduation date, as a year ("2027") or as month and year ("May 2027",
 * "Sept 2027", "05/2027", "5/2027", "2027-05"). An option that holds more
 * than that is something else: "May/June 2027" is two months, "Spring 2027"
 * a season, "2027 or later" and ">2027" a range.
 */
function pickGraduation(stored: string, part: 'year' | 'month and year', options: readonly ChoiceOption[]): ChoicePick {
  const date = yearAndMonth(stored);
  if (date === null) return MISSING;
  const { year, month } = date;
  // A range is not a date: "<2027" must not be chosen for 2027, and ">2027"
  // must not count as a second "2027". Treated like options that cannot be
  // chosen, they keep every other option at its position on the page.
  const dates = options.map((option) => (RANGE_SIGN.test(option.label) ? { ...option, disabled: true } : option));
  if (part === 'year') return pickSameText([year], dates);

  const name = MONTH_NAMES[month - 1] ?? '';
  const digits = String(month).padStart(2, '0');
  // "Sept" is the one short form that is not the first three letters.
  const shortNames = name === 'September' ? ['Sep', 'Sept'] : [name.slice(0, 3)];
  const spellings = [name, ...shortNames].map((written) => `${written} ${year}`);
  return pickSameText([...spellings, `${digits}/${year}`, `${month}/${year}`, `${year}-${digits}`], dates);
}

// ---------------------------------------------------------------------------
// pickChoice
// ---------------------------------------------------------------------------

/**
 * The option to choose for a kind of question, by its position in `options`.
 * 'missing' when the profile has no answer for the kind; 'noOption' when no
 * option, or more than one, says what the profile says.
 */
export const pickChoice: PickChoice = (kind, profile, options) => {
  if (!autofillAllowed(profile, kind)) return MISSING;
  switch (kind) {
    case 'workAuthorization':
      return pickEligibility(profile.workAuthorization, profile.country, options);
    case 'sponsorship':
      return pickEligibility(profile.sponsorship, profile.country, options);
    case 'usCitizenship': {
      // A clause after yes/no could add residency, export-control or other
      // claims. Only the two bare answers are supported for this new field.
      if (readable(options).some(option => option.text !== 'yes' && option.text !== 'no')) return NO_OPTION;
      return pickYesNo(profile.usCitizenship, options);
    }
    case 'gender':
      return pickWorded(GENDER, profile.gender, options);
    case 'race':
      return pickWorded(RACE, profile.race, options);
    case 'veteran':
      return pickWorded(VETERAN, profile.veteran, options);
    case 'disability':
      return pickDisability(profile.disability, options);
    case 'state':
      return pickState(profile.state, profile.country, options);
    case 'country':
      return pickPlace(profile.country, countryCode, options);
    case 'citizenshipCountry':
      return pickPlace(profile.citizenshipCountry, countryCode, options);
    case 'nationality':
      return pickTyped(profile.nationality, options);
    case 'school':
      return pickTyped(profile.school, options);
    case 'degree':
      return pickTyped(profile.degree, options);
    case 'major':
      return pickTyped(profile.major, options);
    case 'graduationYear':
      return pickGraduation(profile.graduationDate, 'year', options);
    case 'graduationDate':
      return pickGraduation(profile.graduationDate, 'month and year', options);
    // Every other kind is typed, attached or left alone; none is chosen from a list.
    default:
      return NO_OPTION;
  }
};
