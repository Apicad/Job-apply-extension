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
