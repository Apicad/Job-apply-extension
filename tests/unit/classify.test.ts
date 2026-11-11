import { describe, expect, it } from 'vitest';
import { classifyField, classifyWorkEligibility, KIND_CONTROLS } from '../../lib/classify';
import type { ChoiceOption, ControlType, FieldDescriptor, FieldKind } from '../../lib/types';

// Labels in this file are real ones unless a comment says otherwise: copied
// from live Greenhouse, Lever and Ashby application forms (November 2026).

/** A plain, unlabelled text box; each test states only what differs. */
function field(overrides: Partial<FieldDescriptor>): FieldDescriptor {
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

/** The options of a select or radio group, from their visible texts. */
function options(...labels: string[]): ChoiceOption[] {
  return labels.map((label) => ({ label, value: label, disabled: false }));
}

describe('classifyWorkEligibility', () => {
  // A need-verb ("require", "need") governs a sponsorship noun.
  const sponsorship: [label: string][] = [
    ['Do you require visa sponsorship?'],
    ['Will you now or in the future require Visa Sponsorship?'],
    ['Will you now or in the future require employment sponsorship?'],
    ['Will you require Visa Sponsorship now, or in the future?'],
    ['Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying?'],
    ['Do you now, or will you in the future, require immigration sponsorship to work at Reddit?'],
    ['Do you now or in the future require immigration support or visa sponsorship to continue working in the United States?'],
    ['Will you require Stripe to sponsor you for a work permit now or in the future for the location(s) you selected in in your previous response?'],
    ['Will you now or in the future require sponsorship for a visa to remain in your current location?'],
    ['Will you now or in the future require sponsorship for employment visa status (e.g., H-1B, etc.)?'],
  ];

  it.each(sponsorship)('sponsorship: %s', (label) => {
    expect(classifyWorkEligibility(label)).toBe('sponsorship');
  });

  // "Authorized / eligible / entitled to work", or "have … work authorization".
  const workAuthorization: [label: string][] = [
    ['Are you authorized to work in the United States?'],
    ['Are you legally authorized to work in the country where the job is located?'],
    ['Are you legally authorized to work in the United States for our Company?'],
    ['Are you legally authorized to work in the country for which you are applying?'],
    ['Are you authorized to work in the stated location of this role?'],
    ['Are you authorized to work in the location(s) you selected in your previous response?'],
    ['Are you currently eligible to work legally in the United States of America?'],
    ['Are you legally authorised to work full-time in the country where this job is based?'],
    ['Are you currently authorized to work in the U.S.?'],
    ['Are you legally entitled to work in Canada?'],
    ['Are you legally work authorized to work in the US?'],
    ['Are you authorized to work lawfully in the United States for Duolingo?'],
    ['Are you currently authorized to work for Pinterest in the country in which you are applying for a position?'],
    ['Do you currently have legal US work authorization?'],
    ['Do you currently have legal Germany work authorization?'],
    ['Do you currently have legal work authorization for work full time in Ireland?'],
  ];

  it.each(workAuthorization)('work authorization: %s', (label) => {
    expect(classifyWorkEligibility(label)).toBe('workAuthorization');
  });

  // Real labels that name both topics. Two keyword rules tried in a fixed
  // order answer one half of these with the wrong profile field.
  const bothTopics: [label: string, want: 'workAuthorization' | 'sponsorship'][] = [
    ['Will you now or in the future require sponsorship for work authorization?', 'sponsorship'],
    [
      'Will you now or in the future require company sponsorship to retain or extend your work authorization in the country where the job is located?',
      'sponsorship',
    ],
    ['Do you now, or will you in the future, require immigration sponsorship for work authorization to work in this location?', 'sponsorship'],
    [
      'Will you now or in the future require employer sponsorship or other employer assistance to obtain, extend, or maintain authorization to work in the country in which you are applying for a position?',
      'sponsorship',
    ],
    ['Will you now or in the future require visa sponsorship to obtain work authorization in the country where this job is located?', 'sponsorship'],
    ["Will you require Elastic's sponsorship to continue or extend your work authorization status?", 'sponsorship'],
    ['Will you require immigration sponsorship at any point in the future to maintain authorization to work in the United States?', 'sponsorship'],
    // Lever, a native Yes/No <select>.
    [
      'Sponsorship: Do you require sponsorship, or will you require sponsorship in the future for employment authorization in the United States?',
      'sponsorship',
    ],
    // Lever, radio buttons "Yes, I do / will require sponsorship" and "No, …".
    ['Do you now or will you in the future require sponsorship or employment authorization to work in Canada?', 'sponsorship'],
    // The visa is only an example in brackets; the question is about authorization.
    [
      'Are you currently legally authorized to work in the country in which this job is based (e.g. you are a citizen, you have a visa, etc.)?',
      'workAuthorization',
    ],
  ];

  it.each(bothTopics)('both topics: %s → %s', (label, want) => {
    expect(classifyWorkEligibility(label)).toBe(want);
  });

  // The sponsorship word itself is in brackets or missing; "an immigration case" carries it.
  const immigrationCase: [label: string][] = [
    ['Will you now or in the future require Samsara to commence (“sponsor”) an immigration case in order to employ you?'],
    [
      'Will you now or in the future require Flexport to commence ("sponsor") an immigration case in order to employ you (for example, H-1B or other employment-based immigration case)? This is sometimes called "sponsorship" for an employ',
    ],
  ];

  it.each(immigrationCase)('sponsorship: %s', (label) => {
    expect(classifyWorkEligibility(label)).toBe('sponsorship');
  });

  it('reads only the question when a statement comes before and a note after it', () => {
    const label =
      'This is a 1099 independent contractor role. Will you now or in the future require work authorization or employment sponsorship to work in the United States? Please answer accurately, as this information is needed to determine elig';
    expect(classifyWorkEligibility(label)).toBe('sponsorship');
  });

  // Traps: a "yes" from the profile would say the opposite of what the user means,
  // or the question is about something else. All of these stay unanswered.
  const traps: [why: string, label: string][] = [
    ['inverted polarity', 'Do you require work authorization?'],
    ['inverted polarity', 'Will you require our assistance with work authorization now or in the future?'],
    ['inverted polarity, no sponsorship word', 'Will you, now or in the future, require the support of HubSpot to maintain that authorization?'],
    ['"without" (Lever radio)', 'Do you have the ability to work in Australia without the need for sponsorship?'],
    ['"without" (Ashby)', 'Are you legally authorized to work in the US without visa sponsorship now or in the future?'],
    [
      'sponsorship only in a trailing note (Okta)',
      'Are you a U.S. Person (U.S. Citizen, National, Lawful Permanent Resident, Refugee, or Asylee), and can you provide documentation establishing U.S. Person status upon hire? Please note: Candidates who require visa sponsorship (e.g.',
    ],
    ['security clearance, not work (Anduril)', 'CLEARANCE ELIGIBILITY - This position requires eligibility to obtain and maintain a U.S. security clearance.'],
    [
      'export control, not work',
      'U.S. Person status and/or U.S. clearance eligibility is required for this role due to access requirements for U.S. export-controlled information/facilities and/or depending on program, are you eligible to meet this requirement?',
    ],
    [
      'export control, not work',
      'EXPORT CONTROLS - This position requires access to information and technology that is subject to U.S. export controls. Your responses to the questions below will be used solely to determine your eligibility under U.S. law to recei',
    ],
    ['"permanent" asks for more than authorization', 'Do you have permanent work authorization to work in the U.S?'],
    ['"any employer" asks for more than authorization', 'Are you currently authorized to work for any employer in the country outlined for this role?'],
    ['"unrestricted" asks for more than authorization', 'Do you have the unrestricted right to work in the country where this role is located?'],
    ['not a yes/no question', 'In what countries do you have the unrestricted right to work?'],
    ['typo, no sponsorship word (Ashby)', 'Do you, now or in the future, require sponorship to work in the country you currently reside in?'],
    ['follow-up to another answer', "If you're not authorized to work at the stated location, what sponsorship would you require for the role?"],
    [
      'follow-up to another answer',
      'If you do require employee sponsorship or assistance for work authorization, please list the type of support you may require.',
    ],
    ['follow-up to another answer', 'If not, please provide information regarding your sponsorship needs.'],
    ['follow-up to another answer', 'If yes, what kind? (If you do not require work authorization sponsorship please select Not Applicable.)'],
    ['follow-up to another answer', 'If so, are you eligible or currently in a period of Optional Practical Training (OPT)?'],
    [
      'eligible for something else',
      'After the OPT, are you eligible for a 24-month OPT extension or are currently in a 24-month OPT extension based upon a degree from a qualifying U.S. institution in Science, Technology, Engineering, or Mathematics after the Optiona',
    ],
    ['a heading, not a question: which way does "yes" point?', 'Work Authorization'],
    ['a heading, not a question', 'U.S. WORK AUTHORIZATION'],
    [
      'asks to pick a description, not yes or no',
      'Your authorization to work in the country where you live. Please choose the option that describes your work authorization.',
    ],
    ['citizenship is not work authorization', 'Citizenship Status'],
    ['citizenship is not work authorization', 'Are you a US citizen or lawful permanent resident?'],
    ['nothing to do with either', 'Are you at least 18 years of age?'],
    ['nothing to do with either', 'Are you open to relocation for this role?'],
    ['"sponsored" is not sponsorship', 'What Duolingo sponsored conferences have you attended and/or organizations are you a part of?'],
    [
      '"unauthorized" is not authorization',
      "To ensure a fair and accurate assessment of each candidate's unique capabilities, Waymo prohibits the use of unauthorized outside assistance during the interview process. This includes, but is not limited to, artificial intelligen",
    ],
    // Not real labels: wordings that turn the meaning of "yes" around, or hang the question on another answer.
    ['negated need', 'Can you confirm that you do not require visa sponsorship?'],
    ['negated authorization', "Is it right that you aren't authorized to work in the United States?"],
    ['negated authorization, typographic apostrophe', 'Is it right that you aren’t authorized to work in the United States?'],
    ['negated need', 'Are you able to work in the United States with no need for sponsorship?'],
    ['follow-up to another answer', 'If you answered yes above, will you require sponsorship to transfer your visa?'],
    ['having and needing in one question', 'Do you currently have or need work authorization?'],
    ['having and needing in one question', 'Are you authorized to work in the United States, or do you require authorization?'],
    // Not real labels: the words of the real traps above, in a sentence that would otherwise pass.
    ['security clearance, not work', 'Are you eligible to work on programs under a U.S. security clearance?'],
    ['export control, not work', 'Are you authorized to work with export-controlled technology?'],
    ['"U.S. Person" is an export-control term', 'As a U.S. Person, are you authorized to work with controlled technical data?'],
    ['authorization that rests on a visa', 'Are you authorized to work in the United States on a visa?'],
    ['empty', ''],
    // Not a real label: two real questions joined, as a page that puts both in one legend would.
    ['both questions in one label', 'Are you authorized to work in the United States? Will you now or in the future require Visa Sponsorship?'],
  ];

  it.each(traps)('null (%s): %s', (_why, label) => {
    expect(classifyWorkEligibility(label)).toBeNull();
  });

  // Not real labels: the real questions above with one word more. Each asks for more than
  // "may you work here?", or turns the meaning of "yes" around.
  const oneWordMore: [why: string, label: string][] = [
    // the design review names "unrestricted" beside "permanent"; the real label with that word says "right to work"
    ['"unrestricted" asks for more than authorization', 'Do you have unrestricted work authorization in the United States?'],
    ['"unrestricted" asks for more than authorization', 'Are you authorized to work in the United States on an unrestricted basis?'],
    ['"yes" would mean "with restrictions"', 'Are you authorized to work in the U.S. with restrictions?'],
    ['"indefinitely" asks for more, as "permanent" does', 'Are you authorized to work in the United States indefinitely?'],
    ['"temporary" asks which kind of authorization', 'Do you have temporary work authorization (e.g. OPT or CPT)?'],
    ['"never" negates the need', 'Can you confirm that you will never require visa sponsorship?'],
    ['consent is never given for the user', 'Do you consent to verification that you are legally authorized to work in the United States?'],
    ['agreement is never given for the user', 'Do you agree to provide proof that you are legally eligible to work in the US?'],
  ];

  it.each(oneWordMore)('null (%s): %s', (_why, label) => {
    expect(classifyWorkEligibility(label)).toBeNull();
  });

  // Not real labels: the authorization question with a time in it, as forms for interns and
  // new graduates word it. Somebody on a student or work visa may work today and still has to
  // answer "no" here, so the saved "yes" must not be used.
  const forHowLong: [why: string, label: string][] = [
    ['a number of months', 'Are you authorized to work in the United States beyond 12 months?'],
    ['"beyond"', 'Are you authorized to work in the United States beyond the end of your studies?'],
    ['"year"', 'Are you authorized to work in the United States for more than one year?'],
    ['"years"', 'Are you authorized to work in the U.S. for at least two years?'],
    ['"month"', 'Are you eligible to work in the US for longer than a month?'],
    ['"months"', 'Are you authorized to work in the US for the next twelve months?'],
    ['a date', 'Are you authorized to work in the United States through December 2027?'],
    ['"after"', 'Will you be authorized to work in the United States after graduation?'],
    ['"until"', 'Are you authorized to work in the United States until the end of the program?'],
    ['"duration"', 'Are you authorized to work in the US for the duration of this internship?'],
    ['"long-term"', 'Are you authorized to work in the United States long-term?'],
    ['"long term"', 'Are you authorized to work in the United States on a long term basis?'],
    ['a time in a note', 'Do you currently have legal US work authorization (valid for at least a year)?'],
    ['a visa type by its number', 'Are you authorized to work in the United States on an H-1B?'],
  ];

  it.each(forHowLong)('null (%s): %s', (_why, label) => {
    expect(classifyWorkEligibility(label)).toBeNull();
  });

  it('still reads a sponsorship question that names visa types or a time', () => {
    // "now or in the future" is the very question the saved answer is for
    expect(classifyWorkEligibility('Will you require H-1B sponsorship now or after your OPT ends?')).toBe('sponsorship');
  });

  // Not real labels: a real question with its condition put in brackets. A note in brackets can
  // be an example ("e.g. you are a citizen, you have a visa") or the very thing that makes the
  // question a different one, so the words that rule a question out count inside brackets too.
  const conditionInBrackets: [why: string, label: string][] = [
    ['"without"', 'Are you legally authorized to work in the United States (without the need for sponsorship)?'],
    ['"WITHOUT", in capitals', 'Are you legally authorized to work in the U.S. (WITHOUT sponsorship)?'],
    ['"without", in the second note', 'Are you authorized to work in the location(s) you selected (without sponsorship)?'],
    ['"not"', 'Are you authorized to work in the U.S. (i.e. you will not need sponsorship)?'],
    ['"n\'t"', "Are you authorized to work in the US (and don't need a visa)?"],
    ['"permanent"', 'Do you have work authorization (permanent) in the United States?'],
    ['"any employer"', 'Are you authorized to work in the United States (for any employer)?'],
    ['needing, with no other word that rules it out', 'Are you authorized to work in the United States (or do you require sponsorship)?'],
    ['a note after the question', 'Are you authorized to work in the United States? (Answer "No" if you will ever need sponsorship.)'],
    ['a negated need', 'Will you now or in the future require visa sponsorship (answer yes if you are not a citizen)?'],
  ];

  it.each(conditionInBrackets)('null (in brackets: %s): %s', (_why, label) => {
    expect(classifyWorkEligibility(label)).toBeNull();
  });

  // Long labels arrive cut off. What the cut hid is unknown ("…without sponsorship?"), so a
  // question is only judged when it can be read up to its question mark.
  const cutOff: [why: string, label: string][] = [
    // real labels, cut the way a length cap would cut them
    [
      'cut inside a note in brackets',
      'Are you currently legally authorized to work in the country in which this job is based (e.g. you are a citizen, you have a visa',
    ],
    ['cut in mid-sentence', 'Are you currently legally authorized to work in the country in which this'],
    ['cut in mid-sentence', 'Will you now or in the future require sponsorship for employment visa status in the country in which'],
    // not a real label: the only question mark stands inside the note that was cut
    ['cut inside a note that holds a question mark', 'Are you legally authorized to work in the United States (are you a citizen? do you hold a visa'],
    // not real labels: statements. Real forms ask; a statement without a question mark may be the rest of a cut question.
    ['a statement, not a question', 'I am legally authorized to work in the United States'],
    ['a statement, not a question', 'I will require visa sponsorship'],
  ];

  it.each(cutOff)('null (%s): %s', (_why, label) => {
    expect(classifyWorkEligibility(label)).toBeNull();
  });

  it('judges a question that is complete even when the note after it was cut off', () => {
    // A real label of 230 characters, cut at 200.
    const label =
      'Will you now or in the future require Flexport to commence ("sponsor") an immigration case in order to employ you (for example, H-1B or other employment-based immigration case)? This is sometimes cal';
    expect(classifyWorkEligibility(label)).toBe('sponsorship');
  });

  // Not real labels: plain wordings of the same two questions that the real ones above do not cover.
  const otherWordings: [label: string, want: 'workAuthorization' | 'sponsorship'][] = [
    ['Do you need a visa to work in the United Kingdom?', 'sponsorship'],
    ['Will you require a work permit to work in Canada?', 'sponsorship'],
    // "U.S." in mid-sentence is not the end of the question
    ['Are you legally authorized to work in the U.S. on a full-time basis?', 'workAuthorization'],
    // a note after the question is not part of the question
    ['Are you legally authorized to work in the United States? Please note that we are unable to sponsor visas for this role.', 'workAuthorization'],
    ['Will you now or in the future require sponsorship? Only candidates authorized to work in the United States can be considered.', 'sponsorship'],
  ];

  it.each(otherWordings)('%s → %s', (label, want) => {
    expect(classifyWorkEligibility(label)).toBe(want);
  });
});

describe('classifyField: field names on text boxes', () => {
  const named: [label: string, want: FieldKind][] = [
    // Greenhouse (counts: how many of 376 sampled forms carry the label)
    ['First Name', 'firstName'], // 376
    ['Last Name', 'lastName'], // 376
    ['Email', 'email'], // 376
    ['Phone', 'phone'], // 376
    ['LinkedIn Profile', 'linkedin'], // 306
    ['Website', 'portfolio'], // 141
    ['Current Company', 'currentCompany'],
    ['Github', 'github'],
    ['GitHub', 'github'],
    ['LinkedIn Profile:', 'linkedin'],
    ['Portfolio', 'portfolio'],
    ['Legal First Name', 'firstName'],
    ['Legal Last Name', 'lastName'],
    ['Legal Name', 'fullName'],
    ['Linkedin Profile URL', 'linkedin'],
    ['Most Recent Employer', 'currentCompany'],
    ['Personal Website', 'portfolio'],
    ['Current Title', 'currentTitle'],
    ['Zip / postal code', 'postalCode'],
    ['LinkedIn URL', 'linkedin'],
    ['Github Profile', 'github'],
    ['Current University', 'school'],
    ['Cumulative GPA', 'gpa'],
    ['Current or Most Recent Company', 'currentCompany'],
    ['Current or Most Recent Title', 'currentTitle'],
    ['Company name', 'currentCompany'], // first row of the employment block
    // Lever
    ['Full name', 'fullName'],
    ['Current location', 'location'],
    ['Current company', 'currentCompany'],
    ['GitHub URL', 'github'],
    ['Portfolio URL', 'portfolio'],
    // Ashby
    ['Name', 'fullName'],
    ['Full Name', 'fullName'],
    ['Country of Residence', 'country'],
  ];

  it.each(named)('%s → %s', (label, want) => {
    expect(classifyField(field({ label }))).toBe(want);
  });

  // The plain names of the fields, in the usual spellings. Not all of these
  // are quoted in the research; they are what the field is called everywhere.
  const plainNames: [label: string, want: FieldKind][] = [
    ['Given Name', 'firstName'],
    ['Family Name', 'lastName'],
    ['Surname', 'lastName'],
    ['Full Legal Name', 'fullName'],
    ['Email Address', 'email'],
    ['E-mail', 'email'],
    ['E-mail address', 'email'],
    ['Phone Number', 'phone'],
    ['Mobile Phone', 'phone'],
    ['Mobile Number', 'phone'],
    ['Mobile', 'phone'],
    ['Telephone', 'phone'],
    ['Address', 'addressLine1'],
    ['Street Address', 'addressLine1'],
    ['Address Line 1', 'addressLine1'],
    ['Address 1', 'addressLine1'],
    ['City', 'city'],
    ['State', 'state'],
    ['Province', 'state'],
    ['State/Province', 'state'],
    ['State / Province', 'state'],
    ['State or Province', 'state'],
    ['Zip Code', 'postalCode'],
    ['ZIP', 'postalCode'],
    ['Postal Code', 'postalCode'],
    ['ZIP/Postal Code', 'postalCode'],
    ['Zip or Postal Code', 'postalCode'],
    ['Postcode', 'postalCode'],
    ['Country', 'country'], // Greenhouse, as a question of its own
    ['Location', 'location'], // Ashby
    ['Location (City)', 'location'], // Greenhouse, 270 of 376 forms
    ['LinkedIn', 'linkedin'],
    ['Website URL', 'portfolio'],
    ['Company', 'currentCompany'],
    ['Employer', 'currentCompany'],
    ['Current Employer', 'currentCompany'],
    ['Current Job Title', 'currentTitle'],
    ['School', 'school'], // Greenhouse education block
    ['School Name', 'school'],
    ['University', 'school'],
    ['College/University', 'school'],
    ['Degree', 'degree'], // Greenhouse education block
    ['Major', 'major'],
    ['Discipline', 'major'], // Greenhouse education block
    ['Field of Study', 'major'],
    ['Graduation Date', 'graduationDate'],
    ['Expected Graduation Date', 'graduationDate'],
    ['Graduation Year', 'graduationYear'],
    ['Expected Graduation Year', 'graduationYear'],
    ['Year of Graduation', 'graduationYear'],
    ['GPA', 'gpa'],
    // "One answer, one field … except e-mail plus confirm e-mail" (project guide)
    ['Confirm Email', 'email'],
    ['Confirm Email Address', 'email'],
  ];

  it.each(plainNames)('%s → %s', (label, want) => {
    expect(classifyField(field({ label }))).toBe(want);
  });

  // What label clean-up on the page may leave behind. The first two are the raw
  // texts of real labels; the rest are real labels with such leftovers added.
  const leftovers: [label: string, want: FieldKind][] = [
    ['First Name*', 'firstName'], // Greenhouse: <label>First Name<span aria-hidden="true">*</span></label>
    ['Full name✱', 'fullName'], // Lever: <div class="application-label">Full name<span class="required">✱</span></div>
    ['Phone ', 'phone'],
    ['  Current   company ', 'currentCompany'],
    ['Email (required)', 'email'],
    ['LinkedIn Profile (optional)', 'linkedin'],
    ['Last Name:', 'lastName'],
    ['Postal Code.', 'postalCode'],
    // Not from the research. Accents are dropped before matching; otherwise "phone" would be found
    // inside "Téléphone" as a word of its own and the label taken for one that mentions a phone in passing.
    ['Téléphone', 'phone'],
  ];

  it.each(leftovers)('"%s" → %s', (label, want) => {
    expect(classifyField(field({ label }))).toBe(want);
  });

  // A label naming several things is the one box for all of them, or nothing.
  // A "last name" rule would type only the surname into Ashby's single name box.
  const composites: [label: string, want: FieldKind | null][] = [
    ['Legal First and Last Name', 'fullName'], // real: Ashby's main name field at some employers
    ['First and Last Name', 'fullName'], // the next six are not from the research: the same idea, other spellings
    ['First & Last Name', 'fullName'],
    ['City and State', 'location'],
    ['City, State', 'location'],
    ['City & State', 'location'],
    ['City/State', 'location'],
    ['Street address, City, and Zip code, if an offer is extended:', null], // real: Lever
    ['If located in the US, in what city and state do you reside?', null], // real
    ['Please confirm your city, timezone and province', null], // real
    ['City, State, Zip', null], // not a real label: three things, and no kind holds all three
    ['Name and Email', null], // not a real label
  ];

  it.each(composites)('%s → %s', (label, want) => {
    expect(classifyField(field({ label }))).toBe(want);
  });

  // A qualified label is not the plain field: one saved answer must not land
  // in every box that carries its word. Real labels, except the two marked.
  const qualified: [label: string, want: FieldKind | null][] = [
    ['GPA', 'gpa'],
    ['GPA (Doctorate)', null], // three dropdowns on one form
    ['GPA (Graduate)', null],
    ['GPA (Undergraduate)', null],
    ['Undergraduate GPA', null],
    ['Portfolio URL', 'portfolio'], // Lever, beside…
    ['Other website', null], // …this one, on 30 of 42 sampled pages
    ['Other Website', null], // Greenhouse
    ['Email', 'email'],
    ['Alternate Email', null],
    ['Legal Name', 'fullName'],
    ['Legal Name (if different than above)', null],
    ['First Name', 'firstName'],
    ['Preferred First Name', 'preferredFirstName'], // Separate explicit saved answer; never the legal first name.
    ['Preferred Last Name', null],
    ['Preferred Name', null],
    ['Preferred First & Last Name', null], // Ashby's main name field at some employers
    ['[Optional] Preferred Full Name (The name that you would like to be referred to as. Please input your legal name in the first and last name fields above.)', null],
    ['Preferred Name | What would you like us to call you?', null], // Lever
    ['Chosen Name', null],
    ['LinkedIn Profile', 'linkedin'],
    ['LinkedIn Profile (linkedin.com/in/<YOUR_ID>)', null], // the note asks for a particular form of it
    ['Current Title', 'currentTitle'],
    ['Title', null], // a Greenhouse employment row; elsewhere Mr / Ms / Dr
    ['Country', 'country'],
    ['Country code', null], // not a real label: the dial code of a phone
    ['Phone country', null], // not a real label: the same thing, the other way round
  ];

  it.each(qualified)('%s → %s', (label, want) => {
    expect(classifyField(field({ label }))).toBe(want);
  });

  // A field name inside a longer label is not that field: every pattern must
  // match the label from its first word to its last. These labels are not
  // from the research; each puts a real field name behind or before other
  // words that no list of "other subjects" could be expected to know.
  const embedded: [label: string][] = [
    ["Mother's first name"],
    ['First name in Katakana'],
    ['Family name in Katakana'],
    ['Surname in Katakana'],
    ["Guardian's first and last name"],
    ['First and last name of your guardian'],
    ['Previous first and last name'],
    ['First and last name in Katakana'],
    ['Email domain'],
    ['Old mobile number'],
    ['Telephone extension'],
    ['Office address line 1'],
    ['Address line 1 of the office'],
    ['State bar number'],
    ['Province of origin'],
    ['Office state/province'],
    ['State/Province of the office'],
    ['Office zip code'],
    ['Office postcode'],
    ['Office zip / postal code'],
    ['Zip / postal code of the office'],
    ['Office location'],
    ['Office location (city)'],
    ['Location (city) of the office'],
    ['Office city, state'],
    ['Company LinkedIn'],
    ["Partner's current title"],
    ['Current title of your mentor'],
    ['University name on your diploma'],
    ['Exchange college/university'],
    ['College/University mascot'],
    ['Graduate degree'],
    ['Degree classification'],
    ['High school graduation date'],
    ['Graduation date of your class'],
    ['High school graduation year'],
    ['Graduation year of your class'],
    ['High school year of graduation'],
    ['Year of graduation from high school'],
  ];

  it.each(embedded)('null: %s', (label) => {
    expect(classifyField(field({ label }))).toBeNull();
  });

  // The type of an input and its placeholder never recognise a field by themselves.
  const noLabelNoIdentifier: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    ['nothing at all', {}],
    ['type=email', { inputType: 'email' }],
    ['type=tel', { inputType: 'tel' }],
    ['type=url', { inputType: 'url' }],
    ['a placeholder that names a field', { placeholder: 'First name' }],
    ['an e-mail placeholder on type=email', { inputType: 'email', placeholder: 'hello@example.com' }], // Ashby
    ['a phone placeholder on type=tel', { inputType: 'tel', placeholder: '(415) 555-5555' }], // Ashby
    ["Lever's signature placeholder", { placeholder: 'Enter your full name' }],
  ];

  it.each(noLabelNoIdentifier)('null: %s', (_what, descriptor) => {
    expect(classifyField(field(descriptor))).toBeNull();
  });

  // Real text-box labels that merely mention a field word. Each comment says
  // what a keyword rule would have typed into the box.
  const notFieldNames: [label: string][] = [
    // someone else's details
    ["If you heard about us through a referral, please state the Brex employee's name."], // own name
    ['If yes, please identify name of person / vendor and describe relationship / association:'], // own name, on a conflict-of-interest disclosure
    ['Has someone at Linear referred you for this role? If so, please include their name here:'], // own name
    ['Has someone at Cursor or Graphite referred you for this role? If so, please include their email here'], // own e-mail
    ["If you selected 'Yes', please include their name below."],
    // questions and sentences, not field names
    ['What is the name of your current or most recent employer?'], // own name
    ['Please provide the name of your current (or most recent) company'],
    ['Who is your current or previous employer?'],
    ['What is your current or most recent job title?'],
    ['What is your legal first name?'],
    ['Please provide your full legal name as it appears on your government ID'],
    ['What college/university do you attend?'],
    ['What country are you based in?'],
    ['This role does require someone to work remotely from Spain. What is your current country of residence?'],
    ['What is the zip code of your primary residence?'],
    ['Please provide the zip code of your primary residence.'],
    ['In which state do you currently reside?'],
    ['What is the address from which you plan on working? If you would need to relocate, please type "relocating".'],
    ['Would you like to include your LinkedIn profile, personal website or blog?'],
    ['Similarly, we also invite you to provide your GPA, this can help us further understand your academic experience.'],
    [
      'We are always aiming to keep our school list inclusive of all institutions. If you do not see your University listed in the previous question, please choose "other" and let us know your school name here.',
    ],
    ['Have you previously worked on or are you currently registered with Outlier? If yes, please provide the email address you used to sign up.'],
    // follow-ups to another answer
    ['If located in Canada, in what city do you reside?'], // city
    ['If located in the US, in what city and state do you reside?'],
    ["If you're less than 3 years out of school, what is your undergraduate GPA?"], // school name
    ['If you answered "Other" above, please note your graduation date.'],
    ['If you answered "Yes" to the above question, which state(s)?'],
    ['If you’ve selected "Other - My location is not listed.” Please list the location by entering it below.'],
    ['Legal Name (if different than above)'],
    // other subjects that share a word with a field
    [
      'If you currently work, or have previously worked, at Capital One or a company acquired by Capital One, please provide your Employee ID (EID). This information is required for former/current employees.',
    ], // current company
    ['In what countries do you have the unrestricted right to work?'], // country of residence
    ['Please list all countries of which you are a citizen, and, if applicable, the date you obtained citizenship.'],
    ['What is the country of your birth?'],
    ['Passport Country'], // Ashby, beside "Country of Residence"
    ['Portfolio password'], // portfolio URL
    ['Portfolio Password'],
    ['If your portfolio access is restricted, share password or login details here.'],
    ['Website/Portfolio (please include password when applicable)'],
    ['Name Pronunciation'],
    ["How do you pronounce your name? (e.g., 'An-na' or 'Ah-na')"],
    ['Name Pronunciation | How do you pronounce your name?'], // Lever
    ['Location Cost Tier'],
    ['What is your preferred work location? * San Francisco (open to relocation) * New York City (open to relocation) * Open to either San Francisco or New York City * Remote preferred/Not open to relocation'],
    // several things in one box
    ['Street address, City, and Zip code, if an offer is extended:'], // one of the three
    ['Please confirm your city, timezone and province'],
    ['Website or GitHub'],
    ['Professional Profile (LinkedIn, Github, Website, etc)'],
    ['LinkedIn Profile, Github, Personal Website, or Portfolio'],
    // a section name in front: which employer, which university?
    ['Work Experience: Current/Previous Employer'],
    ['Education: Last University Attended'],
    // instructions in brackets that change what to enter
    ['Zip Code / Postal Code (Non-U.S. based candidates, please enter "00000")'],
  ];

  it.each(notFieldNames)('null: %s', (label) => {
    expect(classifyField(field({ label }))).toBeNull();
  });
});

