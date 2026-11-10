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
    // A control may name itself beside its label (aria-labelledby="label self"), so that a screen
    // reader also reads the chosen value. What a control holds is never label text.
    [
      'a dropdown that names itself does not put its options into the label',
      '<span id="q">Gender</span><select id="target" aria-labelledby="q target"><option value="">Select ...</option><option>Male</option><option>Female</option></select>',
      'Gender',
    ],
    [
      'a textarea that names itself does not put its text into the label',
      '<span id="q">Cover letter</span><textarea id="target" aria-labelledby="q target">Dear team</textarea>',
      'Cover letter',
    ],
    [
      'a text box named by a neighbouring dropdown gets none of its options either',
      '<label for="unit">Unit</label><select id="unit"><option>Months</option><option>Years</option></select><span id="q">Notice period</span><input id="target" aria-labelledby="q unit">',
      'Notice period',
    ],
    [
      'nor the suggestions of a list it names',
      '<span id="q">School</span><datalist id="schools"><option>MIT</option><option>Stanford</option></datalist><input id="target" list="schools" aria-labelledby="q schools">',
      'School',
    ],
    ['a hidden element named by aria-labelledby still counts: it was asked for by name', '<span id="q" hidden>Preferred name</span><input id="target" aria-labelledby="q">', 'Preferred name'],
    ['so does a button', '<button id="q" type="button">Search schools</button><input id="target" aria-labelledby="q">', 'Search schools'],
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
    ['Legal name*:', 'Legal name'],
    ['Legal name:*', 'Legal name'],
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
    ['button text is not label text', '<label for="target">Photo <button type="button">Browse…</button></label><input id="target" type="file">', 'Photo'],
    ['role=button text is not label text', '<label>Photo <span role="button">Browse…</span><input id="target" type="file"></label>', 'Photo'],
    ['hidden text is not label text', '<label for="target">Email <span hidden>This field is required</span></label><input id="target">', 'Email'],
    ['text hidden from assistive technology is not label text', '<label for="target">Email <span aria-hidden="true">we never share it</span></label><input id="target">', 'Email'],
    ['the suggestions of a datalist are not label text', '<label>School <datalist id="schools"><option>MIT</option><option>Stanford</option></datalist><input id="target" list="schools"></label>', 'School'],
    ['a noscript notice is not label text', '<label for="target">Email <noscript><span>Enable JavaScript</span></noscript></label><input id="target">', 'Email'],
    ['script and style are not label text', '<label for="target">Email<style>.x{color:red}</style><script>var a = 1;</script></label><input id="target">', 'Email'],
    ['an icon title is not label text', '<label for="target"><svg><title>Envelope</title></svg> Email</label><input id="target">', 'Email'],
    ['another control inside the label is not label text', '<label for="target">Country code <textarea>notes</textarea></label><input id="target">', 'Country code'],
    ['the options of another dropdown inside the label are not label text', '<label for="target">Phone <select name="dial"><option>+1</option><option>+44</option></select></label><input id="target">', 'Phone'],
    // A link inside a label is ordinary text unless it wraps the control.
    ['a link in the label text stays', '<label for="target">Link to your <a href="/help">public portfolio</a> or site</label><input id="target">', 'Link to your public portfolio or site'],
    ['a link before the control stays too, as long as it does not wrap the control', '<label>Link to your <a href="/help">public portfolio</a> <input id="target"></label>', 'Link to your public portfolio'],
    // Floating labels put the text after the input.
    ['text after the control is used when nothing comes before it', '<label class="floating"><input id="target" placeholder=" "><span>Email address</span></label>', 'Email address'],
    ['blocks inside a label are separated by a space', '<label for="target"><div>Start</div><div>date</div></label><input id="target">', 'Start date'],
  ];
  it.each(labels)('%s', (_name, html, want) => {
    expect(labelOf(html)).toBe(want);
  });
});

describe('describeControl: groupLabel names the group a control sits in', () => {
  const groups: [name: string, html: string, want: string][] = [
    ['the legend of a fieldset', '<fieldset><legend>Home address</legend><label>Street <input id="target"></label><input name="city"></fieldset>', 'Home address'],
    // Verbatim shape from Greenhouse: the legend is visually hidden, the star is not part of the name.
    [
      'Greenhouse phone fieldset',
      '<fieldset class="phone-input"><legend class="visually-hidden">Phone</legend><div class="phone-input__country"><input id="country" role="combobox" aria-labelledby="country-label"></div><div class="phone-input__phone"><label for="target">Phone</label><input id="target" type="tel"></div></fieldset>',
      'Phone',
    ],
    ['a legend with a required marker', '<fieldset><legend>Gender <span class="required">*</span></legend><input id="target"></fieldset>', 'Gender'],
    ['role=group named by aria-labelledby', '<div role="group" aria-labelledby="g"><div id="g">Resume/CV<span class="required">*</span></div><input id="target"></div>', 'Resume/CV'],
    ['role=group named by aria-label', '<div role="group" aria-label="Education"><input id="target"></div>', 'Education'],
    ['role=radiogroup named by aria-labelledby', '<p id="q">Veteran status</p><div role="radiogroup" aria-labelledby="q"><input id="target"></div>', 'Veteran status'],
    ['a fieldset named by aria-label instead of a legend', '<fieldset aria-label="References"><input id="target"></fieldset>', 'References'],
    ['a legend wins over aria-label on the fieldset', '<fieldset aria-label="From aria-label"><legend>From legend</legend><input id="target"></fieldset>', 'From legend'],
    ['aria-labelledby wins over aria-label on a group', '<p id="g">From labelledby</p><div role="group" aria-labelledby="g" aria-label="From aria-label"><input id="target"></div>', 'From labelledby'],
    ['an empty legend falls through to aria-label', '<fieldset aria-label="References"><legend> </legend><input id="target"></fieldset>', 'References'],
    ['the nearest group wins', '<fieldset><legend>Voluntary Self-Identification</legend><div role="group" aria-label="Gender"><input id="target"></div></fieldset>', 'Gender'],
    // Shaped like Ashby: a fieldset without a legend names nothing, and we do not look further out.
    ['a nameless fieldset inside a named group', '<div role="group" aria-label="Application"><fieldset><input id="target"></fieldset></div>', ''],
    ['no group at all', '<div><label>Email <input id="target"></label></div>', ''],
    ['a legend of a nested fieldset is not the outer group\'s name', '<fieldset><input id="target"><fieldset><legend>Inner</legend><input name="inner"></fieldset></fieldset>', ''],
    ['other roles are not groups', '<div role="region" aria-label="Contact"><input id="target"></div>', ''],
    ['the form is not a group', '<form aria-label="Application"><input id="target"></form>', ''],
  ];
  it.each(groups)('%s', (_name, html, want) => {
    expect(described(html).groupLabel).toBe(want);
  });
});

