// @vitest-environment node
//
// lib/choices.ts is pure: no DOM. Running without one makes a stray
// `document` fail here.
//
// Lists named after a job site, and lists a comment calls real, are copied
// from live application forms (Greenhouse, Lever, Ashby; November 2026) as the
// design review and the saved pages quote them. Every other list is made up to
// pin one rule.
import { describe, expect, it } from 'vitest';
import { pickChoice } from '../../lib/choices';
import { emptyProfile } from '../../lib/profile';
import type { ChoiceOption, ChoicePick, FieldKind, Profile, YesNo } from '../../lib/types';

/** Options the way a scan reports them: the text the user sees, in page order. */
function options(...labels: string[]): ChoiceOption[] {
  return labels.map((label) => ({ label, value: label, disabled: false }));
}

/** A profile that answers only the given questions. */
function profile(answers: Partial<Profile>): Profile {
  return { ...emptyProfile(), ...answers };
}

const match = (index: number): ChoicePick => ({ status: 'match', index });
const NO_OPTION: ChoicePick = { status: 'noOption' };
const MISSING: ChoicePick = { status: 'missing' };

describe('pickChoice: yes or no', () => {
  const authorized = profile({ workAuthorization: 'yes' });
  const notAuthorized = profile({ workAuthorization: 'no' });

  const plainLists: [why: string, labels: string[], yes: number, no: number][] = [
    ['Lever radios', ['Yes', 'No'], 0, 1],
    ['"No" listed first', ['No', 'Yes'], 1, 0],
    ['a trailing space, as real option values have', ['Yes ', 'No'], 0, 1],
    ['capitals', ['YES', 'NO'], 0, 1],
    ['a full stop', ['Yes.', 'No.'], 0, 1],
    ['a clause after a comma', ['Yes, I am authorized', 'No, I am not authorized'], 0, 1],
    ['a clause after a dash', ['Yes - I am authorized to work', 'No - I will need a visa'], 0, 1],
    ['a clause after a long dash', ['Yes — I am authorized', 'No – I am not'], 0, 1],
    ['an explanation in brackets', ['Yes (I am authorized)', 'No (I am not authorized)'], 0, 1],
    ['brackets inside brackets', ['Yes (I am a citizen (by birth))', 'No (I am not (yet))'], 0, 1],
    ['a second sentence', ['Yes. I can show proof.', 'No. I will need help.'], 0, 1],
    ['a second sentence after an exclamation mark', ['Yes! I can start at once.', 'No! I cannot.'], 0, 1],
    ['full-width letters, as Japanese forms write Latin text', ['Ｙｅｓ', 'Ｎｏ'], 0, 1],
    ['a clause on a line of its own', ['Yes,\nI am authorized', 'No,\nI am not authorized'], 0, 1],
    // ("full stops inside a clause", a list that names the U.S., is tested further
    // down: options that name a country need a profile that lives there.)
    ['a full stop inside a clause', ['Yes, I have a B.A. or higher', 'No, I do not have a B.A. or higher'], 0, 1],
    ['the placeholder of a Lever dropdown', ['Select...', 'Yes', 'No'], 1, 2],
    ['a Lever placeholder with its own wording', ['Click Here (If you encounter an issue, make sure your browser is updated and try clearing cache & cookies)', 'Yes', 'No'], 1, 2],
    ['an empty first option', ['', 'Yes', 'No'], 1, 2],
    ['a first option of dashes', ['--', 'Yes', 'No'], 1, 2],
    ['"-- Select --"', ['-- Select --', 'Yes', 'No'], 1, 2],
    ['"Please select"', ['Please select', 'Yes', 'No'], 1, 2],
    ['"Choose..."', ['Choose...', 'Yes', 'No'], 1, 2],
    ['"Select One"', ['Select One', 'Yes', 'No'], 1, 2],
    ['a placeholder in brackets', ['(Select)', 'Yes', 'No'], 1, 2],
  ];

  it.each(plainLists)('answers "yes" on %s', (_why, labels, yes) => {
    expect(pickChoice('workAuthorization', authorized, options(...labels))).toEqual(match(yes));
  });

  it.each(plainLists)('answers "no" on %s', (_why, labels, _yes, no) => {
    expect(pickChoice('workAuthorization', notAuthorized, options(...labels))).toEqual(match(no));
  });

  // Lists where "Yes" or "No" alone would be close enough, and wrong.
  const leftAlone: [why: string, labels: string[]][] = [
    ['two kinds of "yes"', ['Yes, no restriction.', 'Yes, but I will need sponsorship in the future.', 'No, I need sponsorship now.']],
    ['two kinds of "no"', ['Yes', "No, I'm a Singapore Citizen.", "No, I'm a Permanent resident."]],
    [
      'one "no" and six kinds of "yes"',
      [
        'No',
        'Yes, Netherlands Highly Skilled Migrant Visa',
        'Yes, Ireland Highly Skilled Worker Visa',
        'Yes, EU Blue Card',
        'Yes, USMCA Professional (TN) Visa (USA)',
        'Yes, F-1 Visa OPT (USA)',
        'Yes, but not one of the visas listed here',
      ],
    ],
    ['a third answer ("Do you require work authorization?")', ['Yes', 'No', 'Unknown']],
    ['a third answer that declines', ['Yes', 'No', 'Prefer not to say']],
    ['a third answer listed first', ['Not sure', 'Yes', 'No']],
    ['a third answer listed first that starts like a prompt', ['Choose to explain later', 'Yes', 'No']],
    ['a third answer written in brackets', ['Yes', 'No', '(Prefer not to say)']],
    ['a prompt-like option that is not first', ['Yes', 'No', 'Select if unsure']],
    ['words that only start with "no"', ['None', 'Not applicable', 'Non-binary']],
    ['"No" and words that only start with it', ['Yes', 'No', 'None', 'Not applicable']],
    ['a "yes" with more words and no comma', ['Yes with sponsorship', 'No']],
    ['"Nope"', ['Yes', 'Nope']],
    ['"No-one"', ['Yes', 'No-one']],
    ['a full stop that ends no sentence', ['Yes', 'No.1 choice only']],
    // "Yes?" alone is no yes, and it does not become one when a sentence follows.
    ['a yes with a question mark', ['Yes?', 'No']],
    ['a yes with a question mark and more', ['Yes? I am not sure.', 'No']],
    // A bracket that never closes: the text was cut short somewhere, and what it hid is unknown.
    ['a bracket that never closes', ['Yes (I am authorized to work in the United', 'No']],
    ['a bracket that never opened', ['Yes', 'No) or maybe']],
    ['the same answer twice', ['Yes', 'Yes', 'No']],
    ['only "Yes"', ['Yes']],
    ['only "No"', ['No']],
    ['no options at all', []],
    ['only a placeholder', ['Select...']],
    ['statements instead of yes and no', ['I am authorized to work', 'I am not authorized to work']],
    ['"True" and "False"', ['True', 'False']],
    // An option nobody can read may be a third answer: a sign, an emoji, or a
    // radio button whose label the scan did not find. Only in first place is
    // it the empty line a dropdown starts with.
    ['a third answer that is only a sign', ['Yes', 'No', '?']],
    ['a third answer that is only an emoji', ['Yes', 'No', '🤷']],
    ['an option without a text between the two', ['Yes', '', 'No']],
    ['an option without a text after the two', ['Yes', 'No', '']],
  ];

  it.each(leftAlone)('chooses nothing on %s', (_why, labels) => {
    expect(pickChoice('workAuthorization', authorized, options(...labels))).toEqual(NO_OPTION);
    expect(pickChoice('workAuthorization', notAuthorized, options(...labels))).toEqual(NO_OPTION);
  });

  it('skips a disabled option and keeps the indexes of the page', () => {
    const list: ChoiceOption[] = [
      { label: 'Yes', value: 'old-yes', disabled: true },
      { label: 'Yes', value: 'yes', disabled: false },
      { label: 'No', value: 'no', disabled: false },
    ];
    expect(pickChoice('workAuthorization', authorized, list)).toEqual(match(1));
    expect(pickChoice('workAuthorization', notAuthorized, list)).toEqual(match(2));
  });

  it('never chooses a disabled option', () => {
    const list: ChoiceOption[] = [
      { label: 'Yes', value: 'yes', disabled: true },
      { label: 'No', value: 'no', disabled: false },
    ];
    expect(pickChoice('workAuthorization', authorized, list)).toEqual(NO_OPTION);
    expect(pickChoice('workAuthorization', notAuthorized, list)).toEqual(NO_OPTION);
  });

  it('is not stopped by a disabled option it cannot read', () => {
    const list: ChoiceOption[] = [
      { label: 'Yes', value: 'yes', disabled: false },
      { label: 'No', value: 'no', disabled: false },
      { label: '', value: '', disabled: true },
    ];
    expect(pickChoice('workAuthorization', authorized, list)).toEqual(match(0));
    expect(pickChoice('workAuthorization', notAuthorized, list)).toEqual(match(1));
  });

  // Ashby radios have no value attribute, and other values are internal ids:
  // only the text the user sees says what an option means.
  it('reads the text of an option, never its value', () => {
    const misleading: ChoiceOption[] = [
      { label: 'No', value: 'yes', disabled: false },
      { label: 'Yes', value: 'no', disabled: false },
    ];
    expect(pickChoice('workAuthorization', authorized, misleading)).toEqual(match(1));

    const withoutValues: ChoiceOption[] = [
      { label: 'Yes', value: '', disabled: false },
      { label: 'No', value: '', disabled: false },
    ];
    expect(pickChoice('workAuthorization', authorized, withoutValues)).toEqual(match(0));
    expect(pickChoice('workAuthorization', notAuthorized, withoutValues)).toEqual(match(1));
  });

  it('does not choose an option it cannot read', () => {
    const list: ChoiceOption[] = [
      { label: '', value: 'yes', disabled: false },
      { label: '', value: 'no', disabled: false },
    ];
    expect(pickChoice('workAuthorization', authorized, list)).toEqual(NO_OPTION);
  });

  it('uses each question’s own answer', () => {
    const both = profile({ workAuthorization: 'yes', sponsorship: 'no' });
    expect(pickChoice('workAuthorization', both, options('Yes', 'No'))).toEqual(match(0));
    expect(pickChoice('sponsorship', both, options('Yes', 'No'))).toEqual(match(1));
  });

  it('reports "missing" when the profile has no answer, whatever the options', () => {
    expect(pickChoice('workAuthorization', profile({ sponsorship: 'yes' }), options('Yes', 'No'))).toEqual(MISSING);
    expect(pickChoice('sponsorship', profile({ workAuthorization: 'yes' }), options('Yes', 'No'))).toEqual(MISSING);
    expect(pickChoice('sponsorship', profile({}), [])).toEqual(MISSING);
  });

  // A hand-edited profile that skipped normalizeProfile. "Yes" is not "yes";
  // reading it as "anything but yes" would answer "No" on a sponsorship question.
  it.each(['Yes', 'YES', 'true', 'y', 'decline', 'toString'])('treats the stored value "%s" as no answer', (stored) => {
    const broken = profile({ sponsorship: stored as YesNo, workAuthorization: stored as YesNo });
    expect(pickChoice('sponsorship', broken, options('Yes', 'No'))).toEqual(MISSING);
    expect(pickChoice('workAuthorization', broken, options('Yes', 'No'))).toEqual(MISSING);
  });
});

