import type { ChoiceOption, ClassifyField, ControlType, FieldDescriptor, FieldKind } from './types';

// ---------------------------------------------------------------------------
// Which controls a kind may be recognised on
// ---------------------------------------------------------------------------

const TYPED: readonly ControlType[] = ['text'];
// Where sites also offer a list: a native <select>, or a custom dropdown (reported, not operated).
const TYPED_OR_LISTED: readonly ControlType[] = ['text', 'select', 'combobox'];
// Answered by choosing an option. Typing "yes" or "decline" into a text box would be nonsense.
const CHOSEN: readonly ControlType[] = ['select', 'radio', 'combobox'];

/**
 * For every kind, the control types it may be recognised on. Nothing is
 * recognised on a textarea, and only the résumé on a file input. Declared as
 * a Record so the compiler insists on an entry for every FieldKind.
 */
export const KIND_CONTROLS: Readonly<Record<FieldKind, readonly ControlType[]>> = {
  firstName: TYPED,
  lastName: TYPED,
  fullName: TYPED,
  email: TYPED,
  phone: TYPED,
  addressLine1: TYPED,
  city: TYPED,
  state: TYPED_OR_LISTED,
  postalCode: TYPED,
  country: TYPED_OR_LISTED,
  // One box that is a typeahead on Greenhouse, Lever and Ashby.
  location: ['text', 'combobox'],
  linkedin: TYPED,
  github: TYPED,
  portfolio: TYPED,
  currentCompany: TYPED,
  currentTitle: TYPED,
  school: TYPED_OR_LISTED,
  degree: TYPED_OR_LISTED,
  major: TYPED_OR_LISTED,
  graduationDate: TYPED_OR_LISTED,
  graduationYear: TYPED_OR_LISTED,
  gpa: TYPED,
  workAuthorization: CHOSEN,
  sponsorship: CHOSEN,
  gender: CHOSEN,
  race: CHOSEN,
  veteran: CHOSEN,
  disability: CHOSEN,
  resume: ['file'],
};

// ---------------------------------------------------------------------------
// Field names
// ---------------------------------------------------------------------------

/** What the phone number is called, as a label and as the heading of the group that holds its parts. */
const PHONE_NAME = /^(mobile )?phone( number)?$|^mobile( number)?$|^telephone$/;

/**
 * What a label must read, in full, to name a field. Every pattern is anchored
 * at both ends: "What is the name of your current employer?" contains "name",
 * "current" and "employer" and is none of those fields.
 */
const FIELD_NAMES: readonly (readonly [FieldKind, RegExp])[] = [
  ['firstName', /^(legal )?(first|given) name$/],
  ['lastName', /^(legal )?(last|family) name$|^surname$/],
  // "Legal First and Last Name" is Ashby's single name box: a label naming both parts wants the whole name.
  ['fullName', /^(full |legal |full legal )?name$|^(legal )?first (and|&) last name$/],
  // "Confirm email" is the one field that may repeat an answer; the planner decides what to do with it.
  ['email', /^(confirm )?e-?mail( address)?$/],
  ['phone', PHONE_NAME],
  ['addressLine1', /^(street )?address$|^address( line)? 1$/],
  ['city', /^city$/],
  ['state', /^state$|^province$|^state ?(\/|or) ?province$/],
  ['postalCode', /^(zip|postal) code$|^zip$|^postcode$|^zip ?(\/|or) ?postal code$/],
  ['country', /^country( of residence)?$/],
  // "Location (City)" is the label of Greenhouse's own location box. "City, State" is one box for both.
  ['location', /^(current )?location$|^location \(city\)$|^city(, | and | & |\/)state$/],
  ['linkedin', /^linkedin( profile)?( url)?$/],
  ['github', /^github( profile)?( url)?$/],
  ['portfolio', /^(personal )?(website|portfolio)( url)?$/],
  ['currentCompany', /^(current |most recent |current or most recent )?(company|employer)( name)?$/],
  // Never a bare "Title": that is also Mr / Ms / Dr.
  ['currentTitle', /^(current|current or most recent) (job )?title$/],
  ['school', /^(current )?(school|university)( name)?$|^college ?\/ ?university$/],
  ['degree', /^degree$/],
  // Greenhouse calls the major "Discipline", Workday "Field of Study".
  ['major', /^(major|discipline|field of study)$/],
  ['graduationDate', /^(expected )?graduation date$/],
  ['graduationYear', /^(expected )?graduation year$|^year of graduation$/],
  ['gpa', /^(cumulative )?gpa$/],
  // The upload itself: "Resume/CV" on Greenhouse and Lever, "Resume" on Ashby. Only ever a file input (KIND_CONTROLS).
  ['resume', /^((upload|attach) (your |a )?)?(resume|cv|curriculum vitae|resume ?(\/|or) ?cv|cv ?(\/|or) ?resume)$/],
];