describe('classifyField: the autocomplete attribute on an unlabelled text box', () => {
  // Only the exact final token counts.
  const tokens: [autocomplete: string, want: FieldKind][] = [
    ['given-name', 'firstName'], // Greenhouse, first name
    ['family-name', 'lastName'], // Greenhouse, last name
    ['name', 'fullName'],
    ['email', 'email'], // Greenhouse and Ashby
    ['tel', 'phone'],
    ['mobile tel', 'phone'],
    ['street-address', 'addressLine1'],
    ['address-line1', 'addressLine1'],
    ['address-level2', 'city'],
    ['postal-code', 'postalCode'],
    ['organization', 'currentCompany'],
  ];

  it.each(tokens)('%s → %s', (autocomplete, want) => {
    expect(classifyField(field({ autocomplete }))).toBe(want);
  });

  const noAnswer: [why: string, autocomplete: string][] = [
    ['only a part of the phone number', 'tel-national'], // Ashby, with placeholder "(415) 555-5555"
    ['only a part of the phone number', 'tel-country-code'],
    ['only a part of the phone number', 'tel-area-code'],
    ['only a part of the phone number', 'tel-local'],
    ['only a part of the phone number', 'tel-extension'],
    ['the second address line', 'address-line2'],
    ['a middle name', 'additional-name'],
    ['a nickname', 'nickname'],
    ['a login name', 'username'],
    ['a password', 'new-password'],
    ['a birthday', 'bday'],
    ['any web address', 'url'],
    ['switched off', 'off'], // every Greenhouse dropdown
    ['switched on, nothing more', 'on'],
    ['made up to defeat browsers', 'nope'],
    ["someone else's details", 'section-emergency tel'],
    ["someone else's details", 'section-emergency email'],
    ["someone else's details", 'section-referrer name'],
    // In the HTML standard "fax" and "pager" say whose number a "tel" is. Not seen on a job site.
    ['a fax machine, not a phone', 'fax tel'],
    ['a pager, not a phone', 'pager tel'],
    ['a word every JavaScript object knows', 'constructor'],
    ['empty', ''],
  ];

  it.each(noAnswer)('null (%s): %s', (_why, autocomplete) => {
    expect(classifyField(field({ autocomplete }))).toBeNull();
  });
});