describe('describeControl: the question, when the control has no label of its own', () => {
  const fallbacks: [name: string, html: string, want: string][] = [
    // (a) The name of its group, when the group holds nothing but this control.
    ['the legend of a fieldset around this one control', '<fieldset><legend>Date available</legend><input id="target" placeholder="MM/YYYY"></fieldset>', 'Date available'],
    ['a role=group around this one control', '<div role="group" aria-label="Portfolio link"><input id="target"></div>', 'Portfolio link'],
    // A legend over several controls is a section title, not the label of each of them.
    [
      'a legend over several controls names none of them',
      '<form><fieldset><legend>Date of birth</legend><input id="target" placeholder="DD"><input placeholder="MM"><input placeholder="YYYY"></fieldset></form>',
      '',
    ],
    // (b) The question title of a Lever or Ashby field wrapper. Verbatim from a live Lever form:
    [
      'Lever custom question: the text sits in a sibling of the dropdown',
      '<li class="application-question custom-question"><div><div class="application-label full-width dropdown"><div class="text">Please tell us how you heard about this opportunity.<span class="required">✱</span></div></div><div class="application-field full-width required-field"><div class="application-dropdown"><select id="target" name="cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]" required><option value="">Select...</option><option value="BuiltIn">BuiltIn</option><option value="LinkedIn">LinkedIn</option></select></div></div></div></li>',
      'Please tell us how you heard about this opportunity.',
    ],
    [
      'Lever custom question with a text box: the whole question, as written',
      '<li class="application-question custom-question"><div><div class="application-label full-width text"><div class="text">Preferred Name | What would you like us to call you?</div></div><div class="application-field full-width"><input id="target" class="card-field-input" type="text" placeholder="Type your response" value="" name="cards[a69a985a-eae9-4c14-90fb-b5a4b891523e][field1]" /></div></div></li>',
      'Preferred Name | What would you like us to call you?',
    ],
    [
      'Lever custom question with a textarea',
      '<li class="application-question custom-question"><div><div class="application-label full-width textarea"><div class="text">Why do you want to work at Palantir?</div></div><div class="application-field full-width"><textarea id="target" class="card-field-input" name="cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][field1]"></textarea></div></div></li>',
      'Why do you want to work at Palantir?',
    ],
    // Shaped like Ashby's location field: the label's for attribute points at nothing.
    [
      'Ashby: a question title whose for attribute matches no control',
      '<div class="ashby-application-form-field-entry _fieldEntry_1e3gg_28" data-field-path="_systemfield_location"><label class="ashby-application-form-question-title" for="_systemfield_location">Location</label><div><input id="target" placeholder="Start typing..." role="combobox" aria-autocomplete="list"></div></div>',
      'Location',
    ],
    // Shaped like an Ashby field with a description: the title alone is the question.
    [
      'Ashby: the description under the title is not part of the question',
      '<div class="ashby-application-form-field-entry" data-field-path="_systemfield_location"><label class="ashby-application-form-question-title" for="_systemfield_location">Location</label><div class="ashby-application-form-question-description"><p>The city you would work from.</p></div><div><input id="target" placeholder="Start typing..." role="combobox" aria-autocomplete="list"></div></div>',
      'Location',
    ],
    [
      'a Lever-style wrapper that holds two controls names neither',
      '<form><li class="application-question"><div class="application-label">Start and end</div><input id="target"><input name="end"></li></form>',
      '',
    ],
    // Helper inputs beside a control are not fields of their own. Lever keeps a hidden input next to
    // its location box; React-Select puts an invisible required-field helper next to each dropdown.
    [
      'a hidden input in the wrapper does not make it a shared wrapper',
      '<form><li class="application-question"><div class="application-label">Current location</div><div class="application-field"><input id="target" name="location"><input type="hidden" name="selectedLocation"></div></li></form>',
      'Current location',
    ],
    [
      'an aria-hidden helper input in the wrapper does not either',
      '<form><div class="field"><span>Country</span><div><input id="target" role="combobox"><input required="" tabindex="-1" aria-hidden="true" class="requiredInput" value=""></div></div></form>',
      'Country',
    ],
    [
      'a checkbox in the wrapper is another field, although it is never collected',
      '<form><div class="field"><span>Phone</span><input id="target" type="tel"><input type="checkbox" name="sms-opt-in"></div></form>',
      '',
    ],
    // A dropdown that is drawn, not native, is another field too. Shaped like Workday's country
    // dropdown: the label is the button's, and the text box beside the button holds the key of the
    // chosen option, which must never be typed into.
    [
      'Workday: the key box beside a drawn dropdown does not borrow the dropdown\'s label',
      '<div data-automation-id="formField-country"><label for="country--country">Country<abbr title="required">*</abbr></label><div><div><button aria-haspopup="listbox" type="button" value="" id="country--country" name="country">Select One</button><input id="target" type="text" value=""></div></div></div>',
      '',
    ],
    [
      'a text box beside a drawn dropdown (role=combobox) does not borrow its question',
      '<form><div class="field"><span>Country</span><div role="combobox" tabindex="0" aria-expanded="false"></div><input id="target" type="text" placeholder="Other"></div></form>',
      '',
    ],
    ['the same for role=COMBOBOX in capitals', '<form><div class="field"><span>Country</span><span role="COMBOBOX" tabindex="0"></span><input id="target" type="text"></div></form>', ''],
    [
      'the same for a box, not a button, with aria-haspopup=LISTBOX in capitals',
      '<form><div class="field"><span>Country</span><div aria-haspopup="LISTBOX" tabindex="0"></div><input id="target" type="text"></div></form>',
      '',
    ],
    // Not drawn dropdowns: the question is still found.
    ['a plain button in the wrapper is no field', '<form><div class="field"><span>Start date</span><button type="button" aria-label="Clear">×</button><input id="target"></div></form>', 'Start date'],
    [
      'a button that opens a calendar is no dropdown',
      '<form><div class="field"><span>Start date</span><button type="button" aria-haspopup="dialog" aria-label="Open calendar"></button><input id="target"></div></form>',
      'Start date',
    ],
    [
      'a button that opens a menu is no dropdown',
      '<form><div class="field"><span>Notice period</span><button type="button" aria-haspopup="true" aria-label="More"></button><input id="target"></div></form>',
      'Notice period',
    ],
    [
      'the list that the control itself opens is part of it',
      '<form><div class="field"><span>School</span><input id="target" role="combobox" aria-controls="schools"><ul id="schools" role="listbox"><li role="option">MIT</li></ul></div></form>',
      'School',
    ],
    [
      'a box with role=combobox around the control is its own skin (the older combobox pattern)',
      '<form><div class="field"><span>School</span><div role="combobox" aria-haspopup="listbox" aria-expanded="false"><input id="target" aria-autocomplete="list"></div></div></form>',
      'School',
    ],
    [
      'a drawn dropdown hidden from assistive technology is a helper, like a hidden input',
      '<form><div class="field"><span>Country code</span><div role="combobox" aria-hidden="true"></div><input id="target" type="tel"></div></form>',
      'Country code',
    ],
    // (c) Text close by: before the control, in a wrapper that holds only this control.
    ['text before the control in its own wrapper', '<form><div class="field"><div class="title">Desired salary</div><div><input id="target"></div></div></form>', 'Desired salary'],
    ['a table row', '<table><tr><td>Notice period</td><td><input id="target"></td></tr><tr><td>Other</td><td><input name="other"></td></tr></table>', 'Notice period'],
    // A button inside a label makes the label the button's; the text still names the field.
    ['a label that the browser gave to a button', '<form><label>Photo <button type="button">Browse…</button><input id="target" type="file"></label></form>', 'Photo'],
    ['the nearest wrapper with text wins', '<form><div class="section"><h3>Links</h3><div class="field"><span>GitHub</span><input id="target"></div></div></form>', 'GitHub'],
    ['up to four wrappers away', '<form><div><b>Referral code</b><div><div><div><input id="target"></div></div></div></div></form>', 'Referral code'],
    // Must not pick up text that may belong to something else.
    ['text five wrappers away is too far', '<form><div><b>Referral code</b><div><div><div><div><input id="target"></div></div></div></div></div></form>', ''],
    ['text after the control', '<form><div class="field"><input id="target"><span>Optional</span></div></form>', ''],
    ['a neighbour\'s label in a shared wrapper', '<form><div class="row"><span>First name</span><input name="first"><input id="target"></div></form>', ''],
    ['text of a wrapper shared with another control', '<form><div class="row"><p>Tell us about yourself</p><div><input id="target"></div><div><input name="other"></div></div></form>', ''],
    ['text directly inside the form', '<form>Apply now <input id="target"></form>', ''],
    ['text directly inside the page body', 'Apply now <input id="target">', ''],
    ['a heading before the form', '<h1>Software Engineer</h1><form><div><input id="target"></div></form>', ''],
    ['button text before the control', '<form><div class="field"><button type="button">Clear</button><input id="target"></div></form>', ''],
    ['more than 300 characters is a paragraph, not a label', `<form><div class="field"><p>${'word '.repeat(61)}</p><input id="target"></div></form>`, ''],
  ];
  it.each(fallbacks)('%s', (_name, html, want) => {
    expect(labelOf(html)).toBe(want);
  });

  it('takes exactly 300 characters but not 301', () => {
    const text300 = `${'abcdefghi '.repeat(29)}abcdefghij`;
    expect(text300.length).toBe(300);

    expect(labelOf(`<form><div><p>${text300}</p><input id="target"></div></form>`)).toBe(text300);
    expect(labelOf(`<form><div><p>${text300}k</p><input id="target"></div></form>`)).toBe('');
  });

  it('prefers the control\'s own label to every fallback', () => {
    const got = labelOf(
      '<fieldset><legend>Group</legend><li class="application-question"><div class="application-label">Wrapper</div><span>Nearby</span><label for="target">Own label</label><input id="target"></li></fieldset>',
    );

    expect(got).toBe('Own label');
  });

  it('prefers the group name to a wrapper title, and a wrapper title to nearby text', () => {
    const wrapper =
      '<li class="application-question"><div class="application-label">Wrapper title</div><span>Nearby text</span><input id="target"></li>';

    expect(labelOf(`<fieldset><legend>Group name</legend>${wrapper}</fieldset>`)).toBe('Group name');
    expect(labelOf(`<form>${wrapper}</form>`)).toBe('Wrapper title');
  });
});

describe('describeControl: fields inside web components are neighbours too', () => {
  // A component library (Shoelace, UI5…) keeps the real <input> of each field in a shadow tree.
  // Seen from the page, a fieldset around two such fields holds no input at all.

  /** Gives each element matching the selector an open shadow tree with this markup. */
  function shadows(selector: string, html: string): void {
    for (const host of body.querySelectorAll(selector)) host.attachShadow({ mode: 'open' }).innerHTML = html;
  }

  function labels(): string[] {
    return collectControls(document).map((control) => describeControl(control).label);
  }

  it('a legend over several component fields names none of them', () => {
    mount('<fieldset><legend>Name</legend><x-input placeholder="First"></x-input><x-input placeholder="Last"></x-input></fieldset>');
    shadows('x-input', '<div part="base"><input part="input"></div>');

    expect(labels()).toEqual(['', '']);
  });

  it('a legend around one component field is still its question', () => {
    mount('<fieldset><legend>Date available</legend><x-input></x-input></fieldset>');
    shadows('x-input', '<div part="base"><input part="input"></div>');

    expect(labels()).toEqual(['Date available']);
  });

  it('a group around one component radio question is still its question', () => {
    mount('<div role="radiogroup" aria-label="Gender"><x-radio-group></x-radio-group></div>');
    shadows('x-radio-group', '<label><input type="radio" name="g" value="m">Male</label><label><input type="radio" name="g" value="f">Female</label>');

    expect(labels()).toEqual(['Gender']);
  });

  it('a plain text box does not borrow the text beside a component field', () => {
    mount('<form><div class="row"><span>First name</span><x-input></x-input><input id="target"></div></form>');
    shadows('x-input', '<input part="input">');

    expect(describeControl(controlAt('#target')).label).toBe('');
  });

  it('a component two shadow trees deep counts as well', () => {
    mount('<form><div class="row"><span>First name</span><x-field></x-field><input id="target"></div></form>');
    shadows('x-field', '<x-input></x-input>');
    for (const host of body.querySelectorAll('x-field')) {
      host.shadowRoot?.querySelector('x-input')?.attachShadow({ mode: 'open' }).append(document.createElement('textarea'));
    }

    expect(describeControl(controlAt('#target')).label).toBe('');
  });

  it('a component without any field inside changes nothing', () => {
    mount('<form><div class="row"><span>First name</span><x-icon></x-icon><input id="target"></div></form>');
    shadows('x-icon', '<svg><title>Person</title></svg><button type="button">?</button>');

    expect(describeControl(controlAt('#target')).label).toBe('First name');
  });

  it('a drawn dropdown that is a component around the control is its own skin', () => {
    mount('<fieldset><legend>School</legend><x-combobox role="combobox"></x-combobox></fieldset>');
    shadows('x-combobox', '<input aria-autocomplete="list">');

    expect(labels()).toEqual(['School']);
  });
});