// The two eligibility answers are about the country the user lives in. Some
// lists name a country only in their options, under a question that names
// none, so the planner's look at the question cannot catch them.
describe('pickChoice: work authorization and sponsorship options that name a country', () => {
  // Greenhouse, "Will you now or in the future require sponsorship or a visa
  // transfer for employment visa status (ie: H-1B visa)?"
  const US_EMPLOYER = [
    'No, I can work for any US employer without sponsorship (eg: US citizen, permanent resident, EAD, etc.)',
    'Yes, I require sponsorship or a visa transfer (eg: J-1, F-1 CPT/OPT, H-1B, TN, etc.)',
  ];

  const sponsorship: [why: string, labels: string[], country: string, sponsorship: YesNo, want: ChoicePick][] = [
    ['somebody who lives in the country named', US_EMPLOYER, 'United States', 'no', match(0)],
    ['somebody who lives in the country named', US_EMPLOYER, 'United States', 'yes', match(1)],
    ['the country written another way', US_EMPLOYER, 'usa', 'no', match(0)],
    // "No" for Canada must not become "I can work for any US employer… US citizen".
    ['somebody who lives elsewhere', US_EMPLOYER, 'Canada', 'no', NO_OPTION],
    ['somebody who lives elsewhere', US_EMPLOYER, 'Canada', 'yes', NO_OPTION],
    ['a profile without a country', US_EMPLOYER, '', 'no', NO_OPTION],
    ['a profile with a country the table does not know', US_EMPLOYER, 'Narnia', 'no', NO_OPTION],
    // Made up from here on.
    ['a country in the option that is not chosen', ['Yes', 'No, I am a permanent resident of Canada'], 'United States', 'yes', NO_OPTION],
    ['a US state, for somebody in the United States', ['Yes, I need sponsorship to work in California', 'No'], 'US', 'no', match(1)],
    ['a US state, for somebody elsewhere', ['Yes, I need sponsorship to work in California', 'No'], 'Mexico', 'no', NO_OPTION],
    ['a union of countries', ['Yes', 'No, I am an EU citizen'], 'Ireland', 'no', NO_OPTION],
    ['options that name no country', ['Yes, I will require sponsorship', 'No, I will not require sponsorship'], '', 'no', match(1)],
    ['options that name no country', ['Yes, I will require sponsorship', 'No, I will not require sponsorship'], 'Canada', 'yes', match(0)],
  ];

  it.each(sponsorship)('sponsorship, %s %j (lives in "%s", answers %s)', (_why, labels, country, answer, want) => {
    expect(pickChoice('sponsorship', profile({ country, sponsorship: answer }), options(...labels))).toEqual(want);
  });

  const UNITED_STATES = ['Yes, I am authorized to work in the United States', 'No, I am not'];

  const authorization: [why: string, labels: string[], country: string, want: ChoicePick][] = [
    ['somebody who lives in the country named', UNITED_STATES, 'United States', match(0)],
    ['somebody who lives elsewhere', UNITED_STATES, 'Germany', NO_OPTION],
    ['a profile without a country', UNITED_STATES, '', NO_OPTION],
    ['options that name no country', ['Yes', 'No'], '', match(0)],
  ];

  it.each(authorization)('work authorization, %s %j (lives in "%s")', (_why, labels, country, want) => {
    expect(pickChoice('workAuthorization', profile({ country, workAuthorization: 'yes' }), options(...labels))).toEqual(want);
  });

  // This list stood among the plain yes/no lists, with a profile that named no
  // country. The answers expected are the same; the profile now lives in the U.S.
  it('reads on past the full stops of "U.S." inside a clause', () => {
    const list = options('Yes, I am a U.S. citizen or resident', 'No, I am not a U.S. citizen or resident');
    expect(pickChoice('workAuthorization', profile({ country: 'United States', workAuthorization: 'yes' }), list)).toEqual(match(0));
    expect(pickChoice('workAuthorization', profile({ country: 'United States', workAuthorization: 'no' }), list)).toEqual(match(1));
  });

  it('does not count a country named in a disabled option or in the placeholder', () => {
    const list: ChoiceOption[] = [
      { label: 'Select (Canada and Mexico only)', value: '', disabled: false },
      { label: 'Yes', value: 'yes', disabled: false },
      { label: 'No', value: 'no', disabled: false },
      { label: 'No, I am a citizen of Canada', value: 'old', disabled: true },
    ];
    expect(pickChoice('sponsorship', profile({ country: 'United States', sponsorship: 'no' }), list)).toEqual(match(2));
  });
});