describe('classifyField: name, id and data hints on an unlabelled text box', () => {
  type Attribute = 'name' | 'id' | 'hints';

  const identifiers: [attribute: Attribute, value: string, want: FieldKind][] = [
    // Greenhouse: text inputs have an id and no name
    ['id', 'first_name', 'firstName'],
    ['id', 'last_name', 'lastName'],
    ['id', 'email', 'email'],
    ['id', 'phone', 'phone'],
    // Lever: name attributes, plus data-qa on the standard fields
    ['name', 'name', 'fullName'],
    ['name', 'email', 'email'],
    ['name', 'phone', 'phone'],
    ['name', 'org', 'currentCompany'],
    ['name', 'urls[LinkedIn]', 'linkedin'],
    ['name', 'urls[GitHub]', 'github'],
    ['name', 'urls[Portfolio]', 'portfolio'],
    ['hints', 'name-input', 'fullName'],
    ['hints', 'email-input', 'email'],
    ['hints', 'phone-input', 'phone'],
    ['hints', 'org-input', 'currentCompany'],
    // Ashby: id and name are the field path
    ['id', '_systemfield_name', 'fullName'],
    ['name', '_systemfield_name', 'fullName'],
    ['id', '_systemfield_email', 'email'],
    // The plain names, however a site spells them (not from the research)
    ['name', 'firstName', 'firstName'],
    ['name', 'first-name', 'firstName'],
    ['name', 'fname', 'firstName'],
    ['name', 'given_name', 'firstName'],
    ['name', 'lastName', 'lastName'],
    ['name', 'lname', 'lastName'],
    ['name', 'family_name', 'lastName'],
    ['name', 'surname', 'lastName'],
    ['name', 'full_name', 'fullName'],
    ['name', 'fullName', 'fullName'],
    ['name', 'email_address', 'email'],
    ['name', 'emailAddress', 'email'],
    ['name', 'phone_number', 'phone'],
    ['name', 'phoneNumber', 'phone'],
    ['name', 'mobile', 'phone'],
    ['name', 'address', 'addressLine1'],
    ['name', 'street_address', 'addressLine1'],
    ['name', 'address_line_1', 'addressLine1'],
    ['name', 'address1', 'addressLine1'],
    ['name', 'city', 'city'],
    ['name', 'zip', 'postalCode'],
    ['name', 'zip_code', 'postalCode'],
    ['name', 'postal_code', 'postalCode'],
    ['name', 'postalCode', 'postalCode'],
    ['name', 'postcode', 'postalCode'],
    ['name', 'linkedin', 'linkedin'],
    ['name', 'linkedin_url', 'linkedin'],
    ['name', 'github', 'github'],
    ['name', 'github_url', 'github'],
    ['name', 'portfolio', 'portfolio'],
    ['name', 'portfolio_url', 'portfolio'],
    ['name', 'company', 'currentCompany'],
    ['name', 'company_name', 'currentCompany'],
    ['name', 'company[name]', 'currentCompany'], // the whole identifier is read, so this is not a "name"
    ['name', 'current_company', 'currentCompany'],
    ['name', 'employer', 'currentCompany'],
    ['name', 'school', 'school'],
    ['name', 'school_name', 'school'],
    ['name', 'university', 'school'],
    ['name', 'major', 'major'],
    ['name', 'field_of_study', 'major'],
    ['name', 'graduation_year', 'graduationYear'],
    // data hints are several values joined by spaces; one of them names the field
    ['hints', 'apply-form email-input', 'email'],
  ];

  it.each(identifiers)('%s="%s" → %s', (attribute, value, want) => {
    expect(classifyField(field({ [attribute]: value }))).toBe(want);
  });

  // Identifiers that contain a field word without being that field.
  const otherIdentifiers: [attribute: Attribute, value: string][] = [
    ['id', 'question_37369956002'], // Greenhouse custom question
    ['name', 'cards[a69a985a-eae9-4c14-90fb-b5a4b891523e][field1]'], // Lever custom question
    ['name', 'urls[Other]'], // Lever "Other website"
    ['name', 'urls[Twitter]'],
    ['name', 'comments'], // Lever "Additional information"
    ['id', 'preferred_name'], // Greenhouse "Preferred First Name"
    ['id', 'hispanic_ethnicity'], // Greenhouse "Are you Hispanic/Latino?"
    ['id', 'cover_letter_text'], // Greenhouse "Enter manually"
    ['id', 'resume_text'],
    ['id', 'company-name-0'], // Greenhouse employment rows: the label decides, not the row id
    ['id', 'title-0'],
    ['id', 'end-date-year-0'],
    ['name', 'legalName--firstName'], // Workday
    ['name', 'website'], // the name of Workday's honeypot, and of many others
    ['name', 'username'],
    ['name', 'user_name'],
    ['name', 'reference_name'],
    ['name', 'emergency_contact_phone'],
    ['name', 'email_confirmation'],
    ['name', 'constructor'], // a word every JavaScript object knows
    ['id', '__proto__'],
  ];

  it.each(otherIdentifiers)('null: %s="%s"', (attribute, value) => {
    expect(classifyField(field({ [attribute]: value }))).toBeNull();
  });
});

