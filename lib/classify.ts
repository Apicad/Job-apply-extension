/**
 * Recognising what a form field asks for.
 *
 * `classifyField` gets the plain description of one control (its label, the
 * group it sits in, a few attributes, the options it offers) and names the
 * profile field it asks for, or returns null. Null is the safe answer and the
 * common one: a blank field costs the user seconds, a wrong answer on an
 * application can cost the job.
 *
 * How a control is judged, in this order:
 *   1. Signing and attesting are the user's own act: never recognised.
 *   2. A file input is the résumé only on an explicit signal.
 *   3. The label decides. Field names must match in full ("Email", not a
 *      question that mentions an e-mail), and a label about someone or
 *      something else rules the control out.
 *   4. Attributes the user cannot see (autocomplete, name, id, data hints)
 *      may confirm the label, or stand in when there is no label at all. If
 *      they contradict it, nobody knows what the box wants.
 *   5. The control type, the group around the control and the options it
 *      offers can each still rule the result out.
 *
 * Everything here is pure: no DOM, no extension APIs, no profile. The rules
 * were written against labels and markup of live Greenhouse, Lever and Ashby
 * forms; tests/unit/classify.test.ts holds those labels, including the ones
 * each rule must not match.
 */
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
// The classifier
// ---------------------------------------------------------------------------

export const classifyField: ClassifyField = (field) => {
  if (isForSigning(field)) return null;
  if (field.control === 'file') return isResumeInput(field) ? 'resume' : null;

  const kind = kindAskedFor(field);
  if (kind === null) return null;
  if (!KIND_CONTROLS[kind].includes(field.control)) return null;
  if (groupRulesOut(field, kind)) return null;
  if (!optionsFit(kind, field.options)) return null;
  return kind;
};

/** What the label and the attributes say together, before looking at the control itself. */
function kindAskedFor(field: FieldDescriptor): FieldKind | null {
  const fromLabel = readLabel(field.label);
  const fromAttributes = readAttributes(field);
  if (fromLabel === 'blocked' || fromAttributes === 'conflict') return null;

  if (fromLabel === 'nothing') {
    // A label we cannot read is still a label, and what the user can read decides: a box
    // labelled "Promo code (optional)" with autocomplete="tel" must not get the phone number.
    if (plain(field.label) !== '') return null;
    // No label at all: the attributes stand in.
    return fromAttributes === 'nothing' || NEEDS_ITS_OWN_LABEL.has(fromAttributes) ? null : fromAttributes;
  }
  // Attributes may confirm what the user can read, never contradict it.
  if (fromAttributes !== 'nothing' && fromAttributes !== fromLabel) return null;
  return fromLabel;
}

/**
 * Kinds with real look-alikes: "state" is also a state bar, "country" also the
 * dial code of a phone or a passport, "title" also Mr / Ms. They are only
 * recognised when their own label says so; attributes can confirm or
 * contradict that label but never stand in for it. (The sensitive kinds need
 * no entry: no attribute ever names them, see IDENTIFIERS.)
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

// ---------------------------------------------------------------------------
// 1. Signing
// ---------------------------------------------------------------------------

/**
 * Signing and attesting are the user's own act, so such fields are never
 * recognised. Lever's disability form has a text box labelled just "Name"
 * whose name is eeo[disabilitySignature]; Lyft asks for a typed name under
 * "I certify that the facts set forth in this Application…".
 */
const SIGNING = /signature|certif|attest|acknowledg|declar/i;

function isForSigning(field: FieldDescriptor): boolean {
  return [field.label, field.groupLabel, field.name, field.id, field.hints].some((text) => SIGNING.test(text));
}

// ---------------------------------------------------------------------------
// 2. The résumé
// ---------------------------------------------------------------------------