// Option texts come from the page. A page must not be able to stall or crash
// the worker that plans the fill.
describe('pickChoice: hostile option texts', () => {
  const sure = profile({ workAuthorization: 'yes', gender: 'male', school: 'Example University' });

  const hostile: [why: string, label: string][] = [
    ['100,000 brackets inside each other', `Yes ${'('.repeat(100_000)}x${')'.repeat(100_000)}`],
    ['100,000 brackets that never close', `Yes ${'('.repeat(100_000)}`],
    ['100,000 brackets side by side', `Yes ${'(x)'.repeat(100_000)}`],
    ['100,000 spaces', `Yes${' '.repeat(100_000)}x`],
    ['100,000 full stops', `Yes${'. '.repeat(100_000)}`],
    ['100,000 dotted initials', 'a.'.repeat(100_000)],
  ];

  it.each(hostile)('reads %s without stalling', (_why, label) => {
    const started = performance.now();
    const list = options(label, 'No', 'Male', 'Example University');
    expect(() => pickChoice('workAuthorization', sure, list)).not.toThrow();
    expect(() => pickChoice('gender', sure, list)).not.toThrow();
    expect(pickChoice('school', sure, list)).toEqual(match(3));
    // Generous: the point is "not minutes", and a slow machine must not fail this.
    expect(performance.now() - started).toBeLessThan(2000);
  });

  // When a yes and a no are found, the options are read once more for the
  // countries they name. "New" starts many names (New York, New Zealand…).
  it('reads 100,000 words of a clause for countries without stalling', () => {
    const started = performance.now();
    const list = options(`Yes, ${'New '.repeat(100_000)}`, 'No');
    expect(pickChoice('sponsorship', profile({ sponsorship: 'no' }), list)).toEqual(match(1));
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('pickChoice: consent', () => {
  const sure = profile({ workAuthorization: 'yes', sponsorship: 'no' });

  // A real Lever pair (consent to AI note-taking). If the question were ever
  // mistaken for one of ours, "starts with yes" would give consent.
  const consentLists: [why: string, labels: string[]][] = [
    ['the Lever consent pair', ['Yes, I consent', 'No, I do not consent']],
    ['"I agree"', ['Yes, I agree', 'No']],
    ['"I do not agree"', ['Yes', 'No, I do not agree']],
    ['"I disagree"', ['Yes', 'No, I disagree']],
    ['"I acknowledge"', ['Yes, I acknowledge', 'No']],
    ['"acknowledgement" in brackets', ['Yes (acknowledgement)', 'No']],
    ['"acknowledgment", as Americans spell it', ['Yes (acknowledgment)', 'No']],
    ['"I certify"', ['Yes, I certify that the above is true', 'No']],
    ['"certification"', ['Yes, this is my certification', 'No']],
    ['consent in a second sentence', ['Yes. I consent to the processing of my data.', 'No.']],
  ];

  it.each(consentLists)('chooses nothing on %s', (_why, labels) => {
    expect(pickChoice('workAuthorization', sure, options(...labels))).toEqual(NO_OPTION);
    expect(pickChoice('sponsorship', sure, options(...labels))).toEqual(NO_OPTION);
  });

  // Made up: the profile's own text matches the option exactly, and it is
  // still refused, whatever the kind.
  it('never returns such an option, even on an exact match', () => {
    expect(pickChoice('school', profile({ school: 'I agree' }), options('I agree', 'I do not agree'))).toEqual(NO_OPTION);
    expect(pickChoice('degree', profile({ degree: 'I certify' }), options('I certify'))).toEqual(NO_OPTION);
    expect(pickChoice('major', profile({ major: 'Informed consent' }), options('Informed consent', 'Other'))).toEqual(NO_OPTION);
  });
});

describe('pickChoice: kinds it does not choose for', () => {
  // The same text as the profile is on offer, and still nothing is chosen.
  const kinds: [kind: FieldKind, answers: Partial<Profile>, labels: string[]][] = [
    ['firstName', { firstName: 'Ada' }, ['Ada', 'Grace']],
    ['fullName', { firstName: 'Ada', lastName: 'Lovelace' }, ['Ada Lovelace']],
    ['email', { email: 'ada@example.com' }, ['ada@example.com']],
    ['city', { city: 'Springfield' }, ['Springfield', 'Shelbyville']],
    ['location', { city: 'Springfield', state: 'CA' }, ['Springfield, CA', 'Springfield']],
    ['currentTitle', { currentTitle: 'Dr' }, ['Mr', 'Ms', 'Dr']],
    // The start of a real list: every option holds "4.0".
    ['gpa', { gpa: '4.0' }, ['4.0 out of 4.0', '3.9 out of 4.0']],
    ['resume', {}, ['Ada-Lovelace-Resume.pdf']],
  ];

  it.each(kinds)('chooses nothing for %s', (kind, answers, labels) => {
    expect(pickChoice(kind, profile(answers), options(...labels))).toEqual(NO_OPTION);
  });
});

// Ways of declining: first the ones read on live forms, then other common
// wordings. And options that sit next to them and are something else.
describe('pickChoice: declining to answer', () => {
  const declining = profile({ gender: 'decline' });

  const declines: string[] = [
    'Decline to self-identify',
    'Decline To Self Identify',
    'Prefer not to say',
    "I don't wish to answer",
    'I don’t wish to answer',
    'I do not want to answer ',
    'I do not wish to self-identify',
    'Prefer not to answer',
    'I prefer not to say',
    'Prefer not to disclose',
    'Decline to answer',
    'Decline to state',
    'I choose not to disclose',
    'Choose not to disclose',
    "I don't want to answer",
    "I'd prefer not to say",
    'I would prefer not to say',
    'Prefer not to respond',
    'Prefer not to specify',
    'Decline to identify',
  ];

  it.each(declines)('"%s" is a way of declining', (label) => {
    expect(pickChoice('gender', declining, options('Man', label, 'Woman'))).toEqual(match(1));
  });

  it('is found when it is the first option, even though it starts with "Choose"', () => {
    expect(pickChoice('gender', declining, options('Choose not to disclose', 'Man', 'Woman'))).toEqual(match(0));
  });

  const notDeclines: string[] = [
    // On the same real list as "I don't wish to answer": it asks for more, not less.
    'I prefer to self-describe',
    'Prefer to self-describe',
    'Self-identify',
    'Other',
    'None of the above',
    'Not listed',
    'Not applicable',
    'N/A',
    'Unknown',
    "Don't know",
    'I prefer not',
    'Prefer to answer',
    'I wish to answer',
    'Decline to sign',
    // A way of declining merged with another answer is neither of the two.
    'Other / Prefer not to say',
    'Prefer not to say / Other',
    'Non-binary or prefer not to say',
  ];

  it.each(notDeclines)('"%s" is not a way of declining', (label) => {
    expect(pickChoice('gender', declining, options('Man', label, 'Woman'))).toEqual(NO_OPTION);
  });

  it('chooses nothing when two options decline', () => {
    expect(pickChoice('gender', declining, options('Man', 'Woman', 'Prefer not to say', 'Decline to self-identify'))).toEqual(NO_OPTION);
  });
});

describe('pickChoice: gender', () => {
  // Lever, "Please indicate your gender:". Looking for "man" inside the text finds "Woman" first.
  const LEVER = ['Woman', 'Man', 'Non-binary', 'Prefer not to say'];
  // Lever's standard EEO dropdown, with its placeholder.
  const LEVER_EEO = ['Select ...', 'Male', 'Female', 'Decline to self-identify'];
  // Greenhouse's EEOC block.
  const GREENHOUSE = ['Male', 'Female', 'Decline To Self Identify'];
  // Greenhouse, "Gender Identity (optional)": the options the design review quotes from a longer list.
  const GREENHOUSE_IDENTITY = ['Man', 'Woman', 'Non-binary or third gender', 'Genderqueer', 'I prefer to self-describe', "I don't wish to answer"];

  const table: [list: string, labels: string[], gender: Profile['gender'], want: ChoicePick][] = [
    ['Lever', LEVER, 'male', match(1)],
    ['Lever', LEVER, 'female', match(0)],
    ['Lever', LEVER, 'nonbinary', match(2)],
    ['Lever', LEVER, 'decline', match(3)],
    ['Lever EEO', LEVER_EEO, 'male', match(1)],
    ['Lever EEO', LEVER_EEO, 'female', match(2)],
    ['Lever EEO', LEVER_EEO, 'decline', match(3)],
    ['Lever EEO', LEVER_EEO, 'nonbinary', NO_OPTION],
    ['Greenhouse', GREENHOUSE, 'male', match(0)],
    ['Greenhouse', GREENHOUSE, 'female', match(1)],
    ['Greenhouse', GREENHOUSE, 'decline', match(2)],
    ['Greenhouse', GREENHOUSE, 'nonbinary', NO_OPTION],
    ['Greenhouse gender identity', GREENHOUSE_IDENTITY, 'male', match(0)],
    ['Greenhouse gender identity', GREENHOUSE_IDENTITY, 'female', match(1)],
    ['Greenhouse gender identity', GREENHOUSE_IDENTITY, 'nonbinary', match(2)],
    ['Greenhouse gender identity', GREENHOUSE_IDENTITY, 'decline', match(5)],
    // Made up from here on. "male" is inside "Female".
    ['"Female" listed first', ['Female', 'Male'], 'male', match(1)],
    ['"Female" listed first', ['Female', 'Male'], 'female', match(0)],
    ['only "Female"', ['Female', 'Other'], 'male', NO_OPTION],
    ['only "Woman"', ['Woman', 'Other'], 'male', NO_OPTION],
    ['other spellings', ['MALE', 'female ', 'Nonbinary'], 'male', match(0)],
    ['other spellings', ['MALE', 'female ', 'Nonbinary'], 'female', match(1)],
    ['other spellings', ['MALE', 'female ', 'Nonbinary'], 'nonbinary', match(2)],
    ['an explanation in brackets', ['Man (including trans men)', 'Woman (including trans women)'], 'female', match(1)],
    ['a slash where Greenhouse writes "or"', ['Male', 'Female', 'Non-binary / third gender', 'Prefer not to say'], 'nonbinary', match(2)],
    // Two options fit, or the list asks for more than the profile knows.
    ['two options that both say male', ['Male', 'Man', 'Female'], 'male', NO_OPTION],
    ['a list that splits men in two', ['Cisgender man', 'Transgender man', 'Cisgender woman', 'Transgender woman'], 'male', NO_OPTION],
    ['"Non-binary" with other words', ['Non-binary person of colour', 'Man'], 'nonbinary', NO_OPTION],
    ['a full stop that ends no sentence', ['Male.Female', 'Other'], 'male', NO_OPTION],
    ['a closing bracket with no opening one', ['Male)', 'Female'], 'male', match(0)],
    ['words that only start with "non"', ['None', 'No', 'Non-binary'], 'nonbinary', match(2)],
  ];

  it.each(table)('%s %j: %s', (_list, labels, gender, want) => {
    expect(pickChoice('gender', profile({ gender }), options(...labels))).toEqual(want);
  });

  it('reports "missing" when the profile has no answer', () => {
    expect(pickChoice('gender', profile({ race: 'asian' }), options(...LEVER))).toEqual(MISSING);
  });

  it('treats a stored value that is not one of the answers as no answer', () => {
    expect(pickChoice('gender', profile({ gender: 'Male' as Profile['gender'] }), options(...GREENHOUSE))).toEqual(MISSING);
    expect(pickChoice('gender', profile({ gender: 'constructor' as Profile['gender'] }), options(...GREENHOUSE))).toEqual(MISSING);
  });
});

describe('pickChoice: race', () => {
  // Greenhouse's EEOC block.
  const GREENHOUSE = [
    'American Indian or Alaskan Native',
    'Asian',
    'Black or African American',
    'Hispanic or Latino',
    'White',
    'Native Hawaiian or Other Pacific Islander',
    'Two or More Races',
    'Decline To Self Identify',
  ];
  // Lever and Ashby list the EEO-1 categories: six of the eight options end in
  // "(Not Hispanic or Latino)", so looking for "hispanic" inside the text finds seven.
  const LEVER = [
    'Hispanic or Latino',
    'White (Not Hispanic or Latino)',
    'Black or African American (Not Hispanic or Latino)',
    'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)',
    'Asian (Not Hispanic or Latino)',
    'American Indian or Alaska Native (Not Hispanic or Latino)',
    'Two or More Races (Not Hispanic or Latino)',
    'Decline to self-identify',
  ];
  // Greenhouse, "Race or Ethnicity (optional)", as far as the design review
  // quotes it: Asian only in sub-groups.
  const SUBDIVIDED = ['Black or of African descent', 'East Asian', 'South Asian', 'Southeast Asian', 'White or European', 'I prefer to self-describe', "I don't wish to answer"];

  const table: [list: string, labels: string[], race: Profile['race'], want: ChoicePick][] = [
    ['Greenhouse', GREENHOUSE, 'nativeAmerican', match(0)],
    ['Greenhouse', GREENHOUSE, 'asian', match(1)],
    ['Greenhouse', GREENHOUSE, 'black', match(2)],
    ['Greenhouse', GREENHOUSE, 'hispanic', match(3)],
    ['Greenhouse', GREENHOUSE, 'white', match(4)],
    ['Greenhouse', GREENHOUSE, 'pacificIslander', match(5)],
    ['Greenhouse', GREENHOUSE, 'twoOrMore', match(6)],
    ['Greenhouse', GREENHOUSE, 'decline', match(7)],
    ['Lever', LEVER, 'hispanic', match(0)],
    ['Lever', LEVER, 'white', match(1)],
    ['Lever', LEVER, 'black', match(2)],
    ['Lever', LEVER, 'pacificIslander', match(3)],
    ['Lever', LEVER, 'asian', match(4)],
    ['Lever', LEVER, 'nativeAmerican', match(5)],
    ['Lever', LEVER, 'twoOrMore', match(6)],
    ['Lever', LEVER, 'decline', match(7)],
    // A profile says "Asian"; it does not say which of three sub-groups.
    ['sub-divided', SUBDIVIDED, 'asian', NO_OPTION],
    ['sub-divided', SUBDIVIDED, 'black', match(0)],
    ['sub-divided', SUBDIVIDED, 'white', match(4)],
    ['sub-divided', SUBDIVIDED, 'decline', match(6)],
    ['sub-divided', SUBDIVIDED, 'hispanic', NO_OPTION],
    ['sub-divided', SUBDIVIDED, 'twoOrMore', NO_OPTION],
    // Made up: the same with one sub-group, and with "Asian" on offer as well.
    ['one sub-group only', ['East Asian', 'White', 'Black'], 'asian', NO_OPTION],
    ['"Asian" beside a sub-group', ['East Asian', 'Asian', 'White'], 'asian', match(1)],
    // One real list merges two groups in one option (the other two options here are made up).
    ['a merged option', ['White', 'Native American or Other Pacific Islander', 'Asian'], 'nativeAmerican', NO_OPTION],
    ['a merged option', ['White', 'Native American or Other Pacific Islander', 'Asian'], 'pacificIslander', NO_OPTION],
    // Made up.
    ['a yes/no ethnicity pair', ['Hispanic or Latino', 'Not Hispanic or Latino'], 'hispanic', match(0)],
    ['a yes/no ethnicity pair', ['Not Hispanic or Latino', 'Hispanic or Latino'], 'hispanic', match(1)],
    ['a yes/no ethnicity pair', ['Hispanic or Latino', 'Not Hispanic or Latino'], 'white', NO_OPTION],
  ];

  it.each(table)('%s %j: %s', (_list, labels, race, want) => {
    expect(pickChoice('race', profile({ race }), options(...labels))).toEqual(want);
  });

  // Shorter and older wordings of the same groups.
  const otherWordings: [label: string, race: Profile['race']][] = [
    ['Black', 'black'],
    ['African American', 'black'],
    ['Black/African American', 'black'],
    ['Hispanic', 'hispanic'],
    ['Latino', 'hispanic'],
    ['Hispanic/Latino', 'hispanic'],
    ['Caucasian', 'white'],
    ['Native American', 'nativeAmerican'],
    ['Native Hawaiian or Pacific Islander', 'pacificIslander'],
    ['Pacific Islander', 'pacificIslander'],
    ['Two or more', 'twoOrMore'],
  ];

  it.each(otherWordings)('"%s" is %s', (label, race) => {
    expect(pickChoice('race', profile({ race }), options('Other', label, 'Prefer not to say'))).toEqual(match(1));
  });

  // Lever prints a description after each option. If a scan hands the whole
  // text over, nothing may be chosen: "North Africa" is in the White option.
  it('chooses nothing when the option text runs on into its description', () => {
    const described = options(
      'White (Not Hispanic or Latino) A person having origins in any of the original peoples of Europe, the Middle East, or North Africa.',
      'Black or African American (Not Hispanic or Latino) A person having origins in any of the black racial groups of Africa.',
    );
    expect(pickChoice('race', profile({ race: 'white' }), described)).toEqual(NO_OPTION);
    expect(pickChoice('race', profile({ race: 'black' }), described)).toEqual(NO_OPTION);
  });

  it('reports "missing" when the profile has no answer', () => {
    expect(pickChoice('race', profile({ gender: 'male' }), options(...GREENHOUSE))).toEqual(MISSING);
  });

  // A live Lever survey for jobs in the United Kingdom, "What best describes
  // your ethnicity?" (November 2026). Every group is split in several, so no
  // answer of the profile has one option here, except declining.
  const BRITISH = [
    'Any other ethnic group',
    'Arab',
    'Asian/Asian British: Any other Asian background',
    'Asian/Asian British: Bangladeshi',
    'Asian/Asian British: Chinese',
    'Asian/Asian British: Indian',
    'Asian/Asian British: Pakistani',
    'Black/Black British: African',
    'Black/Black British: Any other Black/ African / Caribbean background',
    'Black/Black British: Caribbean',
    'Mixed: Any other mixed background',
    'Mixed: White and Asian',
    'Mixed: White and Black African',
    'Mixed: White and Black Caribbean',
    'Prefer not to disclose',
    'White: Any other White background',
    'White: English/Welsh/Scottish/Northern Irish/British',
    'White: Irish',
    'White: Irish Traveller / Minkiers / Pavees (Previously known as Gypsy) 3',
  ];

  it.each(['asian', 'black', 'hispanic', 'white', 'nativeAmerican', 'pacificIslander', 'twoOrMore'] as const)(
    'chooses nothing for %s on a British list that splits every group',
    (race) => {
      expect(pickChoice('race', profile({ race }), options(...BRITISH))).toEqual(NO_OPTION);
    },
  );

  it('still finds the one way to decline on that list', () => {
    expect(pickChoice('race', profile({ race: 'decline' }), options(...BRITISH))).toEqual(match(14));
  });

  // Greenhouse, "What is your race and/or ethnicity?" (November 2026): every
  // option carries its definition in brackets, and the definitions name other
  // groups, countries and continents.
  const DESCRIBED = [
    'White / Caucasian (A person having origins in any of the original peoples of Europe, the Middle East, or North Africa)',
    'Hispanic or Latinx (A person of Cuban, Mexican, Puerto Rican, South or Central American or other Spanish culture or origin regardless of race)',
    'Black or African-American (A person of African, Caribbean, West Indian descent)',
    'Asian or Asian-American (A person having origins in any of the original peoples of Asia and the Indian subcontinent including all 48 Asian countries - ie. Cambodia, China, India, Japan, Korea, Malaysia, Pakistan, the Philippine Islands, Thailand, Vietnam)',
    'Native Hawaiian or other Pacific Islander (A person having origins in any of the original peoples of Hawaii, Guam, Samoa, or other Pacific Islands)',
    'Indigenous Peoples (A person having origins in any of the original peoples including Aboriginal People, American Indian, Alaska Native, First Nations, Native American, or Alaska Native, Indigenous peoples from non-US countries)',
    'A race, ethnicity, or origin not shown',
    "I don't wish to answer",
  ];

  const described: [race: Profile['race'], want: ChoicePick][] = [
    ['black', match(2)],
    ['pacificIslander', match(4)],
    ['decline', match(7)],
    // "White / Caucasian", "Asian or Asian-American" and "Hispanic or Latinx" are wordings nobody has listed.
    ['white', NO_OPTION],
    ['asian', NO_OPTION],
    ['hispanic', NO_OPTION],
    // "American Indian" and "Native American" stand in the definition of another group.
    ['nativeAmerican', NO_OPTION],
  ];

  it.each(described)('a live list with definitions in brackets: %s', (race, want) => {
    expect(pickChoice('race', profile({ race }), options(...DESCRIBED))).toEqual(want);
  });

  // The same option with half its definition missing. What the bracket would
  // have held is unknown ("…or other Pacific Islands, but not Hawaii"?).
  it('chooses nothing when the bracket of an option never closes', () => {
    const cutShort = options('White', 'Native Hawaiian or other Pacific Islander (A person having origins in any of the original peoples of Hawaii, Guam, Samoa');
    expect(pickChoice('race', profile({ race: 'pacificIslander' }), cutShort)).toEqual(NO_OPTION);
  });
});

describe('pickChoice: veteran', () => {
  // Lever and Ashby: all three options contain "protected veteran".
  const LEVER = [
    'I identify as one or more of the classifications of protected veteran listed above',
    'I am not a protected veteran',
    'I decline to self-identify for protected veteran status',
  ];
  // Greenhouse puts "not" first.
  const GREENHOUSE = ['I am not a protected veteran', 'I identify as one or more of the classifications of a protected veteran', "I don't wish to answer"];
  // Put together from options quoted from other real lists.
  const FOUR_WAY = ['I identify as a protected veteran', 'I identify as a non-protected veteran', 'No military service', 'Prefer not to say'];

  const table: [list: string, labels: string[], veteran: Profile['veteran'], want: ChoicePick][] = [
    ['Lever', LEVER, 'protectedVeteran', match(0)],
    ['Lever', LEVER, 'notVeteran', match(1)],
    // A veteran outside the protected classes has one honest choice here.
    ['Lever', LEVER, 'veteranNotProtected', match(1)],
    ['Lever', LEVER, 'decline', match(2)],
    ['Greenhouse', GREENHOUSE, 'protectedVeteran', match(1)],
    ['Greenhouse', GREENHOUSE, 'notVeteran', match(0)],
    ['Greenhouse', GREENHOUSE, 'veteranNotProtected', match(0)],
    ['Greenhouse', GREENHOUSE, 'decline', match(2)],
    ['four-way', FOUR_WAY, 'protectedVeteran', match(0)],
    ['four-way', FOUR_WAY, 'veteranNotProtected', match(1)],
    ['four-way', FOUR_WAY, 'notVeteran', match(2)],
    ['four-way', FOUR_WAY, 'decline', match(3)],
    // Made up from here on.
    // "Veteran" alone does not say protected or not, so neither kind of veteran takes it.
    ['veteran or not', ['I am a veteran', 'I am not a veteran', 'Prefer not to say'], 'protectedVeteran', NO_OPTION],
    ['veteran or not', ['I am a veteran', 'I am not a veteran', 'Prefer not to say'], 'veteranNotProtected', NO_OPTION],
    ['veteran or not', ['I am a veteran', 'I am not a veteran', 'Prefer not to say'], 'notVeteran', match(1)],
    ['two options a non-veteran could take', ['I am a protected veteran', 'I am not a protected veteran', 'No military service'], 'notVeteran', NO_OPTION],
    ['two options a non-veteran could take', ['I am a protected veteran', 'I am not a protected veteran', 'No military service'], 'protectedVeteran', match(0)],
    ['a sentence nobody has seen before', ['I served and I am protected', 'I did not serve'], 'protectedVeteran', NO_OPTION],
    ['a sentence nobody has seen before', ['I served and I am protected', 'I did not serve'], 'notVeteran', NO_OPTION],
    // Brackets are dropped before comparing, so a "not" inside them needs its own check.
    ['a "not" in brackets', ['I am a protected veteran (not sure which class)', 'I am not a veteran'], 'protectedVeteran', NO_OPTION],
    ['a "non" in brackets', ['Protected veteran (non-disabled)', 'I am not a veteran'], 'protectedVeteran', NO_OPTION],
    ['a "no" in brackets', ['Protected veteran (no longer serving)', 'I am not a veteran'], 'protectedVeteran', NO_OPTION],
    ['a "never" in brackets', ['I am a protected veteran (never deployed)', 'I am not a veteran'], 'protectedVeteran', NO_OPTION],
    ['harmless brackets', ['I am a protected veteran (see the definitions above)', 'I am not a veteran'], 'protectedVeteran', match(0)],
    ['short wordings', ['Protected veteran', 'Non-protected veteran', 'Not a veteran'], 'protectedVeteran', match(0)],
    ['short wordings', ['Protected veteran', 'Non-protected veteran', 'Not a veteran'], 'veteranNotProtected', match(1)],
    ['short wordings', ['Protected veteran', 'Non-protected veteran', 'Not a veteran'], 'notVeteran', match(2)],
  ];

  it.each(table)('%s %j: %s', (_list, labels, veteran, want) => {
    expect(pickChoice('veteran', profile({ veteran }), options(...labels))).toEqual(want);
  });

  it('reports "missing" when the profile has no answer', () => {
    expect(pickChoice('veteran', profile({ disability: 'no' }), options(...LEVER))).toEqual(MISSING);
  });

  // Three more lists from live Greenhouse forms (November 2026).
  // "What is your military status?"
  const MILITARY_STATUS = [
    'I am on active duty',
    'I am part of the national guard or on reserve',
    'I have never served in the military',
    'I identify as a protected veteran',
    'I identify as a non-protected veteran',
    'I identify in multiple military status categories',
    "I don't wish to answer",
  ];
  // "Please identify your veteran status." The second and third options differ by one "NOT".
  const CLASSIFICATION = [
    'I am not a veteran (I did not serve in the military)',
    'I am a veteran and I belong to a classification of protected veterans',
    'I am a veteran and I do NOT belong to a classification of protected veterans',
    "I don't wish to answer",
  ];
  // "Are you a veteran/have you served in the military?" Two options hold "Protected Veteran".
  const SERVICE = [
    'Active Reserve',
    'Inactive Reserve',
    'Other Protected Veteran',
    'Retired',
    'Unspecified Veteran',
    'Vietnam Era Veteran',
    'Vietnam Veteran and Other Protected Veteran',
    'No military service',
    "I don't wish to answer",
  ];

  const live: [list: string, labels: string[], veteran: Profile['veteran'], want: ChoicePick][] = [
    ['military status', MILITARY_STATUS, 'protectedVeteran', match(3)],
    ['military status', MILITARY_STATUS, 'veteranNotProtected', match(4)],
    ['military status', MILITARY_STATUS, 'decline', match(6)],
    ['classification', CLASSIFICATION, 'notVeteran', match(0)],
    ['classification', CLASSIFICATION, 'decline', match(3)],
    ['kinds of service', SERVICE, 'notVeteran', match(7)],
    ['kinds of service', SERVICE, 'protectedVeteran', NO_OPTION],
    ['kinds of service', SERVICE, 'veteranNotProtected', NO_OPTION],
    ['kinds of service', SERVICE, 'decline', match(8)],
  ];

  it.each(live)('a live list, %s %j: %s', (_list, labels, veteran, want) => {
    expect(pickChoice('veteran', profile({ veteran }), options(...labels))).toEqual(want);
  });

  // Whatever wordings are accepted one day, these would be the opposite answer.
  it('never takes the option that says the opposite about protection', () => {
    const list = options(...CLASSIFICATION);
    expect(pickChoice('veteran', profile({ veteran: 'protectedVeteran' }), list)).not.toEqual(match(2));
    expect(pickChoice('veteran', profile({ veteran: 'protectedVeteran' }), list)).not.toEqual(match(0));
    expect(pickChoice('veteran', profile({ veteran: 'veteranNotProtected' }), list)).not.toEqual(match(1));
    expect(pickChoice('veteran', profile({ veteran: 'veteranNotProtected' }), list)).not.toEqual(match(0));
    expect(pickChoice('veteran', profile({ veteran: 'notVeteran' }), options(...MILITARY_STATUS))).not.toEqual(match(3));
    expect(pickChoice('veteran', profile({ veteran: 'notVeteran' }), options(...MILITARY_STATUS))).not.toEqual(match(4));
  });
});

describe('pickChoice: disability', () => {
  // Lever's federal disability form; the last value carries a trailing space on the live page.
  const LEVER = ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer '];
  // An older wording, with the typographic apostrophes real options have.
  const OLDER = ['Yes, I have a disability (or previously had a disability)', 'No, I don’t have a disability', 'I don’t wish to answer'];

  const table: [list: string, labels: string[], disability: Profile['disability'], want: ChoicePick][] = [
    ['Lever', LEVER, 'yes', match(0)],
    ['Lever', LEVER, 'no', match(1)],
    ['Lever', LEVER, 'decline', match(2)],
    ['older wording', OLDER, 'yes', match(0)],
    ['older wording', OLDER, 'no', match(1)],
    ['older wording', OLDER, 'decline', match(2)],
    ['with a placeholder', ['Select...', ...LEVER], 'yes', match(1)],
    ['with a placeholder', ['Select...', ...LEVER], 'decline', match(3)],
    // Made up from here on.
    ['bare yes and no', ['Yes', 'No', 'Prefer not to say'], 'yes', match(0)],
    ['bare yes and no', ['Yes', 'No', 'Prefer not to say'], 'no', match(1)],
    ['bare yes and no', ['Yes', 'No', 'Prefer not to say'], 'decline', match(2)],
    ['nowhere to decline', ['Yes', 'No'], 'yes', match(0)],
    ['nowhere to decline', ['Yes', 'No'], 'decline', NO_OPTION],
    // The same care as for any yes/no question: one yes, one no, and nothing else but a way to decline.
    ['two kinds of "yes"', ['Yes, I have a disability', 'Yes, I had one in the past', 'No', 'I do not want to answer'], 'yes', NO_OPTION],
    ['two kinds of "yes"', ['Yes, I have a disability', 'Yes, I had one in the past', 'No', 'I do not want to answer'], 'no', NO_OPTION],
    ['two kinds of "yes"', ['Yes, I have a disability', 'Yes, I had one in the past', 'No', 'I do not want to answer'], 'decline', match(3)],
    ['a third answer', ['Yes', 'No', 'Not sure'], 'yes', NO_OPTION],
    ['a third answer', ['Yes', 'No', 'Not sure'], 'no', NO_OPTION],
    ['a third answer', ['Yes', 'No', 'Not sure'], 'decline', NO_OPTION],
    ['statements instead of yes and no', ['I have a disability', 'I do not have a disability'], 'no', NO_OPTION],
    ['two ways to decline', ['Yes', 'No', 'Prefer not to say', 'Decline to answer'], 'decline', NO_OPTION],
    ['two ways to decline', ['Yes', 'No', 'Prefer not to say', 'Decline to answer'], 'yes', match(0)],
    ['an option nobody can read', ['Yes', 'No', 'Prefer not to say', '?'], 'no', NO_OPTION],
    ['an option nobody can read', ['Yes', 'No', 'Prefer not to say', '?'], 'decline', match(2)],
  ];

  it.each(table)('%s %j: %s', (_list, labels, disability, want) => {
    expect(pickChoice('disability', profile({ disability }), options(...labels))).toEqual(want);
  });

  it('reports "missing" when the profile has no answer', () => {
    expect(pickChoice('disability', profile({ veteran: 'notVeteran' }), options(...LEVER))).toEqual(MISSING);
  });

  it('treats a stored value that is not one of the answers as no answer', () => {
    expect(pickChoice('disability', profile({ disability: 'Yes' as Profile['disability'] }), options(...LEVER))).toEqual(MISSING);
    expect(pickChoice('disability', profile({ disability: 'none' as Profile['disability'] }), options(...LEVER))).toEqual(MISSING);
  });
});

describe('pickChoice: state', () => {
  // Lever writes state options as "AL - Alabama". Looking for the letters
  // finds "IN" in "IL - Illinois", "LA" and "MA" in "AL - Alabama", "AR" in
  // "AZ - Arizona", and "Kansas" in "Arkansas".
  const LEVER = ['AL - Alabama', 'AK - Alaska', 'AZ - Arizona', 'AR - Arkansas', 'CA - California', 'IL - Illinois', 'IN - Indiana', 'KS - Kansas', 'LA - Louisiana', 'MA - Massachusetts'];
  const NAMES = ['Select a state', 'Alabama', 'Arkansas', 'California', 'Georgia', 'Indiana', 'Kansas', 'New York', 'Virginia', 'West Virginia'];
  const CODES = ['AL', 'AR', 'CA', 'GA', 'IN', 'KS', 'NY', 'VA', 'WV'];

  const table: [list: string, labels: string[], state: string, want: ChoicePick][] = [
    ['Lever', LEVER, 'IN', match(6)],
    ['Lever', LEVER, 'Indiana', match(6)],
    ['Lever', LEVER, 'LA', match(8)],
    ['Lever', LEVER, 'MA', match(9)],
    ['Lever', LEVER, 'AR', match(3)],
    ['Lever', LEVER, 'Kansas', match(7)],
    ['Lever', LEVER, 'Arkansas', match(3)],
    ['Lever', LEVER, 'ca', match(4)],
    ['Lever', LEVER, ' California ', match(4)],
    ['Lever', LEVER, 'TX', NO_OPTION],
    ['Lever', LEVER, 'Texas', NO_OPTION],
    ['names', NAMES, 'CA', match(3)],
    ['names', NAMES, 'California', match(3)],
    ['names', NAMES, 'GA', match(4)],
    ['names', NAMES, 'Virginia', match(8)],
    ['names', NAMES, 'WV', match(9)],
    ['names', NAMES, 'New York', match(7)],
    ['names', NAMES, 'NY', match(7)],
    ['names', NAMES, 'Texas', NO_OPTION],
    ['codes', CODES, 'California', match(2)],
    ['codes', CODES, 'in', match(4)],
    ['codes', CODES, 'Indiana', match(4)],
    ['codes', CODES, 'Kansas', match(5)],
    // Made up from here on.
    ['the state listed twice', ['California', 'CA', 'New York'], 'CA', NO_OPTION],
    ['a city, not the state', ['New York City', 'Kansas City', 'Other'], 'New York', NO_OPTION],
    ['a yes/no list ("... with at least one U.S. state bar?")', ['Yes', 'No'], 'CA', NO_OPTION],
    // A state the table does not know (not in the US) only fits the same words.
    ['Canadian provinces', ['British Columbia', 'Ontario', 'Quebec'], 'Ontario', match(1)],
    ['Canadian provinces', ['British Columbia', 'Ontario', 'Quebec'], 'ontario', match(1)],
    ['Canadian provinces', ['British Columbia', 'Ontario (Canada)', 'Quebec'], 'Ontario', NO_OPTION],
    ['Canadian provinces', ['British Columbia', 'Northern Ontario', 'Quebec'], 'Ontario', NO_OPTION],
    ['Canadian provinces', ['British Columbia', 'Ontario', 'Quebec'], 'ON', NO_OPTION],
  ];

  it.each(table)('%s %j: %s', (_list, labels, state, want) => {
    expect(pickChoice('state', profile({ state }), options(...labels))).toEqual(want);
  });

  it('reports "missing" when the profile has no state', () => {
    expect(pickChoice('state', profile({ country: 'United States' }), options(...NAMES))).toEqual(MISSING);
    expect(pickChoice('state', profile({ state: '   ' }), options(...NAMES))).toEqual(MISSING);
  });

  // A two-letter code is a US state only to somebody who lives in the United
  // States. "TN" is Tamil Nadu in India, "SC" Santa Catarina in Brazil and
  // "WA" Western Australia: read as postal codes, they move the user to
  // Tennessee, South Carolina and Washington on an American form.
  const POSTAL = ['PR - Puerto Rico', 'SC - South Carolina', 'TN - Tennessee', 'WA - Washington'];
  const SPELLED = ['Puerto Rico', 'South Carolina', 'Tennessee', 'Washington'];

  const byCountry: [why: string, state: string, country: string, labels: string[], want: ChoicePick][] = [
    ['Tamil Nadu is not Tennessee', 'TN', 'India', POSTAL, NO_OPTION],
    ['Tamil Nadu is not Tennessee', 'TN', 'India', SPELLED, NO_OPTION],
    ['Santa Catarina is not South Carolina', 'SC', 'Brazil', POSTAL, NO_OPTION],
    // A country the table does not know ("Brasil" is Portuguese) is still a country that was named.
    ['Santa Catarina is not South Carolina', 'sc', 'Brasil', SPELLED, NO_OPTION],
    ['Western Australia is not Washington', 'WA', 'Australia', SPELLED, NO_OPTION],
    // At home the same letters are the state.
    ['Tennessee, for somebody in the United States', 'TN', 'United States', POSTAL, match(2)],
    ['Tennessee, for somebody in the United States', 'TN', 'usa', SPELLED, match(2)],
    ['Tennessee, when the profile names no country', 'TN', '', POSTAL, match(2)],
    // The territories have postal codes and are countries of their own on ISO lists.
    ['Puerto Rico, for somebody in Puerto Rico', 'PR', 'Puerto Rico', POSTAL, match(0)],
    ['Puerto Rico is not Paraná', 'PR', 'Brazil', POSTAL, NO_OPTION],
    // Abroad, an option that reads as the user typed it is still theirs.
    ['a province typed as the form writes it', 'Ontario', 'Canada', ['British Columbia', 'Ontario', 'Quebec'], match(1)],
    ['an Indian list written in codes', 'TN', 'India', ['KA', 'MH', 'TN'], match(2)],
  ];

  it.each(byCountry)('%s: "%s" in "%s" %j', (_why, state, country, labels, want) => {
    expect(pickChoice('state', profile({ state, country }), options(...labels))).toEqual(want);
  });
});

describe('pickChoice: country', () => {
  // A live form, "What country are you based in?". Looking for the closest
  // text to "United States" finds "United Kingdom".
  const BREX = ['Brazil', 'Canada', 'USA', 'Netherlands', 'United Kingdom', 'Other'];
  // Another live list: no option for Ireland, and four for the United Kingdom.
  const NATIONS = ['England', 'Scotland', 'Wales', 'Northern Ireland', 'Other'];
  // Part of the live Greenhouse list used in the regions tests.
  const GREENHOUSE = ['Georgia', 'Germany', 'India', 'Ireland', 'Niger', 'Nigeria', 'United Arab Emirates', 'United Kingdom', 'United States of America'];

  const table: [list: string, labels: string[], country: string, want: ChoicePick][] = [
    ['Brex', BREX, 'United States', match(2)],
    ['Brex', BREX, 'US', match(2)],
    ['Brex', BREX, 'usa', match(2)],
    ['Brex', BREX, 'U.S.A.', match(2)],
    ['Brex', BREX, 'UK', match(4)],
    ['Brex', BREX, 'Great Britain', match(4)],
    ['Brex', BREX, 'The Netherlands', match(3)],
    ['Brex', BREX, 'Germany', NO_OPTION],
    ['four nations', NATIONS, 'Ireland', NO_OPTION],
    ['four nations', NATIONS, 'United Kingdom', NO_OPTION],
    ['Greenhouse', GREENHOUSE, 'United States', match(8)],
    ['Greenhouse', GREENHOUSE, 'America', match(8)],
    ['Greenhouse', GREENHOUSE, 'UAE', match(6)],
    ['Greenhouse', GREENHOUSE, 'Georgia', match(0)],
    ['Greenhouse', GREENHOUSE, 'Niger', match(4)],
    ['Greenhouse', GREENHOUSE, 'Nigeria', match(5)],
    ['Greenhouse', GREENHOUSE, 'DE', match(1)],
    ['Greenhouse', GREENHOUSE, 'Northern Ireland', match(7)],
    ['Greenhouse', GREENHOUSE, 'France', NO_OPTION],
    // Made up from here on.
    ['a longer name that starts the same', ['United States Minor Outlying Islands', 'United States', 'United Kingdom'], 'USA', match(1)],
    ['codes', ['CA', 'GB', 'US'], 'United States', match(2)],
    ['codes', ['CA', 'GB', 'US'], 'Canada', match(0)],
    // "NO" is the ISO code of Norway, and "No" is an answer. A list that
    // offers a yes and a no is a question, not a list of countries.
    ['codes', ['DK', 'NO', 'SE'], 'Norway', match(1)],
    ['a yes/no list', ['Yes', 'No'], 'Norway', NO_OPTION],
    ['a yes/no list', ['YES', 'NO'], 'NO', NO_OPTION],
    ['a yes/no list with a placeholder', ['Select...', 'No', 'Yes'], 'Norway', NO_OPTION],
    ['code and name', ['CA - Canada', 'US - United States'], 'United States of America', match(1)],
    ['the country listed twice', ['United States', 'USA', 'Canada'], 'US', NO_OPTION],
    ['US states, not countries', ['Indiana', 'Georgia', 'New Mexico'], 'India', NO_OPTION],
    ['US states, not countries', ['Indiana', 'Georgia', 'New Mexico'], 'Mexico', NO_OPTION],
    // "Congo" alone is two countries (the pair below is from the live Greenhouse list).
    ['two Congos', ['Democratic Republic of the Congo', 'Republic of the Congo'], 'Congo', NO_OPTION],
    ['two Congos', ['Democratic Republic of the Congo', 'Republic of the Congo'], 'DR Congo', match(0)],
    ['two Congos', ['Democratic Republic of the Congo', 'Republic of the Congo'], 'Congo-Brazzaville', match(1)],
    ['"Congo" on offer as typed', ['Congo', 'Gabon'], 'Congo', match(0)],
    // A place the table does not know only fits the same words.
    ['an unknown place', ['Narnia', 'Other'], 'Narnia', match(0)],
    ['an unknown place', ['Narnia (fictional)', 'Other'], 'Narnia', NO_OPTION],
  ];

  it.each(table)('%s %j: %s', (_list, labels, country, want) => {
    expect(pickChoice('country', profile({ country }), options(...labels))).toEqual(want);
  });

  it('reports "missing" when the profile has no country', () => {
    expect(pickChoice('country', profile({ state: 'CA' }), options(...BREX))).toEqual(MISSING);
  });

  it('keeps Georgia the state and Georgia the country apart', () => {
    const inAtlanta = profile({ state: 'Georgia', country: 'United States' });
    const inTbilisi = profile({ state: 'Tbilisi', country: 'Georgia' });
    const states = options('Florida', 'Georgia', 'Hawaii');
    const countries = options('France', 'Georgia', 'Germany', 'United States');
    expect(pickChoice('state', inAtlanta, states)).toEqual(match(1));
    expect(pickChoice('country', inAtlanta, countries)).toEqual(match(3));
    expect(pickChoice('country', inTbilisi, countries)).toEqual(match(1));
    expect(pickChoice('state', inTbilisi, states)).toEqual(NO_OPTION);
  });
});

describe('pickChoice: school, degree and major', () => {
  // From the 3,302 schools of a live Lever dropdown.
  const SCHOOLS = [
    'Click Here (If you encounter an issue, make sure your browser is updated and try clearing cache & cookies)',
    'Alabama A&M University',
    'California Institute of Technology',
    'California Institute of the Arts',
    'California State University - Chico',
    'Carnegie Mellon University - Pittsburgh',
    'Carnegie Mellon University - Silicon Valley',
    'College of Saint Rose',
  ];

  const schools: [why: string, labels: string[], school: string, want: ChoicePick][] = [
    ['the same name', SCHOOLS, 'California Institute of Technology', match(2)],
    ['the same name in other capitals', SCHOOLS, 'california institute of technology', match(2)],
    ['"&" or "and"', SCHOOLS, 'Alabama A and M University', match(1)],
    ['a hyphen or none', SCHOOLS, 'California State University Chico', match(4)],
    // The profile does not say which campus.
    ['a name that two campuses start with', SCHOOLS, 'Carnegie Mellon University', NO_OPTION],
    ['a name one other campus starts with', ['Carnegie Mellon University - Australia', 'Other'], 'Carnegie Mellon University', NO_OPTION],
    ['a campus named in full', SCHOOLS, 'Carnegie Mellon University - Pittsburgh', match(5)],
    ['the start of a longer name', SCHOOLS, 'California Institute', NO_OPTION],
    ['a school that is not listed', SCHOOLS, 'Example State University', NO_OPTION],
    // Made up from here on.
    ['a full stop in the first word', ["St. Mary's College", "St. John's University"], "St. John's University", match(1)],
    ['a typographic apostrophe on the form', ['St. Mary’s College', 'St. John’s University'], "St. John's University", match(1)],
    ['campuses told apart only in brackets', ['University of California (Davis)', 'University of California (Berkeley)'], 'University of California (Berkeley)', match(1)],
    ['campuses in brackets, none named', ['University of California (Davis)', 'University of California (Berkeley)'], 'University of California', NO_OPTION],
    ['an accent on one side only', ['Universidad de Málaga', 'Other'], 'Universidad de Malaga', match(0)],
    ['the same school twice', ['Example University', 'Example University'], 'Example University', NO_OPTION],
    // Marks that are not accents spell another word. Japanese "ば" and "ぱ"
    // differ by one, and so do the Hindi words for art ("कला") and fort ("किला").
    ['a Japanese name that differs by a voicing mark', ['バス大学', 'Other'], 'パス大学', NO_OPTION],
    ['the same Japanese name', ['バス大学', 'パス大学'], 'パス大学', match(1)],
    ['a Hindi name that differs by a vowel sign', ['किला', 'Other'], 'कला', NO_OPTION],
    ['the same Hindi name', ['किला', 'कला'], 'कला', match(1)],
  ];

  it.each(schools)('school: %s', (_why, labels, school, want) => {
    expect(pickChoice('school', profile({ school }), options(...labels))).toEqual(want);
  });

  const DEGREES = ['High School', "Associate's Degree", "Bachelor's Degree", "Master's Degree", 'Doctorate (Ph.D.)'];

  const degrees: [why: string, labels: string[], degree: string, want: ChoicePick][] = [
    ['the same words', DEGREES, "Bachelor's Degree", match(2)],
    ['a typographic apostrophe in the profile', DEGREES, 'Bachelor’s degree', match(2)],
    ['brackets and all', DEGREES, 'Doctorate (Ph.D.)', match(4)],
    // No guessing that a "Bachelor of Science" is a "Bachelor's Degree".
    ['another name for the degree', DEGREES, 'Bachelor of Science', NO_OPTION],
    ['an abbreviation', DEGREES, 'BS', NO_OPTION],
    ['one word of an option', DEGREES, 'Doctorate', NO_OPTION],
    ['one word of two options', DEGREES, 'Degree', NO_OPTION],
  ];

  it.each(degrees)('degree: %s', (_why, labels, degree, want) => {
    expect(pickChoice('degree', profile({ degree }), options(...labels))).toEqual(want);
  });

  const MAJORS = ['Computer Science', 'Mathematics', 'Applied Mathematics', 'Other'];

  const majors: [why: string, major: string, want: ChoicePick][] = [
    ['the same words', 'Mathematics', match(1)],
    ['a longer option of its own', 'Applied Mathematics', match(2)],
    ['two majors in one profile', 'Mathematics and Computer Science', NO_OPTION],
    ['a major that is not listed', 'Physics', NO_OPTION],
  ];

  it.each(majors)('major: %s', (_why, major, want) => {
    expect(pickChoice('major', profile({ major }), options(...MAJORS))).toEqual(want);
  });

  it('uses each field for its own kind', () => {
    const ada = profile({ school: 'Mathematics', degree: 'Computer Science', major: 'Other' });
    expect(pickChoice('school', ada, options(...MAJORS))).toEqual(match(1));
    expect(pickChoice('degree', ada, options(...MAJORS))).toEqual(match(0));
    expect(pickChoice('major', ada, options(...MAJORS))).toEqual(match(3));
  });

  it.each(['school', 'degree', 'major'] as const)('reports "missing" when the profile has no %s', (kind) => {
    expect(pickChoice(kind, profile({ [kind]: '  ' }), options(...MAJORS))).toEqual(MISSING);
    expect(pickChoice(kind, profile({}), options(...MAJORS))).toEqual(MISSING);
  });
});

describe('pickChoice: graduation', () => {
  const may2027 = profile({ graduationDate: '2027-05' });

  const dates: [why: string, labels: string[], want: ChoicePick][] = [
    ['month and year', ['December 2026', 'May 2027', 'June 2027', 'May 2028'], match(1)],
    ['capitals', ['DECEMBER 2026', 'MAY 2027'], match(1)],
    ['a comma', ['December, 2026', 'May, 2027'], match(1)],
    ['digits with a slash', ['12/2026', '05/2027', '06/2027'], match(1)],
    ['digits without the zero', ['12/2026', '5/2027', '6/2027'], match(1)],
    ['the stored form', ['2026-12', '2027-05', '2027-06'], match(1)],
    // A real list: neither option is May 2027 alone, and a match on the year would take the first.
    ['two months in one option', ['December 2026/January 2027', 'May/June 2027'], NO_OPTION],
    ['seasons', ['Fall 2026', 'Spring 2027', 'Summer 2027'], NO_OPTION],
    ['years only', ['2026', '2027', '2028'], NO_OPTION],
    ['another year', ['May 2026', 'May 2028'], NO_OPTION],
    ['another month', ['April 2027', 'June 2027'], NO_OPTION],
    ['the month in other digits', ['2027-5-01', '27/05', '052027'], NO_OPTION],
    ['the same date twice', ['May 2027', '05/2027'], NO_OPTION],
    // A sign can turn a date into a range, and comparing words drops signs.
    ['"or later" written as a sign', ['May 2027+', 'June 2027'], NO_OPTION],
    ['"before" written as a sign', ['<05/2027', '06/2027'], NO_OPTION],
    ['the month beside ranges that hold it', ['< May 2027', 'May 2027', '> May 2027'], match(1)],
  ];

  it.each(dates)('graduation date, %s %j', (_why, labels, want) => {
    expect(pickChoice('graduationDate', may2027, options(...labels))).toEqual(want);
  });

  const months: [stored: string, label: string][] = [
    ['2027-01', 'January 2027'],
    ['2027-01', 'Jan 2027'],
    ['2027-02', 'Feb 2027'],
    ['2027-06', 'June 2027'],
    ['2027-06', 'Jun 2027'],
    ['2027-09', 'September 2027'],
    ['2027-09', 'Sep 2027'],
    ['2027-09', 'Sept 2027'],
    ['2026-12', 'December 2026'],
    ['2026-12', 'Dec. 2026'],
    ['2026-12', '12/2026'],
  ];

  it.each(months)('a stored %s is "%s"', (graduationDate, label) => {
    expect(pickChoice('graduationDate', profile({ graduationDate }), options('May 2027', label, 'June 2028'))).toEqual(match(1));
  });

  const years: [why: string, labels: string[], want: ChoicePick][] = [
    ['the year', ['2025', '2026', '2027', '2028'], match(2)],
    ['with a placeholder', ['Select...', '2026', '2027'], match(2)],
    ['a year with more words', ['2027 or later', 'Before 2027'], NO_OPTION],
    ['"Class of 2027"', ['Class of 2026', 'Class of 2027'], NO_OPTION],
    ['month and year', ['May 2027', 'June 2027'], NO_OPTION],
    ['the year inside a number', ['12027', '20270'], NO_OPTION],
    ['another year', ['2026', '2028'], NO_OPTION],
    // "<2027" is every year before 2027: the one answer it rules out is 2027.
    ['"before" written as a sign', ['<2027', '2027-2028', '>2028'], NO_OPTION],
    ['"after" written as a sign', ['2025', '2026', '>2027'], NO_OPTION],
    ['"or later" written as a sign', ['2026', '2027+'], NO_OPTION],
    ['"at most" written as a sign', ['≤2027', '2028'], NO_OPTION],
    ['"at least" written as a sign', ['2026', '≥2027'], NO_OPTION],
    ['"about" written as a sign', ['2026', '~2027'], NO_OPTION],
    ['the year beside ranges that start and end with it', ['<2027', '2027', '>2027'], match(1)],
  ];

  it.each(years)('graduation year, %s %j', (_why, labels, want) => {
    expect(pickChoice('graduationYear', may2027, options(...labels))).toEqual(want);
  });

  it.each(['graduationDate', 'graduationYear'] as const)('reports "missing" for %s when the profile has no date', (kind) => {
    expect(pickChoice(kind, profile({}), options('May 2027', '2027'))).toEqual(MISSING);
  });

  // A stored date that is not YYYY-MM is no date: nothing may be read out of it.
  it.each(['2027', 'May 2027', '2027-13', '2027-00', '05/2027'])('treats a stored "%s" as no date', (graduationDate) => {
    const broken = profile({ graduationDate });
    expect(pickChoice('graduationDate', broken, options('May 2027', '2027', graduationDate))).toEqual(MISSING);
    expect(pickChoice('graduationYear', broken, options('May 2027', '2027', graduationDate))).toEqual(MISSING);
  });
});