describe('classifyField: the label and the attributes together', () => {
  // Real controls: what the page shows and what its markup says agree.
  const agreeing: [what: string, descriptor: Partial<FieldDescriptor>, want: FieldKind][] = [
    ['Greenhouse first name', { label: 'First Name', id: 'first_name', autocomplete: 'given-name', required: true }, 'firstName'],
    ['Greenhouse last name', { label: 'Last Name', id: 'last_name', autocomplete: 'family-name', required: true }, 'lastName'],
    ['Greenhouse e-mail', { label: 'Email', id: 'email', autocomplete: 'email', required: true }, 'email'],
    ['Greenhouse LinkedIn question', { label: 'LinkedIn Profile', id: 'question_37369956002' }, 'linkedin'],
    ['Greenhouse employment row', { label: 'Company name', id: 'company-name-0' }, 'currentCompany'],
    ['Lever full name', { label: 'Full name', name: 'name', hints: 'name-input', required: true }, 'fullName'],
    ['Lever e-mail', { label: 'Email', name: 'email', hints: 'email-input', inputType: 'email', required: true }, 'email'],
    ['Lever phone', { label: 'Phone', name: 'phone', hints: 'phone-input' }, 'phone'],
    ['Lever company', { label: 'Current company', name: 'org', hints: 'org-input' }, 'currentCompany'],
    ['Lever LinkedIn', { label: 'LinkedIn URL', name: 'urls[LinkedIn]' }, 'linkedin'],
    ['Lever GitHub', { label: 'GitHub URL', name: 'urls[GitHub]' }, 'github'],
    ['Lever portfolio', { label: 'Portfolio URL', name: 'urls[Portfolio]' }, 'portfolio'],
    ['Ashby name', { label: 'Name', id: '_systemfield_name', name: '_systemfield_name', required: true }, 'fullName'],
    [
      'Ashby name under another title',
      { label: 'Legal First and Last Name', id: '_systemfield_name', name: '_systemfield_name' },
      'fullName',
    ],
    [
      'Ashby e-mail',
      { label: 'Email', id: '_systemfield_email', name: '_systemfield_email', inputType: 'email', autocomplete: 'email' },
      'email',
    ],
    // Ashby marks one of its phone boxes "tel-national": that token says nothing, the label still does.
    ['Ashby phone', { label: 'Phone', inputType: 'tel', autocomplete: 'tel-national', placeholder: '(415) 555-5555' }, 'phone'],
    // Not real controls: the autocomplete tokens of kinds that are never recognised without their label.
    ['a state box marked for browsers', { label: 'State', autocomplete: 'address-level1' }, 'state'],
    ['a country box marked for browsers', { label: 'Country', autocomplete: 'country' }, 'country'],
    ['a country box marked for browsers', { label: 'Country', autocomplete: 'country-name' }, 'country'],
    ['a job title box marked for browsers', { label: 'Current Title', autocomplete: 'organization-title' }, 'currentTitle'],
  ];

  it.each(agreeing)('%s → %s', (_what, descriptor, want) => {
    expect(classifyField(field(descriptor))).toBe(want);
  });

  // Not real controls. The attributes point somewhere else than the label the
  // user sees, or at two places at once: nobody can say what the box wants.
  const contradicting: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    ['label e-mail, autocomplete phone', { label: 'Email', autocomplete: 'tel' }],
    ['label phone, name e-mail', { label: 'Phone', name: 'email' }],
    ['label first name, id last name', { label: 'First Name', id: 'last_name' }],
    ['label whole name, autocomplete first name', { label: 'Name', autocomplete: 'given-name' }],
    ['label company, hint e-mail', { label: 'Company', hints: 'email-input' }],
    ['label city, autocomplete state', { label: 'City', autocomplete: 'address-level1' }],
    ['label city, autocomplete country', { label: 'City', autocomplete: 'country' }],
    ['label city, autocomplete country name', { label: 'City', autocomplete: 'country-name' }],
    ['label company, autocomplete job title', { label: 'Company', autocomplete: 'organization-title' }],
    ['label e-mail, name agrees, autocomplete does not', { label: 'Email', name: 'email', autocomplete: 'tel' }],
    ['no label, name e-mail, autocomplete phone', { name: 'email', autocomplete: 'tel' }],
    ['no label, name first name, id last name', { name: 'first_name', id: 'last_name' }],
    ['no label, two hints that disagree', { hints: 'email-input phone-input' }],
  ];

  it.each(contradicting)('null: %s', (_what, descriptor) => {
    expect(classifyField(field(descriptor))).toBeNull();
  });

  // Not real controls: a phone number split over several boxes under the one label "Phone".
  // The token says that a box holds only a piece of the number, so the whole number does not
  // belong in it. ("tel-national" is no piece: Ashby marks its whole phone box with it, above.)
  const pieceOfAPhoneNumber: [autocomplete: string][] = [
    ['tel-country-code'],
    ['tel-area-code'],
    ['tel-local'],
    ['tel-local-prefix'],
    ['tel-local-suffix'],
    ['tel-extension'],
    ['work tel-extension'], // the last token says what the box holds
  ];

  it.each(pieceOfAPhoneNumber)('null: label "Phone" on a box marked %s', (autocomplete) => {
    expect(classifyField(field({ label: 'Phone', inputType: 'tel', autocomplete }))).toBeNull();
  });

  // What the user can read decides (project guide: attributes stand in "when
  // there is no label"). A label we cannot read is still a label: the box may
  // want anything, so nothing the user cannot see is allowed to claim it.
  const labelsWeCannotRead: [label: string, descriptor: Partial<FieldDescriptor>][] = [
    // The box from the security review, as it stands in tests/fixtures/hostile.html:
    // <label for="promo-code">Promo code (optional)</label>
    // <input type="text" id="promo-code" name="promo_code" autocomplete="tel" />
    ['Promo code (optional)', { id: 'promo-code', name: 'promo_code', autocomplete: 'tel' }],
    ['Promo code', { autocomplete: 'tel' }], // the same label after clean-up on the page
    ['How did you hear about this job?', { name: 'name' }], // real Greenhouse label; the name is not
    ['Fax', { autocomplete: 'tel' }], // not a real control
    // Not real controls: labels in another language. To the classifier "Nombre" is as unknown as "Promo code".
    ['Nombre', { id: 'first_name' }],
    ['Correo electrónico', { autocomplete: 'email' }],
    ['Telefonnummer', { name: 'phone', autocomplete: 'tel' }],
    ['Vorname', { name: 'firstName' }],
  ];

  it.each(labelsWeCannotRead)('null: label "%s", whatever the attributes say', (label, descriptor) => {
    expect(classifyField(field({ label, ...descriptor }))).toBeNull();
  });

  it('treats a label that is only a required marker as no label', () => {
    expect(classifyField(field({ label: '*', id: 'first_name' }))).toBe('firstName');
  });

  // The label is about something else, so no attribute may claim the box.
  // The labels are real unless marked; most of the attributes are not: they
  // show what would happen if the page carried them. The Ashby row is the
  // nearest to a real case: that question is rendered as <input type="email">,
  // and Ashby's code puts autocomplete="email" on e-mail inputs.
  // (Since attributes only stand in for a missing label, each of these rows
  // holds whatever its label says. The words that mark someone or something
  // else are tested one by one where they still decide: on group labels and
  // on the self-identification questions, further down.)
  const aboutSomethingElse: [why: string, label: string, descriptor: Partial<FieldDescriptor>][] = [
    // a follow-up to another answer
    ['follow-up', 'If yes, please provide further explanation below.', { name: 'email' }],
    ['follow-up', 'If located in Canada, in what city do you reside?', { name: 'city' }],
    ['follow-up', 'Legal Name (if different than above)', { autocomplete: 'name' }],
    ['follow-up (label not real)', 'If applicable, the best number to reach you', { autocomplete: 'tel' }],
    ['follow-up (label not real)', 'Do you go by another one? If so, enter it here', { autocomplete: 'name' }],
    ['follow-up (label not real)', 'Known as (if different)', { autocomplete: 'name' }],
    // someone else
    [
      'someone else (Ashby)',
      'Has someone at Cursor or Graphite referred you for this role? If so, please include their email here',
      { inputType: 'email', autocomplete: 'email' },
    ],
    ['someone else', "If you heard about us through a referral, please state the Brex employee's name.", { name: 'name' }],
    ['someone else (label not real)', 'Emergency contact', { autocomplete: 'tel' }],
    ['someone else (label not real)', 'Referred by', { name: 'name' }],
    ['someone else (label not real)', 'Hiring manager', { name: 'name' }],
    ['someone else (label not real)', 'Recruiter', { autocomplete: 'email' }],
    ['someone else (label not real)', 'Your supervisor', { autocomplete: 'name' }],
    ['someone else (label not real)', 'Spouse', { autocomplete: 'name' }],
    ['someone else (label not real)', 'A relative we may reach', { autocomplete: 'tel' }],
    ['someone else (label not real)', 'Family member', { autocomplete: 'name' }],
    ['someone else (label not real)', 'How may we reach them? (their number)', { autocomplete: 'tel' }],
    ['someone else (label not real)', 'References', { name: 'name' }],
    ['someone else (label not real)', "The employee's details", { name: 'name' }],
    ['someone else (label not real), typographic apostrophe', 'The employee’s details', { name: 'name' }],
    // another subject
    ['pronouns', 'Pronouns', { name: 'name' }],
    ['pronouns', 'What are your pronouns?', { name: 'name' }],
    ['pronunciation', "How do you pronounce your name? (e.g., 'An-na' or 'Ah-na')", { name: 'name' }],
    ['a preferred name (Ashby, real id)', 'Preferred First & Last Name', { id: '_systemfield_name', name: '_systemfield_name' }],
    ['a preferred name', 'Preferred First Name', { autocomplete: 'given-name' }],
    ['a preferred name', "What's the name you'd prefer us to use throughout the interview process?", { autocomplete: 'name' }],
    ['a preferred name (label not real)', 'What do you prefer to be called?', { autocomplete: 'given-name' }],
    ['a password', 'Portfolio password', { name: 'portfolio' }],
    ['a password (label not real)', 'Password', { name: 'portfolio' }],
    ['a passport (label not real)', 'Passport number', { name: 'phone' }],
    ['citizenship (label not real)', 'Citizenship', { name: 'city' }],
    ['birth (label not real)', 'Date of birth', { name: 'graduation_year' }],
    ['nationality (label not real)', 'Nationality', { name: 'city' }],
    ['consent (label not real)', 'I consent', { name: 'name' }],
    ['agreement (label not real)', 'I agree', { name: 'name' }],
    ['an employee number (label not real)', 'Employee ID', { name: 'company' }],
    // a second one of something
    ['a second e-mail', 'Alternate Email', { autocomplete: 'email' }],
    ['another website (Lever, real name)', 'Other website', { name: 'urls[Other]', id: 'portfolio' }],
    ['a second contact (label not real)', 'Secondary contact', { autocomplete: 'tel' }],
    ['a second contact (label not real)', 'Additional contact', { autocomplete: 'tel' }],
    ['a second contact (label not real)', 'Second contact', { autocomplete: 'tel' }],
    ['a third contact (label not real)', 'Third contact', { autocomplete: 'tel' }],
    ['a second contact (label not real)', 'Alternative contact', { autocomplete: 'tel' }],
    ['a second contact (label not real)', 'Alternate contact', { autocomplete: 'tel' }],
    ['something else (label not real)', 'Other', { name: 'name' }],
    // a question that mentions a field word without being that field
    ['mentions a name', 'What is the name of your current or most recent employer?', { name: 'name' }],
    ['mentions an e-mail (label not real)', 'School email address', { inputType: 'email', autocomplete: 'email' }],
    ['mentions a postal code', 'Zip Code / Postal Code (Non-U.S. based candidates, please enter "00000")', { autocomplete: 'postal-code' }],
    // made to catch programs
    // Workday's sign-in honeypot as it is on the page: <input data-automation-id="beecatcher" name="website">
    ['a honeypot (Workday, fully real)', "Enter website. This input is for robots only, do not enter if you're human.", { name: 'website', hints: 'beecatcher' }],
    ['a honeypot (Workday, real label)', "Enter website. This input is for robots only, do not enter if you're human.", { name: 'portfolio' }],
    ['a honeypot (label not real)', 'For robots only', { name: 'email' }],
    ['a honeypot (label not real)', 'Leave this field blank', { name: 'email' }],
    ['a honeypot (label not real)', 'Please leave this empty', { name: 'email' }],
    ['a honeypot (label not real)', 'Are you human?', { name: 'name' }],
  ];

  it.each(aboutSomethingElse)('null (%s): "%s"', (_why, label, descriptor) => {
    expect(classifyField(field({ label, ...descriptor }))).toBeNull();
  });

  // One row for each word that field names are made of: a label that uses the
  // word for something else, on a box whose attributes name one of our fields.
  // Labels marked "real" are from live forms; the rest are plausible.
  const fieldWords: [word: string, label: string, descriptor: Partial<FieldDescriptor>][] = [
    ['name', 'Chosen Name', { name: 'name' }], // real
    ['surname', 'Previous surname', { autocomplete: 'family-name' }],
    ['email', 'Work email', { autocomplete: 'email' }],
    ['e-mail', 'Work e-mail', { autocomplete: 'email' }],
    ['phone', 'Work phone', { autocomplete: 'tel' }],
    ['telephone', 'Work telephone', { autocomplete: 'tel' }],
    ['mobile', 'Mobile carrier', { autocomplete: 'tel' }],
    ['address', 'Address Line 2', { autocomplete: 'street-address' }],
    ['city', 'City you would like to work in', { name: 'city' }],
    ['state', 'State bar number', { name: 'city' }],
    ['province', 'Province you would like to work in', { name: 'city' }],
    ['zip', 'Zip code of the office', { autocomplete: 'postal-code' }],
    ['postal', 'Postal district', { autocomplete: 'postal-code' }],
    ['postcode', 'Postcode area', { autocomplete: 'postal-code' }],
    ['country', 'Country code', { autocomplete: 'tel' }],
    ['countries', 'Countries you have worked in', { name: 'city' }],
    ['location', 'Location Cost Tier', { name: 'city' }], // real
    ['linkedin', 'LinkedIn followers', { name: 'linkedin' }],
    ['github', 'GitHub stars', { name: 'github' }],
    ['portfolio', 'Portfolio size', { name: 'portfolio' }],
    ['website', 'Website(s)', { name: 'portfolio' }], // real
    ['company', 'Company size', { name: 'company' }],
    ['employer', 'Work Experience: Current/Previous Employer', { name: 'employer' }], // real
    ['title', 'Title', { name: 'name' }], // real: a Greenhouse employment row, and elsewhere Mr / Ms / Dr
    ['school', 'High school', { name: 'school' }],
    ['university', 'Education: Last University Attended', { name: 'university' }], // real
    ['college', 'College sports', { name: 'school' }],
    ['degree', 'Degree classification', { name: 'major' }],
    ['major', 'Intended major', { name: 'major' }],
    ['discipline', 'Discipline you would like to move into', { name: 'major' }],
    ['gpa', 'Undergraduate GPA', { name: 'major' }], // real
    ['graduation', 'Have you graduated', { name: 'graduation_year' }],
  ];

  it.each(fieldWords)('null: a label using "%s" for something else ("%s")', (_word, label, descriptor) => {
    expect(classifyField(field({ label, ...descriptor }))).toBeNull();
  });

  // Kinds with look-alikes are only recognised by their own label: a hidden
  // attribute alone cannot tell a state from a state bar, or the country you
  // live in from the dial code of your phone.
  const needTheirLabel: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    ['autocomplete for a state', { autocomplete: 'address-level1' }],
    ['autocomplete for a country', { autocomplete: 'country' }],
    ['autocomplete for a country', { autocomplete: 'country-name' }],
    ['autocomplete for a job title', { autocomplete: 'organization-title' }],
    ["Greenhouse's dial-code picker", { id: 'country' }],
    ["Greenhouse's location box", { id: 'candidate-location' }],
    ["Lever's location box", { name: 'location', id: 'location-input', hints: 'location-input' }],
    ["Ashby's location path", { name: '_systemfield_location' }],
    ['a box named state', { name: 'state' }],
    ['a box named province', { name: 'province' }],
    ['a box named degree', { name: 'degree' }],
    ['a box named gpa', { name: 'gpa' }],
    ['a box named graduation_date', { name: 'graduation_date' }],
    ['a box named current_title', { name: 'current_title' }],
  ];

  it.each(needTheirLabel)('null without a label: %s', (_what, descriptor) => {
    expect(classifyField(field(descriptor))).toBeNull();
  });

  // …but their identifiers are known, so they still confirm and contradict.
  it('lets the identifiers of such a kind confirm its label', () => {
    // Lever's "Current location", as it is on every Lever form
    const lever = field({ label: 'Current location', name: 'location', id: 'location-input', hints: 'location-input', required: true });
    expect(classifyField(lever)).toBe('location');
  });

  const contradictedByStrictIdentifier: [label: string, descriptor: Partial<FieldDescriptor>][] = [
    ['Email', { id: 'country' }],
    ['Email', { id: 'candidate-location' }],
    ['Email', { name: 'location' }],
    ['Email', { id: 'location-input' }],
    ['Email', { name: '_systemfield_location' }],
    ['Email', { name: 'state' }],
    ['Email', { name: 'province' }],
    ['Email', { name: 'degree' }],
    ['Email', { name: 'gpa' }],
    ['Email', { name: 'graduation_date' }],
    ['Email', { name: 'current_title' }],
  ];

  it.each(contradictedByStrictIdentifier)('null: label "%s" against %o', (label, descriptor) => {
    expect(classifyField(field({ label, ...descriptor }))).toBeNull();
  });
});

