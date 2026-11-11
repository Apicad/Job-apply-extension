/**
 * The user's profile as data: an empty one, a safe one built from anything
 * (storage, an imported file), the text to type for a field, and the choices
 * the settings form offers. Pure: no DOM, no extension API.
 */
import type { AutofillPreference, Disability, FieldDescriptor, FieldKind, Gender, NormalizeProfile, Profile, Race, TextValueFor, Veteran, YesNo } from './types';

/** A profile with nothing answered. A new object on every call, so nobody shares edits by accident. */
export function emptyProfile(): Profile {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    linkedin: '',
    github: '',
    portfolio: '',
    currentCompany: '',
    currentTitle: '',
    school: '',
    degree: '',
    major: '',
    graduationDate: '',
    gpa: '',
    workAuthorization: '',
    sponsorship: '',
    citizenshipCountry: '',
    nationality: '',
    usCitizenship: '',
    fillLocation: 'yes',
    fillEducation: 'yes',
    fillEmployment: 'yes',
    fillEligibility: 'yes',
    gender: '',
    race: '',
    veteran: '',
    disability: '',
  };
}

/** True when nothing is filled in, so the popup can say "set up your profile" instead of listing every field. */
export function isProfileEmpty(profile: Profile): boolean {
  const fields = Object.keys(emptyProfile()) as (keyof Profile)[];
  return fields.every((field) => AUTOFILL_PREFERENCES.includes(field as AutofillPreferenceKey) || profile[field].trim() === '');
}

export type AutofillPreferenceKey = 'fillLocation' | 'fillEducation' | 'fillEmployment' | 'fillEligibility';
export const AUTOFILL_PREFERENCES: readonly AutofillPreferenceKey[] = ['fillLocation', 'fillEducation', 'fillEmployment', 'fillEligibility'];
const sections: Partial<Record<FieldKind, AutofillPreferenceKey>> = {
  addressLine1: 'fillLocation', city: 'fillLocation', state: 'fillLocation', postalCode: 'fillLocation', country: 'fillLocation', location: 'fillLocation',
  school: 'fillEducation', degree: 'fillEducation', major: 'fillEducation', graduationDate: 'fillEducation', graduationYear: 'fillEducation', gpa: 'fillEducation',
  currentCompany: 'fillEmployment', currentTitle: 'fillEmployment',
  workAuthorization: 'fillEligibility', sponsorship: 'fillEligibility', citizenshipCountry: 'fillEligibility', nationality: 'fillEligibility', usCitizenship: 'fillEligibility',
};
/** Includes Greenhouse education parts whose date labels intentionally have no generic kind. */
export function autofillSection(kind: FieldKind | null, descriptor?: FieldDescriptor): AutofillPreferenceKey | null {
  if (descriptor && /^(school|degree|discipline|end-(?:date-)?month|end-(?:date-)?year)--\d+$/.test(descriptor.id)) return 'fillEducation';
  if (descriptor && descriptor.label.trim().toLowerCase() === 'country' && descriptor.groupLabel.trim().toLowerCase() === 'phone') return 'fillLocation';
  return kind ? sections[kind] ?? null : null;
}
export function autofillAllowed(profile: Profile, kind: FieldKind | null, descriptor?: FieldDescriptor): boolean {
  const section = autofillSection(kind, descriptor);
  return section === null || profile[section] !== 'no';
}

// ---------------------------------------------------------------------------
// The choices of the settings form
// ---------------------------------------------------------------------------

/** One choice of a dropdown in the settings form: the stored answer and the words shown for it. */
export interface ProfileOption<Answer extends string> {
  value: Answer;
  label: string;
}

/**
 * Turns "answer: label" pairs into a list, in the order written. Taking a
 * Record makes the compiler insist on a label for every answer of the type.
 */
function optionsFrom<Answer extends string>(labels: Record<Answer, string>): readonly ProfileOption<Answer>[] {
  return (Object.keys(labels) as Answer[]).map((value) => ({ value, label: labels[value] }));
}

/** '' is always first and always means "never answer this for me". */
export const YES_NO_OPTIONS = optionsFrom<YesNo>({
  '': 'No answer',
  yes: 'Yes',
  no: 'No',
});

export const GENDER_OPTIONS = optionsFrom<Gender>({
  '': 'No answer',
  male: 'Male',
  female: 'Female',
  nonbinary: 'Non-binary',
  decline: 'Prefer not to say',
});

