// The extractor runs inside whatever page the user is looking at, so these tests run it
// inside a real browser tab, against small hand-written pages.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { extractPageInfo } from '../extension/extract.js';
import { launchBrowser } from './helpers/browser.js';
import { startServer } from './helpers/server.js';

let browser;
let server;
let tab;

before(async () => {
  let ready = false;
  try {
    server = await startServer();
    browser = await launchBrowser();
    tab = await browser.openPage();
    ready = true;
  } finally {
    // launchBrowser() throws when no Chromium is installed. The server is already listening
    // then, and nothing else closes it, so the test run would wait forever.
    if (!ready) {
      await browser?.close();
      await server?.close();
      browser = undefined;
      server = undefined;
    }
  }
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/** Wraps `body` in a minimal page. */
const page = (body, head = '') =>
  `<!DOCTYPE html><html lang="en"><head><title>Test page</title>${head}</head><body>${body}</body></html>`;

/** Opens `html` in the tab and returns what the extractor reports for it. */
async function extract(html) {
  await tab.goto(server.serve(html));
  return tab.evaluate(extractPageInfo);
}

// ---------------------------------------------------------------------------------------------
// The page itself
// ---------------------------------------------------------------------------------------------

test('identifies the page by address, title and language', async () => {
  const url = server.serve(
    '<!DOCTYPE html><html lang="en-US"><head><title>\n  Apply: Data Intern </title></head><body></body></html>',
  );
  await tab.goto(url);
  const info = await tab.evaluate(extractPageInfo);

  assert.equal(info.url, url);
  assert.equal(info.title, 'Apply: Data Intern');
  assert.equal(info.lang, 'en-US');
});

test('reads the title even when an element named "title" shadows document.title', async () => {
  const info = await extract(page('<img name="title" alt="" src="data:,">'));

  assert.equal(info.title, 'Test page');
});

test('collects meta tags by name and by property', async () => {
  const info = await extract(
    page(
      '',
      `<meta charset="utf-8">
       <meta name="description" content="Join our data team.">
       <meta property="og:title" content="Data Intern at Acme">`,
    ),
  );

  assert.deepEqual(info.meta, {
    description: 'Join our data team.',
    'og:title': 'Data Intern at Acme',
  });
});

test('reports the canonical address in full', async () => {
  const info = await extract(page('', '<link rel="canonical" href="/jobs/42">'));

  assert.equal(info.canonical, `${server.origin}/jobs/42`);
});

test('lists headings in page order with their levels', async () => {
  const info = await extract(
    page('<h1>Data  Intern</h1><h3>Perks</h3><h2>\n  About the role\n</h2><h2> </h2>'),
  );

  assert.deepEqual(info.headings, [
    { level: 1, text: 'Data Intern' },
    { level: 3, text: 'Perks' },
    { level: 2, text: 'About the role' },
  ]);
});

test('lists links with full addresses, skipping ones that go nowhere', async () => {
  const info = await extract(
    page(
      `<a href="/apply">Apply now</a>
       <a href="https://example.com/partner"><img alt="Partner logo" src="data:,"></a>
       <a>No address</a>
       <a href="javascript:void(0)">Open menu</a>`,
    ),
  );

  assert.deepEqual(info.links, [
    { text: 'Apply now', href: `${server.origin}/apply` },
    { text: 'Partner logo', href: 'https://example.com/partner' },
  ]);
});

test('lists links drawn inside an svg with full addresses too', async () => {
  // An svg link keeps its address in an object, not a string, and has no protocol to check.
  const info = await extract(
    page('<svg width="20" height="20"><a href="/map"><circle r="5"></circle></a><a href="javascript:void(0)"><circle r="5"></circle></a></svg>'),
  );

  assert.deepEqual(info.links, [{ text: '', href: `${server.origin}/map` }]);
});

test('parses JSON-LD blocks and skips broken ones', async () => {
  const info = await extract(
    page(
      '',
      `<script type="application/ld+json">{"@type":"JobPosting","title":"Data Intern"}</script>
       <script type="application/ld+json">{not json</script>`,
    ),
  );

  assert.deepEqual(info.jsonLd, [{ '@type': 'JobPosting', title: 'Data Intern' }]);
});

// ---------------------------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------------------------

test('describes a labelled text input', async () => {
  const info = await extract(
    page(
      `<label for="fn">First name</label>
       <input id="fn" name="first_name" type="text" required placeholder="Ada" autocomplete="given-name">`,
    ),
  );

  assert.deepEqual(info.fields, [
    {
      label: 'First name',
      type: 'text',
      name: 'first_name',
      id: 'fn',
      selector: '#fn',
      required: true,
      disabled: false,
      visible: true,
      placeholder: 'Ada',
      autocomplete: 'given-name',
      form: null,
    },
  ]);
});

const labelCases = [
  ['a wrapping label', '<label>Email <input name="x"></label>', 'Email'],
  [
    'a wrapping label, without the text of the control inside it',
    '<label>Country <select name="x"><option>Peru</option><option>Chile</option></select></label>',
    'Country',
  ],
  ['aria-label', '<input name="x" aria-label="Phone number">', 'Phone number'],
  [
    'the elements aria-labelledby points to',
    '<span id="a">Start</span> <span id="b">date</span><input name="x" aria-labelledby="a b">',
    'Start date',
  ],
  ['its placeholder when nothing else names it', '<input name="x" placeholder="LinkedIn URL">', 'LinkedIn URL'],
  ['its title when nothing else names it', '<input name="x" title="Postal code">', 'Postal code'],
  [
    'its label, minus the required asterisk',
    '<label for="ln">Last name *</label><input id="ln" name="x">',
    'Last name',
  ],
  [
    'its label, minus a heavy asterisk',
    '<label for="fn">Full name<span>✱</span></label><input id="fn" name="x">',
    'Full name',
  ],
  [
    'its label, minus an asterisk standing alone in the middle',
    '<label><div>Resume/CV <span>✱</span></div><div><span>Attach</span><input type="file" name="x"></div></label>',
    'Resume/CV Attach',
  ],
  [
    'its label, without helper text that is hidden',
    '<label><div>Current location</div><input name="x"><div style="display:none">No location found.</div></label>',
    'Current location',
  ],
  [
    'a label that is itself hidden',
    '<label for="h" style="display:none">Hidden but still the name</label><input id="h" name="x">',
    'Hidden but still the name',
  ],
  [
    'aria-label, ahead of its <label>',
    '<label for="both">Visible label</label><input id="both" name="x" aria-label="Spoken label">',
    'Spoken label',
  ],
  [
    'its label, with a line break read as a space',
    '<label>Legal name<br>(as on passport)<input name="x"></label>',
    'Legal name (as on passport)',
  ],
  [
    'its label, keeping an asterisk that is part of the wording',
    '<label>What is 4 * 7 ?<input name="x"></label>',
    'What is 4 * 7 ?',
  ],
  ['nothing at all', '<input name="x">', ''],
];
for (const [source, html, want] of labelCases) {
  test(`labels a field from ${source}`, async () => {
    const [field] = (await extract(page(html))).fields;

    assert.equal(field.label, want);
  });
}

const requiredCases = [
  ['it has the required attribute', '<input name="x" required>', true],
  ['it has aria-required', '<input name="x" aria-required="true">', true],
  ['its label ends in an asterisk', '<label>Last name <span>*</span><input name="x"></label>', true],
  ['its label carries a heavy asterisk', '<label>Full name<span>✱</span><input name="x"></label>', true],
  [
    'an asterisk stands alone inside its label',
    '<label><div>Resume/CV <span>✱</span></div><div><span>Attach</span><input type="file" name="x"></div></label>',
    true,
  ],
  ['nothing says so', '<label>Nickname <input name="x"></label>', false],
  ['the only asterisk is a multiplication sign', '<label>What is 4 * 7 ?<input name="x"></label>', false],
];
for (const [when, html, want] of requiredCases) {
  test(`marks a field ${want ? 'required' : 'optional'} when ${when}`, async () => {
    const [field] = (await extract(page(html))).fields;

    assert.equal(field.required, want);
  });
}

test('reports each kind of control by its type', async () => {
  const info = await extract(
    page(
      `<input name="a" type="email"><input name="b" type="tel"><input name="c" type="date"><input name="d">
       <textarea name="e"></textarea><input name="f" type="file"><select name="g"></select>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.type]),
    [
      ['a', 'email'],
      ['b', 'tel'],
      ['c', 'date'],
      ['d', 'text'],
      ['e', 'textarea'],
      ['f', 'file'],
      ['g', 'select'],
    ],
  );
});

test('notes which files an upload accepts and whether it takes several', async () => {
  const [field] = (await extract(page('<input type="file" name="resume" accept=".pdf,.docx" multiple>'))).fields;

  assert.equal(field.accept, '.pdf,.docx');
  assert.equal(field.multiple, true);
});

test('lists the options of a select', async () => {
  const [field] = (
    await extract(
      page(
        `<select name="degree">
           <option value="">Select…</option>
           <option value="bs">Bachelor's</option>
           <option value="ms" label="Master's">ignored text</option>
         </select>`,
      ),
    )
  ).fields;

  assert.deepEqual(field.options, [
    { label: 'Select…', value: '' },
    { label: "Bachelor's", value: 'bs' },
    { label: "Master's", value: 'ms' },
  ]);
});

test('leaves hidden inputs and button-like inputs out of the fields', async () => {
  const info = await extract(
    page(
      `<input type="hidden" name="csrf" value="t0k3n"><input type="submit" value="Send">
       <input type="button" value="Back"><input type="reset"><input type="image" alt="Go" src="data:,">
       <input name="real">`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => field.name),
    ['real'],
  );
});

test('flags fields the user cannot see', async () => {
  const info = await extract(
    page(
      `<input name="shown">
       <input name="not-rendered" style="display:none">
       <div style="visibility:hidden"><input name="invisible"></div>
       <input name="off-screen" style="position:absolute; left:-9999px">
       <input name="zero-size" style="width:0; height:0; padding:0; border:0">
       <input name="above-the-page" style="position:absolute; top:-9999px">
       <input name="see-through" style="opacity:0">
       <input name="clipped-to-a-dot" style="position:absolute; width:1px; height:1px; padding:0; border:0; overflow:hidden; clip:rect(0 0 0 0)">`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.visible]),
    [
      ['shown', true],
      ['not-rendered', false],
      ['invisible', false],
      ['off-screen', false],
      ['zero-size', false],
      ['above-the-page', false],
      ['see-through', false],
      ['clipped-to-a-dot', false],
    ],
  );
});

test('judges visibility against the whole page, not the part scrolled into view', async () => {
  await tab.goto(server.serve(page('<input name="top"><div style="height:4000px"></div><input name="bottom">')));
  await tab.evaluate(() => window.scrollTo(0, 3000));
  const info = await tab.evaluate(extractPageInfo);

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.visible]),
    [
      ['top', true],
      ['bottom', true],
    ],
  );
});

test('flags fields that are hidden from assistive technology as not visible', async () => {
  // Widgets plant dummy inputs like this to borrow the browser's own validation.
  const info = await extract(
    page('<input name="self" aria-hidden="true"><div aria-hidden="true"><input name="inherited"></div>'),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.visible]),
    [
      ['self', false],
      ['inherited', false],
    ],
  );
});

test('notes fields that can be read but not changed', async () => {
  const info = await extract(page('<input name="locked" readonly><input name="open">'));

  assert.equal(info.fields[0].readonly, true);
  assert.equal('readonly' in info.fields[1], false);
});

test('counts a hidden control as visible when its label is what the user sees', async () => {
  // Styled uploads and custom radios hide the real input and show its label instead.
  const [field] = (
    await extract(
      page('<label for="cv">Attach résumé</label><input id="cv" name="resume" type="file" style="display:none">'),
    )
  ).fields;

  assert.equal(field.visible, true);
});

test('flags disabled fields, including ones disabled by their fieldset or by ARIA', async () => {
  const info = await extract(
    page(
      `<input name="on"><input name="off" disabled><fieldset disabled><input name="inherited"></fieldset>
       <input name="aria" aria-disabled="true">`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.disabled]),
    [
      ['on', false],
      ['off', true],
      ['inherited', true],
      ['aria', true],
    ],
  );
});

test('includes custom ARIA widgets and editable regions as fields', async () => {
  const info = await extract(
    page(
      `<div role="combobox" aria-label="Country" tabindex="0"></div>
       <div contenteditable="true" aria-label="Cover letter"></div>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.label, field.type]),
    [
      ['Country', 'combobox'],
      ['Cover letter', 'contenteditable'],
    ],
  );
});

test('names an ARIA switch or checkbox by its own text, not by what comes before it', async () => {
  const info = await extract(
    page(
      `<button role="switch" aria-checked="false">Email me about new jobs</button>
       <div role="checkbox" aria-checked="false" tabindex="0">I agree to the terms</div>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.label, field.type, field.nearbyText]),
    [
      ['Email me about new jobs', 'switch', undefined],
      ['I agree to the terms', 'checkbox', undefined],
    ],
  );
});

test('lists an editable region once, not once per element inside it that has a role', async () => {
  const info = await extract(
    page(
      '<div contenteditable="true" aria-label="Message"><table role="presentation"><tr><td>Hello</td></tr></table></div>',
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.label, field.type]),
    [['Message', 'contenteditable']],
  );
});

test('notes the ARIA role of a native control that has one', async () => {
  // Searchable dropdowns (react-select and friends) are text inputs with role="combobox".
  const [field] = (await extract(page('<input name="school" role="combobox" aria-label="School">'))).fields;

  assert.equal(field.type, 'text');
  assert.equal(field.role, 'combobox');
});

// ---------------------------------------------------------------------------------------------
// Text beside a field that nothing names
// ---------------------------------------------------------------------------------------------

// Modelled on a common applicant tracking system: the question is a plain <div> next to the
// control's wrapper, not a <label>.
const question = (text, control) =>
  `<ul><li><div><div class="question"><div class="text">${text}</div></div><div class="answer">${control}</div></div></li></ul>`;

test('reports the text beside a control that nothing names', async () => {
  const [field] = (
    await extract(
      page(question('Which university did you last attend?', '<div><select name="q1"><option>Mars University</option></select></div>')),
    )
  ).fields;

  assert.equal(field.label, '');
  assert.equal(field.nearbyText, 'Which university did you last attend?');
});

test('keeps a placeholder as the label and reports the text beside the control as well', async () => {
  const [field] = (
    await extract(page(question('Preferred name', '<input name="q2" placeholder="Type your response">')))
  ).fields;

  assert.equal(field.label, 'Type your response');
  assert.equal(field.nearbyText, 'Preferred name');
});

test('does not take an asterisk in nearby text as proof that the field is required', async () => {
  // The text is only a guess at the field's name, and a guess should not turn into a fact.
  const [field] = (await extract(page('<p>* Required fields</p><input name="first" placeholder="First name">'))).fields;

  assert.equal(field.nearbyText, 'Required fields');
  assert.equal(field.required, false);
});

test('reports the question beside a group of radios, not the first choice', async () => {
  const [field] = (
    await extract(
      page(
        question(
          'Are you authorized to work here?',
          `<ul>
             <li><label>Yes <input type="radio" name="q4" value="y"></label></li>
             <li><label>No <input type="radio" name="q4" value="n"></label></li>
           </ul>`,
        ),
      ),
    )
  ).fields;

  assert.equal(field.nearbyText, 'Are you authorized to work here?');
});

test('does not offer nearby text for a control that has a real label', async () => {
  const [field] = (await extract(page('<p>Tell us about yourself.</p><label>Email <input name="e"></label>'))).fields;

  assert.equal('nearbyText' in field, false);
});

test('does not borrow text from the far side of another control', async () => {
  const info = await extract(page('<p>Your details</p><input name="first"><input name="second">'));

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.nearbyText]),
    [
      ['first', 'Your details'],
      ['second', undefined],
    ],
  );
});

test('does not guess at a name for a control nobody can see', async () => {
  // Captcha widgets, for one, keep an invisible textarea next to their own small print.
  const [field] = (await extract(page('<div>Protected by a captcha</div><textarea name="token" style="display:none"></textarea>'))).fields;

  assert.equal('nearbyText' in field, false);
});

test('does not mistake a long passage for the name of the control after it', async () => {
  const passage = 'We are a small team building tools for people who apply to many jobs. '.repeat(20);
  const [field] = (await extract(page(`<div>${passage}</div><div><input name="alerts"></div>`))).fields;

  assert.equal('nearbyText' in field, false);
});

test('does not offer text from outside the form as the name of a control inside it', async () => {
  const [field] = (await extract(page('<p>Welcome to Acme</p><form><input name="q"></form>'))).fields;

  assert.equal('nearbyText' in field, false);
});

test('does not borrow text from the far side of a button', async () => {
  const [field] = (await extract(page('<div>Work history</div><button>Add another job</button><input name="x">'))).fields;

  assert.equal('nearbyText' in field, false);
});

test('reports the question before a group of radios whose labels sit beside them', async () => {
  const [field] = (
    await extract(
      page(
        `<p>Open to remote work?</p>
         <label for="remote-yes">Yes</label><input type="radio" id="remote-yes" name="remote" value="y">
         <label for="remote-no">No</label><input type="radio" id="remote-no" name="remote" value="n">`,
      ),
    )
  ).fields;

  assert.equal(field.nearbyText, 'Open to remote work?');
});

test('reports the text beside a control at the top of a shadow root', async () => {
  const [field] = (
    await extract(
      page(
        `<color-question id="host"></color-question>
         <script>
           document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML =
             '<div>Favourite colour</div><input name="colour">';
         </script>`,
      ),
    )
  ).fields;

  assert.equal(field.nearbyText, 'Favourite colour');
});

test('leaves hidden text and icon titles out of the text beside a control', async () => {
  const [field] = (
    await extract(
      page(
        '<div><span>Portfolio</span><span style="display:none">Invalid link</span>' +
          '<svg width="10" height="10"><title>Help</title></svg></div><input name="q5">',
      ),
    )
  ).fields;

  assert.equal(field.nearbyText, 'Portfolio');
});

// ---------------------------------------------------------------------------------------------
// Groups of radios and checkboxes
// ---------------------------------------------------------------------------------------------

test('folds a radio group into one field with an option per radio', async () => {
  const info = await extract(
    page(
      `<form id="application">
         <fieldset>
           <legend>Are you authorized to work in the US? *</legend>
           <label><input type="radio" name="auth" value="yes" id="auth-yes"> Yes</label>
           <label><input type="radio" name="auth" value="no" id="auth-no"> No</label>
         </fieldset>
       </form>`,
    ),
  );

  assert.deepEqual(info.fields, [
    {
      label: 'Are you authorized to work in the US?',
      type: 'radio',
      name: 'auth',
      required: true,
      disabled: false,
      visible: true,
      form: 0,
      options: [
        { label: 'Yes', value: 'yes', selector: '#auth-yes' },
        { label: 'No', value: 'no', selector: '#auth-no' },
      ],
    },
  ]);
});

test('names a radio group after its ARIA group label when there is no legend', async () => {
  const [field] = (
    await extract(
      page(
        `<div role="radiogroup" aria-labelledby="question">
           <p id="question">Will you need visa sponsorship?</p>
           <label><input type="radio" name="sponsorship" value="yes"> Yes</label>
           <label><input type="radio" name="sponsorship" value="no"> No</label>
         </div>`,
      ),
    )
  ).fields;

  assert.equal(field.label, 'Will you need visa sponsorship?');
});

test('folds ARIA radios into their radiogroup, each choice named by its own text', async () => {
  const info = await extract(
    page(
      `<span id="plan">Choose a plan</span>
       <div role="radiogroup" aria-labelledby="plan" aria-required="true">
         <div role="radio" id="free" aria-checked="false" tabindex="0">Free</div>
         <div role="radio" id="pro" aria-checked="false">Pro</div>
         <div role="radio" id="team" aria-checked="false">Team</div>
       </div>`,
    ),
  );

  assert.deepEqual(info.fields, [
    {
      label: 'Choose a plan',
      type: 'radio',
      name: '',
      required: true,
      disabled: false,
      visible: true,
      form: null,
      options: [
        { label: 'Free', value: '', selector: '#free' },
        { label: 'Pro', value: '', selector: '#pro' },
        { label: 'Team', value: '', selector: '#team' },
      ],
    },
  ]);
});

test('points at each radio without an id by its name and value', async () => {
  const [field] = (
    await extract(page('<input type="radio" name="size" value="s"><input type="radio" name="size" value="m">'))
  ).fields;

  assert.deepEqual(
    field.options.map((option) => option.selector),
    ['input[name="size"][value="s"]', 'input[name="size"][value="m"]'],
  );
});

test('keeps radio groups with the same name in different forms apart', async () => {
  const info = await extract(
    page(
      `<form><input type="radio" name="choice" value="a"><input type="radio" name="choice" value="b"></form>
       <form><input type="radio" name="choice" value="c"></form>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.form, field.options.map((option) => option.value)]),
    [
      [0, ['a', 'b']],
      [1, ['c']],
    ],
  );
});