describe('describeControl: the options of a dropdown, index-aligned with the DOM', () => {
  it('lists every option of a Lever dropdown, placeholder included', () => {
    const got = described(
      '<select id="target" name="cards[a6197d84][field0]" required><option value="">Select...</option><option value="Agency or Non-Palantir Recruiter">Agency or Non-Palantir Recruiter</option><option value="America\'s Job Exchange">America\'s Job Exchange</option><option value="BuiltIn">BuiltIn</option></select>',
    );

    expect(got.options).toEqual([
      { label: 'Select...', value: '', disabled: false },
      { label: 'Agency or Non-Palantir Recruiter', value: 'Agency or Non-Palantir Recruiter', disabled: false },
      { label: "America's Job Exchange", value: "America's Job Exchange", disabled: false },
      { label: 'BuiltIn', value: 'BuiltIn', disabled: false },
    ]);
  });

  it('keeps disabled and hidden options in place and marks the disabled ones', () => {
    // Ashby's placeholder is <option disabled hidden value="">.
    const got = described(`
      <select id="target">
        <option disabled hidden value=""></option>
        <option value="1">Yes</option>
        <option value="0" disabled>No (not available)</option>
        <optgroup label="Later" disabled><option value="2">Maybe</option></optgroup>
        <optgroup label="Other"><option value="3">Prefer not to say</option></optgroup>
      </select>`);

    expect(got.options).toEqual([
      { label: '', value: '', disabled: true },
      { label: 'Yes', value: '1', disabled: false },
      { label: 'No (not available)', value: '0', disabled: true },
      { label: 'Maybe', value: '2', disabled: true },
      { label: 'Prefer not to say', value: '3', disabled: false },
    ]);
  });

  const optionShapes: [name: string, option: string, want: { label: string; value: string; disabled: boolean }][] = [
    ['no value attribute: the value is reported as absent', '<option>United States</option>', { label: 'United States', value: '', disabled: false }],
    ['whitespace in the text is collapsed', '<option value="us">  United\n     States  </option>', { label: 'United States', value: 'us', disabled: false }],
    // The browser shows the label attribute instead of the text, so that is what the user sees.
    ['a label attribute replaces the text', '<option value="1" label="No">Yes</option>', { label: 'No', value: '1', disabled: false }],
    ['an empty label attribute does not', '<option value="1" label="">Yes</option>', { label: 'Yes', value: '1', disabled: false }],
    ['the value is not trimmed or changed', '<option value=" CA ">California</option>', { label: 'California', value: ' CA ', disabled: false }],
    ['a required marker is part of an option', '<option value="x">Other *</option>', { label: 'Other *', value: 'x', disabled: false }],
  ];
  it.each(optionShapes)('%s', (_name, option, want) => {
    expect(described(`<select id="target">${option}</select>`).options).toEqual([want]);
  });

  it('has one entry per option, at the index the select itself uses', () => {
    mount('<select id="target"><option>a</option><optgroup label="g"><option>b</option><option disabled>c</option></optgroup><option>d</option></select>');
    const select = find<HTMLSelectElement>('#target');

    const got = describeControl(controlAt('#target')).options.map((option) => option.label);

    expect(got).toEqual(Array.from(select.options).map((option) => option.text));
    expect(got).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gives no options for a text box, even one with a datalist', () => {
    const got = described('<input id="target" list="schools"><datalist id="schools"><option value="MIT"><option value="Stanford"></datalist>');

    expect(got.options).toEqual([]);
  });
});