export const RACE_OPTIONS = optionsFrom<Race>({
  '': 'No answer',
  asian: 'Asian',
  black: 'Black or African American',
  hispanic: 'Hispanic or Latino',
  white: 'White',
  nativeAmerican: 'American Indian or Alaska Native',
  pacificIslander: 'Native Hawaiian or other Pacific Islander',
  twoOrMore: 'Two or more races',
  decline: 'Prefer not to say',
});

/** US forms ask about "protected" veterans (a legal category), so a veteran says which kind. */
export const VETERAN_OPTIONS = optionsFrom<Veteran>({
  '': 'No answer',
  notVeteran: 'Not a veteran',
  protectedVeteran: 'Protected veteran',
  veteranNotProtected: 'Veteran, but not a protected veteran',
  decline: 'Prefer not to say',
});

export const DISABILITY_OPTIONS = optionsFrom<Disability>({
  '': 'No answer',
  yes: 'Yes, I have a disability',
  no: 'No, I do not have a disability',
  decline: 'Prefer not to say',
});

// ---------------------------------------------------------------------------
// The graduation date
// ---------------------------------------------------------------------------

export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The year and the month (1 to 12) of a stored graduation date. The profile
 * keeps 'YYYY-MM', which is what <input type="month"> holds; anything else is
 * no date, and nothing is read out of it. Year 0000 is no year: given
 * "0000-05", <input type="month"> empties itself.
 */
export function yearAndMonth(stored: string): { year: string; month: number } | null {
  const parts = /^(?!0000)(\d{4})-(0[1-9]|1[0-2])$/.exec(stored);
  const year = parts?.[1];
  const month = parts?.[2];
  return year === undefined || month === undefined ? null : { year, month: Number(month) };
}

// ---------------------------------------------------------------------------
// A profile from anything
// ---------------------------------------------------------------------------

/** Longer than any real name, address or link; a longer value is a mistake or an attack on the storage quota. */
const MAX_TEXT_LENGTH = 300;

/** A text field: kept as typed, or '' when it is not text or is too long. Never cut short: half an address is a wrong answer. */
function text(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH ? value : '';
}

/** A graduation date: 'YYYY-MM' or nothing. */
function yearMonth(value: unknown): string {
  return typeof value === 'string' && yearAndMonth(value) !== null ? value : '';
}

/** One of the listed answers, or '' ("not answered") for anything else: "Yes", true and "maybe" are not answers. */
function oneOf<Answer extends string>(options: readonly ProfileOption<Answer>[], unanswered: Answer, value: unknown): Answer {
  for (const option of options) {
    if (option.value === value) return option.value;
  }
  return unanswered;
}
const preference = (value: unknown): AutofillPreference => value === 'no' ? 'no' : 'yes';

/**
 * Builds a valid profile from anything: stored data, an imported file, null.
 *
 * The result is written out field by field and each value is checked. The
 * input is never copied or merged as a whole, so it cannot add keys, change
 * types or smuggle values in through a prototype.
 */
export const normalizeProfile: NormalizeProfile = (input) => {
  // Only a plain object can hold a profile. Null, text, numbers and lists hold none.
  const source: object = typeof input === 'object' && input !== null && !Array.isArray(input) ? input : {};
  // Reads a value stored on the object itself: not one inherited from a
  // prototype (the "__proto__" trick), and without running a getter.
  const read = (field: keyof Profile): unknown => Object.getOwnPropertyDescriptor(source, field)?.value;

  return {
    firstName: text(read('firstName')),
    lastName: text(read('lastName')),
    email: text(read('email')),
    phone: text(read('phone')),
    addressLine1: text(read('addressLine1')),
    city: text(read('city')),
    state: text(read('state')),
    postalCode: text(read('postalCode')),
    country: text(read('country')),
    linkedin: text(read('linkedin')),
    github: text(read('github')),
    portfolio: text(read('portfolio')),
    currentCompany: text(read('currentCompany')),
    currentTitle: text(read('currentTitle')),
    school: text(read('school')),
    degree: text(read('degree')),
    major: text(read('major')),
    graduationDate: yearMonth(read('graduationDate')),
    gpa: text(read('gpa')),
    workAuthorization: oneOf(YES_NO_OPTIONS, '', read('workAuthorization')),
    sponsorship: oneOf(YES_NO_OPTIONS, '', read('sponsorship')),
    citizenshipCountry: text(read('citizenshipCountry')),
    nationality: text(read('nationality')),
    usCitizenship: oneOf(YES_NO_OPTIONS, '', read('usCitizenship')),
    fillLocation: preference(read('fillLocation')),
    fillEducation: preference(read('fillEducation')),
    fillEmployment: preference(read('fillEmployment')),
    fillEligibility: preference(read('fillEligibility')),
    gender: oneOf(GENDER_OPTIONS, '', read('gender')),
    race: oneOf(RACE_OPTIONS, '', read('race')),
    veteran: oneOf(VETERAN_OPTIONS, '', read('veteran')),
    disability: oneOf(DISABILITY_OPTIONS, '', read('disability')),
  };
};