// The ids and names job sites give their résumé input: Greenhouse id "resume", Lever id
// "resume-upload-input" and name "resume", Ashby id "_systemfield_resume".
const RESUME_IDENTIFIERS: readonly string[] = ['resume', 'cv', 'resumeuploadinput', 'systemfieldresume'];

// "Resume/CV", "Résumé", "CV": the label has to start with the word.
const STARTS_WITH_RESUME = /^(resume|cv)\b/;

// Other documents, and Ashby's "Autofill from resume" box: a file dropped there goes to a parser
// that re-renders the whole form over everything already filled in.
const NOT_THE_RESUME = /cover|transcript|portfolio|visa|licen[cs]e|autofill|parse|import|prefill/i;

/**
 * A file input gets the résumé only on an explicit signal: a known id or
 * name, or a label (or group label) that starts with the word. Greenhouse
 * labels both of its file inputs "Attach"; only the id and the group label
 * ("Resume/CV", "Cover Letter") tell them apart.
 */
function isResumeInput(field: FieldDescriptor): boolean {
  const texts = [field.label, field.groupLabel, field.name, field.id, field.hints];
  if (texts.some((text) => NOT_THE_RESUME.test(text))) return false;
  const identified = RESUME_IDENTIFIERS.includes(squash(field.id)) || RESUME_IDENTIFIERS.includes(squash(field.name));
  const labelled = STARTS_WITH_RESUME.test(plain(field.label)) || STARTS_WITH_RESUME.test(plain(field.groupLabel));
  return identified || labelled;
}

// ---------------------------------------------------------------------------
// 3. The label
// ---------------------------------------------------------------------------

/** One way to recognise a kind: what the label must match, and what it must not. */
type LabelRule = readonly [kind: FieldKind, names: RegExp, unless?: RegExp];

/**
 * What a label must read, in full, to name a field. Every pattern is anchored
 * at both ends: "What is the name of your current employer?" contains "name",
 * "current" and "employer" and is none of those fields. Anchoring is also
 * what keeps these labels short (six words at most) and free of questions.
 */
const FIELD_NAMES: readonly LabelRule[] = [
  ['firstName', /^(legal )?(first|given) name$/],
  ['lastName', /^(legal )?(last|family) name$|^surname$/],
  // "Legal First and Last Name" is Ashby's single name box: a label naming both parts wants the whole name.
  ['fullName', /^(full |legal |full legal )?name$|^(legal )?first (and|&) last name$/],
  // "Confirm email" is the one field that may repeat an answer; the planner decides what to do with it.
  ['email', /^(confirm )?e-?mail( address)?$/],
  ['phone', /^(mobile )?phone( number)?$|^mobile( number)?$|^telephone$/],
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
];

/**
 * The voluntary self-identification questions. These are asked as whole
 * sentences in many wordings ("I identify my gender as:", "Are you a veteran
 * or active member of…"), so the word is looked for inside the label. That
 * is safe only because the answer is then chosen by an exact match on the
 * options. Whole words: "transgender" is its own question, "ethnicities"
 * asks for several, "veterans' benefits" is not about this applicant.
 */
const SELF_IDENTIFICATION: readonly LabelRule[] = [
  ['gender', /\bgender\b/],
  ['race', /\b(race|ethnicity)\b/],
  ['veteran', /\bveteran\b|\bmilitary status\b/],
  // Narrower, because this one is answered with a bare yes or no: only "do you have a disability"
  // counts. Not "Do you require accommodations for a disability?", "…a disability that would
  // prevent you from performing…" or "Do you wish to disclose your disability status?": the
  // profile's yes or no would answer a different question there.
  [
    'disability',
    /^disability$|\bdisability status\b|\b(i|you) (have|live with) a (physical or mental )?disability\b|\bself-identification of disability\b/,
    /accommodat|adjustment|\b(require|need|prevent|perform)|\b(wish|like|willing|want) to\b/,
  ],
];