describe('describeControl: a radio group is one question with one option per radio', () => {
  // Verbatim from a live Lever form.
  const LEVER_AUTHORIZED = `
    <li class="application-question custom-question"><div><div class="application-label full-width multiple-choice"><div class="text">Are you legally authorized to work in the country for which you are applying?<span class="required">✱</span></div></div><div class="application-field full-width required-field"><ul data-qa="multiple-choice"><li><label><input type="radio" name="cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]" value="Yes" required="required" /><span class="application-answer-alternative">Yes</span></label></li><li><label><input type="radio" name="cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]" value="No" required="required" /><span class="application-answer-alternative">No</span></label></li></ul></div></div></li>`;

  // Verbatim from the same form: a consent question that must never be mistaken for a yes/no answer.
  const LEVER_CONSENT = `
    <li class="application-question custom-question"><div><div class="application-label full-width multiple-choice"><div class="text">As part of our interview process, we may use AI notetakers to transcribe conversations for accuracy and efficiency. Please see our candidate privacy policy for more information on how we process your data. Your decision to opt in or out of this tooling will not impact your candidacy.<span class="required">✱</span></div></div><div class="application-field full-width required-field"><ul data-qa="multiple-choice"><li><label><input type="radio" name="cards[73796cde-fc01-4758-9002-c85155f3503d][field0]" value="Yes, I consent" required="required" /><span class="application-answer-alternative">Yes, I consent</span></label></li><li><label><input type="radio" name="cards[73796cde-fc01-4758-9002-c85155f3503d][field0]" value="No, I do not consent" required="required" /><span class="application-answer-alternative">No, I do not consent</span></label></li></ul></div></div></li>`;

  // The shape of Lever's EEO race question as quoted in the design review: one outer label around
  // the question and every option, and option labels that carry a description.
  const LEVER_RACE = `
    <li class="application-question"><label><div class="application-label multiple-choice">Race</div><div class="application-field"><ul>
      <li><label><input type="radio" name="eeo[race]" value="Hispanic or Latino"><span class="eeo-option-text">Hispanic or Latino</span><div class="eeo-option-description">A person of Cuban, Mexican, Puerto Rican, South or Central American, or other Spanish culture or origin regardless of race.</div></label></li>
      <li><label><input type="radio" name="eeo[race]" value="White (Not Hispanic or Latino)"><span class="eeo-option-text">White (Not Hispanic or Latino)</span><div class="eeo-option-description">A person having origins in any of the original peoples of Europe, the Middle East, or North Africa.</div></label></li>
      <li><label><input type="radio" name="eeo[race]" value="Decline to self-identify"><span class="eeo-option-text">Decline to self-identify</span></label></li>
    </ul></div></label></li>`;

  // Shaped like Ashby's radio question as its bundle renders it: a fieldset without a legend, a
  // question label whose for attribute names no element, and radios without a value attribute.
  const ASHBY_RADIOS = `
    <div class="ashby-application-form-field-entry _fieldEntry_1e3gg_28" data-field-path="6f1c2f0e-8f0a-4c56-9d57-3f0a5a1b2c3d" data-field-entry-id="form_6f1c2f0e">
      <fieldset class="_container_1v5e2_28">
        <label class="ashby-application-form-question-title _heading_101oc_53 _required_101oc_92" for="6f1c2f0e-8f0a-4c56-9d57-3f0a5a1b2c3d">Are you legally authorized to work in the United States?</label>
        <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-0" name="form_6f1c2f0e"><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-0">Yes</label></div>
        <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-1" name="form_6f1c2f0e"><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-1">No</label></div>
      </fieldset>
    </div>`;

  it('Lever: the question comes from the wrapper, the options from each radio\'s own label', () => {
    expect(described(LEVER_AUTHORIZED, 'input[type="radio"]')).toEqual({
      control: 'radio',
      inputType: 'radio',
      autocomplete: '',
      label: 'Are you legally authorized to work in the country for which you are applying?',
      groupLabel: '',
      name: 'cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]',
      id: '',
      placeholder: '',
      hints: '',
      required: true,
      options: [
        { label: 'Yes', value: 'Yes', disabled: false },
        { label: 'No', value: 'No', disabled: false },
      ],
      accept: '',
    });
  });

  it('Lever consent question: the options keep their full wording', () => {
    const got = described(LEVER_CONSENT, 'input[type="radio"]');

    expect(got.label).toBe(
      'As part of our interview process, we may use AI notetakers to transcribe conversations for accuracy and efficiency. Please see our candidate privacy policy for more information on how we process your data. Your decision to opt in or out of this tooling will not impact your candidacy.',
    );
    expect(got.options.map((option) => option.label)).toEqual(['Yes, I consent', 'No, I do not consent']);
  });

  it('Lever race question: nested labels do not leak the question or the descriptions into the options', () => {
    const got = described(LEVER_RACE, 'input[type="radio"]');

    expect(got.label).toBe('Race');
    expect(got.options).toEqual([
      { label: 'Hispanic or Latino', value: 'Hispanic or Latino', disabled: false },
      { label: 'White (Not Hispanic or Latino)', value: 'White (Not Hispanic or Latino)', disabled: false },
      { label: 'Decline to self-identify', value: 'Decline to self-identify', disabled: false },
    ]);
  });

  it('Ashby: the question is the wrapper\'s title, the radios have no value and no group name', () => {
    expect(described(ASHBY_RADIOS, 'input[type="radio"]')).toEqual({
      control: 'radio',
      inputType: 'radio',
      autocomplete: '',
      label: 'Are you legally authorized to work in the United States?',
      groupLabel: '',
      name: 'form_6f1c2f0e',
      id: '',
      placeholder: '',
      hints: '',
      required: false,
      options: [
        { label: 'Yes', value: '', disabled: false },
        { label: 'No', value: '', disabled: false },
      ],
      accept: '',
    });
  });

  const questions: [name: string, html: string, want: { label: string; groupLabel: string }][] = [
    [
      'a fieldset with a legend',
      '<fieldset><legend>Gender <span aria-hidden="true">*</span></legend><label><input type="radio" name="g" value="m">Male</label><label><input type="radio" name="g" value="f">Female</label></fieldset>',
      { label: 'Gender', groupLabel: 'Gender' },
    ],
    [
      'a role=radiogroup named by aria-labelledby',
      '<p id="q">Do you require visa sponsorship?</p><div role="radiogroup" aria-labelledby="q"><label><input type="radio" name="s" value="y">Yes</label><label><input type="radio" name="s" value="n">No</label></div>',
      { label: 'Do you require visa sponsorship?', groupLabel: 'Do you require visa sponsorship?' },
    ],
    [
      'the group may hold an "other" box and is then no longer the question of the radios alone',
      '<form><fieldset><legend>How did you hear about us?</legend><label><input type="radio" name="h" value="a">Ad</label><label><input type="radio" name="h" value="o">Other</label><input type="text" name="other"></fieldset></form>',
      { label: '', groupLabel: 'How did you hear about us?' },
    ],
    // A legend over two questions is a section title. Using it for both could answer the wrong one.
    [
      'a section fieldset over two radio questions names neither',
      '<form><fieldset><legend>Work eligibility</legend><p>Are you authorized to work in the US?</p><label><input type="radio" name="a" value="y">Yes</label><label><input type="radio" name="a" value="n">No</label><p>Will you require sponsorship?</p><label><input type="radio" name="s" value="y">Yes</label><label><input type="radio" name="s" value="n">No</label></fieldset></form>',
      { label: '', groupLabel: 'Work eligibility' },
    ],
    [
      'the same section, with each question in a wrapper of its own',
      '<form><fieldset><legend>Work eligibility</legend><div class="q"><p>Are you authorized to work in the US?</p><label><input type="radio" name="a" value="y">Yes</label><label><input type="radio" name="a" value="n">No</label></div><div class="q"><p>Will you require sponsorship?</p><label><input type="radio" name="s" value="y">Yes</label><label><input type="radio" name="s" value="n">No</label></div></fieldset></form>',
      { label: 'Are you authorized to work in the US?', groupLabel: 'Work eligibility' },
    ],
    // The question is never an option label.
    [
      'option labels that come before their radios are not the question',
      '<form><div class="q"><label>Yes <input type="radio" name="q" value="y"></label><label>No <input type="radio" name="q" value="n"></label></div></form>',
      { label: '', groupLabel: '' },
    ],
    [
      'a question before such option labels is',
      '<form><div class="q"><span>Are you over 18?</span><label>Yes <input type="radio" name="q" value="y"></label><label>No <input type="radio" name="q" value="n"></label></div></form>',
      { label: 'Are you over 18?', groupLabel: '' },
    ],
    [
      'aria-label on a radio describes that option, not the question',
      '<form><div><input type="radio" name="q" aria-label="Yes"><input type="radio" name="q" aria-label="No"></div></form>',
      { label: '', groupLabel: '' },
    ],
    [
      'radios with nothing around them',
      '<form><input type="radio" name="q" value="1"><input type="radio" name="q" value="2"></form>',
      { label: '', groupLabel: '' },
    ],
  ];
  it.each(questions)('%s', (_name, html, want) => {
    const got = described(html, 'input[type="radio"]');

    expect({ label: got.label, groupLabel: got.groupLabel }).toEqual(want);
  });

  const optionLabels: [name: string, html: string, want: { label: string; value: string; disabled: boolean }[]][] = [
    [
      'nested labels: the label around the whole question is not part of the first option',
      '<label>Race: <label><input type="radio" name="q" value="a">Asian</label> <label><input type="radio" name="q" value="w">White</label></label>',
      [
        { label: 'Asian', value: 'a', disabled: false },
        { label: 'White', value: 'w', disabled: false },
      ],
    ],
    [
      'label[for] beside the radio',
      '<input type="radio" id="y" name="q" value="1"><label for="y">Yes</label><input type="radio" id="n" name="q" value="0"><label for="n">No</label>',
      [
        { label: 'Yes', value: '1', disabled: false },
        { label: 'No', value: '0', disabled: false },
      ],
    ],
    [
      'text before the radio inside its label',
      '<label>Yes <input type="radio" name="q" value="1"></label><label>No <input type="radio" name="q" value="0"></label>',
      [
        { label: 'Yes', value: '1', disabled: false },
        { label: 'No', value: '0', disabled: false },
      ],
    ],
    [
      'an option whose text is a block: the whole label is used',
      '<label><input type="radio" name="q" value="1"><div>I am a protected veteran</div></label><label><input type="radio" name="q" value="0"><div>I am not a protected veteran</div></label>',
      [
        { label: 'I am a protected veteran', value: '1', disabled: false },
        { label: 'I am not a protected veteran', value: '0', disabled: false },
      ],
    ],
    [
      'no label element: aria-label, else nothing',
      '<input type="radio" name="q" value="1" aria-label="Yes"><input type="radio" name="q" value="0">',
      [
        { label: 'Yes', value: '1', disabled: false },
        { label: '', value: '0', disabled: false },
      ],
    ],
    [
      'disabled radios, also through a disabled fieldset',
      '<label><input type="radio" name="q" value="1" disabled>Yes</label><fieldset disabled><label><input type="radio" name="q" value="0">No</label></fieldset><label><input type="radio" name="q" value="2">Maybe</label>',
      [
        { label: 'Yes', value: '1', disabled: true },
        { label: 'No', value: '0', disabled: true },
        { label: 'Maybe', value: '2', disabled: false },
      ],
    ],
    [
      'a required marker is part of an option, whitespace is collapsed',
      '<label><input type="radio" name="q" value="1">  Other \n (please   specify) *</label>',
      [{ label: 'Other (please specify) *', value: '1', disabled: false }],
    ],
  ];
  it.each(optionLabels)('options: %s', (_name, html, want) => {
    expect(described(html, 'input[type="radio"]').options).toEqual(want);
  });

  const requiredGroups: [name: string, html: string, want: boolean][] = [
    ['every radio required', '<input type="radio" name="q" required><input type="radio" name="q" required>', true],
    ['one radio required', '<input type="radio" name="q"><input type="radio" name="q" required>', true],
    ['aria-required on a radio', '<input type="radio" name="q"><input type="radio" name="q" aria-required="true">', true],
    ['aria-required on the radiogroup', '<div role="radiogroup" aria-required="true"><input type="radio" name="q"><input type="radio" name="q"></div>', true],
    ['aria-required="false" on the radiogroup', '<div role="radiogroup" aria-required="false"><input type="radio" name="q"><input type="radio" name="q"></div>', false],
    ['nothing says required', '<fieldset><legend>Gender *</legend><input type="radio" name="q"><input type="radio" name="q"></fieldset>', false],
    [
      'aria-required on a group that also holds other fields is not about this question',
      '<div role="group" aria-required="true"><input type="radio" name="q"><input type="radio" name="q"><input type="text" name="other"></div>',
      false,
    ],
  ];
  it.each(requiredGroups)('required: %s', (_name, html, want) => {
    expect(described(html, 'input[type="radio"]').required).toBe(want);
  });

  it('reports the name the radios share, and no id: an id belongs to one option', () => {
    const got = described('<input type="radio" id="gender-male" name="eeo[gender]" data-qa="gender-male"><input type="radio" id="gender-female" name="eeo[gender]">', '#gender-female');

    expect([got.name, got.id]).toEqual(['eeo[gender]', '']);
  });
});

