// @vitest-environment node
//
// lib/choices.ts is pure: no DOM. Running without one makes a stray
// `document` fail here.
//
// The option lists are copied from live application forms (Greenhouse, Lever,
// Ashby; November 2026) unless a comment says a list was made up for the test.
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
    ['"U.S." inside a clause is not the end of a sentence', ['Yes, I am a U.S. citizen or resident', 'No, I am not a U.S. citizen or resident'], 0, 1],
    ['the placeholder of a Lever dropdown', ['Select...', 'Yes', 'No'], 1, 2],
    ['a Lever placeholder with its own wording', ['Click Here (If you encounter an issue, make sure your browser is updated and try clearing cache & cookies)', 'Yes', 'No'], 1, 2],
    ['an empty first option', ['', 'Yes', 'No'], 1, 2],
    ['a first option of dashes', ['--', 'Yes', 'No'], 1, 2],
    ['"-- Select --"', ['-- Select --', 'Yes', 'No'], 1, 2],
    ['"Please select"', ['Please select', 'Yes', 'No'], 1, 2],
    ['"Choose..."', ['Choose...', 'Yes', 'No'], 1, 2],
    ['"Select One"', ['Select One', 'Yes', 'No'], 1, 2],
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
    ['words that only start with "no"', ['None', 'Not applicable', 'Non-binary']],
    ['"No" and words that only start with it', ['Yes', 'No', 'None', 'Not applicable']],
    ['a "yes" with more words and no comma', ['Yes with sponsorship', 'No']],
    ['"Nope"', ['Yes', 'Nope']],
    ['"No-one"', ['Yes', 'No-one']],
    ['the same answer twice', ['Yes', 'Yes', 'No']],
    ['only "Yes"', ['Yes']],
    ['only "No"', ['No']],
    ['no options at all', []],
    ['only a placeholder', ['Select...']],
    ['statements instead of yes and no', ['I am authorized to work', 'I am not authorized to work']],
    ['"True" and "False"', ['True', 'False']],
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

  // Ashby radios have no value attribute, and other values are internal ids:
  // only the text the user sees says what an option means.
  it('reads the text of an option, never its value', () => {
    const list: ChoiceOption[] = [
      { label: 'No', value: 'yes', disabled: false },
      { label: 'Yes', value: 'no', disabled: false },
    ];
    expect(pickChoice('workAuthorization', authorized, list)).toEqual(match(1));
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
    ['"I certify"', ['Yes, I certify that the above is true', 'No']],
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
    // Every option of this real list holds "4.0".
    ['gpa', { gpa: '4.0' }, ['4.0 out of 4.0', '3.9 out of 4.0', '3.8 out of 4.0']],
    ['resume', {}, ['Ada-Lovelace-Resume.pdf']],
  ];

  it.each(kinds)('chooses nothing for %s', (kind, answers, labels) => {
    expect(pickChoice(kind, profile(answers), options(...labels))).toEqual(NO_OPTION);
  });
});

// Every way of declining seen on the sampled forms, and options that sit
// next to them and are something else.
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
  // Greenhouse, "Gender Identity (optional)".
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
    // "male" is inside "Female".
    ['"Female" listed first', ['Female', 'Male'], 'male', match(1)],
    ['"Female" listed first', ['Female', 'Male'], 'female', match(0)],
    ['only "Female"', ['Female', 'Other'], 'male', NO_OPTION],
    ['only "Woman"', ['Woman', 'Other'], 'male', NO_OPTION],
    ['other spellings', ['MALE', 'female ', 'Nonbinary'], 'male', match(0)],
    ['other spellings', ['MALE', 'female ', 'Nonbinary'], 'female', match(1)],
    ['other spellings', ['MALE', 'female ', 'Nonbinary'], 'nonbinary', match(2)],
    ['an explanation in brackets', ['Man (including trans men)', 'Woman (including trans women)'], 'female', match(1)],
    // Made up: two options fit, or the list asks for more than the profile knows.
    ['two options that both say male', ['Male', 'Man', 'Female'], 'male', NO_OPTION],
    ['a list that splits men in two', ['Cisgender man', 'Transgender man', 'Cisgender woman', 'Transgender woman'], 'male', NO_OPTION],
    ['"Non-binary" with other words', ['Non-binary person of colour', 'Man'], 'nonbinary', NO_OPTION],
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
  // Lever and Ashby: six of the eight options end in "(Not Hispanic or Latino)",
  // so looking for "hispanic" inside the text finds seven options.
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
  // Greenhouse, "Race or Ethnicity (optional)": Asian only in sub-groups.
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
    ['one sub-group only', ['East Asian', 'White', 'Black'], 'asian', NO_OPTION],
    ['"Asian" beside a sub-group', ['East Asian', 'Asian', 'White'], 'asian', match(1)],
    // One real list merges two groups in one option.
    ['a merged option', ['White', 'Native American or Other Pacific Islander', 'Asian'], 'nativeAmerican', NO_OPTION],
    ['a merged option', ['White', 'Native American or Other Pacific Islander', 'Asian'], 'pacificIslander', NO_OPTION],
    ['a yes/no ethnicity pair', ['Hispanic or Latino', 'Not Hispanic or Latino'], 'hispanic', match(0)],
    ['a yes/no ethnicity pair', ['Not Hispanic or Latino', 'Hispanic or Latino'], 'hispanic', match(1)],
    ['a yes/no ethnicity pair', ['Hispanic or Latino', 'Not Hispanic or Latino'], 'white', NO_OPTION],
  ];

  it.each(table)('%s %j: %s', (_list, labels, race, want) => {
    expect(pickChoice('race', profile({ race }), options(...labels))).toEqual(want);
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
    ['harmless brackets', ['I am a protected veteran (see the definitions above)', 'I am not a veteran'], 'protectedVeteran', match(0)],
  ];

  it.each(table)('%s %j: %s', (_list, labels, veteran, want) => {
    expect(pickChoice('veteran', profile({ veteran }), options(...labels))).toEqual(want);
  });

  it('reports "missing" when the profile has no answer', () => {
    expect(pickChoice('veteran', profile({ disability: 'no' }), options(...LEVER))).toEqual(MISSING);
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