// The patterns below mark a text as being about something else. They matter
// wherever a word is looked for inside a longer text: a self-identification
// word in a label ("What are your preferred gender pronouns?"), and a plain
// field name under the heading of its group ("Phone" inside "Emergency contact").

// A follow-up to another answer: "If yes, please identify name of person…", "Legal Name (if different than above)".
const FOLLOW_UP = /^if\b|\bif (yes|no|not|so)\b|\(if\b/;

// Someone else's details: "…please include their email here", an emergency contact, a reference
// ("referee" outside the US), a parent or guardian, the next of kin.
// "Family name" is a surname; any other "family" is a relative.
const SOMEONE_ELSE =
  /\b(their|referr\w*|references?|referees?|recruiter|manager|supervisor|emergency|relatives?|spouse|parents?|guardians?|next of kin)\b|\bfamily\b(?! name)|employee's/;

// Another subject that shares words with ours: "Portfolio password", "Passport Country",
// "Preferred First Name", "What are your pronouns?", "What is the country of your birth?".
// The last three alternatives are the wording of honeypots ("This input is for robots only").
const OTHER_SUBJECT =
  /password|pronoun|prefer|passport|citizen|birth|nationality|consent|\bagree|employee id|\brobots?\b|\bhuman\b|\bleave\b.*\b(blank|empty)\b/;

// A second one of something: "Alternate Email", "Other website", "a secondary or more specific ethnicity".
const QUALIFIED = /\b(secondary|second|third|additional|alternate|alternative)\b|^other\b/;

/**
 * A label as the patterns expect it: lower case, single spaces, straight
 * apostrophes, and without what label clean-up may leave behind ("First
 * Name*", "Full name✱", "Email (required)", "LinkedIn Profile:"). Accents
 * are dropped so that "Résumé" reads "resume" and "Téléphone" "telephone".
 */
function plain(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/’/g, "'")
    .toLowerCase()
    .replace(/[*✱]|\((required|optional)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[:.]$/, '');
}

/** What a label says: a kind, nothing we know, or something that rules the box out. */
type LabelReading = FieldKind | 'nothing' | 'blocked';

function readLabel(label: string): LabelReading {
  const text = plain(label);
  if (FOLLOW_UP.test(text) || SOMEONE_ELSE.test(text)) return 'blocked';

  const named: FieldKind[] = [];
  // The eligibility classifier judges the whole question, notes in brackets included, so
  // "(e.g. you are a citizen, you have a visa)" does not rule the label out as it would below.
  const eligibility = classifyWorkEligibility(label);
  if (eligibility) named.push(eligibility);
  else if (OTHER_SUBJECT.test(text) || QUALIFIED.test(text)) return 'blocked';

  for (const [kind, names, unless] of [...FIELD_NAMES, ...SELF_IDENTIFICATION]) {
    if (names.test(text) && !unless?.test(text)) named.push(kind);
  }
  // A label that names two things asks for neither.
  if (named.length > 1) return 'blocked';
  return named[0] ?? 'nothing';
}

// ---------------------------------------------------------------------------
// The two eligibility questions
// ---------------------------------------------------------------------------

// The verbs of needing: "Will you require…", "Do you need…".
const NEED = /\b(require|need)\b/;

// The words sponsorship goes by: "sponsor", "sponsorship", "visa", "immigration case", "work permit".
const SPONSORSHIP = /\bsponsor\w*|\bvisas?\b|\bimmigration\b|\bwork permit\b/;

// Needing governs one of those words in the same sentence: "require … sponsorship", "need a visa",
// "require Samsara to commence an immigration case", "require Stripe to sponsor you for a work permit".
const NEEDS_SPONSORSHIP = new RegExp(String.raw`${NEED.source}[^.?]{0,80}(${SPONSORSHIP.source})`);

// "Are you authorized to work…", "eligible to work legally…", "entitled to work…",
// "Do you currently have legal US work authorization?".
const IS_AUTHORIZED = /\b(authori[sz]ed|eligible|entitled) to work\b|\bhave\b[^.?]{0,40}\bwork authori[sz]ation\b/;

// Wordings where "yes" means something else than "I may work here":
// - turned around: "work without sponsorship", "do not require", "no need for", "never require";
// - more than was asked: "permanent work authorization", "indefinitely", "unrestricted", "for any employer";
// - less than was asked: "temporary work authorization", "with restrictions";
// - security clearance and export-control questions (the word boundary before "export" matters:
//   one real employer is called Flexport);
// - a request for consent or agreement, which is never given for the user.
const NOT_THE_PLAIN_QUESTION =
  /\bwithout\b|\b(no|not|never)\b|n't\b|permanent|indefinite|temporar|restrict|\bany employer\b|clearance|\bus person\b|\bexport|consent|\bagree/;

// A time in an authorization question asks whether the authorization lasts: "…beyond 12 months?",
// "…after graduation?", "…for the duration of this internship?", "…through December 2027?".
// Somebody on a student or work visa may work today and still has to say no. A digit also
// catches a visa type ("…on an H-1B?"), which asks how one is authorized.
const FOR_HOW_LONG = /\b(after|beyond|until|duration|months?|years?|long[- ]term)\b|\d/;

/**
 * Reduces a label to the question it asks: lower case, "U.S." written "us",
 * notes in brackets dropped, and only the sentences that end in "?" kept.
 * Real labels carry statements before the question and notes after it
 * ("Please note: candidates who require visa sponsorship…") that must not be
 * read as the question. And long labels arrive cut off: a question that
 * cannot be read up to its question mark is not judged at all, because the
 * part that is missing may be "…without sponsorship?".
 */
function questionOnly(label: string): string {
  const text = spelledPlainly(label)
    // "(e.g. you are a citizen, you have a visa, etc.)" is an example, not the question.
    // A bracket that never closes was cut off: everything after it is unknown and goes too.
    .replace(/\([^)]*\)?/g, ' ');
  const sentences = text.split(/(?<=[.?!])\s+/);
  return sentences.filter((sentence) => sentence.trimEnd().endsWith('?')).join(' ');
}