describe('describeControl: file inputs are named by their upload widget', () => {
  // Verbatim from a live Greenhouse form: both inputs have the same label, "Attach".
  const GREENHOUSE_UPLOADS = `
    <div class="field-wrapper"><div role="group" aria-labelledby="upload-label-resume" aria-required="true" class="file-upload" data-allow-s3="false"><div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="resume">Attach</label><input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="resume-text">Enter manually</button><label class="visually-hidden" for="resume_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>
    <div class="field-wrapper"><div role="group" aria-labelledby="upload-label-cover_letter" aria-required="false" class="file-upload" data-allow-s3="false"><div id="upload-label-cover_letter" class="label upload-label">Cover Letter</div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="cover_letter">Attach</label><input id="cover_letter" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="cover_letter-text">Enter manually</button><label class="visually-hidden" for="cover_letter_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>`;

  // Verbatim from a live Lever form (SVG icons left out).
  const LEVER_UPLOAD = `
    <li class="application-question resume"><label><div class="application-label">Resume/CV <span class="required">✱</span></div><div class="application-field"><a href="#" class="postings-btn template-btn-utility visible-resume-upload"><span class="filename"></span><span class="default-label">ATTACH RESUME/CV</span><input class="application-file-input invisible-resume-upload" data-qa="input-resume" id="resume-upload-input" name="resume" tabindex="-1" type="file"></a><span class="resume-upload-failure"><div class="resume-upload-label">Couldn't auto-read resume.</div></span><span class="resume-upload-working"><div class="loading-indicator"></div><div class="resume-upload-label">Analyzing resume...</div></span><span class="resume-upload-success"><div class="loading-indicator completed"></div><div class="resume-upload-label">Success!</div></span></div></label><span class="resume-upload-oversize"><p class="error-message">File exceeds the maximum upload size of <b>100MB</b>. Please try a smaller size.</p></span></li>`;

  // Shaped like Ashby's page as its bundle renders it: an "autofill from résumé" drop zone above the
  // form, whose input has no label, id or name, and then the real résumé field.
  const ASHBY_UPLOADS = `
    <div class="ashby-application-form-autofill-pane"><div class="_root_1kkr9_1" role="presentation"><input type="file" tabindex="-1" style="display:none"><div><h3>Autofill from resume</h3><p>Upload your resume here to autofill key application fields.</p></div><button type="button">Upload file</button></div></div>
    <div class="ashby-application-form-field-entry" data-field-path="_systemfield_resume">
      <label class="ashby-application-form-question-title" for="_systemfield_resume">Resume</label>
      <div class="ashby-application-form-input-file" role="presentation"><input id="_systemfield_resume" type="file" tabindex="-1" required><div><button type="button">Upload File</button><p>or drag and drop here</p></div></div>
    </div>`;

  it('Greenhouse résumé: named and marked required by its group, not by the "Attach" label', () => {
    expect(described(GREENHOUSE_UPLOADS, '#resume')).toEqual({
      control: 'file',
      inputType: 'file',
      autocomplete: '',
      label: 'Resume/CV',
      groupLabel: 'Resume/CV',
      name: '',
      id: 'resume',
      placeholder: '',
      hints: '',
      required: true,
      options: [],
      accept: '.pdf,.doc,.docx,.txt,.rtf',
    });
  });

  it('Greenhouse cover letter: the same markup, told apart by the group', () => {
    const got = described(GREENHOUSE_UPLOADS, '#cover_letter');

    expect([got.label, got.groupLabel, got.id, got.required]).toEqual(['Cover Letter', 'Cover Letter', 'cover_letter', false]);
  });

  it('Lever résumé: named by the label around it, without the caption of the upload link', () => {
    expect(described(LEVER_UPLOAD, 'input[type="file"]')).toEqual({
      control: 'file',
      inputType: 'file',
      autocomplete: '',
      label: 'Resume/CV',
      groupLabel: '',
      name: 'resume',
      id: 'resume-upload-input',
      placeholder: '',
      hints: 'input-resume',
      required: false,
      options: [],
      accept: '',
    });
  });

  it('Ashby: the résumé field is named by its question title; the autofill drop zone gets no label', () => {
    mount(ASHBY_UPLOADS);
    const [autofill, resume] = collectControls(document);
    if (autofill === undefined || resume === undefined) throw new Error('the fixture has two file inputs');

    expect(describeControl(autofill).label).toBe('');
    expect([describeControl(resume).label, describeControl(resume).id, describeControl(resume).required]).toEqual([
      'Resume',
      '_systemfield_resume',
      true,
    ]);
  });

  const files: [name: string, html: string, want: { label: string; groupLabel: string; required: boolean }][] = [
    [
      'a group that holds two uploads names neither: each keeps its own label',
      '<div role="group" aria-label="Documents" aria-required="true"><label for="target">Résumé</label><input id="target" type="file"><label for="other">Cover letter</label><input id="other" type="file"></div>',
      { label: 'Résumé', groupLabel: 'Documents', required: false },
    ],
    [
      'a group without a name leaves the label to the input\'s own',
      '<div role="group"><label for="target">Upload your CV</label><input id="target" type="file"></div>',
      { label: 'Upload your CV', groupLabel: '', required: false },
    ],
    ['no group: the own label', '<label>Transcript <input id="target" type="file"></label>', { label: 'Transcript', groupLabel: '', required: false }],
    ['the required attribute on the input', '<label>Transcript <input id="target" type="file" required></label>', { label: 'Transcript', groupLabel: '', required: true }],
    [
      'a fieldset around one upload',
      '<fieldset aria-required="true"><legend>Portfolio or Cover Letter</legend><button type="button">Attach</button><label class="visually-hidden" for="target">Attach</label><input id="target" type="file"></fieldset>',
      { label: 'Portfolio or Cover Letter', groupLabel: 'Portfolio or Cover Letter', required: true },
    ],
  ];
  it.each(files)('%s', (_name, html, want) => {
    const got = described(html);

    expect({ label: got.label, groupLabel: got.groupLabel, required: got.required }).toEqual(want);
  });

  it('does not let a group rename or require a text box that has its own label', () => {
    const got = described('<div role="group" aria-label="Contact" aria-required="true"><label for="target">Email</label><input id="target" type="email"></div>');

    expect([got.label, got.groupLabel, got.required]).toEqual(['Email', 'Contact', false]);
  });
});