/**
 * A label as the patterns expect it: lower case, single spaces, and without
 * what label clean-up may leave behind ("First Name*", "Full name✱",
 * "Email (required)", "LinkedIn Profile:"). Accents are dropped because \b
 * in a pattern takes "é" for the end of a word: it would find "phone" in
 * "Téléphone".
 */
function fieldName(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[*✱]|\((required|optional)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[:.]$/, '');
}

// ---------------------------------------------------------------------------
// Labels about something else. When one of these fires, the box is left alone
// whatever its attributes say.
// ---------------------------------------------------------------------------

// A follow-up to another answer: "If yes, please identify name of person…", "Legal Name (if different than above)".
const FOLLOW_UP = /^if\b|\bif (yes|no|not|so)\b|\(if\b/;

// Someone else's details: "…please include their email here", an emergency contact, a referee.
// "Family name" is a surname; any other "family" is a relative.
const SOMEONE_ELSE =
  /\b(their|referr\w*|references?|recruiter|manager|supervisor|emergency|relatives?|spouse)\b|\bfamily\b(?! name)|employee's/;

// Another subject that shares words with ours: "Portfolio password", "Passport Country",
// "Preferred First Name", "What are your pronouns?", "What is the country of your birth?".
// A cover letter is the other upload beside the résumé ("Resume or cover letter" wants either).
// The last three alternatives are the wording of honeypots ("This input is for robots only").
const OTHER_SUBJECT =
  /password|pronoun|prefer|passport|citizen|birth|nationality|consent|\bagree|employee id|\bcover letter\b|\brobots?\b|\bhuman\b|\bleave\b.*\b(blank|empty)\b/;

// A second one of something: "Alternate Email", "Other website", "a secondary or more specific ethnicity".
const QUALIFIED = /\b(secondary|second|third|additional|alternate|alternative)\b|^other\b/;

// A field word used for something else ("School email address", "Company size",
// "What is the name of your current employer?"). Real case: Ashby gives every
// e-mail-typed question autocomplete="email", whoever's e-mail it asks for.
const MENTIONS_A_FIELD =
  /\b(name|e-?mail|phone|mobile|address|city|state|province|zip|postal|postcode|country|countries|location|linkedin|github|portfolio|website|company|employer|title|school|university|college|degree|major|gpa|graduat\w*|resume|cv)\b/;

/** What a label says: a kind, nothing we know, or something that rules the box out. */
type LabelReading = FieldKind | 'nothing' | 'blocked';

/**
 * The voluntary self-identification questions. These are asked as whole
 * sentences in many wordings ("I identify my gender as:", "Are you a veteran
 * or active member of…"), so the word is looked for inside the label. That
 * is safe only because the answer is then chosen by an exact match on the
 * options. Whole words: "transgender" is its own question, "ethnicities"
 * asks for several, "veterans' benefits" is not about this applicant.
 */
const SELF_IDENTIFICATION: readonly (readonly [FieldKind, RegExp])[] = [
  ['gender', /\bgender\b/],
  ['race', /\b(race|ethnicity)\b/],
  ['veteran', /\bveteran\b|\bmilitary status\b/],
  // Narrower, because a yes/no about disability is easy to mistake: only "do you have one" counts.
  ['disability', /^disability$|\bdisability status\b|\b(have|live with) a (physical or mental )?disability\b|\bself-identification of disability\b/],
];

// "Do you require accommodations for a disability?" and "…a disability that would prevent you
// from performing…" are yes/no questions too, and the profile's answer would be wrong for them.
const NOT_DISABILITY_STATUS = /accommodat|adjustment|\b(require|need|prevent|perform)/;

function readLabel(label: string): LabelReading {
  const text = fieldName(label);
  if (FOLLOW_UP.test(text) || SOMEONE_ELSE.test(text)) return 'blocked';

  const named: FieldKind[] = [];
  // The eligibility classifier judges the whole question, notes in brackets included, so
  // "(e.g. you are a citizen, you have a visa)" does not rule the label out as it would below.
  const eligibility = classifyWorkEligibility(label);
  if (eligibility) named.push(eligibility);
  else if (OTHER_SUBJECT.test(text) || QUALIFIED.test(text)) return 'blocked';

  for (const [kind, pattern] of [...FIELD_NAMES, ...SELF_IDENTIFICATION]) {
    if (kind === 'disability' && NOT_DISABILITY_STATUS.test(text)) continue;
    if (pattern.test(text)) named.push(kind);
  }
  // A label that names two things asks for neither.
  if (named.length > 1) return 'blocked';
  return named[0] ?? (MENTIONS_A_FIELD.test(text) ? 'blocked' : 'nothing');
}

// ---------------------------------------------------------------------------
// Attributes the user cannot see
// ---------------------------------------------------------------------------

/**
 * The autocomplete tokens that name one of our fields. A Map, not an object:
 * the value comes from the page, and an object would also "know" words such
 * as "constructor".
 */
const AUTOCOMPLETE_TOKENS: ReadonlyMap<string, FieldKind> = new Map([
  ['given-name', 'firstName'],
  ['family-name', 'lastName'],
  ['name', 'fullName'],
  ['email', 'email'],
  ['tel', 'phone'],
  ['street-address', 'addressLine1'],
  ['address-line1', 'addressLine1'],
  ['address-level2', 'city'],
  ['address-level1', 'state'],
  ['postal-code', 'postalCode'],
  ['country', 'country'],
  ['country-name', 'country'],
  ['organization', 'currentCompany'],
  ['organization-title', 'currentTitle'],
]);

/**
 * Reads the autocomplete attribute by its exact final token. Anything looser
 * fills the wrong part: /^tel/ would put the whole number into "tel-extension",
 * /address/ the street into "address-level2" (the city). A "section-…" token
 * marks another person's block, such as an emergency contact.
 */
function kindFromAutocomplete(autocomplete: string): FieldKind | null {
  const tokens = autocomplete.split(' ');
  if (tokens.some((token) => token.startsWith('section-'))) return null;
  return AUTOCOMPLETE_TOKENS.get(tokens[tokens.length - 1] ?? '') ?? null;
}

/**
 * Identifiers (name, id, data-qa…) that name one of our fields, written
 * without case and punctuation so that first_name, firstName and first-name
 * are one entry. Whole identifiers only: "hispanic_ethnicity" contains
 * "city" and "preferred_name" contains "name", and neither is that field.
 * "website" is left out on purpose: it is the classic name of a honeypot.
 */
const IDENTIFIERS: Readonly<Partial<Record<FieldKind, readonly string[]>>> = {
  firstName: ['firstname', 'fname', 'givenname'],
  lastName: ['lastname', 'lname', 'familyname', 'surname'],
  // "name" and "nameinput" are Lever's, "systemfieldname" is Ashby's.
  fullName: ['name', 'fullname', 'nameinput', 'systemfieldname'],
  email: ['email', 'emailaddress', 'emailinput', 'systemfieldemail'],
  phone: ['phone', 'phonenumber', 'phoneinput', 'mobile'],
  addressLine1: ['address', 'streetaddress', 'addressline1', 'address1'],
  city: ['city'],
  state: ['state', 'province'],
  postalCode: ['zip', 'zipcode', 'postalcode', 'postcode'],
  country: ['country'],
  // Lever: name "location", id and data-qa "location-input". Greenhouse: "candidate-location". Ashby: "_systemfield_location".
  location: ['location', 'locationinput', 'candidatelocation', 'systemfieldlocation'],
  // Lever names its link boxes urls[LinkedIn], urls[GitHub], urls[Portfolio].
  linkedin: ['linkedin', 'linkedinurl', 'urlslinkedin'],
  github: ['github', 'githuburl', 'urlsgithub'],
  portfolio: ['portfolio', 'portfoliourl', 'urlsportfolio'],
  // "org" and "orginput" are Lever's.
  currentCompany: ['company', 'companyname', 'currentcompany', 'employer', 'org', 'orginput'],
  currentTitle: ['currenttitle'],
  school: ['school', 'schoolname', 'university'],
  degree: ['degree'],
  major: ['major', 'fieldofstudy'],
  graduationDate: ['graduationdate'],
  graduationYear: ['graduationyear'],
  gpa: ['gpa'],
  // Greenhouse: id "resume" (the label there is only "Attach"). Lever: name "resume", data-qa "input-resume". Ashby: "_systemfield_resume".
  resume: ['resume', 'cv', 'resumecv', 'inputresume', 'systemfieldresume'],
};

// A Map for the same reason as above: these strings come from the page.
const IDENTIFIER_KINDS: ReadonlyMap<string, FieldKind> = new Map(
  Object.entries(IDENTIFIERS).flatMap(([kind, names]) => names.map((name) => [name, kind as FieldKind] as const)),
);

/** "urls[LinkedIn]" → "urlslinkedin", "_systemfield_name" → "systemfieldname". */
function squash(identifier: string): string {
  return identifier.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function kindFromIdentifier(identifier: string): FieldKind | null {
  return IDENTIFIER_KINDS.get(squash(identifier)) ?? null;
}

/** Every kind the attributes point to. More than one means the markup contradicts itself. */
function kindsFromAttributes(field: FieldDescriptor): Set<FieldKind> {
  const kinds = new Set<FieldKind>();
  const fromAutocomplete = kindFromAutocomplete(field.autocomplete);
  if (fromAutocomplete) kinds.add(fromAutocomplete);
  for (const identifier of [field.name, field.id, ...field.hints.split(' ')]) {
    const kind = kindFromIdentifier(identifier);
    if (kind) kinds.add(kind);
  }
  return kinds;
}

/**
 * Kinds with real look-alikes: "state" is also a state bar, "country" also the
 * dial code of a phone or a passport, "title" also Mr / Ms. They are only
 * recognised when their own label says so; attributes can confirm or
 * contradict that label but never stand in for it.
 */
const NEEDS_ITS_OWN_LABEL: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'location',
  'country',
  'state',
  'graduationDate',
  'gpa',
  'degree',
  'currentTitle',
]);