// ---------------------------------------------------------------------------
// The text to type for a field
// ---------------------------------------------------------------------------

/** A plain decimal: what <input type="number"> keeps. Given "3.9/4.0" the browser empties the box. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** "https://", "http://": a link that already says how to reach it. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Ashby's link fields are <input type="url">; "linkedin.com/in/ada" needs "https://" in front. */
function link(typed: string): string {
  const address = typed.trim();
  return address === '' || HAS_SCHEME.test(address) ? address : `https://${address}`;
}

/** "May 2027" for a stored "2027-05"; "2027-05" itself for <input type="month">. '' when the stored value is not a month. */
function graduationDate(stored: string, inputType: string): string {
  const date = yearAndMonth(stored);
  if (date === null) return '';
  if (inputType === 'month') return stored;
  const month = MONTH_NAMES[date.month - 1];
  return month === undefined ? '' : `${month} ${date.year}`;
}

/** The answer for a kind as text, before asking whether the field can hold it. */
function answer(kind: FieldKind, profile: Profile, inputType: string): string {
  switch (kind) {
    case 'firstName':
    case 'lastName':
    case 'email':
    case 'phone':
    case 'addressLine1':
    case 'city':
    case 'state':
    case 'postalCode':
    case 'country':
    case 'citizenshipCountry':
    case 'nationality':
    case 'currentCompany':
    case 'currentTitle':
    case 'school':
    case 'degree':
    case 'major':
    case 'gpa':
      return profile[kind].trim();
    case 'fullName': {
      const first = profile.firstName.trim();
      const last = profile.lastName.trim();
      // Half a name in a "Full name" box is a wrong answer; an empty box gets noticed.
      return first !== '' && last !== '' ? `${first} ${last}` : '';
    }
    case 'linkedin':
    case 'github':
    case 'portfolio':
      return link(profile[kind]);
    case 'graduationDate':
      return graduationDate(profile.graduationDate, inputType);
    case 'graduationYear':
      return yearAndMonth(profile.graduationDate)?.year ?? '';
    // Answered by choosing an option, never by typing: the stored value is a
    // token such as "notVeteran", which means nothing on a form.
    case 'workAuthorization':
    case 'sponsorship':
    case 'usCitizenship':
    case 'gender':
    case 'race':
    case 'veteran':
    case 'disability':
    // One "where are you based" box is a typeahead on the big job sites: never written.
    case 'location':
    // A file, not text.
    case 'resume':
      return '';
    default:
      // The compiler stops here when a new FieldKind has no case above. A kind
      // that arrives at run time anyway is not an answer: nothing is typed.
      kind satisfies never;
      return '';
  }
}

/** Whether an <input> of this type keeps the text. Strict types silently empty themselves instead. */
function fits(text: string, inputType: string): boolean {
  switch (inputType) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
    // Not an <input>: '' is a dropdown or text area, 'radio' a radio group.
    // Nothing is typed there; the text is what the user is shown to enter by hand.
    case '':
    case 'radio':
      return true;
    case 'number':
      return PLAIN_NUMBER.test(text);
    case 'month':
      return yearAndMonth(text) !== null;
    // date wants a full YYYY-MM-DD, which a profile never holds. The rest
    // (password, hidden, time, range...) is never ours to fill.
    default:
      return false;
  }
}

/**
 * The text to type into a field for a kind, or '' when there is nothing safe
 * to write: no answer in the profile, a kind that is not text, or a field
 * whose type would refuse the text.
 */
export const textValueFor: TextValueFor = (kind, profile, field) => {
  // A file input takes a file, never text.
  if (field.control === 'file' || !autofillAllowed(profile, kind, field)) return '';
  const text = answer(kind, profile, field.inputType);
  return fits(text, field.inputType) ? text : '';
};