test('lists a group where its first member sits among the other fields', async () => {
  const info = await extract(
    page(
      `<input name="before"><input type="radio" name="pick" value="1"><input name="between">
       <input type="radio" name="pick" value="2"><input name="after">`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => field.name),
    ['before', 'pick', 'between', 'after'],
  );
});

test('marks a radio group required when one of its radios is', async () => {
  const [field] = (
    await extract(page('<input type="radio" name="size" value="s"><input type="radio" name="size" value="m" required>'))
  ).fields;

  assert.equal(field.required, true);
});

test('calls a group disabled only when every member is', async () => {
  const info = await extract(
    page(
      `<input type="radio" name="some" value="1" disabled><input type="radio" name="some" value="2">
       <input type="radio" name="all" value="1" disabled><input type="radio" name="all" value="2" disabled>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.disabled]),
    [
      ['some', false],
      ['all', true],
    ],
  );
});

test('folds checkboxes that share a name into one field', async () => {
  const info = await extract(
    page(
      `<fieldset>
         <legend>Which days can you work?</legend>
         <label><input type="checkbox" name="days" value="mon"> Monday</label>
         <label><input type="checkbox" name="days" value="tue"> Tuesday</label>
       </fieldset>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => ({
      label: field.label,
      type: field.type,
      name: field.name,
      options: field.options.map((option) => [option.label, option.value]),
    })),
    [
      {
        label: 'Which days can you work?',
        type: 'checkbox',
        name: 'days',
        options: [
          ['Monday', 'mon'],
          ['Tuesday', 'tue'],
        ],
      },
    ],
  );
});