/** A label in the spelling the eligibility patterns expect: lower case, straight apostrophes, "U.S." written "us". */
function spelledPlainly(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/’/g, "'")
      // Dots of abbreviations are not sentence ends: "u.s." → "us", "e.g." → "eg".
      .replace(/\b[a-z](\.[a-z])+\b\.?/g, (abbreviation) => abbreviation.replaceAll('.', ''))
  );
}

/** Everything a label says in brackets: "(e.g., H-1B, etc.)", "(without the need for sponsorship)". */
function notesInBrackets(label: string): string {
  return (spelledPlainly(label).match(/\([^)]*\)/g) ?? []).join(' ');
}

/**
 * Decides whether a label asks "may you work here?" (workAuthorization) or
 * "will you need sponsorship?" (sponsorship). The two answers are opposites
 * for most people, and real labels often name both topics, so one function
 * decides and it returns null whenever both readings fit or neither does.
 * Only a question that is there in full, question mark included, is judged.
 * Which country the question is about is for the planner to check.
 */
export function classifyWorkEligibility(label: string): 'workAuthorization' | 'sponsorship' | null {
  if (FOLLOW_UP.test(label.toLowerCase())) return null;
  const question = questionOnly(label);
  // A note in brackets is not always an example. "(without the need for sponsorship)" and
  // "(or do you require sponsorship)" make it another question, so the words that rule a
  // question out, and the verbs of needing, count inside brackets too.
  const withNotes = `${question} ${notesInBrackets(label)}`;
  if (NOT_THE_PLAIN_QUESTION.test(withNotes)) return null;

  const needsSponsorship = NEEDS_SPONSORSHIP.test(question);
  const isAuthorized = IS_AUTHORIZED.test(question);
  if (needsSponsorship && !isAuthorized) return 'sponsorship';
  // Only the plain question counts: nothing needed, no time set, no sponsorship mentioned beside the
  // authorization. (A sponsorship word in a note is left alone: "e.g. you are a citizen, you have a
  // visa" is an example.)
  const isPlain = !NEED.test(withNotes) && !FOR_HOW_LONG.test(withNotes) && !SPONSORSHIP.test(question);
  if (isAuthorized && isPlain) return 'workAuthorization';
  // Both readings, or neither. "Do you require work authorization?" ends here: a "yes" to it means the opposite.
  return null;
}