describe('describeControl on real application forms', () => {
  // Copied from a live Greenhouse form (job-boards.greenhouse.io, November 2026). Left out: the
  // <style> blocks React-Select injects, the SVG icons, and most of the custom questions.
  const GREENHOUSE = `
    <form method="get" action="/embed/job_app" id="application-form" class="application--form" data-discover="true"><div class="application--questions">
    <div class="field-wrapper"><div class="text-input-wrapper"><div class="input-wrapper"><label id="first_name-label" for="first_name" class="label label">First Name<span aria-hidden="true">*</span></label><input id="first_name" class="input input__single-line" aria-label="First Name" aria-describedby="first_name-description first_name-error first_name-help" aria-invalid="false" aria-errormessage="first_name-error" aria-required="true" type="text" maxLength="255" autoComplete="given-name" value=""/></div></div></div>
    <div class="field-wrapper"><div class="text-input-wrapper"><div class="input-wrapper"><label id="last_name-label" for="last_name" class="label label">Last Name<span aria-hidden="true">*</span></label><input id="last_name" class="input input__single-line" aria-label="Last Name" aria-describedby="last_name-description last_name-error last_name-help" aria-invalid="false" aria-errormessage="last_name-error" aria-required="true" type="text" maxLength="255" autoComplete="family-name" value=""/></div></div></div>
    <div class="field-wrapper"><div class="text-input-wrapper"><div class="input-wrapper"><label id="email-label" for="email" class="label label">Email<span aria-hidden="true">*</span></label><input id="email" class="input input__single-line" aria-label="Email" aria-describedby="email-description email-error email-help" aria-invalid="false" aria-errormessage="email-error" aria-required="true" type="text" maxLength="255" autoComplete="email" value=""/></div></div></div>
    <div><fieldset class="phone-input"><legend class="visually-hidden">Phone</legend><div class="phone-input__country"><div class="select"><div class="select__container"><label id="country-label" for="country" class="label select__label">Country</label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-country-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-country-placeholder"></div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="label:input;color:inherit;background:0;opacity:1;width:100%;grid-area:1 / 2;font:inherit;min-width:2px;border:0;margin:0;outline:0;padding:0" autoCapitalize="none" autoComplete="off" autoCorrect="off" id="country" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="country-error" aria-invalid="false" aria-labelledby="country-label" aria-required="false" role="combobox" aria-activedescendant="" aria-describedby="react-select-country-placeholder" enterKeyHint="done" value=""/></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"></button></div></div></div></div></div></div></div><div class="phone-input__phone"><div class="text-input-wrapper"><div class="input-wrapper"><label id="phone-label" for="phone" class="label label">Phone</label><input id="phone" class="input input__single-line" aria-label="Phone" aria-describedby="phone-description phone-error phone-help" aria-invalid="false" aria-errormessage="phone-error" aria-required="false" type="tel" maxLength="255"/></div></div></div></fieldset></div>
    <div class="field-wrapper"><div role="group" aria-labelledby="upload-label-resume" aria-required="true" class="file-upload" data-allow-s3="false"><div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="resume">Attach</label><input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="resume-text">Enter manually</button><label class="visually-hidden" for="resume_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>
    <div class="field-wrapper"><div role="group" aria-labelledby="upload-label-cover_letter" aria-required="false" class="file-upload" data-allow-s3="false"><div id="upload-label-cover_letter" class="label upload-label">Cover Letter</div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="cover_letter">Attach</label><input id="cover_letter" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="cover_letter-text">Enter manually</button><label class="visually-hidden" for="cover_letter_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div></div>
    <div class="application--questions"><hr/><div class="field-wrapper"><div class="text-input-wrapper"><div class="input-wrapper"><label id="question_37369956002-label" for="question_37369956002" class="label label">LinkedIn Profile</label><input id="question_37369956002" class="input input__single-line" aria-label="LinkedIn Profile" aria-describedby="question_37369956002-description question_37369956002-error question_37369956002-help" aria-invalid="false" aria-errormessage="question_37369956002-error" aria-required="false" type="text" maxLength="255" value=""/></div></div></div>
    <div class="field-wrapper"><div class="select"><div class="select__container"><label id="question_37369961002-label" for="question_37369961002" class="label select__label">Will you now or in the future require sponsorship for a visa to remain in your current location?<span aria-hidden="true">*</span></label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-question_37369961002-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-question_37369961002-placeholder">Select...</div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="label:input;color:inherit;background:0;opacity:1;width:100%;grid-area:1 / 2;font:inherit;min-width:2px;border:0;margin:0;outline:0;padding:0" autoCapitalize="none" autoComplete="off" autoCorrect="off" id="question_37369961002" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="question_37369961002-error" aria-invalid="false" aria-labelledby="question_37369961002-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-question_37369961002-placeholder" enterKeyHint="done" value=""/></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"></button></div></div></div><input required="" tabindex="-1" aria-hidden="true" class="remix-css-1a0ro4n-requiredInput" value=""/></div></div></div></div></div>
    <div class="eeoc__container body"><div class="eeoc__question__wrapper"><div class="select"><div class="select__container"><label id="gender-label" for="gender" class="label select__label">Gender</label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-gender-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-gender-placeholder">Select...</div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="label:input;color:inherit;background:0;opacity:1;width:100%;grid-area:1 / 2;font:inherit;min-width:2px;border:0;margin:0;outline:0;padding:0" autoCapitalize="none" autoComplete="off" autoCorrect="off" id="gender" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="gender-error" aria-invalid="false" aria-labelledby="gender-label" aria-required="false" role="combobox" aria-activedescendant="" aria-describedby="react-select-gender-placeholder" enterKeyHint="done" value=""/></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"></button></div></div></div></div></div></div></div>
    <div class="application--submit"><button type="submit" class="btn btn--pill" aria-disabled="false">Submit application</button></div></form>`;

  // Copied from a live Lever form (jobs.lever.co, November 2026). Left out: the SVG icons, the
  // pattern attribute of the e-mail input, the JSON in the hidden baseTemplate input, and most options.
  const LEVER = `
    <form id="application-form" enctype="multipart/form-data" method="POST"><div class="section page-centered application-form"><h4>Submit your application</h4><ul>
    <li class="application-question resume"><label><div class="application-label">Resume/CV <span class="required">✱</span></div><div class="application-field"><a href="#" class="postings-btn template-btn-utility visible-resume-upload"><span class="filename"></span><span class="default-label">ATTACH RESUME/CV</span><input class="application-file-input invisible-resume-upload" data-qa="input-resume" id="resume-upload-input" name="resume" tabindex="-1" type="file"></a><span class="resume-upload-failure"><div class="resume-upload-label">Couldn't auto-read resume.</div></span><span class="resume-upload-working"><div class="loading-indicator"></div><div class="resume-upload-label">Analyzing resume...</div></span><span class="resume-upload-success"><div class="loading-indicator completed"></div><div class="resume-upload-label">Success!</div></span></div></label><span class="resume-upload-oversize"><p class="error-message">File exceeds the maximum upload size of <b>100MB</b>. Please try a smaller size.</p></span></li>
    <li class="application-question"><label><div class="application-label">Full name<span class="required">✱</span></div><div class="application-field"><input type="text" data-qa="name-input" name="name" required></div></label></li>
    <li class="application-question"><label><div class="application-label">Email<span class="required">✱</span></div><div class="application-field"><input name="email" data-qa="email-input" type="email" required></div></label></li>
    <li class="application-question"><label><div class="application-label">Phone </div><div class="application-field"><input type="text" data-qa="phone-input" name="phone"></div></label></li>
    <li class="application-question" data-qa="structured-contact-location-question"><label><div class="application-label">Current location <span class="required" data-qa="SCL-question-required-asterisk">✱</span></div><div class="application-field"><input class="location-input" data-qa="location-input" id="location-input" type="text" maxlength="100" name="location" required><input id="selected-location" type="hidden" name="selectedLocation"><div class="momentum-body flex flex-column items-start width-full height-auto bg-gray-800 text-gray-200 rounded dropdown-container"><div class="dropdown-results width-full cursor-pointer"></div><div class="dropdown-no-results width-full break-word py1 px2 pointer-events-none">No location found. Try entering a different location</div><div class="dropdown-loading-results width-full break-word height-full py1 px2 pointer-events-none"><div class="theme-inverse items-center"><span>Loading</span></div></div></div></div></label></li>
    <li class="application-question"><label><div class="application-label">Current company </div><div class="application-field"><input type="text" data-qa="org-input" name="org"></div></label></li></ul></div>
    <div class="section page-centered application-form"><h4>Links</h4><ul><li class="application-question"><label><div class="application-label">LinkedIn URL</div><div class="application-field"><input type="text" name="urls[LinkedIn]"></div></label></li></ul></div>
    <div class="section page-centered application-form" data-qa="additional-cards"><h4 data-qa="card-name">Supplementary Questions</h4><input type="hidden" value="{}" name="cards[a69a985a-eae9-4c14-90fb-b5a4b891523e][baseTemplate]"><ul><li class="application-question custom-question"><div><div class="application-label full-width multiple-select"><div class="text">Language Skill(s) (Check all that apply)<span class="required">✱</span></div></div><div class="application-field full-width required-field"><ul data-qa="checkboxes"><li><label><input type="checkbox" name="cards[a69a985a-eae9-4c14-90fb-b5a4b891523e][field0]" value="English (ENG)" /><span class="application-answer-alternative">English (ENG)</span></label></li><li><label><input type="checkbox" name="cards[a69a985a-eae9-4c14-90fb-b5a4b891523e][field0]" value="Spanish (SPA)" /><span class="application-answer-alternative">Spanish (SPA)</span></label></li></ul></div></div></li></ul></div>
    <div class="section page-centered application-form" data-qa="additional-cards"><h4 data-qa="card-name">Work Authorization</h4><input type="hidden" value="{}" name="cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][baseTemplate]"><ul><li class="application-question custom-question"><div><div class="application-label full-width multiple-choice"><div class="text">Are you legally authorized to work in the country for which you are applying?<span class="required">✱</span></div></div><div class="application-field full-width required-field"><ul data-qa="multiple-choice"><li><label><input type="radio" name="cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]" value="Yes" required="required" /><span class="application-answer-alternative">Yes</span></label></li><li><label><input type="radio" name="cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]" value="No" required="required" /><span class="application-answer-alternative">No</span></label></li></ul></div></div></li></ul></div>
    <div class="section page-centered application-form" data-qa="additional-cards"><h4 data-qa="card-name">How did you hear about this opportunity?</h4><input type="hidden" value="{}" name="cards[a6197d84-549e-4a91-8bb0-6af972510013][baseTemplate]"><ul><li class="application-question custom-question"><div><div class="application-label full-width dropdown"><div class="text">Please tell us how you heard about this opportunity.<span class="required">✱</span></div></div><div class="application-field full-width required-field"><div class="application-dropdown"><select name="cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]" required><option value="">Select...</option><option value="BuiltIn">BuiltIn</option><option value="LinkedIn">LinkedIn</option></select></div></div></div></li></ul></div>
    <div class="section page-centered application-form" data-qa="additional-cards"><h4 data-qa="card-name">Additional Questions</h4><input type="hidden" value="{}" name="cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][baseTemplate]"><ul><li class="application-question custom-question"><div><div class="application-label full-width textarea"><div class="text">What has been your favorite project or proudest accomplishment? Why?</div></div><div class="application-field full-width"><textarea class="card-field-input" name="cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][field0]"></textarea></div></div></li></ul></div>
    <div class="section page-centered application-form"><label for="additional-information"><h4>Additional information</h4></label><div class="application-additional"><textarea placeholder="Add a cover letter or anything else you want to share." name="comments" id="additional-information"></textarea></div></div>
    <input type="hidden" name="accountId" value="00000000-0000-0000-0000-000000000000"><input type="hidden" name="linkedInData"><input type="hidden" name="origin"><input type="hidden" name="referer"><input type="hidden" name="timezone" id="applicant-timezone" value=""><input type="hidden" name="socialReferralKey"><input type="hidden" name="socialSource"><input type="hidden" name="resumeStorageId" value=""><input id="hcaptchaResponseInput" type="hidden" name="h-captcha-response" value=""><button id="hcaptchaSubmitBtn" type="submit" class="hidden"></button><input type="hidden" name="source"><div id="h-captcha" class="h-captcha"></div><div class="section page-centered application-form last-section-apply"><button id="btn-submit" type="button" class="postings-btn template-btn-submit black" data-qa="btn-submit" href="#">Submit application</button></div></form>`;

  /** One line per collected control: what it is, how it is labelled, and whether it is required. */
  function listing(html: string): string[] {
    mount(html);
    return collectControls(document).map((control) => {
      const field = describeControl(control);
      return `${field.control} | ${field.label} | ${field.groupLabel} | ${field.required ? 'required' : 'optional'}`;
    });
  }

  it('Greenhouse: every control gets the label a person reads', () => {
    expect(listing(GREENHOUSE)).toEqual([
      'text | First Name |  | required',
      'text | Last Name |  | required',
      'text | Email |  | required',
      'combobox | Country | Phone | optional',
      'text | Phone | Phone | optional',
      'file | Resume/CV | Resume/CV | required',
      'file | Cover Letter | Cover Letter | optional',
      'text | LinkedIn Profile |  | optional',
      'combobox | Will you now or in the future require sponsorship for a visa to remain in your current location? |  | required',
      'combobox | Gender |  | optional',
    ]);
  });

  it('Greenhouse: the first name box in full', () => {
    mount(GREENHOUSE);

    expect(describeControl(controlAt('#first_name'))).toEqual({
      control: 'text',
      inputType: 'text',
      autocomplete: 'given-name',
      label: 'First Name',
      groupLabel: '',
      name: '',
      id: 'first_name',
      placeholder: '',
      hints: '',
      required: true,
      options: [],
      accept: '',
    });
  });

  it('Lever: every control gets the label a person reads', () => {
    expect(listing(LEVER)).toEqual([
      'file | Resume/CV |  | optional',
      'text | Full name |  | required',
      'text | Email |  | required',
      'text | Phone |  | optional',
      'text | Current location |  | required',
      'text | Current company |  | optional',
      'text | LinkedIn URL |  | optional',
      'radio | Are you legally authorized to work in the country for which you are applying? |  | required',
      'select | Please tell us how you heard about this opportunity. |  | required',
      'textarea | What has been your favorite project or proudest accomplishment? Why? |  | optional',
      'textarea | Additional information |  | optional',
    ]);
  });

  it('Lever: the full name box and the free-text box in full', () => {
    mount(LEVER);

    expect(describeControl(controlAt('input[name="name"]'))).toEqual({
      control: 'text',
      inputType: 'text',
      autocomplete: '',
      label: 'Full name',
      groupLabel: '',
      name: 'name',
      id: '',
      placeholder: '',
      hints: 'name-input',
      required: true,
      options: [],
      accept: '',
    });
    expect(describeControl(controlAt('#additional-information'))).toEqual({
      control: 'textarea',
      inputType: '',
      autocomplete: '',
      label: 'Additional information',
      groupLabel: '',
      name: 'comments',
      id: 'additional-information',
      placeholder: 'Add a cover letter or anything else you want to share.',
      hints: '',
      required: false,
      options: [],
      accept: '',
    });
  });
});