test('keeps a lone checkbox as a field of its own, named by its own label', async () => {
  const info = await extract(
    page(
      `<fieldset>
         <legend>Almost done</legend>
         <label><input type="checkbox" name="terms"> I agree to the terms</label>
       </fieldset>`,
    ),
  );

  assert.equal(info.fields.length, 1);
  assert.equal(info.fields[0].label, 'I agree to the terms');
  assert.equal(info.fields[0].options, undefined);
});

// ---------------------------------------------------------------------------------------------
// Buttons and forms
// ---------------------------------------------------------------------------------------------

test('lists buttons with their text, type and state', async () => {
  const info = await extract(
    page(
      `<form>
         <button>Submit application</button>
         <button type="button" disabled>Add another</button>
         <input type="submit" value="Save draft">
         <input type="reset" value="Clear">
       </form>
       <div role="button" aria-label="Close dialog" tabindex="0"></div>`,
    ),
  );

  assert.deepEqual(
    info.buttons.map(({ text, type, disabled, form }) => ({ text, type, disabled, form })),
    [
      { text: 'Submit application', type: 'submit', disabled: false, form: 0 },
      { text: 'Add another', type: 'button', disabled: true, form: 0 },
      { text: 'Save draft', type: 'submit', disabled: false, form: 0 },
      { text: 'Clear', type: 'reset', disabled: false, form: 0 },
      { text: 'Close dialog', type: 'button', disabled: false, form: null },
    ],
  );
});

