import { afterEach, describe, expect, it } from 'vitest';
import { collectControls } from '../../lib/page/collect';
import { describeControl, isEmpty } from '../../lib/page/describe';
import type { Control, FieldDescriptor } from '../../lib/types';

/** Taken before any fixture is on the page: a fixture may shadow `document.body` with an element of that name. */
const body = document.body;

/** Puts markup on the page. */
function mount(html: string): void {
  body.innerHTML = html;
}

function find<T extends Element = HTMLElement>(selector: string): T {
  const el = body.querySelector<T>(selector);
  if (el === null) throw new Error(`the fixture has no ${selector}`);
  return el;
}

/** The control, as the real collector finds it, that the element matching the selector belongs to. */
function controlAt(selector: string): Control {
  const el = find(selector);
  const control = collectControls(document).find(
    (candidate) => candidate.el === el || (candidate.control === 'radio' && candidate.radios.some((radio) => radio === el)),
  );
  if (control === undefined) throw new Error(`collectControls did not return ${selector}`);
  return control;
}

function described(html: string, selector = '#target'): FieldDescriptor {
  mount(html);
  return describeControl(controlAt(selector));
}

function labelOf(html: string, selector = '#target'): string {
  return described(html, selector).label;
}

afterEach(() => {
  body.innerHTML = '';
});

describe('describeControl: the plain facts of a control', () => {
  it('describes a labelled text box', () => {
    const got = described(
      '<label for="target">Email</label><input id="target" type="email" name="candidate[email]" autocomplete="email" placeholder="you@example.com" required>',
    );

    expect(got).toEqual({
      control: 'text',
      inputType: 'email',
      autocomplete: 'email',
      label: 'Email',
      groupLabel: '',
      name: 'candidate[email]',
      id: 'target',
      placeholder: 'you@example.com',
      hints: '',
      required: true,
      options: [],
      accept: '',
    });
  });

  it('describes a bare input with nothing to go on', () => {
    expect(described('<form><input></form>', 'input')).toEqual({
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
    });
  });

  const inputTypes: [html: string, control: string, inputType: string][] = [
    ['<input id="target">', 'text', 'text'],
    ['<input id="target" type="TEL">', 'text', 'tel'],
    ['<input id="target" type="month">', 'text', 'month'],
    // an unknown type is a text box to the browser
    ['<input id="target" type="postcode">', 'text', 'text'],
    ['<input id="target" type="text" role="combobox">', 'combobox', 'text'],
    ['<input id="target" type="file">', 'file', 'file'],
    ['<textarea id="target"></textarea>', 'textarea', ''],
    ['<select id="target"><option>CA</option></select>', 'select', ''],
    ['<input id="target" type="radio" name="q">', 'radio', 'radio'],
  ];
  it.each(inputTypes)('%s is control %j with inputType %j', (html, control, inputType) => {
    const got = described(html);

    expect([got.control, got.inputType]).toEqual([control, inputType]);
  });

  const autocompletes: [attribute: string, want: string][] = [
    ['autocomplete="given-name"', 'given-name'],
    ['autocomplete="  Shipping  Street-Address "', 'shipping  street-address'],
    ['autoComplete="OFF"', 'off'],
    ['', ''],
  ];
  it.each(autocompletes)('reads %j as autocomplete %j', (attribute, want) => {
    expect(described(`<input id="target" ${attribute}>`).autocomplete).toBe(want);
  });

  const hints: [name: string, attributes: string, want: string][] = [
    // Lever marks its standard inputs with data-qa.
    ['Lever data-qa', 'data-qa="name-input"', 'name-input'],
    ['Workday data-automation-id', 'data-automation-id="legalNameSection_firstName"', 'legalNameSection_firstName'],
    [
      'all six, always in the same order',
      'data-name="f" data-field="e" data-test="d" data-testid="c" data-qa="b" data-automation-id="a"',
      'a b c d e f',
    ],
    ['empty values are left out', 'data-qa="" data-testid="resume-dropbox"', 'resume-dropbox'],
    ['other data attributes are not hints', 'data-value="x" data-qa-id="y" data-id="z" class="first-name"', ''],
  ];
  it.each(hints)('hints: %s', (_name, attributes, want) => {
    expect(described(`<input id="target" ${attributes}>`).hints).toBe(want);
  });

  const required: [name: string, html: string, want: boolean][] = [
    ['the required attribute', '<input id="target" required>', true],
    // Greenhouse marks its visible controls with aria-required only.
    ['aria-required="true"', '<input id="target" aria-required="true">', true],
    ['aria-required="false"', '<input id="target" aria-required="false">', false],
    ['neither', '<input id="target">', false],
    ['a required dropdown', '<select id="target" required><option>CA</option></select>', true],
    ['a required textarea', '<textarea id="target" aria-required="true"></textarea>', true],
    // A ✱ in the label is a marker for people; only the attributes count.
    ['a star in the label', '<label>Phone ✱ <input id="target"></label>', false],
  ];
  it.each(required)('required: %s', (_name, html, want) => {
    expect(described(html).required).toBe(want);
  });

  it('reports accept for file inputs only', () => {
    expect(described('<input id="target" type="file" accept=".pdf,.doc,.docx,.txt,.rtf">').accept).toBe('.pdf,.doc,.docx,.txt,.rtf');
    expect(described('<input id="target" type="file">').accept).toBe('');
    expect(described('<input id="target" type="text" accept=".pdf">').accept).toBe('');
  });
});