// ---------------------------------------------------------------------------
// 4. Attributes the user cannot see
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
 * marks another person's block, such as an emergency contact, and "fax" or
 * "pager" before "tel" says the number belongs to such a device.
 */
function kindFromAutocomplete(autocomplete: string): FieldKind | null {
  const tokens = autocomplete.split(' ');
  if (tokens.some((token) => token.startsWith('section-'))) return null;
  if (tokens.includes('fax') || tokens.includes('pager')) return null;
  return AUTOCOMPLETE_TOKENS.get(tokens.at(-1) ?? '') ?? null;
}

/**
 * Identifiers (name, id, data-qa…) that name one of our fields, written
 * without case and punctuation so that first_name, firstName and first-name
 * are one entry. Whole identifiers only: "hispanic_ethnicity" contains
 * "city" and "preferred_name" contains "name", and neither is that field.
 * Two things are left out on purpose. "website": it is the classic name of a
 * honeypot. And the sensitive kinds (gender, race, veteran, disability, work
 * authorization, sponsorship): those are answered only when the question
 * itself can be read.
 */
const IDENTIFIERS: readonly (readonly [FieldKind, readonly string[]])[] = [
  ['firstName', ['firstname', 'fname', 'givenname']],
  ['lastName', ['lastname', 'lname', 'familyname', 'surname']],
  // "name" and "name-input" are Lever's, "_systemfield_name" is Ashby's.
  ['fullName', ['name', 'fullname', 'nameinput', 'systemfieldname']],
  ['email', ['email', 'emailaddress', 'emailinput', 'systemfieldemail']],
  ['phone', ['phone', 'phonenumber', 'phoneinput', 'mobile']],
  ['addressLine1', ['address', 'streetaddress', 'addressline1', 'address1']],
  ['city', ['city']],
  ['state', ['state', 'province']],
  ['postalCode', ['zip', 'zipcode', 'postalcode', 'postcode']],
  ['country', ['country']],
  // Lever: name "location", id and data-qa "location-input". Greenhouse: "candidate-location".
  // Ashby: "_systemfield_location".
  ['location', ['location', 'locationinput', 'candidatelocation', 'systemfieldlocation']],
  // Lever names its link boxes urls[LinkedIn], urls[GitHub], urls[Portfolio].
  ['linkedin', ['linkedin', 'linkedinurl', 'urlslinkedin']],
  ['github', ['github', 'githuburl', 'urlsgithub']],
  ['portfolio', ['portfolio', 'portfoliourl', 'urlsportfolio']],
  // "org" and "org-input" are Lever's.
  ['currentCompany', ['company', 'companyname', 'currentcompany', 'employer', 'org', 'orginput']],
  ['currentTitle', ['currenttitle']],
  ['school', ['school', 'schoolname', 'university']],
  ['degree', ['degree']],
  ['major', ['major', 'fieldofstudy']],
  ['graduationDate', ['graduationdate']],
  ['graduationYear', ['graduationyear']],
  ['gpa', ['gpa']],
];