test('gives a submit or reset input with no text of its own the text the browser shows', async () => {
  const info = await extract(page('<form><input type="submit"><input type="reset"></form>'));

  assert.deepEqual(
    info.buttons.map((button) => button.text),
    ['Submit', 'Reset'],
  );
});

test('copes with a form whose controls shadow the form own properties', async () => {
  // A form exposes its controls by name or id, so here form.children and form.matches are inputs.
  const info = await extract(
    page(
      `<form id="booking">
         <label for="children">Children</label><input id="children" type="number">
         <input name="matches" aria-label="Matches played">
         <div><input aria-label="Adults"></div>
         <div><input aria-label="Rooms"></div>
         <button>Search</button><button>Clear</button>
       </form>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.label, field.selector]),
    [
      ['Children', '#children'],
      ['Matches played', 'input[name="matches"]'],
      ['Adults', '#booking > div:nth-of-type(1) > input'],
      ['Rooms', '#booking > div:nth-of-type(2) > input'],
    ],
  );
  assert.deepEqual(
    info.buttons.map((button) => button.selector),
    ['#booking > button:nth-of-type(1)', '#booking > button:nth-of-type(2)'],
  );
});

test('still returns the rest of the page when one part of it cannot be read', async () => {
  await tab.goto(server.serve(page('<a id="trap" href="/x">Link</a><input name="email">')));
  // Stands in for a page odd enough to trip one part of the extractor.
  await tab.evaluate(() => {
    Object.defineProperty(document.querySelector('#trap'), 'href', {
      get() {
        throw new Error('This link is a trap');
      },
    });
  });
  const info = await tab.evaluate(extractPageInfo);

  assert.deepEqual(info.links, []);
  assert.deepEqual(
    info.fields.map((field) => field.name),
    ['email'],
  );
  assert.ok(info.html.includes('<input name="email">'));
  assert.equal(info.problems.length, 1);
  assert.match(info.problems[0], /links/);
});

test('lists forms and ties each field to its form', async () => {
  const info = await extract(
    page(
      `<form id="search" action="/search"><input name="q"></form>
       <form name="apply" action="/apply" method="POST"><input name="email"></form>
       <input name="loose">`,
    ),
  );

  assert.deepEqual(info.forms, [
    { selector: '#search', id: 'search', name: '', action: `${server.origin}/search`, method: 'get' },
    { selector: 'form[name="apply"]', id: '', name: 'apply', action: `${server.origin}/apply`, method: 'post' },
  ]);
  assert.deepEqual(
    info.fields.map((field) => [field.name, field.form]),
    [
      ['q', 0],
      ['email', 1],
      ['loose', null],
    ],
  );
});

test('reads form details even when inputs shadow the form properties', async () => {
  // <input name="action"> makes form.action return that input instead of the address.
  const info = await extract(
    page(
      `<form id="real-id" name="real-name" action="/submit" method="post">
         <input name="id"><input name="name"><input name="action"><input name="method">
       </form>`,
    ),
  );

  assert.deepEqual(info.forms, [
    { selector: '#real-id', id: 'real-id', name: 'real-name', action: `${server.origin}/submit`, method: 'post' },
  ]);
});

// ---------------------------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------------------------

const selectorCases = [
  [
    'a test hook, ahead of its id',
    '<input id="input-12" data-automation-id="legalName" name="n">',
    '[data-automation-id="legalName"]',
  ],
  ['its id', '<input id="email" name="e">', '#email'],
  ['its name when it has no id', '<textarea name="cover_letter"></textarea>', 'textarea[name="cover_letter"]'],
];
for (const [what, html, want] of selectorCases) {
  test(`points at a field by ${what}`, async () => {
    const [field] = (await extract(page(html))).fields;

    assert.equal(field.selector, want);
  });
}

test('starts a positional selector from the nearest ancestor it can name', async () => {
  const info = await extract(page('<form id="application"><p><input></p><p><input></p></form>'));

  assert.deepEqual(
    info.fields.map((field) => field.selector),
    ['#application > p:nth-of-type(1) > input', '#application > p:nth-of-type(2) > input'],
  );
});

test('gives every field a selector that finds that element and nothing else', async () => {
  // data-n numbers the inputs so the test can tell which element each selector lands on.
  await tab.goto(
    server.serve(
      page(
        `<form>
           <input data-n="0" id="first">
           <input data-n="1" name="email">
           <p><input data-n="2"></p>
           <p><input data-n="3"></p>
           <input data-n="4" id="twin" name="twin-a">
           <input data-n="5" id="twin" name="twin-b">
           <input data-n="6" name="same">
           <input data-n="7" name="same">
           <input data-n="8" id="1st.choice">
           <input data-n="9" name='quo"te'>
           <input data-n="10" data-testid="dup">
           <input data-n="11" data-testid="dup">
           <o:p><input data-n="12"></o:p>
         </form>`,
      ),
    ),
  );
  const { fields } = await tab.evaluate(extractPageInfo);
  const found = await tab.evaluate(
    (selectors) => selectors.map((selector) => [...document.querySelectorAll(selector)].map((el) => el.dataset.n)),
    fields.map((field) => field.selector),
  );

  assert.deepEqual(found, [['0'], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['10'], ['11'], ['12']]);
});

// ---------------------------------------------------------------------------------------------
// Shadow DOM
// ---------------------------------------------------------------------------------------------

test('finds fields inside shadow roots, in page order, with selectors that cross into them', async () => {
  const info = await extract(
    page(
      `<input name="before">
       <fancy-input id="host"></fancy-input>
       <input name="after">
       <script>
         document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML =
           '<label for="link">Portfolio link</label><input id="link" name="portfolio">';
       </script>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => [field.name, field.label, field.selector]),
    [
      ['before', '', 'input[name="before"]'],
      ['portfolio', 'Portfolio link', '#host >>> #link'],
      ['after', '', 'input[name="after"]'],
    ],
  );
});