describe('describeControl: where the label comes from', () => {
  const sources: [name: string, html: string, want: string][] = [
    // 1. aria-labelledby
    ['aria-labelledby', '<span id="q">Preferred name</span><input id="target" aria-labelledby="q">', 'Preferred name'],
    [
      'aria-labelledby naming several elements, in the order given',
      '<span id="b">(City)</span><span id="a">Location</span><input id="target" aria-labelledby="a b">',
      'Location (City)',
    ],
    [
      'aria-labelledby wins over aria-label and over a label element',
      '<span id="q">From labelledby</span><label for="target">From label</label><input id="target" aria-labelledby="q" aria-label="From aria-label">',
      'From labelledby',
    ],
    // 2. aria-label
    ['aria-label', '<input id="target" aria-label="Phone">', 'Phone'],
    [
      'aria-label wins over a label element',
      '<label for="target">From label</label><input id="target" aria-label="From aria-label">',
      'From aria-label',
    ],
    [
      'aria-labelledby that names nothing falls through to aria-label',
      '<input id="target" aria-labelledby="no-such-id" aria-label="Phone">',
      'Phone',
    ],
    [
      'aria-labelledby that names an empty element falls through',
      '<span id="q">  </span><label for="target">School</label><input id="target" aria-labelledby="q">',
      'School',
    ],
    // Markup can hide a name. CSS that only clips it off screen cannot: that is how a
    // screen-reader label is written, and it is still the name of the control.
    [
      'a screen-reader label clipped off screen still names the control',
      '<span id="q" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">Email</span><label for="target">Manager email</label><input id="target" aria-labelledby="q">',
      'Email',
    ],
    [
      'aria-labelledby pointing at a hidden element falls through to the visible label',
      '<span id="q" hidden>Email</span><label for="target">Manager email</label><input id="target" aria-labelledby="q">',
      'Manager email',
    ],
    [
      'aria-labelledby pointing at an aria-hidden element falls through',
      '<span id="q" aria-hidden="true">Email</span><label for="target">Phone</label><input id="target" aria-labelledby="q">',
      'Phone',
    ],
    [
      'aria-labelledby pointing at an inert element falls through',
      '<span id="q" inert>Email</span><label for="target">Phone</label><input id="target" aria-labelledby="q">',
      'Phone',
    ],
    [
      'a name inside a hidden ancestor falls through',
      '<div hidden><span id="q">Email</span></div><label for="target">City</label><input id="target" aria-labelledby="q">',
      'City',
    ],
    [
      'a name inside a closed details element falls through',
      '<details><span id="q">Email</span></details><label for="target">School</label><input id="target" aria-labelledby="q">',
      'School',
    ],
    [
      'a hidden name is skipped and a visible one is kept',
      '<span id="a" hidden>Email</span><span id="b">Phone</span><input id="target" aria-labelledby="a b">',
      'Phone',
    ],
    ['an empty aria-label falls through to the label element', '<label for="target">School</label><input id="target" aria-label="  ">', 'School'],
    // 3. label elements
    ['label[for]', '<label for="target">LinkedIn Profile</label><input id="target">', 'LinkedIn Profile'],
    ['a label around the control', '<label>Website <input id="target"></label>', 'Website'],
    [
      'two labels for one control',
      '<label for="target">Start date</label><label for="target">(month and year)</label><input id="target">',
      'Start date (month and year)',
    ],
    // nothing
    ['no label of any kind', '<form><input id="target" name="q" placeholder="Type here"></form>', ''],
    ['a label for another control', '<form><label for="other">Other</label><input id="target"><input id="other"></form>', ''],
  ];
  it.each(sources)('%s', (_name, html, want) => {
    expect(labelOf(html)).toBe(want);
  });

  it('resolves aria-labelledby inside the shadow tree the control lives in', () => {
    mount('<span id="q">Label of the page</span><div id="host"></div>');
    const root = find('#host').attachShadow({ mode: 'open' });
    root.innerHTML = '<span id="q">Label in the shadow tree</span><input id="inside" aria-labelledby="q">';
    const inside = root.getElementById('inside');
    const control = collectControls(document).find((candidate) => candidate.el === inside);
    if (control === undefined) throw new Error('collectControls did not return the input in the shadow tree');

    expect(describeControl(control).label).toBe('Label in the shadow tree');
  });
});

describe('describeControl: cleaning a label', () => {
  const cleaned: [raw: string, want: string][] = [
    // Required markers, as the big job sites write them.
    ['First Name*', 'First Name'],
    ['First Name *', 'First Name'],
    ['Full name✱', 'Full name'],
    ['Resume/CV ✱', 'Resume/CV'],
    ['* Email', 'Email'],
    ['Email (required)', 'Email'],
    ['Email (Required)', 'Email'],
    ['Website (optional)', 'Website'],
    ['Phone:', 'Phone'],
    ['Please indicate your gender:', 'Please indicate your gender'],
    ['Email * :', 'Email'],
    // Whitespace of every kind becomes one space.
    ['  First \n\t  Name  ', 'First Name'],
    ['First Name', 'First Name'],
    // What is part of the label stays.
    ['Are you legally authorized to work in the United States?', 'Are you legally authorized to work in the United States?'],
    ['Location (City)', 'Location (City)'],
    ['GPA (out of 4.0)', 'GPA (out of 4.0)'],
    ['Salary expectations (USD)', 'Salary expectations (USD)'],
    ['Which of these is required for the role?', 'Which of these is required for the role?'],
    ['Rate 1*5 stars', 'Rate 1*5 stars'],
    ['Time (HH:MM)', 'Time (HH:MM)'],
    ['Note: this is optional', 'Note: this is optional'],
    ['*', ''],
    ['(required)', ''],
  ];
  it.each(cleaned)('%j becomes %j', (raw, want) => {
    mount('<label for="target"></label><input id="target">');
    find('label').textContent = raw;

    expect(describeControl(controlAt('#target')).label).toBe(want);
  });

  it('cleans aria-label and aria-labelledby text the same way', () => {
    expect(labelOf('<input id="target" aria-label="  Email  * ">')).toBe('Email');
    expect(labelOf('<span id="q">Phone (required):</span><input id="target" aria-labelledby="q">')).toBe('Phone');
  });
});