/**
 * Signing and attesting are the user's own act. Lever's disability form has a
 * text box labelled just "Name" whose name is eeo[disabilitySignature]; Lyft
 * asks for a typed name under "I certify that the facts set forth…". The
 * heading of the group counts too: a "Name" box under "Signature" signs.
 */
const SIGNING = /signature|certif|attest|acknowledg|declar/i;

function isForSigning(field: FieldDescriptor): boolean {
  return [field.label, field.groupLabel, field.name, field.id, field.hints].some((text) => SIGNING.test(text));
}

/**
 * True when the heading of the group a control sits in (the legend of its
 * fieldset, the name of its role=group) says the control is not the field its
 * own label names.
 *
 * - The group is about someone or something else: "Emergency contact",
 *   "References", "Preferred name", "Passport details", "If you answered yes
 *   above". Every control inside is then left alone.
 * - The group is the phone number. Greenhouse's <fieldset class="phone-input">
 *   with the legend "Phone" holds a dial-code picker labelled "Country" beside
 *   the number: inside such a group only the number itself is a field of ours.
 *
 * An ordinary heading rules nothing out, even one that names fields itself
 * ("Address", "Name and contact details") or reads like a second something
 * ("Additional information", "Other details"). And a heading that only repeats
 * the control's own label (the legend of a radio group is its question) has
 * been judged already, as that label.
 */