describe('classifyField: signing and attesting are left to the user', () => {
  const signing: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    // Lever's federal disability form: a text box labelled just "Name", and a date beside it
    ['Lever signature', { label: 'Name', name: 'eeo[disabilitySignature]', placeholder: 'Enter your full name' }],
    ['Lever signature date', { label: 'Date', name: 'eeo[disabilitySignatureDate]', placeholder: 'MM/DD/YYYY' }],
    // Lyft, on Greenhouse: a text box under a paragraph to attest to
    [
      'Lyft attestation',
      {
        label:
          'I certify that the facts set forth in this Application for Employment are true and complete to the best of my knowledge. I understand that if I am employed, false statements, omissions or misrepresentations may result in my dismis',
        autocomplete: 'name',
      },
    ],
    ['real label "…Attestation"', { label: 'Candidate AI Usage Attestation:', name: 'name' }],
    ['real label "…acknowledge…"', { label: 'Please review and acknowledge our Candidate Privacy Policy linked below:', name: 'name' }],
    // Not real controls: one per word, in each place it can stand
    ['label "Signature"', { label: 'Signature', name: 'name' }],
    ['label "Declaration"', { label: 'Declaration', name: 'name' }],
    ['id says signature', { label: 'Name', id: 'applicant_signature' }],
    ['hint says signature', { label: 'Name', hints: 'apply-form signature-name' }],
    ['name says certification', { label: 'Full name', name: 'certification_name' }],
    ['name says attestation', { label: 'Full name', name: 'attestation[name]' }],
    ['id says acknowledgement', { label: 'Full name', id: 'acknowledgement-name' }],
    ['name says declaration', { label: 'Full name', name: 'declaration_name' }],
    ['upper case', { label: 'Full name', name: 'SIGNATURE' }],
  ];

  it.each(signing)('null: %s', (_what, descriptor) => {
    expect(classifyField(field(descriptor))).toBeNull();
  });

  // Not real labels: the questions answered by choosing, worded as something to certify or
  // attest to. A "yes" from the profile would sign the statement for the user.
  const statementsToSign: [what: string, label: string][] = [
    ['an eligibility question to certify', 'Do you certify that you are legally authorized to work in the United States?'],
    ['a sponsorship question to attest to', 'Do you attest that you will now or in the future require visa sponsorship?'],
    ['a veteran statement to attest to', 'I attest that I am a protected veteran'],
    ['a self-declared gender', 'I declare my gender as:'],
    ['a disability status to acknowledge', 'Please acknowledge your disability status'],
    ['a race given under a signature', 'Race (your selection counts as your signature)'],
  ];

  it.each(statementsToSign)('null: %s', (_what, label) => {
    const dropdown = field({ control: 'select', inputType: '', label, options: options('Select...', 'Yes', 'No') });
    expect(classifyField(dropdown)).toBeNull();
  });
});

