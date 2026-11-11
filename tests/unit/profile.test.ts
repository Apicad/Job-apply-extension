// @vitest-environment node
//
// lib/profile.ts is pure: no DOM, no extension API. Running without a DOM
// makes a stray `document` fail here.
import { describe, expect, it } from 'vitest';
import {
  DISABILITY_OPTIONS,
  GENDER_OPTIONS,
  RACE_OPTIONS,
  VETERAN_OPTIONS,
  YES_NO_OPTIONS,
  emptyProfile,
  isProfileEmpty,
  normalizeProfile,
  textValueFor,
  yearAndMonth,
} from '../../lib/profile';
import type { FieldDescriptor, FieldKind, Profile } from '../../lib/types';

/** Every field of a profile, each with a value no other field has. Nobody real. */
const ADA: Profile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '555-0100',
  addressLine1: '12 Example Street',
  city: 'Springfield',
  state: 'CA',
  postalCode: '94105',
  country: 'United States',
  linkedin: 'https://www.linkedin.com/in/ada-lovelace-example',
  github: 'https://github.com/ada-lovelace-example',
  portfolio: 'https://ada.example.com',
  currentCompany: 'Analytical Engines Ltd',
  currentTitle: 'Software Engineer',
  school: 'Example State University',
  degree: 'Bachelor of Science',
  major: 'Mathematics',
  graduationDate: '2027-05',
  gpa: '3.9',
  workAuthorization: 'yes',
  sponsorship: 'no',
  citizenshipCountry: 'United Kingdom',
  nationality: 'British',
  usCitizenship: 'no',
  fillLocation: 'yes',
  fillEducation: 'yes',
  fillEmployment: 'yes',
  fillEligibility: 'yes',
  gender: 'female',
  race: 'white',
  veteran: 'notVeteran',
  disability: 'decline',
};