describe('describeControl: the text of a label element', () => {
  const labels: [name: string, html: string, want: string][] = [
    // Verbatim from Greenhouse: the star is aria-hidden and glued to the text.
    [
      'Greenhouse label with an aria-hidden star',
      '<label id="first_name-label" for="target" class="label label">First Name<span aria-hidden="true">*</span></label><input id="target">',
      'First Name',
    ],
    // Verbatim from Lever: the label wraps two blocks and the control.
    [
      'Lever label around the control',
      '<label><div class="application-label">Full name<span class="required">✱</span></div><div class="application-field"><input id="target" type="text" data-qa="name-input" name="name" required></div></label>',
      'Full name',
    ],
    // Lever's gender dropdown: textContent would glue "Gender" to every option.
    [
      'label around a dropdown: the options are not label text',
      '<label><div class="application-label">Gender</div><div class="application-field"><div class="application-dropdown"><select id="target" name="eeo[gender]"><option value="">Select ...</option><option value="Male">Male</option><option value="Female">Female</option><option value="Decline to self-identify">Decline to self-identify</option></select></div></div></label>',
      'Gender',
    ],
    // Lever's location box: its suggestion list sits inside the label, after the input.
    [
      'text after the control is not label text',
      '<label><div class="application-label">Current location <span class="required" data-qa="SCL-question-required-asterisk">✱</span></div><div class="application-field"><input class="location-input" data-qa="location-input" id="target" type="text" maxlength="100" name="location" required><input id="selected-location" type="hidden" name="selectedLocation"><div class="dropdown-container"><div class="dropdown-results"></div><div class="dropdown-no-results">No location found. Try entering a different location</div><div class="dropdown-loading-results"><span>Loading</span></div></div></div></label>',
      'Current location',
    ],
    // Lever's résumé upload: the link the user clicks holds the input and a caption.
    [
      'the caption of a link that wraps the control is not label text',
      '<label><div class="application-label">Resume/CV <span class="required">✱</span></div><div class="application-field"><a href="#" class="postings-btn template-btn-utility visible-resume-upload"><span class="filename"></span><span class="default-label">ATTACH RESUME/CV</span><input id="target" class="application-file-input invisible-resume-upload" data-qa="input-resume" name="resume" tabindex="-1" type="file"></a><span class="resume-upload-failure"><div class="resume-upload-label">Couldn\'t auto-read resume.</div></span><span class="resume-upload-working"><div class="resume-upload-label">Analyzing resume...</div></span><span class="resume-upload-success"><div class="resume-upload-label">Success!</div></span></div></label>',
      'Resume/CV',
    ],
    ['button text is not label text', '<label>Photo <button type="button">Browse…</button><input id="target" type="file"></label>', 'Photo'],
    ['role=button text is not label text', '<label>Photo <span role="button">Browse…</span><input id="target" type="file"></label>', 'Photo'],
    ['hidden text is not label text', '<label for="target">Email <span hidden>This field is required</span></label><input id="target">', 'Email'],
    ['script and style are not label text', '<label for="target">Email<style>.x{color:red}</style><script>var a = 1;</script></label><input id="target">', 'Email'],
    ['an icon title is not label text', '<label for="target"><svg><title>Envelope</title></svg> Email</label><input id="target">', 'Email'],
    ['another control inside the label is not label text', '<label for="target">Country code <textarea>notes</textarea></label><input id="target">', 'Country code'],
    // A link inside a label is ordinary text unless it wraps the control.
    ['a link in the label text stays', '<label for="target">Portfolio (<a href="/help">what is this?</a>)</label><input id="target">', 'Portfolio (what is this?)'],
    // Floating labels put the text after the input.
    ['text after the control is used when nothing comes before it', '<label class="floating"><input id="target" placeholder=" "><span>Email address</span></label>', 'Email address'],
    ['blocks inside a label are separated by a space', '<label for="target"><div>Start</div><div>date</div></label><input id="target">', 'Start date'],
  ];
  it.each(labels)('%s', (_name, html, want) => {
    expect(labelOf(html)).toBe(want);
  });
});

describe('describeControl: a label from the wrapper around the control', () => {
  // Lever's custom questions have no <label> at all: the question is a block next to the field.
  const LEVER_DROPDOWN =
    '<ul><li class="application-question custom-question"><div><div class="application-label full-width dropdown"><div class="text">Please tell us how you heard about this opportunity.<span class="required">✱</span></div></div><div class="application-field full-width required-field"><div class="application-dropdown"><select id="target" name="cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]" required><option value="">Select...</option><option value="BuiltIn">BuiltIn</option><option value="LinkedIn">LinkedIn</option></select></div></div></div></li></ul>';
  const LEVER_TEXTAREA =
    '<ul><li class="application-question custom-question"><div><div class="application-label full-width textarea"><div class="text">What has been your favorite project or proudest accomplishment? Why?</div></div><div class="application-field full-width"><textarea id="target" class="card-field-input" name="cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][field0]"></textarea></div></div></li></ul>';

  const wrappers: [name: string, html: string, want: string][] = [
    ['Lever custom dropdown', LEVER_DROPDOWN, 'Please tell us how you heard about this opportunity.'],
    ['Lever custom text area', LEVER_TEXTAREA, 'What has been your favorite project or proudest accomplishment? Why?'],
    ['text in the block that holds only this control', '<div class="field"><div class="title">Email *</div><input id="target"></div>', 'Email'],
    [
      'four levels up, and no further',
      '<div><p>Phone</p><div><div><div><input id="target"></div></div></div></div>',
      'Phone',
    ],
    // The nearest block that says something is the one that counts.
    [
      'the nearest text wins over text further out',
      '<section><h2>Your details</h2><div><span>City</span><input id="target"></div></section>',
      'City',
    ],
    // Not a label.
    ['five levels up is too far', '<div><p>Phone</p><div><div><div><div><input id="target"></div></div></div></div></div>', ''],
    ['text after the control (a hint, an error)', '<div class="field"><input id="target"><p class="hint">We will never share your e-mail.</p></div>', ''],
    ['text in a block shared with another field', '<div class="row"><span>Name</span><input id="first"><input id="target"></div>', ''],
    ['text beyond a block shared with another field', '<div><p>Name</p><div class="row"><input id="first"><div><input id="target"></div></div></div>', ''],
    ['the text of a button', '<div class="field"><button type="button">Help</button><input id="target"></div>', ''],
    ['hidden text', '<div class="field"><span hidden>Email</span><span aria-hidden="true">Email</span><input id="target"></div>', ''],
    ['text directly inside the form', '<form>Email <input id="target"></form>', ''],
    ['text directly inside the page', 'Email <input id="target">', ''],
    // A real label always comes first.
    ['a label element wins', '<div class="field"><p>Contact</p><label for="target">Email</label><input id="target"></div>', 'Email'],
    ['aria-label wins', '<div class="field"><p>Contact</p><input id="target" aria-label="Email"></div>', 'Email'],
  ];
  it.each(wrappers)('%s', (_name, html, want) => {
    expect(labelOf(html)).toBe(want);
  });

  it('reads the legend when the control sits alone in a fieldset', () => {
    const got = described('<fieldset><legend>Email <span aria-hidden="true">*</span></legend><p>We reply within a week.</p><input id="target"></fieldset>');

    expect([got.label, got.groupLabel]).toEqual(['Email', 'Email']);
  });
});