describe('classifyField: voluntary self-identification questions', () => {
  /** A dropdown with the given question; what it offers does not matter to these tests. */
  const question = (label: string) => field({ control: 'select', inputType: '', label, options: options('Select...', 'A', 'B') });

  const selfIdentification: [label: string, want: FieldKind][] = [
    ['Gender', 'gender'], // Greenhouse EEOC block, Lever EEO block
    ['Gender:', 'gender'],
    ['Gender Identity', 'gender'],
    ['Gender Identity (optional)', 'gender'],
    ['Please identify your gender.', 'gender'],
    ['Please indicate your gender', 'gender'],
    ['I identify my gender as:', 'gender'],
    ['How would you describe your gender identity?', 'gender'],
    ['How would you describe your gender identity (please select one)?', 'gender'],
    ['How do you identify? (gender identity)', 'gender'],
    ['What is your gender or gender identity?', 'gender'],
    ['What gender identity do you most closely identify with?', 'gender'],
    ['Gender (Thailand)', 'gender'],
    ['Race', 'race'],
    ['Race:', 'race'],
    ['Race/Ethnicity', 'race'],
    ['Race and Ethnicity', 'race'],
    ['Race or Ethnicity (optional)', 'race'],
    ['What is your race or ethnicity?', 'race'],
    [
      'What is your race/ethnicity? Please mark the one box that describes the race/ethnicity category with which you primarily identify.',
      'race',
    ],
    ['How do you identify? (race/ethnicity)', 'race'],
    ['Please identify your race.', 'race'],
    ['Please identify your ethnicity.', 'race'],
    ['Please indicate your race / ethnic group (choose all that apply)', 'race'],
    ['Which ethnicity do you identify with primarily?', 'race'], // Lever, the first of three ethnicity dropdowns
    ['Veteran Status', 'veteran'],
    ['Veteran Status:', 'veteran'],
    ['Protected Veteran Status', 'veteran'],
    ['Military Veteran Status', 'veteran'],
    ['Veteran Status (please select one):', 'veteran'],
    ['Please identify your veteran status.', 'veteran'],
    ['Are you a veteran or active member of the United States Armed Forces?', 'veteran'],
    ['Please indicate if you are a veteran or active member of the United States Armed Forces.', 'veteran'],
    ['Are you a veteran/have you served in the military?', 'veteran'],
    ['Are you a veteran, active member or reservist of the United States Armed Forces?', 'veteran'],
    ['What is your military status?', 'veteran'],
    ['Disability Status', 'disability'],
    ['I have a disability:', 'disability'],
    ['I have a disability (please select one):', 'disability'],
    ['What is your disability status?', 'disability'],
    ['Do you know if you have a disability?', 'disability'],
    ['Do you have a physical or mental disability, impairment, or condition that substantially limits major life activity?', 'disability'],
    ['Do you live with a disability (as outlined by the ADA)?', 'disability'],
    [
      'Do you have a disability or chronic condition (physical, visual, auditory, cognitive, mental, emotional, other) that substantially limits 1 or more of your major life activities, including mobility, communication (seeing, hearing, speaking), and learning?',
      'disability',
    ],
    ['Voluntary Self-Identification of Disability - Form CC-305 OMB Control Number 1250-0005 Expires 04/30/2026', 'disability'],
    ['Disability', 'disability'], // not from the research: the plain name
  ];

  it.each(selfIdentification)('%s → %s', (label, want) => {
    expect(classifyField(question(label))).toBe(want);
  });

  const otherQuestions: [why: string, label: string][] = [
    ['pronouns, not gender', 'What are your preferred gender pronouns? (She/Her/Hers; He/Him/His; They/Them/Theirs, etc.)'],
    ['pronouns, not gender', 'Please share your gender pronouns.'],
    ['pronouns, not gender', 'Gender Pronouns (She/Her/Hers, He/Him/His, They/Them/Theirs, etc.)'],
    ['a yes/no question of its own', 'Do you identify as transgender?'],
    ['a yes/no question of its own', 'I identify as transgender (please select one):'],
    ['a yes/no question of its own', 'Are you a person of transgender experience?'],
    ['names no subject', 'I identify as:'],
    ['orientation, not gender', 'How would you describe your sexual orientation? (mark all that apply)'],
    ['sex is not asked from the gender answer', 'Please identify your sex.'],
    ['a yes/no question the profile has no answer for', 'Are you Hispanic/Latino?'], // Greenhouse EEOC block
    ['a second ethnicity (Lever)', 'Do you identify with a secondary or more specific ethnicity? ...'],
    ['a third ethnicity (Lever)', 'Do you identify with a third ethnicity? ...'],
    // Not real labels: the other words for "one more of the same", on the question Lever asks three times.
    ['a second ethnicity', 'Do you identify with a second ethnicity?'],
    ['an additional ethnicity', 'Do you identify with an additional ethnicity?'],
    ['an alternate ethnicity', 'Alternate ethnicity'],
    ['an alternative ethnicity', 'Alternative ethnicity'],
    ['another ethnicity', 'Other ethnicity'],
    ['several ethnicities', 'Please select up to 2 ethnicities that you most closely identify with.'],
    ['a follow-up', 'If you are based in the US, what is your veteran status?'],
    ['inclusion, not disability', 'It is important to us to create an accessible and inclusive interview experience. Please let us know if there are any adjustments we can make to assist you during the hiring and interview process.'],
    // Not real labels. A profile "yes" or "no" would answer a different question here.
    ['accommodation, not disability status', 'Do you require any accommodations for a disability during the interview process?'],
    ['accommodation, not disability status', 'Do you need any adjustments because you have a disability?'],
    ['accommodation, not disability status', 'Do you have a disability we should accommodate?'],
    ['adjustments, not disability status', 'Do you have a disability for which we should make adjustments?'],
    ['what it requires, not disability status', 'Do you have a disability that requires special arrangements?'],
    ['what you need, not disability status', 'Do you have a disability and need support at the interview?'],
    ['ability to do the job, not disability status', 'Do you have a disability that would prevent you from performing the essential functions of this job?'],
    ['ability to do the job, not disability status', 'Do you have a disability that would prevent you from doing this job?'],
    ['ability to do the job, not disability status', 'Can you perform this job although you have a disability?'],
    ['whether to answer at all, not disability status', 'Do you wish to disclose your disability status?'],
    ['whether to answer at all, not disability status', 'Would you like to tell us your disability status?'],
    ['whether to answer at all, not disability status', 'Are you willing to share your disability status?'],
    ['whether to answer at all, not disability status', 'Do you want to state your disability status?'],
    ["someone else's disability", 'Do any of your dependents have a disability?'],
    ["someone else's disability", 'Does your child live with a disability?'],
    ['insurance, not disability status', 'Would you like to enrol in disability insurance?'],
    ['someone else', 'Are you the spouse of a veteran?'],
    ['veterans in general, not this applicant', "Do you receive veterans' benefits?"],
    ['several subjects at once', 'Gender and race'],
    ['several subjects at once', 'We do not discriminate on the basis of race, gender, disability or veteran status. Do you understand?'],
  ];

  it.each(otherQuestions)('null (%s): %s', (_why, label) => {
    expect(classifyField(question(label))).toBeNull();
  });

  // Real controls: the label names the question; the identifier neither helps nor hurts.
  const realControls: [what: string, descriptor: Partial<FieldDescriptor>, want: FieldKind | null][] = [
    ['Greenhouse gender', { control: 'combobox', autocomplete: 'off', label: 'Gender', id: 'gender' }, 'gender'],
    ['Greenhouse veteran status', { control: 'combobox', autocomplete: 'off', label: 'Veteran Status', id: 'veteran_status' }, 'veteran'],
    ['Greenhouse Hispanic/Latino', { control: 'combobox', autocomplete: 'off', label: 'Are you Hispanic/Latino?', id: 'hispanic_ethnicity' }, null],
    [
      'Lever gender',
      {
        control: 'select',
        inputType: '',
        label: 'Gender',
        name: 'eeo[gender]',
        options: options('Select ...', 'Male', 'Female', 'Decline to self-identify'),
      },
      'gender',
    ],
    [
      'Lever race',
      {
        control: 'radio',
        inputType: 'radio',
        label: 'Race',
        name: 'eeo[race]',
        options: options('Hispanic or Latino', 'White (Not Hispanic or Latino)', 'Decline to self-identify'),
      },
      'race',
    ],
    [
      'Lever veteran status (the dropdown is real, the wording of its label is assumed)',
      {
        control: 'select',
        inputType: '',
        label: 'Veteran status',
        name: 'eeo[veteran]',
        options: options(
          'Select ...',
          'I identify as one or more of the classifications of protected veteran listed above',
          'I am not a protected veteran',
          'I decline to self-identify for protected veteran status',
        ),
      },
      'veteran',
    ],
  ];

  it.each(realControls)('%s → %s', (_what, descriptor, want) => {
    expect(classifyField(field(descriptor))).toBe(want);
  });

  // A sensitive question is answered only when the question itself can be
  // read: without a label, no name or id is taken for one.
  const identifiersAlone: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    ['Greenhouse id gender', { id: 'gender' }],
    ['Greenhouse id veteran_status', { id: 'veteran_status' }],
    ['an id disability_status', { id: 'disability_status' }],
    ['an id race', { id: 'race' }],
    ['Lever name eeo[gender]', { name: 'eeo[gender]' }],
    ['Lever name eeo[race]', { name: 'eeo[race]' }],
    ['Lever name eeo[veteran]', { name: 'eeo[veteran]' }],
    ['Lever name eeo[disability]', { name: 'eeo[disability]' }],
    ['a box named work_authorization', { name: 'work_authorization' }],
    ['a box named sponsorship', { name: 'sponsorship' }],
    ['a box named requires_sponsorship', { name: 'requires_sponsorship' }],
  ];

  it.each(identifiersAlone)('null without a label: %s', (_what, descriptor) => {
    const unlabelled = field({ control: 'select', inputType: '', options: options('Select...', 'Yes', 'No'), ...descriptor });
    expect(classifyField(unlabelled)).toBeNull();
  });
});