function groupRulesOut(field: FieldDescriptor, kind: FieldKind): boolean {
  const group = fieldName(field.groupLabel);
  if (group === '' || group === fieldName(field.label)) return false;
  if (FOLLOW_UP.test(group) || SOMEONE_ELSE.test(group) || OTHER_SUBJECT.test(group)) return true;
  return PHONE_NAME.test(group) && kind !== 'phone';
}

/** What the label and the attributes say together, before looking at the control itself. */
function kindAskedFor(field: FieldDescriptor): FieldKind | null {
  const fromLabel = readLabel(field.label);
  if (fromLabel === 'blocked') return null;

  const hinted = [...kindsFromAttributes(field)];
  if (hinted.length > 1) return null;
  const fromAttributes = hinted[0] ?? null;

  // A label that says nothing we know leaves the attributes to stand in.
  if (fromLabel === 'nothing') {
    return fromAttributes !== null && !NEEDS_ITS_OWN_LABEL.has(fromAttributes) ? fromAttributes : null;
  }
  // Attributes may confirm what the user can read, never contradict it.
  if (fromAttributes !== null && fromAttributes !== fromLabel) return null;
  return fromLabel;
}

// "Yes", "No ", "Yes, I plan to relocate", "Yes - NYC": an answer. Not "North Carolina", "Norway" or "No degree".
const YES_OR_NO_ANSWER = /^(yes|no)\s*([,.!-].*)?$/i;

/**
 * False when a list cannot be the list for this kind. A typed kind offered as
 * a dropdown (state, country, school…) must not be offered yes and no: one
 * real question, "Do you have active membership … with at least one U.S.
 * state bar?", is a Yes/No list that mentions a state. A graduation date or
 * year must be offered as dates. Lists of the sensitive kinds are left to the
 * option matcher, which demands an exact match anyway.
 */