test('reaches fields in shadow roots nested inside other shadow roots', async () => {
  const info = await extract(
    page(
      `<outer-box id="outer"></outer-box>
       <script>
         const outer = document.querySelector('#outer').attachShadow({ mode: 'open' });
         outer.innerHTML = '<inner-box id="inner"></inner-box>';
         outer.querySelector('#inner').attachShadow({ mode: 'open' }).innerHTML = '<input name="deep">';
       </script>`,
    ),
  );

  assert.deepEqual(
    info.fields.map((field) => field.selector),
    ['#outer >>> #inner >>> input[name="deep"]'],
  );
});

test('gives fields inside a shadow root selectors that single them out there too', async () => {
  await tab.goto(
    server.serve(
      page(
        `<nested-form id="host"></nested-form>
         <script>
           document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML =
             '<div><input data-n="0"></div><section><div><input data-n="1"></div></section>';
         </script>`,
      ),
    ),
  );
  const { fields } = await tab.evaluate(extractPageInfo);
  // Each selector is "host selector >>> selector inside its shadow root".
  const found = await tab.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const [host, inside] = selector.split(' >>> ');
        return [...document.querySelector(host).shadowRoot.querySelectorAll(inside)].map((el) => el.dataset.n);
      }),
    fields.map((field) => field.selector),
  );

  assert.deepEqual(found, [['0'], ['1']]);
});