describe('classifyField: the eligibility questions on real controls', () => {
  const yesNo = options('Yes', 'No');

  const controls: [what: string, descriptor: Partial<FieldDescriptor>, want: FieldKind | null][] = [
    [
      'Greenhouse custom dropdown (Discord)',
      {
        control: 'combobox',
        autocomplete: 'off',
        label: 'Are you legally authorized to work in the United States for our Company?',
        id: 'question_39004003002',
        required: true,
      },
      'workAuthorization',
    ],
    [
      'Greenhouse custom dropdown (GitLab)',
      {
        control: 'combobox',
        autocomplete: 'off',
        label: 'Will you now or in the future require sponsorship for a visa to remain in your current location?',
        id: 'question_37369961002',
        required: true,
      },
      'sponsorship',
    ],
    [
      'Lever radio group (Palantir)',
      {
        control: 'radio',
        inputType: 'radio',
        label: 'Are you legally authorized to work in the country for which you are applying?',
        name: 'cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]',
        options: yesNo,
        required: true,
      },
      'workAuthorization',
    ],
    [
      'Lever radio group (Palantir)',
      {
        control: 'radio',
        inputType: 'radio',
        label: 'Will you now or in the future require sponsorship for employment visa status (e.g., H-1B, etc.)?',
        name: 'cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field1]',
        options: yesNo,
        required: true,
      },
      'sponsorship',
    ],
    [
      'Lever native dropdown (Zoox)',
      {
        control: 'select',
        inputType: '',
        label: 'Sponsorship: Do you require sponsorship, or will you require sponsorship in the future for employment authorization in the United States?',
        options: options('Select...', 'Yes', 'No'),
        required: true,
      },
      'sponsorship',
    ],
    [
      'a note in brackets mentions citizens, which elsewhere rules a label out',
      {
        control: 'select',
        inputType: '',
        label: 'Are you currently legally authorized to work in the country in which this job is based (e.g. you are a citizen, you have a visa, etc.)?',
        options: yesNo,
      },
      'workAuthorization',
    ],
    [
      'inverted polarity',
      { control: 'select', inputType: '', label: 'Do you require work authorization?', options: options('Yes', 'No', 'Unknown') },
      null,
    ],
    ['a heading', { control: 'select', inputType: '', label: 'U.S. WORK AUTHORIZATION', options: yesNo }, null],
    [
      'Ashby radio group with "without"',
      {
        control: 'radio',
        inputType: 'radio',
        label: 'Are you legally authorized to work in the US without visa sponsorship now or in the future?',
        options: yesNo,
      },
      null,
    ],
  ];

  it.each(controls)('%s → %s', (_what, descriptor, want) => {
    expect(classifyField(field(descriptor))).toBe(want);
  });
});

describe('which controls a kind is recognised on', () => {
  // For every kind: a label that names it, the controls it may sit on, and
  // (for kinds a list can offer) a list of the right sort.
  const kinds: [kind: FieldKind, label: string, controls: ControlType[], list: string[]][] = [
    ['firstName', 'First Name', ['text'], []],
    ['lastName', 'Last Name', ['text'], []],
    ['fullName', 'Full name', ['text'], []],
    ['email', 'Email', ['text'], []],
    ['phone', 'Phone', ['text'], []],
    ['addressLine1', 'Address', ['text'], []],
    ['city', 'City', ['text'], []],
    ['postalCode', 'Zip Code', ['text'], []],
    ['linkedin', 'LinkedIn Profile', ['text'], []],
    ['github', 'GitHub', ['text'], []],
    ['portfolio', 'Website', ['text'], []],
    ['currentCompany', 'Current company', ['text'], []],
    ['currentTitle', 'Current Title', ['text'], []],
    ['gpa', 'GPA', ['text'], []],
    // a typeahead on Greenhouse, Lever and Ashby
    ['location', 'Location', ['text', 'combobox'], []],
    // a list is plausible
    ['state', 'State', ['text', 'select', 'combobox'], ['Alabama', 'Alaska', 'Arizona']],
    ['country', 'Country', ['text', 'select', 'combobox'], ['United States of America', 'Canada', 'Afghanistan']],
    ['school', 'School', ['text', 'select', 'combobox'], ['Aalborg University', 'Aalto University', 'Aarhus University']],
    ['degree', 'Degree', ['text', 'select', 'combobox'], ['High School', "Associate's Degree", "Bachelor's Degree"]],
    ['major', 'Discipline', ['text', 'select', 'combobox'], ['Accounting', 'Biology', 'Computer Science']],
    ['graduationDate', 'Graduation Date', ['text', 'select', 'combobox'], ['December 2026', 'May 2027', 'December 2027']],
    ['graduationYear', 'Graduation Year', ['text', 'select', 'combobox'], ['2026', '2027', '2028']],
    // answered by choosing, never by typing
    ['workAuthorization', 'Are you authorized to work in the United States?', ['select', 'radio', 'combobox'], ['Yes', 'No']],
    ['sponsorship', 'Do you require visa sponsorship?', ['select', 'radio', 'combobox'], ['Yes', 'No']],
    ['gender', 'Gender', ['select', 'radio', 'combobox'], ['Male', 'Female', 'Decline To Self Identify']],
    ['race', 'Race', ['select', 'radio', 'combobox'], ['Asian', 'White', 'Decline To Self Identify']],
    ['veteran', 'Veteran Status', ['select', 'radio', 'combobox'], ['I am not a protected veteran', "I don't wish to answer"]],
    ['disability', 'Disability Status', ['select', 'radio', 'combobox'], ['Yes, I have a disability', "No, I don't have a disability"]],
    // a file, and the only kind a file input can be
    ['resume', 'Resume/CV', ['file'], []],
  ];

  const allControls: ControlType[] = ['text', 'textarea', 'select', 'radio', 'combobox', 'file'];

  /** The descriptor of one control type as the page would describe it. */
  function control(type: ControlType, label: string, list: string[]): FieldDescriptor {
    const inputType = { text: 'text', textarea: '', select: '', radio: 'radio', combobox: 'text', file: 'file' }[type];
    const hasList = type === 'select' || type === 'radio';
    return field({ control: type, inputType, label, options: hasList ? options(...list) : [] });
  }

  describe.each(kinds)('%s ("%s")', (kind, label, controls, list) => {
    it.each(allControls)('on a %s', (type) => {
      const want = controls.includes(type) ? kind : null;
      expect(classifyField(control(type, label, list))).toBe(want);
    });

    it('is listed with those controls in KIND_CONTROLS', () => {
      expect([...KIND_CONTROLS[kind]].sort()).toEqual([...controls].sort());
    });
  });
});

describe('classifyField: what a dropdown offers can rule its label out', () => {
  const dropdown = (label: string, ...offered: string[]) =>
    field({ control: 'select', inputType: '', label, options: options(...offered) });

  it('does not take a yes/no question about a state bar for the state (real label and options)', () => {
    const stateBar = dropdown('Do you have active membership in good standing with at least one U.S. state bar?', 'Yes', 'No');
    expect(classifyField(stateBar)).toBeNull();
  });

  // Not real controls: a label that does name the field, over a list that cannot be it.
  const wrongLists: [label: string, offered: string[]][] = [
    ['State', ['Yes', 'No']],
    ['State', ['Select...', 'Yes', 'No']],
    ['State', ['Yes ', 'No ']], // real lists carry trailing spaces
    ['State', [' Yes', ' No']],
    ['State', ['YES', 'NO']],
    ['State', ['Yes, I live here', 'No, I plan to relocate']],
    ['State', ['Yes - NYC', 'Yes - SF', 'No - elsewhere']],
    ['Country', ['Yes', 'No']],
    ['School', ['Yes', 'No']],
    ['Degree', ['Yes', 'No']],
    ['Discipline', ['Yes', 'No']],
    ['Graduation Year', ['Yes', 'No']],
    ['Graduation Date', ['Yes', 'No']],
    // a graduation date or year is offered as dates
    ['Graduation Date', ['Select...', 'Spring', 'Fall', 'Other']],
    ['Graduation Year', ['Freshman', 'Sophomore', 'Junior', 'Senior']],
  ];

  it.each(wrongLists)('null: "%s" offering %j', (label, offered) => {
    expect(classifyField(dropdown(label, ...offered))).toBeNull();
  });

  const rightLists: [label: string, offered: string[], want: FieldKind][] = [
    ['State', ['AL', 'AK', 'AZ', 'AR', 'CA'], 'state'],
    ['State', ['Select...', 'AL - Alabama', 'AK - Alaska', 'AZ - Arizona'], 'state'],
    ['State', ['New York', 'Illinois', 'Another State in the US', 'APAC', 'EMEA', 'Other'], 'state'],
    ['State', ['North Carolina', 'North Dakota', 'Nova Scotia'], 'state'], // "No…" is not "No"
    ['Country', ['Brazil', 'Canada', 'USA', 'Netherlands', 'United Kingdom', 'Other'], 'country'],
    ['Country', ['Norway', 'Yemen'], 'country'],
    ['Degree', ['No degree', 'High School', "Bachelor's Degree"], 'degree'],
    ['Graduation Date', ['December 2026/January 2027', 'May/June 2027', 'December 2027/January 2028', 'Other'], 'graduationDate'],
    ['Graduation Date', ['Spring 2027', 'Fall 2027', 'Spring 2028', 'I am not currently enrolled'], 'graduationDate'],
    ['Graduation Year', ['Graduated', 'Before July 2027', 'December 2027', '2028'], 'graduationYear'],
  ];

  it.each(rightLists)('"%s" offering %j → %s', (label, offered, want) => {
    expect(classifyField(dropdown(label, ...offered))).toBe(want);
  });

  it('leaves the list of a self-identification question to the option matcher (real list)', () => {
    const disability = dropdown('I have a disability:', 'Yes', 'No', 'I prefer to self-describe', "I don't wish to answer");
    expect(classifyField(disability)).toBe('disability');
  });
});