describe('isEmpty: text boxes, textareas and comboboxes are empty when they hold only whitespace', () => {
  const values: [name: string, html: string, want: boolean][] = [
    ['no value', '<input id="target">', true],
    ['spaces', '<input id="target" value="   ">', true],
    ['a non-breaking space', '<input id="target" value="&nbsp;">', true],
    ['a name', '<input id="target" value="Ada">', false],
    ['a dial code the page filled in is an answer we must not overwrite', '<input id="target" type="tel" value="+1">', false],
    ['a number', '<input id="target" type="number" value="3.9">', false],
    ['an empty textarea', '<textarea id="target"></textarea>', true],
    ['a textarea with line breaks only', '<textarea id="target">\n\n  \t</textarea>', true],
    ['a textarea with text', '<textarea id="target">Dear team</textarea>', false],
    // React-Select keeps the chosen option outside the input, so its input always reads as empty.
    ['a combobox with no text', '<input id="target" role="combobox" value="">', true],
    ['a combobox with text', '<input id="target" role="combobox" value="United">', false],
  ];
  it.each(values)('%s', (_name, html, want) => {
    mount(html);

    expect(isEmpty(controlAt('#target'))).toBe(want);
  });

  it('looks at what the box holds now, not at the value attribute', () => {
    mount('<input id="target" value="">');
    find<HTMLInputElement>('#target').value = 'ada@example.com';

    expect(isEmpty(controlAt('#target'))).toBe(false);
  });
});

describe('isEmpty: a dropdown is empty until a real option is selected', () => {
  const selects: [name: string, options: string, want: boolean][] = [
    // Placeholders, as real forms write them.
    ['Lever placeholder with an empty value', '<option value="">Select ...</option><option value="Male">Male</option>', true],
    [
      'Lever "Click Here" placeholder with an empty value',
      '<option value="">Click Here (If you encounter an issue, make sure your browser is updated and try clearing cache &amp; cookies)</option><option value="Aalborg University">Aalborg University</option>',
      true,
    ],
    ['Ashby placeholder: disabled, hidden, empty value', '<option disabled hidden value="" selected></option><option value="1">Yes</option>', true],
    ['a placeholder without a value attribute', '<option>Please select</option><option>Yes</option><option>No</option>', true],
    ['a placeholder with a value', '<option value="0">-- Select --</option><option value="1">Yes</option>', true],
    ['"Select One"', '<option value="-1">Select One</option><option value="1">Yes</option>', true],
    ['"Choose…"', '<option value="x">Choose…</option><option value="1">Yes</option>', true],
    ['"Choose an option"', '<option value="x">Choose an option</option><option value="1">Yes</option>', true],
    ['"Select State"', '<option value="x">Select State</option><option value="CA">California</option>', true],
    ['"(Select)"', '<option value="x">(Select)</option><option value="1">Yes</option>', true],
    ['"Pick one"', '<option value="x">Pick one</option><option value="1">Yes</option>', true],
    ['dashes', '<option value="x">---------</option><option value="1">Yes</option>', true],
    ['an em dash', '<option value="x">—</option><option value="1">Yes</option>', true],
    ['no text but a value', '<option value="x"></option><option value="1">Yes</option>', true],
    ['a disabled option that is selected', '<option value="1">Yes</option><option value="0" disabled selected>No longer offered</option>', true],
    ['an option in a disabled group that is selected', '<option value="1">Yes</option><optgroup disabled><option value="0" selected>Old</option></optgroup>', true],
    ['no options at all', '', true],
    // Real answers, including defaults the page chose: those are kept.
    ['a chosen answer', '<option value="">Select...</option><option value="1" selected>Yes</option><option value="0">No</option>', false],
    ['a real first option that is selected by default', '<option value="US">United States</option><option value="CA">Canada</option>', false],
    ['a first option without a value attribute', '<option>United States</option><option>Canada</option>', false],
    ['"Choose not to disclose" is an answer', '<option value="d">Choose not to disclose</option><option value="m">Male</option>', false],
    ['"Selected candidates only" is not a placeholder', '<option value="s">Selected candidates only</option><option value="a">All</option>', false],
    ['"None" is an answer', '<option value="none">None</option><option value="1">One</option>', false],
    ['"N/A" is an answer', '<option value="na">N/A</option><option value="1">One</option>', false],
    ['"0" is an answer', '<option value="0">0</option><option value="1">1</option>', false],
    ['placeholder wording on an option that is not the first', '<option value="a">Annual</option><option value="s" selected>Select</option>', false],
  ];
  it.each(selects)('%s', (_name, options, want) => {
    mount(`<select id="target">${options}</select>`);

    expect(isEmpty(controlAt('#target'))).toBe(want);
  });

  it('is empty for a multiple select with nothing selected, and not once something is', () => {
    mount('<select id="target" multiple><option value="en">English</option><option value="es">Spanish</option></select>');
    const select = find<HTMLSelectElement>('#target');

    expect(isEmpty(controlAt('#target'))).toBe(true);

    select.selectedIndex = 1;

    expect(isEmpty(controlAt('#target'))).toBe(false);
  });

  it('looks at what is selected now, not at the selected attribute', () => {
    mount('<select id="target"><option value="">Select...</option><option value="1">Yes</option></select>');
    find<HTMLSelectElement>('#target').selectedIndex = 1;

    expect(isEmpty(controlAt('#target'))).toBe(false);
  });
});

describe('isEmpty: a radio group is empty when none of its radios is checked', () => {
  const groups: [name: string, html: string, want: boolean][] = [
    ['nothing checked', '<input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No">', true],
    ['the second radio checked', '<input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No" checked>', false],
    ['a disabled radio checked: still an answer, not ours to change', '<input type="radio" name="q" value="Yes" checked disabled><input type="radio" name="q" value="No">', false],
    [
      'a checked radio of the same name in another form belongs to another question',
      '<form><input id="target" type="radio" name="q" value="Yes"><input type="radio" name="q" value="No"></form><form><input type="radio" name="q" value="Yes" checked></form>',
      true,
    ],
    // The answer may sit on a radio that is never collected: an option in a part of the question
    // that the page collapsed with aria-hidden. The browser still counts it, and a click on another
    // option would replace what the user chose.
    [
      'a checked option that was never collected still answers the question',
      '<form><label><input type="radio" name="q" value="Yes">Yes</label><label><input type="radio" name="q" value="No">No</label><div class="more-options" aria-hidden="true"><label><input type="radio" name="q" value="Other" checked>Other</label></div></form>',
      false,
    ],
    [
      'the same without a form, and with the option made inert',
      '<label><input type="radio" name="q" value="Yes">Yes</label><div inert><label><input type="radio" name="q" value="Other" checked>Other</label></div>',
      false,
    ],
    [
      'a checked, never-collected radio of another name is another question',
      '<form><input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No"><div aria-hidden="true"><input type="radio" name="other" value="x" checked></div></form>',
      true,
    ],
    [
      'a checked, never-collected radio of the same name in another form is another question',
      '<form><input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No"></form><form aria-hidden="true"><input type="radio" name="q" value="Yes" checked></form>',
      true,
    ],
    [
      'radios without a name are never grouped, so a checked one beside this one says nothing',
      '<input type="radio" value="Yes"><div aria-hidden="true"><input type="radio" value="No" checked></div>',
      true,
    ],
    [
      'a checked checkbox that shares the name is no option of the question',
      '<form><input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No"><input type="checkbox" name="q" value="Maybe" checked></form>',
      true,
    ],
    [
      'a checked look-alike inside <svg> is no radio',
      '<input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No"><svg aria-hidden="true"><input type="radio" name="q" checked></input></svg>',
      true,
    ],
  ];
  it.each(groups)('%s', (_name, html, want) => {
    mount(html);

    expect(isEmpty(controlAt('input[type="radio"]'))).toBe(want);
  });

  it('looks at what is checked now, not at the checked attribute', () => {
    mount('<input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No">');
    find<HTMLInputElement>('input[value="No"]').checked = true;

    expect(isEmpty(controlAt('input[type="radio"]'))).toBe(false);
  });

  it('counts a never-collected option inside a shadow tree, and keeps the trees apart', () => {
    mount('<input type="radio" name="q" value="page-1"><input type="radio" name="q" value="page-2"><div id="host"></div>');
    const root = find('#host').attachShadow({ mode: 'open' });
    root.innerHTML =
      '<input type="radio" name="q" value="shadow-1"><input type="radio" name="q" value="shadow-2"><span aria-hidden="true"><input type="radio" name="q" value="shadow-more" checked></span>';
    const [onPage, inShadow] = collectControls(document);
    if (onPage === undefined || inShadow === undefined) throw new Error('the fixture has two radio groups');

    // the checked radio belongs to the group in the shadow tree: same name, but another tree
    expect([isEmpty(onPage), isEmpty(inShadow)]).toEqual([true, false]);
  });

  it('still reads the radios it was given when they are not on any page', () => {
    // nothing can be looked up around radios that hang in the air, so the group is all there is
    const loose = document.createElement('div');
    loose.innerHTML = '<input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No" checked>';
    const radios = Array.from(loose.querySelectorAll('input'));
    const first = radios[0];
    if (first === undefined) throw new Error('the fixture has two radios');

    expect(isEmpty({ control: 'radio', el: first, radios })).toBe(false);
  });
});