test('does not mistake an element named "host" for the host of a shadow root', { timeout: 10_000 }, async () => {
  const [field] = (await extract(page('<form name="host"><input name="q"></form>'))).fields;

  assert.equal(field.selector, 'input[name="q"]');
});

// ---------------------------------------------------------------------------------------------
// Raw HTML and embedded frames
// ---------------------------------------------------------------------------------------------

test('captures the html of the whole page as it stands, not as it was served', async () => {
  const info = await extract(
    '<!DOCTYPE html><html lang="en" data-theme="dark"><head><title>T</title></head><body><main id="app"></main>' +
      '<script>document.querySelector("#app").textContent = "Rendered later";</script></body></html>',
  );

  assert.equal(
    info.html,
    '<!DOCTYPE html>\n<html lang="en" data-theme="dark"><head><title>T</title></head><body><main id="app">Rendered later</main>' +
      '<script>document.querySelector("#app").textContent = "Rendered later";</script></body></html>',
  );
});

test('includes the content of shadow roots in the html', async () => {
  const info = await extract(
    page(
      '<x-card></x-card>' +
        `<script>document.querySelector('x-card').attachShadow({ mode: 'open' }).innerHTML = '<p>Inside the shadow</p>';</script>`,
    ),
  );

  const want =
    '<!DOCTYPE html>\n<html lang="en"><head><title>Test page</title></head><body>' +
    '<x-card><template shadowrootmode="open"><p>Inside the shadow</p></template></x-card>';
  assert.equal(info.html.slice(0, want.length), want);
});