function optionsFit(kind: FieldKind, options: readonly ChoiceOption[]): boolean {
  if (options.length === 0) return true; // a text box, or a custom dropdown whose list we cannot see
  if (!KIND_CONTROLS[kind].includes('text')) return true;
  const texts = options.map((option) => option.label.trim());
  if (texts.some((text) => YES_OR_NO_ANSWER.test(text))) return false;
  if (kind === 'graduationDate' || kind === 'graduationYear') return texts.some((text) => /\d{4}/.test(text));
  return true;
}

export const classifyField: ClassifyField = (field) => {
  if (isForSigning(field)) return null;

  const kind = kindAskedFor(field);
  if (kind === null) return null;
  if (groupRulesOut(field, kind)) return null;
  if (!KIND_CONTROLS[kind].includes(field.control)) return null;
  if (!optionsFit(kind, field.options)) return null;
  return kind;
};

// ---------------------------------------------------------------------------
// The two eligibility questions
// ---------------------------------------------------------------------------

// A need-verb governing a sponsorship noun: "require … sponsorship", "need a visa",
// "require Samsara to commence an immigration case", "require Stripe to sponsor you for a work permit".
const NEEDS_SPONSORSHIP = /\b(require|need)\b[^.?]{0,80}(\bsponsor\w*|\bvisas?\b|\bimmigration (support|case)\b|\bwork permit\b)/;

// Any mention of sponsorship at all, governed or not.
const MENTIONS_SPONSORSHIP = /\bsponsor\w*|\bvisas?\b|\bimmigration\b|\bwork permit\b/;

// "Are you authorized to work…", "eligible to work legally…", "entitled to work…",
// "Do you currently have legal US work authorization?".
const IS_AUTHORIZED = /\b(authori[sz]ed|eligible|entitled) to work\b|\bhave\b[^.?]{0,40}\bwork authori[sz]ation\b/;

// Wordings where "yes" means something else than "I may work here":
// "work without sponsorship" and "do not require" (inverted), "permanent work authorization",
// "unrestricted right", "for any employer" (more than was asked), security clearance and
// export-control questions. The word boundary before "export" matters: one real employer is called Flexport.
const NOT_THE_PLAIN_QUESTION =
  /\bwithout\b|\bnot\b|n['’]t\b|\bnever\b|permanent|restrict|\bany employer\b|clearance|\bus person\b|\bexport/;

/**
 * Reduces a label to the question it asks: lower case, "U.S." written "us",
 * notes in brackets dropped, and only the sentences ending in "?" kept when
 * there are any. Real labels carry statements before the question and notes
 * after it ("Please note: candidates who require visa sponsorship…") that
 * must not be read as the question.
 */
function questionOnly(label: string): string {
  const text = label
    .toLowerCase()
    // Dots of abbreviations are not sentence ends: "u.s." → "us", "e.g." → "eg".
    .replace(/\b[a-z](\.[a-z])+\b\.?/g, (abbreviation) => abbreviation.replaceAll('.', ''))
    // "(e.g. you are a citizen, you have a visa, etc.)" is an example, not the question.
    // The closing bracket is optional because long labels arrive cut off.
    .replace(/\([^)]*\)?/g, ' ');
  const sentences = text.split(/(?<=[.?!])\s+/);
  const questions = sentences.filter((sentence) => sentence.trimEnd().endsWith('?'));
  return (questions.length > 0 ? questions : sentences).join(' ');
}

/**
 * Decides whether a label asks "may you work here?" (workAuthorization) or
 * "will you need sponsorship?" (sponsorship). The two answers are opposites
 * for most people, and real labels often name both topics, so one function
 * decides and it returns null whenever both readings fit or neither does.
 */
export function classifyWorkEligibility(label: string): 'workAuthorization' | 'sponsorship' | null {
  if (FOLLOW_UP.test(label.toLowerCase())) return null;
  const question = questionOnly(label);
  if (NOT_THE_PLAIN_QUESTION.test(question)) return null;

  const needsSponsorship = NEEDS_SPONSORSHIP.test(question);
  const isAuthorized = IS_AUTHORIZED.test(question);
  if (needsSponsorship && !isAuthorized) return 'sponsorship';
  // "Do you require work authorization?" matches neither pattern: a "yes" there means the opposite.
  if (isAuthorized && !MENTIONS_SPONSORSHIP.test(question)) return 'workAuthorization';
  return null;
}