describe('isEmpty: a file input is empty when it holds no file and its widget shows none', () => {
  /** jsdom cannot put a file into an input, so the test defines what `files` answers. */
  function withFile(input: HTMLInputElement): void {
    const file = new File(['%PDF-1.7'], 'Ada-Lovelace-Resume.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  }

  // Verbatim from a live Greenhouse form.
  const GREENHOUSE_UPLOAD = `
    <div class="field-wrapper"><div role="group" aria-labelledby="upload-label-resume" aria-required="true" class="file-upload" data-allow-s3="false"><div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="resume">Attach</label><input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf"/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="resume-text">Enter manually</button><label class="visually-hidden" for="resume_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>`;

  // Verbatim from a live Lever form (SVG icons left out); the file name span is filled in by the page.
  const leverUpload = (filename: string): string => `
    <li class="application-question resume"><label><div class="application-label">Resume/CV <span class="required">✱</span></div><div class="application-field"><a href="#" class="postings-btn template-btn-utility visible-resume-upload"><span class="filename">${filename}</span><span class="default-label">ATTACH RESUME/CV</span><input class="application-file-input invisible-resume-upload" data-qa="input-resume" id="resume-upload-input" name="resume" tabindex="-1" type="file"></a><span class="resume-upload-failure"><div class="resume-upload-label">Couldn't auto-read resume.</div></span><span class="resume-upload-working"><div class="loading-indicator"></div><div class="resume-upload-label">Analyzing resume...</div></span><span class="resume-upload-success"><div class="loading-indicator completed"></div><div class="resume-upload-label">Success!</div></span></div></label><span class="resume-upload-oversize"><p class="error-message">File exceeds the maximum upload size of <b>100MB</b>. Please try a smaller size.</p></span></li>`;

  // Shaped like Ashby's file field once a saved résumé is restored: the input stays empty and the
  // page shows the file name with a "Replace" button.
  const ASHBY_RESTORED = `
    <div class="ashby-application-form-field-entry" data-field-path="_systemfield_resume">
      <label class="ashby-application-form-question-title" for="_systemfield_resume">Resume</label>
      <div class="ashby-application-form-input-file" role="presentation"><input id="_systemfield_resume" type="file" tabindex="-1" required><div><span class="_fileName_1e3gg_60">Ada Lovelace CV</span><button type="button">Replace</button></div></div>
    </div>`;

  const uploads: [name: string, html: string, want: boolean][] = [
    ['a plain file input', '<input type="file">', true],
    ['Greenhouse upload before anything is attached', GREENHOUSE_UPLOAD, true],
    ['Lever upload before anything is attached', leverUpload(''), true],
    ['Lever upload showing a file name', leverUpload('Ada-Lovelace-Resume.pdf'), false],
    ['Ashby field showing a restored file with a Replace button', ASHBY_RESTORED, false],
    ['a file name with spaces and brackets', '<div class="upload"><input type="file"><span>My Resume (final).docx</span></div>', false],
    ['a Remove button named by aria-label', '<div class="upload"><input type="file"><button type="button" aria-label="Remove file">×</button></div>', false],
    ['a Remove link', '<div class="upload"><input type="file"><a href="#">Remove</a></div>', false],
    ['a Delete button named by its title', '<div class="upload"><input type="file"><button type="button" title="Delete attachment"></button></div>', false],
    ['a Remove button written as an input', '<div class="upload"><input type="file"><input type="button" value="Remove"></div>', false],
    // Hints about accepted files are not file names.
    ['a hint listing extensions with dots', '<div class="upload"><input type="file"><p>(.pdf, .docx, .txt up to 5MB)</p></div>', true],
    ['a hint with a wildcard', '<div class="upload"><input type="file"><p>Allowed: *.pdf *.doc</p></div>', true],
    ['a hint in capitals', '<div class="upload"><input type="file"><p>PDF, DOC or DOCX. Max 2 MB.</p></div>', true],
    ['buttons that attach, not remove', '<div class="upload"><button type="button">Attach</button><button type="button">Upload file</button><input type="file"></div>', true],
    // Only what the user is shown counts.
    ['a file name in a hidden element', '<div class="upload"><input type="file"><span hidden>previous.pdf</span></div>', true],
    ['a Remove button that is hidden', '<div class="upload"><input type="file"><button type="button" hidden>Remove</button></div>', true],
    ['a Remove button that is aria-hidden', '<div class="upload"><input type="file"><span aria-hidden="true"><button type="button">Remove</button></span></div>', true],
    // Only this input's own widget counts.
    [
      'a file name shown for the neighbouring upload',
      '<div class="row"><div class="upload"><input id="target" type="file"></div><div class="upload"><input type="file"><span>cover-letter.pdf</span><button>Remove</button></div></div>',
      true,
    ],
    ['a Remove button in a wrapper shared with another field', '<div class="row"><input type="file"><input type="text" name="title"><button type="button">Remove</button></div>', true],
  ];
  it.each(uploads)('%s', (_name, html, want) => {
    mount(html);

    expect(isEmpty(controlAt('input[type="file"]'))).toBe(want);
  });

  it('is not empty once the input holds a file', () => {
    mount(GREENHOUSE_UPLOAD);
    withFile(find<HTMLInputElement>('#resume'));

    expect(isEmpty(controlAt('#resume'))).toBe(false);
  });
});

/**
 * In a browser a <form> exposes its controls as properties named after them, and those names win over
 * the built-in ones: with <input name="id"> inside it, `form.id` is that input (Lever's form has an
 * <input name="name">). jsdom does not copy this, so the trap goes further: every built-in property of
 * this one form throws when read. Code that still works never read a property off the form.
 */
function trap(form: HTMLFormElement): HTMLFormElement {
  for (let proto = Object.getPrototypeOf(form); proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      Object.defineProperty(form, name, {
        configurable: true,
        get() {
          throw new Error(`read form.${name}`);
        },
      });
    }
  }
  return form;
}

describe('describeControl and isEmpty: names chosen by the page cannot break them', () => {
  it('never read a property off a form, even when the form is itself the group or the wrapper', () => {
    mount(`
      <form id="application-form" role="group" aria-labelledby="form-title" aria-required="true">
        <h2 id="form-title">Apply</h2>
        <label for="full-name">Full name</label><input id="full-name" name="name">
        <div class="field"><span>Employee ID</span><input id="employee-id" name="id"></div>
        <li class="application-question"><div class="application-label">Are you over 18?</div><label><input type="radio" name="elements" value="Yes">Yes</label><label><input type="radio" name="elements" value="No" checked>No</label></li>
        <label>State <select id="state" name="children"><option value="">Select...</option><option value="CA">California</option></select></label>
        <div class="upload"><button type="button">Remove</button><input id="resume" type="file" name="parentElement"></div>
        <textarea id="direct" name="getAttribute" aria-labelledby="form-title">Dear team</textarea>
      </form>
      <form id="group-of-one" role="group" aria-label="Referral code"><input id="code" name="querySelector"></form>
      <form id="wrapper" class="application-question"><div class="application-label">Notice period</div><input id="notice" name="matches"></form>`);
    trap(find<HTMLFormElement>('#application-form'));
    trap(find<HTMLFormElement>('#group-of-one'));
    trap(find<HTMLFormElement>('#wrapper'));

    const got = collectControls(document).map((control) => {
      const field = describeControl(control);
      return `${field.control} | ${field.label} | ${field.groupLabel} | ${isEmpty(control) ? 'empty' : 'answered'}`;
    });

    expect(got).toEqual([
      'text | Full name | Apply | empty',
      'text | Employee ID | Apply | empty',
      'radio | Are you over 18? | Apply | answered',
      'select | State | Apply | empty',
      'file |  | Apply | answered',
      'textarea | Apply | Apply | answered',
      'text | Referral code | Referral code | empty',
      'text | Notice period |  | empty',
    ]);
  });

  it('never read a property off a form that sits inside the text being gathered, or is that text', () => {
    mount(`
      <div id="q">Email <form id="inside-label">address <span>here</span></form></div>
      <input id="by-reference" aria-labelledby="q" form="inside-label" name="localName">
      <label>Notice <form id="inside-wrapping-label">period</form> <input id="wrapped" name="closest"></label>
      <form id="named-form">Preferred name <span aria-hidden="true">(optional)</span></form>
      <input id="by-form" aria-labelledby="named-form" name="contains">`);
    trap(find<HTMLFormElement>('#inside-label'));
    trap(find<HTMLFormElement>('#inside-wrapping-label'));
    trap(find<HTMLFormElement>('#named-form'));

    const got = ['#by-reference', '#wrapped', '#by-form'].map((selector) => describeControl(controlAt(selector)).label);

    expect(got).toEqual(['Email address here', 'Notice period', 'Preferred name']);
  });

  it('still find labels when elements shadow the document\'s own properties', () => {
    mount(`
      <img name="createTreeWalker"><img name="getElementById"><img name="querySelector"><img name="body">
      <form name="forms">
        <span id="q">Preferred name</span><input id="by-reference" aria-labelledby="q">
        <label for="by-label">Email<span aria-hidden="true">*</span></label><input id="by-label">
        <div class="field"><span>Notice period</span><input id="nearby"></div>
      </form>`);

    const got = ['#by-reference', '#by-label', '#nearby'].map((selector) => describeControl(controlAt(selector)).label);

    expect(got).toEqual(['Preferred name', 'Email', 'Notice period']);
  });

  it('still finds the whole radio group when an element shadows the document\'s own search', () => {
    mount(`
      <img name="querySelectorAll"><img name="getRootNode">
      <input type="radio" name="q" value="Yes"><input type="radio" name="q" value="No">
      <div aria-hidden="true"><input type="radio" name="q" value="Other" checked></div>`);

    expect(isEmpty(controlAt('input[type="radio"]'))).toBe(false);
  });
});

describe('collecting and describing a document that no window shows', () => {
  it('needs no window: a parsed document works like the live one', () => {
    const parsed = new DOMParser().parseFromString(
      `<form><label for="email">Email<span aria-hidden="true">*</span></label><input id="email" type="email" value="ada@example.com">
       <div class="question"><span>Are you over 18?</span><label><input type="radio" name="adult" value="Yes">Yes</label><label><input type="radio" name="adult" value="No">No</label></div></form>`,
      'text/html',
    );

    const got = collectControls(parsed).map((control) => {
      const field = describeControl(control);
      return `${field.control} | ${field.label} | ${field.options.map((option) => option.label).join('/')} | ${isEmpty(control) ? 'empty' : 'answered'}`;
    });

    expect(parsed.defaultView).toBeNull();
    expect(got).toEqual(['text | Email |  | answered', 'radio | Are you over 18? | Yes/No | empty']);
  });
});