const EMPTY: Profile = {
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

describe('emptyProfile', () => {
  it('has every field, each empty', () => {
    expect(emptyProfile()).toEqual(EMPTY);
  });

  // Storage hands the fallback out on every read of an empty store; a shared
  // object would let the settings form's edits leak into the next read.
  it('is a new object every time', () => {
    const first = emptyProfile();
    first.firstName = 'Ada';
    first.gender = 'female';
    expect(emptyProfile()).toEqual(EMPTY);
  });
});

describe('isProfileEmpty', () => {
  it('is true for a profile nobody has filled in', () => {
    expect(isProfileEmpty(EMPTY)).toBe(true);
  });

  it('is true when the only content is spaces', () => {
    expect(isProfileEmpty({ ...EMPTY, firstName: '   ', city: '\t' })).toBe(true);
  });

  const filled: [field: keyof Profile, value: string][] = [
    ['firstName', 'Ada'],
    ['gpa', '3.9'],
    ['graduationDate', '2027-05'],
    ['sponsorship', 'no'],
    ['disability', 'decline'],
  ];

  it.each(filled)('is false once %s is set', (field, value) => {
    expect(isProfileEmpty({ ...EMPTY, [field]: value })).toBe(false);
  });

  it('is false for a complete profile', () => {
    expect(isProfileEmpty(ADA)).toBe(false);
  });
});

describe('normalizeProfile', () => {
  it('keeps a complete, valid profile as it is', () => {
    expect(normalizeProfile(ADA)).toStrictEqual(ADA);
  });

  it('reads a profile that went through JSON, the way storage and an import file deliver it', () => {
    expect(normalizeProfile(JSON.parse(JSON.stringify(ADA)))).toStrictEqual(ADA);
  });

  it('gives back a new object, never the one it was handed', () => {
    const input = { ...ADA };
    expect(normalizeProfile(input)).not.toBe(input);
  });

  it('does not change the object it reads', () => {
    const input = Object.freeze({ ...ADA, gender: 'Female', extra: 1 });
    normalizeProfile(input);
    expect(input).toEqual({ ...ADA, gender: 'Female', extra: 1 });
  });

  const notProfiles: [name: string, value: unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'Ada'],
    ['true', true],
    ['an empty array', []],
    ['an array carrying profile fields', Object.assign([], ADA)],
    ['a function carrying profile fields', Object.assign(() => 0, ADA)],
  ];

  it.each(notProfiles)('gives an empty profile for %s', (_name, value) => {
    expect(normalizeProfile(value)).toStrictEqual(EMPTY);
  });

  it('fills in the fields that are missing (a profile saved before a field existed)', () => {
    expect(normalizeProfile({ firstName: 'Ada', gender: 'female' })).toStrictEqual({ ...EMPTY, firstName: 'Ada', gender: 'female' });
  });

  it('drops keys a profile does not have', () => {
    expect(normalizeProfile({ ...ADA, isAdmin: true, resume: 'data:application/pdf;base64,AAAA', toString: 'x' })).toStrictEqual(ADA);
  });

  // The settings form shows the profile back while the user types: "New " must
  // keep its space or "New York" could never be typed.
  it('keeps a text exactly as typed, spaces included', () => {
    expect(normalizeProfile({ city: ' New ' }).city).toBe(' New ');
  });

  const wrongTypes: [name: string, value: unknown][] = [
    ['a number', 42],
    ['null', null],
    ['true', true],
    ['an object', { first: 'Ada' }],
    ['an array', ['Ada']],
    ['an object that turns itself into text', { toString: () => 'Ada' }],
  ];

  it.each(wrongTypes)('leaves a text field empty when it holds %s', (_name, value) => {
    expect(normalizeProfile({ ...ADA, firstName: value })).toStrictEqual({ ...ADA, firstName: '' });
  });

  it('refuses a wrong type in every field, not only in some', () => {
    const allNumbers = Object.fromEntries(Object.keys(EMPTY).map((key) => [key, 7]));
    expect(normalizeProfile(allNumbers)).toStrictEqual(EMPTY);
  });

  // Typed here from lib/types.ts, not taken from the module under test.
  const answers: [field: keyof Profile, allowed: string[]][] = [
    ['workAuthorization', ['yes', 'no']],
    ['sponsorship', ['yes', 'no']],
    ['gender', ['male', 'female', 'nonbinary', 'decline']],
    ['race', ['asian', 'black', 'hispanic', 'white', 'nativeAmerican', 'pacificIslander', 'twoOrMore', 'decline']],
    ['veteran', ['notVeteran', 'protectedVeteran', 'veteranNotProtected', 'decline']],
    ['disability', ['yes', 'no', 'decline']],
  ];

  it.each(answers)('keeps every allowed answer for %s', (field, allowed) => {
    for (const value of allowed) expect(normalizeProfile({ [field]: value })[field]).toBe(value);
  });

  // A wrong value here would be matched against options on exactly the
  // questions where a wrong answer costs most, so it must become "unanswered".
  const notAnswers: [field: keyof Profile, value: unknown][] = [
    ['workAuthorization', 'Yes'],
    ['workAuthorization', 'YES'],
    ['workAuthorization', ' yes'],
    ['workAuthorization', true],
    ['workAuthorization', 'decline'],
    ['sponsorship', 'No'],
    ['sponsorship', false],
    ['sponsorship', 0],
    ['sponsorship', 'maybe'],
    ['gender', 'Male'],
    ['gender', 'man'],
    ['gender', 'yes'],
    ['race', 'Asian'],
    ['race', 'other'],
    ['veteran', 'veteran'],
    ['veteran', 'yes'],
    ['disability', 'none'],
    ['disability', 'nonbinary'],
    ['disability', ['yes']],
    // Names every object answers to: a lookup in a plain object would accept them.
    ['gender', 'constructor'],
    ['race', 'toString'],
    ['veteran', '__proto__'],
    ['disability', 'hasOwnProperty'],
  ];

  it.each(notAnswers)('leaves %s unanswered when it holds %j', (field, value) => {
    expect(normalizeProfile({ ...ADA, [field]: value })[field]).toBe('');
  });

  it.each(['2027-05', '1999-12', '2030-01'])('keeps the graduation date %s', (value) => {
    expect(normalizeProfile({ graduationDate: value }).graduationDate).toBe(value);
  });

  // "0000-05": browsers know no year 0, and <input type="month"> empties itself when given one.
  const notDates: unknown[] = ['2027-5', '2027-13', '2027-00', '0000-05', 'May 2027', '2027', '2027-05-15', '05/2027', ' 2027-05', '2027-05\n', 202705, null];

  it.each(notDates)('drops the graduation date %j', (value) => {
    expect(normalizeProfile({ ...ADA, graduationDate: value }).graduationDate).toBe('');
  });

  it('keeps a text of 300 characters', () => {
    const long = 'a'.repeat(300);
    expect(normalizeProfile({ addressLine1: long }).addressLine1).toBe(long);
  });

  // Dropped, not cut: the first 300 characters of an address are a wrong answer.
  it('drops a text of 301 characters', () => {
    expect(normalizeProfile({ ...ADA, addressLine1: 'a'.repeat(301) })).toStrictEqual({ ...ADA, addressLine1: '' });
  });

  it('drops a 9 MB string instead of filling the storage quota with it', () => {
    expect(normalizeProfile({ ...ADA, portfolio: 'x'.repeat(9_000_000) }).portfolio).toBe('');
  });

  it('is not fooled by a "__proto__" key in an imported file', () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"firstName": "Mallory", "workAuthorization": "yes"}, "lastName": "Lovelace"}');
    const profile = normalizeProfile(parsed);
    expect(profile).toStrictEqual({ ...EMPTY, lastName: 'Lovelace' });
    expect(Object.getPrototypeOf(profile)).toBe(Object.prototype);
    // Nothing leaked into every other object either.
    expect(({} as Record<string, unknown>).firstName).toBe(undefined);
  });

  it('ignores values that only come from a prototype', () => {
    const inherited: unknown = Object.create({ firstName: 'Mallory', sponsorship: 'no' });
    expect(normalizeProfile(inherited)).toStrictEqual(EMPTY);
  });

  it('never runs a getter', () => {
    let ran = false;
    const trap = Object.defineProperty({}, 'firstName', {
      enumerable: true,
      get: () => {
        ran = true;
        return 'Mallory';
      },
    });
    expect(normalizeProfile(trap)).toStrictEqual(EMPTY);
    expect(ran).toBe(false);
  });
});