/** "urls[LinkedIn]" → "urlslinkedin", "_systemfield_name" → "systemfieldname". */
function squash(identifier: string): string {
  return identifier.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function kindFromIdentifier(identifier: string): FieldKind | null {
  const squashed = squash(identifier);
  for (const [kind, names] of IDENTIFIERS) {
    if (names.includes(squashed)) return kind;
  }
  return null;
}

/**
 * Tokens for one piece of a phone number: the boxes of a phone field that is
 * split in three or has a box for the extension. The whole number belongs in
 * none of them, even when the one visible label, "Phone", points at that box.
 * "tel-national" is not listed: Ashby marks its whole phone box with it.
 */
const PIECES_OF_A_PHONE_NUMBER: ReadonlySet<string> = new Set([
  'tel-country-code',
  'tel-area-code',
  'tel-local',
  'tel-local-prefix',
  'tel-local-suffix',
  'tel-extension',
]);

/**
 * The one kind the attributes point to. 'conflict' when they leave no kind
 * standing: they point to several at once (the markup contradicts itself), or
 * to a piece of a phone number, which is none of our answers.
 */
function readAttributes(field: FieldDescriptor): FieldKind | 'nothing' | 'conflict' {
  if (PIECES_OF_A_PHONE_NUMBER.has(field.autocomplete.split(' ').at(-1) ?? '')) return 'conflict';

  const kinds = new Set<FieldKind>();
  const fromAutocomplete = kindFromAutocomplete(field.autocomplete);
  if (fromAutocomplete) kinds.add(fromAutocomplete);
  // The data hints are several values joined by spaces.
  for (const identifier of [field.name, field.id, ...field.hints.split(' ')]) {
    const kind = kindFromIdentifier(identifier);
    if (kind) kinds.add(kind);
  }
  if (kinds.size > 1) return 'conflict';
  const [only] = kinds;
  return only ?? 'nothing';
}

// ---------------------------------------------------------------------------
// 5. The group around the control, and the options it offers
// ---------------------------------------------------------------------------

// The fields an address is made of. A group called "Address" or "Location" stands over them.
const PARTS_OF_AN_ADDRESS: readonly FieldKind[] = ['addressLine1', 'city', 'state', 'postalCode', 'country', 'location'];

/**
 * What a group named after one field may hold besides that field: the pieces
 * of a name under "Name", the pieces of an address under "Address" or
 * "Location". A group named after any other field holds that field only.
 */
const PIECES_OF: Partial<Record<FieldKind, readonly FieldKind[]>> = {
  fullName: ['firstName', 'lastName'],
  addressLine1: PARTS_OF_AN_ADDRESS,
  location: PARTS_OF_AN_ADDRESS,
};

/**
 * True when the fieldset or group around a control rules it out: a "Phone"
 * inside "Emergency contact" is not the applicant's phone. An ordinary
 * heading ("Personal information", "Name and contact details") rules nothing
 * out.
 */
function groupRulesOut(field: FieldDescriptor, kind: FieldKind): boolean {
  const group = plain(field.groupLabel);
  // The legend of a radio group is usually its question, and that has been judged as the label.
  if (group === plain(field.label)) return false;
  if (FOLLOW_UP.test(group) || SOMEONE_ELSE.test(group) || OTHER_SUBJECT.test(group)) return true;

  // A group that is itself one field: what stands inside belongs to that field. Greenhouse puts
  // a dial-code picker labelled "Country" beside the number in a fieldset "Phone", and a "Name"
  // under "Current employer" is the employer's. Only the field itself and its pieces are ours.
  const groupKind = readLabel(field.groupLabel);
  if (groupKind === 'nothing' || groupKind === 'blocked' || groupKind === kind) return false;
  return !(PIECES_OF[groupKind] ?? []).includes(kind);
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
  if (!KIND_CONTROLS[kind].includes('text')) return true; // a sensitive kind: only ever chosen, never typed
  const texts = options.map((option) => option.label.trim());
  if (texts.some((text) => YES_OR_NO_ANSWER.test(text))) return false;
  if (kind === 'graduationDate' || kind === 'graduationYear') return texts.some((text) => /\d{4}/.test(text));
  return true;
}