describe('describeControl: the question of a radio group', () => {
  // Verbatim from a live Lever form: no fieldset, no ARIA; the question is a block beside the options.
  const LEVER_RADIOS =
    '<ul><li class="application-question custom-question"><div><div class="application-label full-width multiple-choice"><div class="text">Are you legally authorized to work in the country for which you are applying?<span class="required">✱</span></div></div><div class="application-field full-width required-field"><ul data-qa="multiple-choice"><li><label><input type="radio" name="cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]" value="Yes" required="required" /><span class="application-answer-alternative">Yes</span></label></li><li><label><input type="radio" name="cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]" value="No" required="required" /><span class="application-answer-alternative">No</span></label></li></ul></div></div></li></ul>';

  // Shaped like Ashby's radios as its bundle renders them: the question is a label for an id no
  // control has; each option's text is a label[for] beside an invisible input.
  const ASHBY_RADIOS = `
    <div class="ashby-application-form-field-entry" data-field-path="6f1c2f0e">
      <fieldset>
        <label class="ashby-application-form-question-title" for="6f1c2f0e">Are you authorized to work in the United States?</label>
        <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-0" name="6f1c2f0e"><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-0">Yes</label></div>
        <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-1" name="6f1c2f0e"><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-1">No</label></div>
      </fieldset>
    </div>`;

  // Lever's voluntary questions: one outer <label> around the question and every option.
  const LEVER_NESTED_LABELS =
    '<label><div class="application-label">Race</div><ul><li><label><input type="radio" name="eeo[race]" value="Asian"><span>Asian</span></label></li><li><label><input type="radio" name="eeo[race]" value="White"><span>White</span></label></li></ul></label>';

  const yesNo = (name: string): string =>
    `<label><input type="radio" name="${name}" value="1"> Yes</label><label><input type="radio" name="${name}" value="0"> No</label>`;

  const questions: [name: string, html: string, want: string][] = [
    ['Lever', LEVER_RADIOS, 'Are you legally authorized to work in the country for which you are applying?'],
    ['Ashby', ASHBY_RADIOS, 'Are you authorized to work in the United States?'],
    ['Lever, one label around question and options', LEVER_NESTED_LABELS, 'Race'],
    ['the legend of the fieldset around the group', `<fieldset><legend>Do you require visa sponsorship? <span aria-hidden="true">*</span></legend>${yesNo('q')}</fieldset>`, 'Do you require visa sponsorship?'],
    ['a radiogroup named with aria-labelledby', `<p id="question">Veteran status</p><div role="radiogroup" aria-labelledby="question">${yesNo('q')}</div>`, 'Veteran status'],
    ['a radiogroup named with aria-label', `<div role="radiogroup" aria-label="Gender (optional)">${yesNo('q')}</div>`, 'Gender'],
    ['text in front of the options, in their own block', `<div class="question"><p>Are you over 18?</p><div class="options">${yesNo('q')}</div></div>`, 'Are you over 18?'],
    // Never an option, whatever the markup.
    ['option text in front of each input is not the question', '<div class="question"><label>Yes <input type="radio" name="q"></label><label>No <input type="radio" name="q"></label></div>', ''],
    ['option text without labels is not the question', '<div class="question"><div class="choice"><span>Yes</span><input type="radio" name="q"></div><div class="choice"><span>No</span><input type="radio" name="q"></div></div>', ''],
    ['an option label written before its input is not the question', '<div><label for="y">Yes</label><input type="radio" id="y" name="q"><label for="n">No</label><input type="radio" id="n" name="q"></div>', ''],
    ['the aria-label of an option is not the question', '<div><input type="radio" name="q" aria-label="Yes"><input type="radio" name="q" aria-label="No"></div>', ''],
    ['text after the options is not the question', `<div class="question">${yesNo('q')}<p>Are you over 18?</p></div>`, ''],
    ['a heading shared with another field is not the question', `<section><h3>Eligibility</h3><input id="other"><div class="options">${yesNo('q')}</div></section>`, ''],
    ['bare radios', '<input type="radio" name="q" value="1"><input type="radio" name="q" value="0">', ''],
  ];
  it.each(questions)('%s', (_name, html, want) => {
    expect(labelOf(html, 'input[type="radio"]')).toBe(want);
  });

  it('gives a radio group whose legend is its question the same label and group label', () => {
    // lib/classify.ts relies on this to judge such a question once, not twice.
    const got = described(
      `<fieldset><legend>Are you authorized to work in the United States? (e.g. you are a citizen)</legend><p>Select one.</p>${yesNo('q')}</fieldset>`,
      'input[type="radio"]',
    );

    expect(got.label).toBe('Are you authorized to work in the United States? (e.g. you are a citizen)');
    expect(got.groupLabel).toBe(got.label);
  });
});