describe('the choices of the settings form', () => {
  // Answers typed here from lib/types.ts, not taken from the module under test.
  const lists: [name: string, options: readonly { value: string; label: string }[], answers: string[]][] = [
    ['YES_NO_OPTIONS', YES_NO_OPTIONS, ['', 'no', 'yes']],
    ['GENDER_OPTIONS', GENDER_OPTIONS, ['', 'decline', 'female', 'male', 'nonbinary']],
    ['RACE_OPTIONS', RACE_OPTIONS, ['', 'asian', 'black', 'decline', 'hispanic', 'nativeAmerican', 'pacificIslander', 'twoOrMore', 'white']],
    ['VETERAN_OPTIONS', VETERAN_OPTIONS, ['', 'decline', 'notVeteran', 'protectedVeteran', 'veteranNotProtected']],
    ['DISABILITY_OPTIONS', DISABILITY_OPTIONS, ['', 'decline', 'no', 'yes']],
  ];

  it.each(lists)('%s starts with the empty value, labelled "No answer"', (_name, options) => {
    expect(options[0]).toEqual({ value: '', label: 'No answer' });
  });

  it.each(lists)('%s offers every answer a profile can hold, each once', (_name, options, answers) => {
    expect(options.map((option) => option.value).sort()).toEqual(answers);
  });

  it.each(lists)('%s labels each answer in words of its own, not with the stored token', (_name, options) => {
    const labels = options.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const { value, label } of options) {
      expect(label).toMatch(/^[A-Z][a-z]/);
      expect(label).not.toBe(value);
    }
  });
});