describe('classifyField: the group a control sits in can rule it out', () => {
  // Greenhouse: <fieldset class="phone-input"><legend>Phone</legend> holds a dial-code
  // picker labelled "Country" and the number itself.
  it('does not take the dial-code picker inside the "Phone" group for the country of residence', () => {
    const dialCode = field({ control: 'combobox', autocomplete: 'off', label: 'Country', groupLabel: 'Phone', id: 'country' });
    expect(classifyField(dialCode)).toBeNull();
  });

  it('still recognises the phone number inside the "Phone" group', () => {
    const number = field({ inputType: 'tel', label: 'Phone', groupLabel: 'Phone', id: 'phone' });
    expect(classifyField(number)).toBe('phone');
  });

  it('recognises a country dropdown that stands on its own (Greenhouse custom question)', () => {
    expect(classifyField(field({ control: 'combobox', autocomplete: 'off', label: 'Country' }))).toBe('country');
  });

  // Not real controls: plain labels inside a group about someone or something else.
  const ruledOut: [groupLabel: string, label: string][] = [
    ['Phone number', 'Country'],
    ['Emergency contact', 'Phone'],
    ['Emergency contact', 'Name'],
    ['References', 'Name'],
    ['Reference 1', 'Email'],
    ['Your manager', 'Email'],
    ['Preferred name', 'First Name'],
    ['Passport details', 'Country'],
    ['Place of birth', 'City'],
    ['If you answered yes above', 'City'],
    ['Signature', 'Name'],
    ['Declaration', 'Full name'],
    // someone else, in the words forms outside the US use for a reference and for an applicant's family
    ['Referees', 'Name'],
    ['Referee 1', 'Email'],
    ['Parent or carer', 'Phone'],
    ['Parents', 'Email'],
    ['Legal guardian', 'Name'],
    ['Guardians', 'Phone'],
    ['Next of kin', 'Name'],
  ];

  it.each(ruledOut)('null: group "%s", label "%s"', (groupLabel, label) => {
    expect(classifyField(field({ label, groupLabel }))).toBeNull();
  });

  // One row for every other word that marks a text as being about someone or something else.
  // Not real controls. In a label these words only decide beside a self-identification word
  // (any other label we cannot read is left alone anyway); as the heading of a group each of
  // them decides on its own, so this is where they are tested.
  const ruledOutByWord: [word: string, groupLabel: string, label: string][] = [
    // a follow-up to another answer
    ['if yes', 'Have you lived abroad? If yes:', 'Country'],
    ['if no', 'Is this your permanent address? If no:', 'City'],
    ['if not', 'Same as above? If not:', 'Address'],
    ['if so', 'Do you go by another name? If so:', 'Name'],
    ['(if', 'Term-time address (if different)', 'City'],
    // someone else
    ['their', 'Their details', 'Name'],
    ['referral', 'Referral', 'Email'],
    ['referred', 'Referred by', 'Name'],
    ['recruiter', 'Your recruiter', 'Email'],
    ['supervisor', 'Supervisor', 'Phone'],
    ['relative', 'A relative we may reach', 'Phone'],
    ['relatives', 'Relatives working here', 'Name'],
    ['spouse', 'Spouse', 'Name'],
    ['family', 'Family member', 'Name'],
    ["employee's", "The employee's details", 'Name'],
    ["employee's, typographic apostrophe", 'The employee’s details', 'Name'],
    // another subject
    ['password', 'Password hint', 'Email'],
    ['pronoun', 'Pronouns', 'Name'],
    ['citizen', 'Citizenship', 'Country'],
    ['nationality', 'Nationality', 'Country'],
    ['consent', 'Consent', 'Full name'],
    ['agree', 'Agreement', 'Full name'],
    ['employee id', 'Employee ID', 'Email'],
    // the wording of honeypots
    ['robots', 'For robots only', 'Email'],
    ['robot', 'Robot check', 'Email'],
    ['human', 'Are you human?', 'Name'],
    ['leave … blank', 'Leave this field blank', 'Email'],
    ['leave … empty', 'Please leave this empty', 'Email'],
  ];

  it.each(ruledOutByWord)('null ("%s"): group "%s", label "%s"', (_word, groupLabel, label) => {
    expect(classifyField(field({ label, groupLabel }))).toBeNull();
  });

  it('rules out an unlabelled box inside such a group too, whatever its attributes say', () => {
    expect(classifyField(field({ groupLabel: 'Emergency contact', autocomplete: 'tel' }))).toBeNull();
    expect(classifyField(field({ groupLabel: 'Contact details', autocomplete: 'tel' }))).toBe('phone');
  });

  // Not real controls. Greenhouse's "Phone" group above is the real case of a group that is
  // itself one field; these are the same thing for other fields. What stands inside belongs to
  // the group's subject: the "Name" under "Current employer" is the employer's, not the applicant's.
  const underAnotherField: [groupLabel: string, label: string][] = [
    ['Current employer', 'Name'],
    ['Employer', 'Phone'],
    ['Company', 'Address'],
    ['School', 'City'],
    ['University', 'State'],
    // the line to sign on a disability form, when nothing but its section says so
    ['Disability status', 'Name'],
    ['Voluntary Self-Identification of Disability', 'Name'],
    ['Veteran status', 'Full name'],
  ];

  it.each(underAnotherField)('null: group "%s" is a field of its own, label "%s"', (groupLabel, label) => {
    expect(classifyField(field({ label, groupLabel }))).toBeNull();
  });

  it('rules out an unlabelled box inside a group that is a field of its own, too', () => {
    expect(classifyField(field({ groupLabel: 'Current employer', name: 'name' }))).toBeNull();
  });

  // …but a group named after a field may hold that field, and "Name", "Address" and "Location"
  // stand over the pieces of a name and of an address. Not real controls (the project's own
  // tests/fixtures/generic.html has such an "Address" group).
  const piecesOfTheGroup: [groupLabel: string, label: string, want: FieldKind][] = [
    ['Address', 'Street address', 'addressLine1'],
    ['Address', 'State', 'state'],
    ['Address', 'Zip Code', 'postalCode'],
    ['Address', 'City, State', 'location'],
    ['Legal name', 'Last Name', 'lastName'],
    ['Current location', 'City', 'city'],
    ['Location', 'Address', 'addressLine1'],
    ['Current employer', 'Company name', 'currentCompany'],
    ['Email', 'Confirm Email', 'email'],
  ];

  it.each(piecesOfTheGroup)('group "%s", label "%s" → %s', (groupLabel, label, want) => {
    expect(classifyField(field({ label, groupLabel }))).toBe(want);
  });

  // An ordinary section heading rules nothing out, and one that names a field stands over that
  // field and its pieces. Not real controls either.
  const untouched: [groupLabel: string, label: string, want: FieldKind][] = [
    ['Address', 'City', 'city'],
    ['Address', 'Country', 'country'],
    ['Name', 'First Name', 'firstName'],
    ['Personal information', 'First Name', 'firstName'],
    ['Name and contact details', 'Phone', 'phone'],
    ['Contact details', 'Email', 'email'],
    ['Education', 'School', 'school'],
    ['Additional information', 'LinkedIn Profile', 'linkedin'],
    ['Phone', 'Mobile', 'phone'],
  ];

  it.each(untouched)('group "%s", label "%s" → %s', (groupLabel, label, want) => {
    expect(classifyField(field({ label, groupLabel }))).toBe(want);
  });

  it('judges a radio group whose legend is its question once, not twice', () => {
    // The note in brackets mentions citizens; as the legend of some other group that would rule the control out.
    const question =
      'Are you currently legally authorized to work in the country in which this job is based (e.g. you are a citizen, you have a visa, etc.)?';
    const radios = field({ control: 'radio', inputType: 'radio', label: question, groupLabel: question, options: options('Yes', 'No') });
    expect(classifyField(radios)).toBe('workAuthorization');
  });

  it('recognises a self-identification dropdown inside its section', () => {
    const gender = field({
      control: 'select',
      inputType: '',
      label: 'Gender',
      groupLabel: 'Voluntary Self-Identification',
      options: options('Select...', 'Male', 'Female', 'Decline to self-identify'),
    });
    expect(classifyField(gender)).toBe('gender');
  });
});

describe('classifyField: the résumé', () => {
  const fileInput = (overrides: Partial<FieldDescriptor>) => field({ control: 'file', inputType: 'file', ...overrides });
  const accept = '.pdf,.doc,.docx,.txt,.rtf';

  const resumes: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    // Greenhouse: both file inputs are labelled "Attach"; the id and the group label tell them apart
    ['Greenhouse', { label: 'Attach', groupLabel: 'Resume/CV', id: 'resume', accept }],
    ['Greenhouse, group label used as the label', { label: 'Resume/CV', groupLabel: 'Resume/CV', id: 'resume', accept }],
    ['Greenhouse, group label not found', { label: 'Attach', id: 'resume', accept }],
    ['Lever', { label: 'Resume/CV', id: 'resume-upload-input', name: 'resume', hints: 'input-resume' }],
    [
      'Lever, with the whole upload widget read as the label',
      {
        label: "Resume/CV ✱ATTACH RESUME/CVCouldn't auto-read resume.Analyzing resume...Success!",
        id: 'resume-upload-input',
        name: 'resume',
        hints: 'input-resume',
      },
    ],
    ['Ashby', { label: 'Resume', id: '_systemfield_resume', required: true }],
    // the label alone is enough when it starts with the word
    ['label "Resume"', { label: 'Resume' }],
    ['label "RESUME"', { label: 'RESUME' }],
    ['label "Résumé"', { label: 'Résumé' }],
    ['label "Résumé/CV"', { label: 'Résumé/CV' }],
    ['label "CV"', { label: 'CV' }],
    ['label "CV / Resume"', { label: 'CV / Resume' }],
    ['label "Resume (PDF only)"', { label: 'Resume (PDF only)' }],
    ['group label alone', { label: 'Upload', groupLabel: 'Résumé' }],
    // …and so is one of the known ids or names
    ['id resume', { id: 'resume' }],
    ['name resume', { name: 'resume' }],
    ['id cv', { id: 'cv' }],
    ['name cv', { name: 'cv' }],
    ['id resume-upload-input', { id: 'resume-upload-input' }],
    ['id _systemfield_resume', { id: '_systemfield_resume' }],
  ];

  it.each(resumes)('%s → resume', (_what, descriptor) => {
    expect(classifyField(fileInput(descriptor))).toBe('resume');
  });

  const otherUploads: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    // real controls
    ['Greenhouse cover letter', { label: 'Attach', groupLabel: 'Cover Letter', id: 'cover_letter', accept }],
    ['Greenhouse cover letter, group label not found', { label: 'Attach', id: 'cover_letter', accept }],
    ['Greenhouse "Portfolio or Cover Letter"', { label: 'Portfolio or Cover Letter' }],
    [
      'Greenhouse transcript',
      { label: 'Please upload your academic record document (e.g. University Transcript, Transcript of Records, Marksheet, or Statement of Marks).' },
    ],
    ['Greenhouse visa copy', { label: 'If you currently hold a work or study visa, please upload a copy of this here:' }],
    // Ashby's "Autofill from resume" box: unlabelled, first in the page, and it re-renders the whole form
    ['Ashby autofill box, unlabelled', {}],
    ['Ashby autofill box, heading as label', { label: 'Autofill from resume' }],
    ['Ashby autofill box, all nearby text as label', { label: 'Autofill from resume Upload your resume here to autofill key application fields.' }],
    // no explicit signal
    ['a bare "Attach"', { label: 'Attach' }],
    ['"Upload your resume": the label does not start with the word', { label: 'Upload your resume' }],
    ['"Please attach your CV"', { label: 'Please attach your CV' }],
    ['a word that only starts like CV', { label: 'CVS Health badge' }],
    ['a word that only starts like resume', { label: 'Resumes of your team' }],
    ['an id that only contains the word', { id: 'resume_text' }],
    ['an id that only contains the word', { id: 'old-resume-2' }],
    ['the data hint alone', { hints: 'input-resume' }],
    // Not real labels: a résumé signal together with another document or an import feature
    ['résumé and cover letter in one', { label: 'Resume and Cover Letter' }],
    ['transcript', { label: 'CV or transcript' }],
    ['portfolio', { label: 'Resume / Portfolio' }],
    ['visa', { label: 'CV and visa copy' }],
    ['license', { label: "CV and driver's license" }],
    ['licence', { label: 'CV and driving licence' }],
    ['autofill', { label: 'Resume (autofill your application)' }],
    ['autofill in the group', { label: 'Resume', groupLabel: 'Autofill from resume' }],
    ['autofill in a hint', { id: 'resume', hints: 'autofill-input' }],
    ['parse', { label: 'Resume - we parse it for you' }],
    ['import', { label: 'Resume import' }],
    ['prefill', { label: 'Resume to prefill the form' }],
    ['cover letter by id', { label: 'Resume', id: 'cover_letter' }],
    ['cover letter by name', { id: 'resume', name: 'cover_letter_upload' }],
    ['a signature', { label: 'Resume', name: 'signature_file' }],
  ];

  it.each(otherUploads)('null: %s', (_what, descriptor) => {
    expect(classifyField(fileInput(descriptor))).toBeNull();
  });

  // A résumé is a file. A box to paste it into, or a link to it, is not recognised.
  const notFiles: [what: string, descriptor: Partial<FieldDescriptor>][] = [
    ['a text box labelled Resume', { control: 'text', label: 'Resume' }],
    ['a text box with the résumé id', { control: 'text', id: 'resume' }],
    ['a textarea to paste it into', { control: 'textarea', inputType: '', label: 'Resume', id: 'resume_text' }],
  ];

  it.each(notFiles)('null: %s', (_what, descriptor) => {
    expect(classifyField(field(descriptor))).toBeNull();
  });
});