describe('describeControl: the group a control sits in', () => {
  // Verbatim from a live Greenhouse form: the dial-code picker and the number share a fieldset.
  const GREENHOUSE_PHONE =
    '<div><fieldset class="phone-input"><legend class="visually-hidden">Phone</legend><div class="phone-input__country"><div class="select"><div class="select__container"><label id="country-label" for="country" class="label select__label">Country</label><div class="select-shell remix-css-b62m3t-container"><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-country-placeholder"></div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" autoComplete="off" id="country" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-labelledby="country-label" aria-required="false" role="combobox" value=""/></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"></button></div></div></div></div></div></div></div><div class="phone-input__phone"><div class="text-input-wrapper"><div class="input-wrapper"><label id="phone-label" for="phone" class="label label">Phone</label><input id="phone" class="input input__single-line" aria-label="Phone" aria-required="false" type="tel" maxLength="255"/></div></div></div></fieldset></div>';

  // Verbatim from a live Greenhouse form: the upload widget is a group named by the visible title.
  const greenhouseUpload = (id: string, title: string, required: boolean): string =>
    `<div class="field-wrapper"><div role="group" aria-labelledby="upload-label-${id}" aria-required="${required}" class="file-upload" data-allow-s3="false"><div id="upload-label-${id}" class="label upload-label">${title}</div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="${id}">Attach</label><input id="${id}" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="${id}-text">Enter manually</button><label class="visually-hidden" for="${id}_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>`;

  it('Greenhouse: the dial-code picker and the number are both in the group "Phone"', () => {
    mount(GREENHOUSE_PHONE);

    const picker = describeControl(controlAt('#country'));
    const number = describeControl(controlAt('#phone'));

    expect([picker.control, picker.label, picker.groupLabel]).toEqual(['combobox', 'Country', 'Phone']);
    expect([number.control, number.label, number.groupLabel]).toEqual(['text', 'Phone', 'Phone']);
  });

  it('Greenhouse: an upload is labelled "Attach" and sits in a group named for the document', () => {
    mount(greenhouseUpload('resume', 'Resume/CV<span class="required">*</span>', true) + greenhouseUpload('cover_letter', 'Cover Letter', false));

    const resume = describeControl(controlAt('#resume'));
    const letter = describeControl(controlAt('#cover_letter'));

    expect([resume.label, resume.groupLabel, resume.required]).toEqual(['Attach', 'Resume/CV', true]);
    expect([letter.label, letter.groupLabel, letter.required]).toEqual(['Attach', 'Cover Letter', false]);
  });

  const input = '<input id="target">';
  const groups: [name: string, html: string, want: string][] = [
    ['the legend of the fieldset', `<fieldset><legend>Address</legend><label>City ${input}</label><input id="zip"></fieldset>`, 'Address'],
    ['a legend is cleaned like a label', `<fieldset><legend>  Emergency\n contact <span aria-hidden="true">*</span>: </legend>${input}<input id="b"></fieldset>`, 'Emergency contact'],
    ['deep inside the fieldset', `<fieldset><legend>Education</legend><div><p><span>${input}</span></p></div><input id="b"></fieldset>`, 'Education'],
    ['role=group named with aria-label', `<div role="group" aria-label="References">${input}<input id="b"></div>`, 'References'],
    ['role=group named with aria-labelledby', `<h3 id="heading">Preferred name</h3><div role="group" aria-labelledby="heading">${input}<input id="b"></div>`, 'Preferred name'],
    ['role in capitals, with a fallback role', `<div role="GROUP region" aria-label="Phone">${input}<input id="b"></div>`, 'Phone'],
    ['a fieldset named with aria-labelledby rather than its legend', `<span id="name">From aria</span><fieldset aria-labelledby="name"><legend>From legend</legend>${input}<input id="b"></fieldset>`, 'From aria'],
    ['the closest group wins', `<fieldset><legend>Outer</legend><fieldset><legend>Inner</legend>${input}<input id="b"></fieldset></fieldset>`, 'Inner'],
    ['a group without a name is passed over', `<fieldset><legend>Outer</legend><fieldset>${input}<input id="b"></fieldset><div role="group"><input id="c"></div></fieldset>`, 'Outer'],
    ['only the first legend names a fieldset', `<fieldset><legend>First</legend><legend>Second</legend>${input}<input id="b"></fieldset>`, 'First'],
    // No group.
    ['no group at all', `<form><div class="section"><h2>Contact</h2>${input}</div></form>`, ''],
    ['a fieldset without a legend', `<fieldset>${input}<input id="b"></fieldset>`, ''],
    ['a legend that is not the fieldset\'s own', `<fieldset><div><legend>Address</legend></div>${input}<input id="b"></fieldset>`, ''],
    ['a group next to the control', `<fieldset><legend>Address</legend><input id="b"></fieldset>${input}`, ''],
    ['other roles', `<div role="region" aria-label="Application">${input}</div>`, ''],
    ['a class named group', `<div class="group" aria-label="Phone">${input}</div>`, ''],
  ];
  it.each(groups)('%s', (_name, html, want) => {
    expect(described(html).groupLabel).toBe(want);
  });

  it('looks past the top of a shadow tree for the group', () => {
    mount('<fieldset><legend>Emergency contact</legend><div id="host"></div></fieldset>');
    const root = find('#host').attachShadow({ mode: 'open' });
    root.innerHTML = '<label>Phone <input id="inside"></label>';
    const inside = root.getElementById('inside');
    const control = collectControls(document).find((candidate) => candidate.el === inside);
    if (control === undefined) throw new Error('collectControls did not return the input in the shadow tree');

    expect(describeControl(control).groupLabel).toBe('Emergency contact');
  });
});

describe('describeControl: required', () => {
  const groups: [name: string, html: string, want: boolean][] = [
    // Lever marks every radio of a required question.
    ['every radio required', '<input type="radio" name="q" required><input type="radio" name="q" required>', true],
    // To the browser one required radio makes the whole group required.
    ['only the last radio required', '<input type="radio" name="q"><input type="radio" name="q" required>', true],
    ['a radiogroup marked aria-required', '<div role="radiogroup" aria-required="true"><input type="radio" name="q"><input type="radio" name="q"></div>', true],
    ['no radio required', '<input type="radio" name="q"><input type="radio" name="q">', false],
    ['a radiogroup marked aria-required="false"', '<div role="radiogroup" aria-required="false"><input type="radio" name="q"><input type="radio" name="q"></div>', false],
    // A group that holds other fields too does not speak for this one.
    [
      'a required mark on a group shared with other fields',
      '<div role="group" aria-required="true"><input id="other"><input type="radio" name="q"><input type="radio" name="q"></div>',
      false,
    ],
  ];
  it.each(groups)('%s', (_name, html, want) => {
    expect(described(html, 'input[type="radio"]').required).toBe(want);
  });
});