test('blanks password values in the html and leaves other values alone', async () => {
  const info = await extract(
    page('<input type="password" name="pw" value="tr0ub4dor&amp;3"><input name="user" value="ada">'),
  );

  assert.ok(!info.html.includes('tr0ub4dor'), `password found in: ${info.html}`);
  assert.ok(info.html.includes('<input name="user" value="ada">'), `other value missing from: ${info.html}`);
});

test('blanks passwords on a page that has shadow roots, inside them and out', async () => {
  const info = await extract(
    page(
      `<input type="password" name="outer" value="s3cret-outside">
       <login-box id="host"></login-box>
       <script>
         document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML =
           '<input type="password" name="inner" value="s3cret-inside">';
       </script>`,
    ),
  );

  assert.ok(!info.html.includes('s3cret-outside'), `password found in: ${info.html}`);
  assert.ok(!info.html.includes('s3cret-inside'), `password found in: ${info.html}`);
});

test('blanks a password that was only assigned to the control, not written into the markup', async () => {
  const info = await extract(
    page(
      `<input type="password" id="pw"><input id="user">
       <script>
         document.querySelector('#pw').value = 'typed-secret';
         document.querySelector('#user').value = 'ada-typed';
       </script>`,
    ),
  );

  assert.ok(!info.html.includes('typed-secret'), `password found in: ${info.html}`);
  assert.ok(info.html.includes('ada-typed'), `other value missing from: ${info.html}`);
});