/** A plain, visible text input. Each test changes only what it is about. */
function field(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    control: 'text',
    inputType: 'text',
    autocomplete: '',
    label: '',
    groupLabel: '',
    name: '',
    id: '',
    placeholder: '',
    hints: '',
    required: false,
    options: [],
    accept: '',
    ...overrides,
  };
}

describe('textValueFor', () => {
  // ADA holds a different value in every field, so a kind wired to the wrong
  // field shows up here.
  const plain: [kind: FieldKind, want: string][] = [
    ['firstName', 'Ada'],
    ['lastName', 'Lovelace'],
    ['fullName', 'Ada Lovelace'],
    ['email', 'ada@example.com'],
    ['phone', '555-0100'],
    ['addressLine1', '12 Example Street'],
    ['city', 'Springfield'],
    ['state', 'CA'],
    ['postalCode', '94105'],
    ['country', 'United States'],
    ['linkedin', 'https://www.linkedin.com/in/ada-lovelace-example'],
    ['github', 'https://github.com/ada-lovelace-example'],
    ['portfolio', 'https://ada.example.com'],
    ['currentCompany', 'Analytical Engines Ltd'],
    ['currentTitle', 'Software Engineer'],
    ['school', 'Example State University'],
    ['degree', 'Bachelor of Science'],
    ['major', 'Mathematics'],
    ['graduationDate', 'May 2027'],
    ['graduationYear', '2027'],
    ['gpa', '3.9'],
  ];

  it.each(plain)('%s in a text box is %s', (kind, want) => {
    expect(textValueFor(kind, ADA, field())).toBe(want);
  });

  it.each(plain)('%s is empty when the profile is empty', (kind) => {
    expect(textValueFor(kind, EMPTY, field())).toBe('');
  });

  it('drops the spaces around a value', () => {
    expect(textValueFor('city', { ...ADA, city: '  Springfield ' }, field())).toBe('Springfield');
    expect(textValueFor('city', { ...ADA, city: '   ' }, field())).toBe('');
  });

  // These kinds are answered by choosing an option. Typing the stored token
  // ("yes", "decline", "notVeteran") into a text box would be nonsense, and on
  // Greenhouse the Gender and Veteran questions are text boxes underneath.
  const neverTyped: FieldKind[] = ['workAuthorization', 'sponsorship', 'gender', 'race', 'veteran', 'disability', 'location', 'resume'];

  it.each(neverTyped)('%s is never text', (kind) => {
    expect(textValueFor(kind, ADA, field())).toBe('');
    expect(textValueFor(kind, ADA, field({ control: 'combobox' }))).toBe('');
  });

  // The compiler knows every kind, but at run time a kind is just a string. One
  // this module does not know must not be typed into a form as if it were the answer.
  it('gives nothing for a kind it does not know', () => {
    expect(textValueFor('salary' as FieldKind, ADA, field())).toBe('');
    expect(textValueFor('constructor' as FieldKind, ADA, field())).toBe('');
  });

  describe('fullName', () => {
    const table: [why: string, first: string, last: string, want: string][] = [
      ['both names', 'Ada', 'Lovelace', 'Ada Lovelace'],
      ['spaces around the names', ' Ada ', ' Lovelace ', 'Ada Lovelace'],
      ['a first name of two words', 'Ada Augusta', 'Lovelace', 'Ada Augusta Lovelace'],
      // Half a name in a "Full name" box is a wrong answer; an empty box gets noticed.
      ['only a first name', 'Ada', '', ''],
      ['only a last name', '', 'Lovelace', ''],
      ['a last name made of spaces', 'Ada', '   ', ''],
    ];

    it.each(table)('%s', (_why, firstName, lastName, want) => {
      expect(textValueFor('fullName', { ...ADA, firstName, lastName }, field())).toBe(want);
    });
  });

  describe('graduation date', () => {
    const months: [stored: string, want: string][] = [
      ['2027-01', 'January 2027'],
      ['2027-02', 'February 2027'],
      ['2027-03', 'March 2027'],
      ['2027-04', 'April 2027'],
      ['2027-05', 'May 2027'],
      ['2027-06', 'June 2027'],
      ['2027-07', 'July 2027'],
      ['2027-08', 'August 2027'],
      ['2027-09', 'September 2027'],
      ['2027-10', 'October 2027'],
      ['2027-11', 'November 2027'],
      ['2026-12', 'December 2026'],
    ];

    it.each(months)('%s in a text box is "%s"', (graduationDate, want) => {
      expect(textValueFor('graduationDate', { ...ADA, graduationDate }, field())).toBe(want);
    });

    it.each(months)('%s in <input type="month"> stays as stored', (graduationDate) => {
      expect(textValueFor('graduationDate', { ...ADA, graduationDate }, field({ inputType: 'month' }))).toBe(graduationDate);
    });

    it('is written out in words for a dropdown, where the user picks it by hand', () => {
      expect(textValueFor('graduationDate', ADA, field({ control: 'select', inputType: '' }))).toBe('May 2027');
    });

    // A stored value that is not YYYY-MM cannot be turned into a date.
    it.each(['2027-13', '2027-00', '0000-05', 'May 2027', '2027', '27-05'])('a stored "%s" gives nothing', (graduationDate) => {
      const profile = { ...ADA, graduationDate };
      expect(textValueFor('graduationDate', profile, field())).toBe('');
      expect(textValueFor('graduationDate', profile, field({ inputType: 'month' }))).toBe('');
      expect(textValueFor('graduationYear', profile, field())).toBe('');
    });
  });

  describe('links', () => {
    const table: [why: string, stored: string, want: string][] = [
      // Ashby's link fields are <input type="url">, which wants a scheme.
      ['a link typed without a scheme', 'linkedin.com/in/ada-lovelace-example', 'https://linkedin.com/in/ada-lovelace-example'],
      ['a link starting with www', 'www.ada.example.com', 'https://www.ada.example.com'],
      ['a link that has https', 'https://ada.example.com/work', 'https://ada.example.com/work'],
      ['a link that has http', 'http://ada.example.com', 'http://ada.example.com'],
      ['a scheme in capitals', 'HTTPS://ADA.EXAMPLE.COM', 'HTTPS://ADA.EXAMPLE.COM'],
      ['spaces around the link', '  ada.example.com  ', 'https://ada.example.com'],
      ['no link', '', ''],
      ['only spaces', '   ', ''],
    ];

    const kinds: FieldKind[] = ['linkedin', 'github', 'portfolio'];

    it.each(table)('%s', (_why, stored, want) => {
      for (const kind of kinds) {
        const profile = { ...ADA, [kind]: stored };
        expect(textValueFor(kind, profile, field({ inputType: 'url' }))).toBe(want);
        expect(textValueFor(kind, profile, field({ inputType: 'text' }))).toBe(want);
      }
    });

    it('adds a scheme to links only', () => {
      expect(textValueFor('currentCompany', { ...ADA, currentCompany: 'example.com' }, field())).toBe('example.com');
    });
  });

  describe('input types the browser is strict about', () => {
    // A browser silently empties <input type="number"> given "3.9/4.0", and
    // <input type="month"> or type="date" given "May 2027". Nothing is better
    // than a write that vanishes.
    const table: [why: string, kind: FieldKind, profile: Partial<Profile>, inputType: string, want: string][] = [
      ['a plain GPA in a number box', 'gpa', { gpa: '3.9' }, 'number', '3.9'],
      ['a whole-number GPA in a number box', 'gpa', { gpa: '4' }, 'number', '4'],
      ['"3.9/4.0" in a number box', 'gpa', { gpa: '3.9/4.0' }, 'number', ''],
      ['a comma decimal in a number box', 'gpa', { gpa: '3,9' }, 'number', ''],
      ['a GPA with words in a number box', 'gpa', { gpa: '3.9 GPA' }, 'number', ''],
      ['"3.9/4.0" in a text box', 'gpa', { gpa: '3.9/4.0' }, 'text', '3.9/4.0'],
      ['the graduation year in a number box', 'graduationYear', {}, 'number', '2027'],
      ['a ZIP code in a number box', 'postalCode', { postalCode: '94105' }, 'number', '94105'],
      ['a ZIP+4 code in a number box', 'postalCode', { postalCode: '94105-1234' }, 'number', ''],
      ['a phone number with a dash in a number box', 'phone', {}, 'number', ''],
      ['a name in a number box', 'firstName', {}, 'number', ''],
      ['the graduation date in a number box', 'graduationDate', {}, 'number', ''],
      ['the graduation date in a date box (it has no day)', 'graduationDate', {}, 'date', ''],
      ['the graduation year in a date box', 'graduationYear', {}, 'date', ''],
      ['the graduation year in a month box', 'graduationYear', {}, 'month', ''],
      ['a name in a month box', 'firstName', {}, 'month', ''],
      ['a name in a date box', 'firstName', {}, 'date', ''],
      ['an e-mail address in an e-mail box', 'email', {}, 'email', 'ada@example.com'],
      ['a phone number in a phone box', 'phone', {}, 'tel', '555-0100'],
    ];

    it.each(table)('%s', (_why, kind, changes, inputType, want) => {
      expect(textValueFor(kind, { ...ADA, ...changes }, field({ inputType }))).toBe(want);
    });

    // Input types the extension never collects. If one arrives anyway, nothing is written.
    it.each(['password', 'hidden', 'datetime-local', 'time', 'week', 'range', 'color', 'checkbox', 'search', 'file'])(
      'gives nothing for <input type="%s">',
      (inputType) => {
        expect(textValueFor('firstName', ADA, field({ inputType }))).toBe('');
        expect(textValueFor('email', ADA, field({ inputType }))).toBe('');
      },
    );
  });

  describe('controls that are not text boxes', () => {
    it('gives nothing for a file input: it takes a file, never text', () => {
      expect(textValueFor('firstName', ADA, field({ control: 'file', inputType: 'file' }))).toBe('');
      expect(textValueFor('fullName', ADA, field({ control: 'file', inputType: 'text' }))).toBe('');
    });

    // The planner never types into these, but it shows the user the answer to enter by hand.
    const shown: [control: FieldDescriptor['control'], inputType: string][] = [
      ['combobox', 'text'],
      ['textarea', ''],
      ['select', ''],
      ['radio', 'radio'],
    ];

    it.each(shown)('still gives the answer for a %s', (control, inputType) => {
      expect(textValueFor('state', ADA, field({ control, inputType }))).toBe('CA');
    });
  });
});

describe('yearAndMonth', () => {
  const dates: [stored: string, year: string, month: number][] = [
    ['2027-05', '2027', 5],
    ['2027-01', '2027', 1],
    ['1999-12', '1999', 12],
    ['2030-10', '2030', 10],
    ['0001-01', '0001', 1],
  ];

  it.each(dates)('%s is year %s, month %i', (stored, year, month) => {
    expect(yearAndMonth(stored)).toEqual({ year, month });
  });

  // Anything else is not a date, and nothing is read out of it.
  it.each(['', '2027', '2027-5', '2027-00', '2027-13', '0000-05', '2027-05-15', 'May 2027', '05/2027', '27-05', ' 2027-05', '2027-05 '])('"%s" is no date', (stored) => {
    expect(yearAndMonth(stored)).toBe(null);
  });
});