describe('describeControl: the options of a dropdown', () => {
  it('lists every option with its text, value and whether it can be chosen, in page order', () => {
    const got = described(`
      <select id="target" name="eeo[gender]">
        <option value="">Select ...</option>
        <option value="Male">Male</option>
        <option value="Female" disabled>Female</option>
        <option>Decline to self-identify</option>
      </select>`);

    expect(got.options).toEqual([
      { label: 'Select ...', value: '', disabled: false },
      { label: 'Male', value: 'Male', disabled: false },
      { label: 'Female', value: 'Female', disabled: true },
      // no value attribute: the value is '' here, whatever the browser would submit
      { label: 'Decline to self-identify', value: '', disabled: false },
    ]);
  });

  it('keeps the positions of the page, groups included', () => {
    const got = described(`
      <select id="target">
        <option value="">Choose…</option>
        <optgroup label="Americas"><option value="us">United States</option><option value="ca">Canada</option></optgroup>
        <optgroup label="Not hiring" disabled><option value="aq">Antarctica</option></optgroup>
        <option value="other">Other</option>
      </select>`);

    expect(got.options.map((option) => [option.label, option.disabled])).toEqual([
      ['Choose…', false],
      ['United States', false],
      ['Canada', false],
      ['Antarctica', true],
      ['Other', false],
    ]);
    expect(got.options).toHaveLength(find<HTMLSelectElement>('#target').options.length);
  });

  const texts: [name: string, option: string, want: string][] = [
    ['white space is collapsed', '<option value="1">  Yes,\n   I am   authorized </option>', 'Yes, I am authorized'],
    ['the label attribute is what the browser shows', '<option value="1" label="Yes">internal text</option>', 'Yes'],
    ['an empty label attribute shows the text', '<option value="1" label="">Yes</option>', 'Yes'],
    ['markers are part of an option', '<option value="1">* Other (please specify):</option>', '* Other (please specify):'],
    ['an option without text', '<option value="1"></option>', ''],
  ];
  it.each(texts)('option text: %s', (_name, option, want) => {
    expect(described(`<select id="target">${option}</select>`).options.map((entry) => entry.label)).toEqual([want]);
  });

  it('gives no options for controls that offer none', () => {
    const none = ['<input id="target">', '<input id="target" role="combobox">', '<textarea id="target"></textarea>', '<input id="target" type="file">'];

    expect(none.map((html) => described(html).options)).toEqual([[], [], [], []]);
  });

  it('reads a text box with a datalist as a text box: the suggestions are not its options', () => {
    const got = described('<input id="target" list="schools"><datalist id="schools"><option value="Analytical Engine University"></datalist>');

    expect(got.options).toEqual([]);
  });
});

describe('describeControl: the options of a radio group', () => {
  const texts = (html: string): string[] => described(html, 'input[type="radio"]').options.map((option) => option.label);

  it('Lever: each option is a label around its radio', () => {
    const got = described(
      '<ul data-qa="multiple-choice"><li><label><input type="radio" name="q" value="Yes" required="required" /><span class="application-answer-alternative">Yes</span></label></li><li><label><input type="radio" name="q" value="No" required="required" disabled /><span class="application-answer-alternative">No</span></label></li></ul>',
      'input[type="radio"]',
    );

    expect(got.options).toEqual([
      { label: 'Yes', value: 'Yes', disabled: false },
      { label: 'No', value: 'No', disabled: true },
    ]);
  });

  it('Ashby: each option is a label[for] beside its radio, and no radio has a value', () => {
    const got = described(
      `<fieldset><label class="ashby-application-form-question-title" for="6f1c2f0e">Are you authorized to work in the United States?</label>
       <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-0" name="q"><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-0">Yes</label></div>
       <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-1" name="q"><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-1">No</label></div></fieldset>`,
      'input[type="radio"]',
    );

    expect(got.options).toEqual([
      { label: 'Yes', value: '', disabled: false },
      { label: 'No', value: '', disabled: false },
    ]);
  });

  const options: [name: string, html: string, want: string[]][] = [
    ['text on both sides of the radio belongs to the option', '<label>Yes <input type="radio" name="q"> – I am authorized</label><label>No <input type="radio" name="q"></label>', ['Yes – I am authorized', 'No']],
    ['a styled wrapper without a label', '<div class="choice"><input type="radio" name="q"><span class="dot"></span><span>Yes</span></div><div class="choice"><input type="radio" name="q"><span class="dot"></span><span>No</span></div>', ['Yes', 'No']],
    ['aria-label on the radio', '<input type="radio" name="q" aria-label="Yes"><input type="radio" name="q" aria-label=" No ">', ['Yes', 'No']],
    ['aria-labelledby on the radio', '<span id="a">Yes</span><input type="radio" name="q" aria-labelledby="a"><span id="b">No</span><input type="radio" name="q" aria-labelledby="b">', ['Yes', 'No']],
    // Lever's nested labels: the outer label names the question, never the first option.
    [
      'the label around the whole question is no option',
      '<label><div class="application-label">Race</div><ul><li><label><input type="radio" name="q" value="A"><span>Asian</span></label></li><li><label><input type="radio" name="q" value="B"><span>White</span></label></li></ul></label>',
      ['Asian', 'White'],
    ],
    ['white space is collapsed', '<label><input type="radio" name="q">  Yes,\n  I am   authorized </label><label><input type="radio" name="q"> No</label>', ['Yes, I am authorized', 'No']],
    ['hidden text and icons are not option text', '<label><input type="radio" name="q"><svg><title>Tick</title></svg> Yes <span hidden>selected</span></label><label><input type="radio" name="q"> No<span aria-hidden="true">✓</span></label>', ['Yes', 'No']],
    // An option nobody can read stays unreadable: its value is never shown in its place.
    ['a radio with nothing readable around it', '<input type="radio" name="q" value="yes"><input type="radio" name="q" value="no">', ['', '']],
    ['radios that share one block of text', '<div>Pick one <input type="radio" name="q" value="1"><input type="radio" name="q" value="2"></div>', ['', '']],
  ];
  it.each(options)('%s', (_name, html, want) => {
    expect(texts(html)).toEqual(want);
  });

  it('lists the options in the order of the group, so that a position means the same radio to the fill', () => {
    mount('<label><input type="radio" name="q" value="first"> One</label><input id="between"><label><input type="radio" name="q" value="second"> Two</label>');
    const control = controlAt('input[type="radio"]');
    if (control.control !== 'radio') throw new Error('not a radio group');

    expect(describeControl(control).options.map((option) => option.value)).toEqual(control.radios.map((radio) => radio.value));
  });
});