test('blanks a password that has been switched to plain text by a show-password toggle', async () => {
  const info = await extract(
    page('<input type="text" name="pw" autocomplete="current-password" value="s3cret-shown">'),
  );

  assert.ok(!info.html.includes('s3cret-shown'), `password found in: ${info.html}`);
});

test('lists embedded frames with their address, size and position among the page frames', async () => {
  // An <object> only becomes a frame once an html page has loaded into it.
  server.serve('<!DOCTYPE html><title>Legacy form</title>', 'legacy-form');
  const info = await extract(
    page(
      `<iframe src="/embedded-form" title="Application form" width="400" height="300" style="border:0"></iframe>
       <iframe src="/pixel" style="display:none"></iframe>
       <object data="/legacy-form" type="text/html" width="300" height="200"></object>`,
    ),
  );

  assert.deepEqual(info.iframes, [
    { src: `${server.origin}/embedded-form`, title: 'Application form', index: 0, width: 400, height: 300, visible: true },
    { src: `${server.origin}/pixel`, title: '', index: 1, width: 0, height: 0, visible: false },
    { src: `${server.origin}/legacy-form`, title: '', index: 2, width: 300, height: 200, visible: true },
  ]);
});

test('says the page itself sits at the top of the frame tree', async () => {
  const info = await extract(page('<iframe src="/inner"></iframe>'));

  assert.deepEqual(info.framePath, []);
});

test('does not count a file picker as hidden just because a styled button stands in for it', async () => {
  const [field] = (
    await extract(
      page(
        '<button type="button">Attach</button>' +
          '<input type="file" name="resume" style="position:absolute; width:1px; height:1px; opacity:0">',
      ),
    )
  ).fields;

  assert.equal(field.visible, true);
});

// ---------------------------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------------------------

// Each of these once did work per control that rescanned the whole page, and took seconds.
const filler = '<a href="/x"><span>Link</span></a><svg><path d="M0 0h9"/><circle r="2"/></svg>';
const bigPages = [
  [
    '6000 fields that have ids',
    Array.from({ length: 6000 }, (_, i) => `<div><label for="f${i}">Field ${i}</label><input id="f${i}">${filler}</div>`),
    (info) => [info.fields.length, info.fields[5999].label, info.fields[5999].selector],
    [6000, 'Field 5999', '#f5999'],
  ],
  [
    '6000 fields that have only names',
    Array.from({ length: 6000 }, (_, i) => `<div><label>Field ${i} <input name="n${i}"></label>${filler}</div>`),
    (info) => [info.fields.length, info.fields[5999].label, info.fields[5999].selector],
    [6000, 'Field 5999', 'input[name="n5999"]'],
  ],
  [
    '6000 fields with nothing to tell them apart',
    Array.from({ length: 6000 }, (_, i) => `<div><label>Field ${i} <input></label>${filler}</div>`),
    (info) => [info.fields.length, info.fields[5999].selector],
    [6000, 'html > body > div:nth-of-type(6000) > label > input'],
  ],
  [
    '3000 table rows with a checkbox and a button each',
    [
      '<table>',
      ...Array.from(
        { length: 3000 },
        (_, i) => `<tr><td><input type="checkbox" name="pick" value="${i}"></td><td>Row ${i}</td><td><button>Edit</button></td></tr>`,
      ),
      '</table>',
    ],
    (info) => [info.fields[0].options.length, info.buttons.length, info.buttons[2999].selector],
    [3000, 3000, 'html > body > table > tbody > tr:nth-of-type(3000) > td:nth-of-type(3) > button'],
  ],
];
for (const [name, rows, summarise, want] of bigPages) {
  test(`stays quick on a page with ${name}`, async () => {
    await tab.goto(server.serve(page(rows.join(''))));

    const { elapsed, summary } = await tab.evaluate(`(() => {
      const started = performance.now();
      const info = (${extractPageInfo})();
      return { elapsed: performance.now() - started, summary: (${summarise})(info) };
    })()`);

    assert.deepEqual(summary, want);
    assert.ok(elapsed < 2000, `took ${Math.round(elapsed)} ms`);
  });
}