describe('isEmpty: text boxes, text areas and comboboxes', () => {
  const cases: [name: string, html: string, want: boolean][] = [
    ['an empty text box', '<input id="target">', true],
    ['only spaces', '<input id="target" value="   ">', true],
    ['a placeholder is not an answer', '<input id="target" placeholder="you@example.com">', true],
    ['typed text', '<input id="target" value="Ada">', false],
    ['an empty e-mail box', '<input id="target" type="email">', true],
    ['a month', '<input id="target" type="month" value="2027-05">', false],
    ['an empty text area', '<textarea id="target"></textarea>', true],
    ['a text area of line breaks', '<textarea id="target">\n\n  </textarea>', true],
    ['a text area with text', '<textarea id="target">Analytical Engine, 1843</textarea>', false],
    ['an empty combobox', '<input id="target" role="combobox" aria-autocomplete="list" value="">', true],
    // Ashby's location box holds the chosen place as its text.
    ['a combobox holding text', '<input id="target" role="combobox" aria-autocomplete="list" value="London, United Kingdom">', false],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    mount(html);

    expect(isEmpty(controlAt('#target'))).toBe(want);
  });

  it('goes by what the box holds now, not by the value attribute it started with', () => {
    mount('<input id="target" value="Ada"><input id="other">');
    find<HTMLInputElement>('#target').value = '';
    find<HTMLInputElement>('#other').value = 'Lovelace';

    expect([isEmpty(controlAt('#target')), isEmpty(controlAt('#other'))]).toEqual([true, false]);
  });

  // Shaped like Greenhouse's React-Select: the search box stays empty for ever; the answer is a
  // block beside it, which is there only once something has been chosen.
  const reactSelect = (shown: string): string =>
    `<div class="select"><div class="select__container"><label id="country-label" for="target" class="label select__label">Country</label><div class="select-shell"><div class="select__control"><div class="select__value-container">${shown}<div class="select__input-container" data-value=""><input class="select__input" id="target" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-labelledby="country-label" role="combobox" value=""/></div></div><div class="select__indicators"><button type="button" class="icon-button" aria-label="Toggle flyout" tabindex="-1"></button></div></div></div></div></div>`;

  const dropdowns: [name: string, shown: string, want: boolean][] = [
    ['nothing chosen: only the placeholder is shown', '<div class="select__placeholder" id="react-select-country-placeholder">Select...</div>', true],
    ['nothing chosen and no placeholder', '', true],
    ['one answer chosen', '<div class="select__single-value">United States</div>', false],
    ['several answers chosen', '<div class="select__multi-value"><div class="select__multi-value__label">English</div></div>', false],
    ['an answer block that says nothing', '<div class="select__single-value">  </div>', true],
  ];
  it.each(dropdowns)('a custom dropdown with %s', (_name, shown, want) => {
    mount(reactSelect(shown));

    expect(isEmpty(controlAt('#target'))).toBe(want);
  });

  it('does not take the answer of a neighbouring dropdown for its own', () => {
    mount(`<div class="row"><div class="select__single-value">Canada</div><input id="other">${reactSelect('')}</div>`);

    expect(isEmpty(controlAt('#target'))).toBe(true);
  });
});

describe('isEmpty: dropdowns', () => {
  const select = (options: string, attributes = ''): string => `<select id="target" ${attributes}>${options}</select>`;

  const cases: [name: string, html: string, want: boolean][] = [
    // Unanswered.
    ['the placeholder of a Lever dropdown is selected', select('<option value="">Select...</option><option value="Male">Male</option>'), true],
    ['an option with an empty value is selected', select('<option value="Male">Male</option><option value="" selected>No answer</option>'), true],
    ['a disabled option is selected', select('<option value="x" disabled selected>Choose a country</option><option value="us">United States</option>'), true],
    ['an option in a disabled group is selected', select('<optgroup label="Old" disabled><option value="x" selected>Legacy</option></optgroup><option value="us">United States</option>'), true],
    ['the first option reads "Select…" and has a value', select('<option value="0">Select…</option><option value="1">Yes</option>'), true],
    ['the first option reads "Please select"', select('<option value="-1">Please select</option><option value="1">Yes</option>'), true],
    ['the first option reads "Choose..."', select('<option value="none">Choose...</option><option value="1">Yes</option>'), true],
    ['the first option reads "-- Select One --"', select('<option value="none">-- Select One --</option><option value="1">Yes</option>'), true],
    ['the first option reads "Pick one"', select('<option value="none">Pick one</option><option value="1">Yes</option>'), true],
    ['the first option is dashes', select('<option value="none">---</option><option value="1">Yes</option>'), true],
    ['the first option has no text', select('<option></option><option value="1">Yes</option>'), true],
    ['no options at all', select(''), true],
    ['a list for several answers with none chosen', select('<option>Mathematics</option><option>Programming</option>', 'multiple'), true],
    // Answered.
    ['an answer is selected', select('<option value="">Select...</option><option value="Male" selected>Male</option>'), false],
    ['the first option is a real answer', select('<option value="us">United States</option><option value="ca">Canada</option>'), false],
    ['the first option declines, which is an answer', select('<option value="d">Choose not to disclose</option><option value="m">Male</option>'), false],
    ['a "Select…" option further down is an answer of its own', select('<option value="a">Yes</option><option value="b" selected>Select all that apply</option>'), false],
    ['an option without a value attribute counts by its text', select('<option>United States</option><option>Canada</option>'), false],
    ['a list for several answers with one chosen', select('<option>Mathematics</option><option selected>Programming</option>', 'multiple'), false],
    [
      'a list for several answers with a placeholder and a real answer chosen',
      select('<option value="" selected>Select...</option><option selected>Programming</option>', 'multiple'),
      false,
    ],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    mount(html);

    expect(isEmpty(controlAt('#target'))).toBe(want);
  });

  it('goes by the choice made on the page, not by the selected attribute', () => {
    mount(select('<option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option>'));
    find<HTMLSelectElement>('#target').selectedIndex = 2;

    expect(isEmpty(controlAt('#target'))).toBe(false);
  });
});

describe('isEmpty: radio groups', () => {
  const cases: [name: string, html: string, want: boolean][] = [
    ['none chosen', '<input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No">', true],
    ['the first chosen', '<input type="radio" name="q" value="Yes" checked><input type="radio" name="q" value="No">', false],
    ['the last chosen', '<input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No" checked>', false],
    ['a chosen option that has since been disabled still answers', '<input type="radio" name="q" value="Yes" checked disabled><input type="radio" name="q" value="No">', false],
    ['a single radio, not chosen', '<input type="radio" name="q" value="Yes">', true],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    mount(html);

    expect(isEmpty(controlAt('input[type="radio"]'))).toBe(want);
  });

  it('goes by the choice made on the page, not by the checked attribute', () => {
    mount('<input type="radio" name="q" value="Yes"><input type="radio" id="no" name="q" value="No">');
    find<HTMLInputElement>('#no').checked = true;

    expect(isEmpty(controlAt('input[type="radio"]'))).toBe(false);
  });
});

describe('isEmpty: file inputs', () => {
  /** jsdom will not put a file into an input, so the input is told what it holds. */
  function holdFiles(input: HTMLInputElement, names: string[]): void {
    const files = names.map((name) => new File(['%PDF-1.7'], name, { type: 'application/pdf' }));
    Object.defineProperty(input, 'files', { configurable: true, value: files });
  }

  // Verbatim from a live Lever form (SVG icons left out); `filename` is where Lever prints the name.
  const leverUpload = (filename: string): string =>
    `<ul><li class="application-question resume"><label><div class="application-label">Resume/CV <span class="required">✱</span></div><div class="application-field"><a href="#" class="postings-btn template-btn-utility visible-resume-upload"><span class="filename">${filename}</span><span class="default-label">ATTACH RESUME/CV</span><input class="application-file-input invisible-resume-upload" data-qa="input-resume" id="target" name="resume" tabindex="-1" type="file"></a><span class="resume-upload-failure"><div class="resume-upload-label">Couldn't auto-read resume.</div></span><span class="resume-upload-working"><div class="loading-indicator"></div><div class="resume-upload-label">Analyzing resume...</div></span><span class="resume-upload-success"><div class="loading-indicator completed"></div><div class="resume-upload-label">Success!</div></span></div></label><span class="resume-upload-oversize"><p class="error-message">File exceeds the maximum upload size of <b>100MB</b>. Please try a smaller size.</p></span></li></ul>`;

  // Verbatim from a live Greenhouse form, before anything is attached.
  const GREENHOUSE_UPLOAD =
    '<div class="field-wrapper"><div role="group" aria-labelledby="upload-label-resume" aria-required="true" class="file-upload" data-allow-s3="false"><div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="target">Attach</label><input id="target" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="resume-text">Enter manually</button><label class="visually-hidden" for="resume_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>';

  it('is empty when the input holds no file and nothing beside it shows one', () => {
    const empties = ['<input id="target" type="file">', leverUpload(''), GREENHOUSE_UPLOAD];

    expect(
      empties.map((html) => {
        mount(html);
        return isEmpty(controlAt('#target'));
      }),
    ).toEqual([true, true, true]);
  });

  it('is answered when the input holds a file', () => {
    mount('<input id="target" type="file">');
    holdFiles(find<HTMLInputElement>('#target'), ['Ada-Lovelace-Resume.pdf']);

    expect(isEmpty(controlAt('#target'))).toBe(false);
  });

  // Sites upload a file the moment it is chosen and then clear the input, so the input alone
  // cannot say that a résumé is already attached. The widget around it can.
  const attached: [name: string, html: string][] = [
    ['Lever prints the file name beside the input', leverUpload('Ada-Lovelace-Resume.pdf')],
    ['a file name with several dots and spaces', '<div class="upload"><span>Ada Lovelace - CV (final).v2.docx</span><input id="target" type="file"></div>'],
    ['a "Remove" button', '<div class="upload"><input id="target" type="file"><button type="button">Remove</button></div>'],
    ['a "Remove file" button named with aria-label', '<div class="upload"><input id="target" type="file"><button type="button" aria-label="Remove file">×</button></div>'],
    ['a "Replace" link', '<div class="upload"><input id="target" type="file"><a href="#">Replace</a></div>'],
    ['a "Delete" control with role=button', '<div class="upload"><input id="target" type="file"><span role="button">Delete</span></div>'],
    ['a "Change file" button in the label of the input', '<label>Resume <input id="target" type="file"><button type="button">Change file</button></label>'],
  ];
  it.each(attached)('is answered when %s', (_name, html) => {
    mount(html);

    expect(isEmpty(controlAt('#target'))).toBe(false);
  });

  // What an empty upload widget says about itself must not be taken for a file.
  const stillEmpty: [name: string, html: string][] = [
    ['the accepted types are listed', '<div class="upload"><input id="target" type="file"><p>Accepted file types: pdf, doc, docx, txt, rtf</p></div>'],
    ['the accepted extensions are listed', '<div class="upload"><input id="target" type="file"><p>Allowed: .pdf, .doc, .docx (max. 2.5MB)</p></div>'],
    ['the upload buttons of an empty widget', '<div class="upload"><button type="button">Attach</button><button type="button">Dropbox</button><button type="button">Choose file</button><input id="target" type="file"></div>'],
    ['a file name that belongs to another field', '<div class="row"><div><span>Ada-Lovelace-Letter.pdf</span><input type="file" name="letter"></div><div><input id="target" type="file"></div></div>'],
    ['a "Remove" button that belongs to another field', '<div class="row"><input type="file" name="letter"><button type="button">Remove</button><div><input id="target" type="file"></div></div>'],
    ['a hidden file name left in the page', '<div class="upload"><span hidden>Ada-Lovelace-Resume.pdf</span><input id="target" type="file"></div>'],
    ['a hidden "Remove" button', '<div class="upload"><button type="button" hidden>Remove</button><div aria-hidden="true"><button type="button">Replace</button></div><input id="target" type="file"></div>'],
    ['a word that only starts like "change"', '<div class="upload"><button type="button">Changelog</button><a href="/help">Clearance levels</a><input id="target" type="file"></div>'],
    ['a button whose form value, not its caption, says "remove"', '<div class="upload"><button type="button" value="remove">Attach</button><input id="target" type="file"></div>'],
  ];
  it.each(stillEmpty)('is still empty when %s', (_name, html) => {
    mount(html);

    expect(isEmpty(controlAt('#target'))).toBe(true);
  });
});
