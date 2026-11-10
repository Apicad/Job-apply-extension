import { afterEach, describe, expect, it } from 'vitest';
import { browserEnv } from '../../lib/page/layout';
import { isHiddenByMarkup, isShown } from '../../lib/page/visibility';
import type { Control, PageEnv } from '../../lib/types';

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

afterEach(() => {
  body.innerHTML = '';
});

describe('isHiddenByMarkup', () => {
  const cases: [name: string, html: string, want: boolean][] = [
    // Hidden: the markup itself says nobody is meant to see or use this.
    ['<input type="hidden">', '<input id="target" type="hidden">', true],
    ['type=hidden in capitals', '<input id="target" type="HIDDEN">', true],
    ['the hidden attribute', '<input id="target" hidden>', true],
    ['hidden="until-found"', '<input id="target" hidden="until-found">', true],
    ['hidden on an ancestor', '<div hidden><p><input id="target"></p></div>', true],
    ['inert', '<input id="target" inert>', true],
    ['inert on an ancestor', '<section inert><input id="target"></section>', true],
    ['aria-hidden=true', '<input id="target" aria-hidden="true">', true],
    ['aria-hidden=TRUE', '<input id="target" aria-hidden="TRUE">', true],
    ['aria-hidden on an ancestor', '<div aria-hidden="true"><label>Email <input id="target"></label></div>', true],
    // Verbatim from Greenhouse: React-Select's invisible helper beside a required dropdown.
    [
      'Greenhouse required-select helper',
      '<input id="target" required="" tabindex="-1" aria-hidden="true" class="remix-css-1a0ro4n-requiredInput" value=""/>',
      true,
    ],
    ['inside a closed <details>', '<details><summary>More</summary><input id="target"></details>', true],
    ['deep inside a closed <details>', '<details><summary>More</summary><div><p><input id="target"></p></div></details>', true],
    [
      'in an open <details> inside a closed one',
      '<details><summary>Outer</summary><details open><summary>Inner</summary><input id="target"></details></details>',
      true,
    ],
    ['in a second <summary>, which a closed <details> does not show', '<details><summary>Shown</summary><summary><input id="target"></summary></details>', true],
    // Not hidden as far as markup can tell (layout may still say otherwise).
    ['a plain input', '<input id="target">', false],
    ['aria-hidden=false', '<div aria-hidden="false"><input id="target"></div>', false],
    ['aria-hidden without a value', '<input id="target" aria-hidden>', false],
    ['a hidden sibling', '<span hidden>Required</span><input id="target"><span aria-hidden="true">*</span>', false],
    ['a class named hidden (that is a matter for layout)', '<div class="hidden visually-hidden"><input id="target" class="d-none"></div>', false],
    ['data-hidden', '<div data-hidden="true"><input id="target" data-inert></div>', false],
    ['tabindex=-1', '<input id="target" tabindex="-1">', false],
    ['inside an open <details>', '<details open><summary>More</summary><input id="target"></details>', false],
    ['in the <summary> of a closed <details>, which stays on screen', '<details><summary><input id="target"></summary><p>Body</p></details>', false],
    [
      'in an open <details> whose own closed <details> is a sibling',
      '<details open><summary>Open</summary><input id="target"><details><summary>Closed</summary></details></details>',
      false,
    ],
    ['a text input named "hidden"', '<input id="target" name="hidden" value="hidden">', false],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    mount(html);

    expect(isHiddenByMarkup(find('#target'))).toBe(want);
  });

  it('looks past the top of a shadow tree: a hidden host hides what is inside it', () => {
    mount('<div hidden><div id="host"></div></div><div id="open-host"></div>');
    const hiddenRoot = find('#host').attachShadow({ mode: 'open' });
    hiddenRoot.innerHTML = '<p><input id="inside"></p>';
    const shownRoot = find('#open-host').attachShadow({ mode: 'open' });
    shownRoot.innerHTML = '<p><input id="inside"></p>';

    const inHidden = hiddenRoot.getElementById('inside');
    const inShown = shownRoot.getElementById('inside');
    if (inHidden === null || inShown === null) throw new Error('the fixture has no #inside');

    expect(isHiddenByMarkup(inHidden)).toBe(true);
    expect(isHiddenByMarkup(inShown)).toBe(false);
  });

  it('finds a closed <details> around the host of a shadow tree', () => {
    mount('<details><summary>More</summary><div id="host"></div></details>');
    const root = find('#host').attachShadow({ mode: 'open' });
    // inside the tree the input sits in a <summary>, which its own closed <details> keeps on screen
    root.innerHTML = '<details><summary><input id="inside"></summary></details>';
    const inside = root.getElementById('inside');
    if (inside === null) throw new Error('the fixture has no #inside');

    expect(isHiddenByMarkup(inside)).toBe(true);
  });

  it('judges elements that are not controls too (labels and buttons stand in for hidden inputs)', () => {
    mount('<div aria-hidden="true"><label id="a">Attach</label></div><button id="b" hidden>Attach</button><label id="c">Attach</label>');

    expect([isHiddenByMarkup(find('#a')), isHiddenByMarkup(find('#b')), isHiddenByMarkup(find('#c'))]).toEqual([
      true,
      true,
      false,
    ]);
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

describe('isHiddenByMarkup: names chosen by the page cannot break it', () => {
  it('never reads a property off a form, whether the form is the element or an ancestor', () => {
    mount(`
      <form id="shown"><input name="closest"><details><summary>More</summary><input id="in-closed-details" name="parentElement"></details></form>
      <div hidden><form id="hidden-inside"><input id="in-hidden-form" name="hidden"></form></div>
      <form id="hidden-itself" aria-hidden="true"><input name="getAttribute"></form>`);
    const shown = trap(find<HTMLFormElement>('#shown'));
    const hiddenInside = trap(find<HTMLFormElement>('#hidden-inside'));
    const hiddenItself = trap(find<HTMLFormElement>('#hidden-itself'));

    expect(isHiddenByMarkup(shown)).toBe(false);
    expect(isHiddenByMarkup(hiddenInside)).toBe(true);
    expect(isHiddenByMarkup(hiddenItself)).toBe(true);
    expect(isHiddenByMarkup(find('#in-closed-details'))).toBe(true);
    expect(isHiddenByMarkup(find('#in-hidden-form'))).toBe(true);
    expect(isHiddenByMarkup(find('[name="closest"]'))).toBe(false);
  });
});

/**
 * Stands in for the browser's layout, which jsdom does not have. An element counts as rendered unless
 * it, or an element around it, is marked data-test-hidden: the way display:none, a 1px clip or
 * opacity:0 on a wrapper takes a whole subtree off the screen.
 */
const env: PageEnv = {
  isRendered: (el) => el.closest('[data-test-hidden]') === null,
  assignFiles: () => {
    throw new Error('visibility never assigns files');
  },
};

/** What the real `browserEnv` answers in jsdom: nothing is rendered, because nothing can be measured. */
const noLayout: PageEnv = { ...env, isRendered: () => false };

/** The control made of the elements that match the selector (several radios make one group). */
function controlAt(selector: string): Control {
  const els = Array.from(body.querySelectorAll<HTMLElement>(selector));
  const first = els[0];
  if (first === undefined) throw new Error(`the fixture has no ${selector}`);
  if (first.localName === 'select') return { control: 'select', el: first as HTMLSelectElement };
  if (first.localName === 'textarea') return { control: 'textarea', el: first as HTMLTextAreaElement };
  const input = first as HTMLInputElement;
  if (input.type === 'radio') return { control: 'radio', el: input, radios: els as HTMLInputElement[] };
  if (input.type === 'file') return { control: 'file', el: input };
  return { control: input.getAttribute('role') === 'combobox' ? 'combobox' : 'text', el: input };
}

function shown(html: string, selector = '#target'): boolean {
  mount(html);
  return isShown(controlAt(selector), env);
}

describe('isShown: a text box, textarea or dropdown must itself be visible', () => {
  const cases: [name: string, html: string, want: boolean][] = [
    ['a visible text box', '<label for="target">Email</label><input id="target" type="email">', true],
    ['a visible textarea', '<textarea id="target"></textarea>', true],
    ['a visible dropdown', '<select id="target"><option>CA</option></select>', true],
    ['a visible combobox', '<input id="target" role="combobox" aria-autocomplete="list">', true],
    // Honeypots: the box itself is off the screen (opacity:0, a 1px clip, left:-9999px, display:none).
    ['a text box that is not rendered', '<input id="target" name="email" data-test-hidden>', false],
    ['a textarea that is not rendered', '<textarea id="target" data-test-hidden></textarea>', false],
    ['a dropdown that is not rendered', '<select id="target" data-test-hidden><option>CA</option></select>', false],
    ['a combobox that is not rendered', '<input id="target" role="combobox" data-test-hidden>', false],
    ['a text box inside a wrapper that is not rendered', '<div data-test-hidden><p><input id="target" name="website"></p></div>', false],
    // A visible label, button or wrapper never vouches for a hidden text box.
    [
      'hidden text box with a visible label[for]',
      '<input id="target" autocomplete="street-address" data-test-hidden><label for="target">Subscribe to updates</label>',
      false,
    ],
    ['hidden text box inside a visible label', '<label>Website <input id="target" name="website" data-test-hidden></label>', false],
    [
      'hidden text box beside a visible button (the same shape as a Greenhouse upload)',
      '<div role="group"><button type="button">Attach</button><input id="target" class="visually-hidden" type="text" name="email" data-test-hidden></div>',
      false,
    ],
    ['hidden dropdown inside a visible label', '<label>State <select id="target" data-test-hidden><option>CA</option></select></label>', false],
    // Hidden by markup, whatever layout says.
    ['aria-hidden text box', '<input id="target" aria-hidden="true">', false],
    ['text box in a hidden block', '<div hidden><input id="target"></div>', false],
    ['text box in an inert block', '<div inert><input id="target"></div>', false],
    ['dropdown in a closed <details>', '<details><summary>More</summary><select id="target"><option>CA</option></select></details>', false],
    // Disabled and read-only controls are not ours to change.
    ['disabled text box', '<input id="target" disabled>', false],
    ['text box in a disabled fieldset', '<fieldset disabled><input id="target"></fieldset>', false],
    ['aria-disabled text box', '<input id="target" aria-disabled="true">', false],
    ['read-only text box', '<input id="target" readonly value="ada@example.com">', false],
    ['aria-readonly text box', '<input id="target" aria-readonly="true">', false],
    ['disabled dropdown', '<select id="target" disabled><option>CA</option></select>', false],
    ['read-only textarea', '<textarea id="target" readonly></textarea>', false],
    // Still shown.
    ['aria-disabled=false', '<input id="target" aria-disabled="false" aria-readonly="false">', true],
    ['text box in the legend of a disabled fieldset (the browser keeps it enabled)', '<fieldset disabled><legend><input id="target"></legend></fieldset>', true],
    ['a required, empty text box', '<input id="target" required aria-required="true">', true],
    ['a text box next to a hidden one', '<input name="website" data-test-hidden><input id="target">', true],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    expect(shown(html)).toBe(want);
  });

  it('is never shown just because there is no layout to ask', () => {
    mount('<input id="a"><textarea id="b"></textarea><select id="c"><option>CA</option></select>');

    expect(['#a', '#b', '#c'].map((selector) => isShown(controlAt(selector), noLayout))).toEqual([false, false, false]);
  });
});

describe('isShown: a radio group may hide its inputs behind labels or styled wrappers that are visible', () => {
  // Verbatim from a live Lever form: native radios, each inside its own label.
  const LEVER_RADIOS = `
    <li class="application-question custom-question"><div><div class="application-label full-width multiple-choice"><div class="text">Are you legally authorized to work in the country for which you are applying?<span class="required">✱</span></div></div><div class="application-field full-width required-field"><ul data-qa="multiple-choice"><li><label><input type="radio" name="q" value="Yes" required="required" /><span class="application-answer-alternative">Yes</span></label></li><li><label><input type="radio" name="q" value="No" required="required" /><span class="application-answer-alternative">No</span></label></li></ul></div></div></li>`;

  // Shaped like Ashby's radios as its bundle renders them: the input is an opacity:0 overlay on a
  // drawn circle (not rendered for our purposes), the option text is a label[for] beside it.
  const ashbyRadios = (labelAttributes: string): string => `
    <div class="ashby-application-form-field-entry" data-field-path="6f1c2f0e">
      <fieldset>
        <label class="ashby-application-form-question-title" for="6f1c2f0e">Are you authorized to work in the United States?</label>
        <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-0" name="q" data-test-hidden><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-0" ${labelAttributes}>Yes</label></div>
        <div class="_option_1v5e2_35"><span class="_container_132c8_28"><input type="radio" id="form_6f1c2f0e-labeled-radio-1" name="q" data-test-hidden><span class="_circle_132c8_53"></span></span><label for="form_6f1c2f0e-labeled-radio-1" ${labelAttributes}>No</label></div>
      </fieldset>
    </div>`;

  const cases: [name: string, html: string, want: boolean][] = [
    ['Lever: native radios that are visible themselves', LEVER_RADIOS, true],
    ['Ashby: invisible inputs, visible label[for]', ashbyRadios(''), true],
    ['Ashby shape with the option labels not rendered either', ashbyRadios('data-test-hidden'), false],
    ['Ashby shape with aria-hidden option labels', ashbyRadios('aria-hidden="true"'), false],
    [
      'invisible inputs inside visible wrapping labels (button-style radios)',
      '<label class="btn"><input type="radio" name="q" value="Yes" data-test-hidden>Yes</label><label class="btn"><input type="radio" name="q" value="No" data-test-hidden>No</label>',
      true,
    ],
    [
      'invisible inputs without labels, each alone in a visible styled wrapper',
      '<div class="choice"><input type="radio" name="q" value="Yes" data-test-hidden><span class="dot"></span><span>Yes</span></div><div class="choice"><input type="radio" name="q" value="No" data-test-hidden><span class="dot"></span><span>No</span></div>',
      true,
    ],
    [
      'the same, with a visually hidden span around each input',
      '<div class="choice"><span data-test-hidden><input type="radio" name="q" value="Yes"></span><span>Yes</span></div><div class="choice"><span data-test-hidden><input type="radio" name="q" value="No"></span><span>No</span></div>',
      true,
    ],
    // Nothing visible stands in for the radios.
    ['invisible radios with nothing around them', '<input type="radio" name="q" value="1" data-test-hidden><input type="radio" name="q" value="2" data-test-hidden>', false],
    [
      'invisible radios without labels that share one visible wrapper',
      '<div class="question">Pick one <input type="radio" name="q" value="1" data-test-hidden><input type="radio" name="q" value="2" data-test-hidden></div>',
      false,
    ],
    [
      'radios in a step that is not rendered, inside a visible form',
      '<form><input id="first_name"><div class="step" data-test-hidden><div class="choice"><input type="radio" name="q" value="Yes"><span>Yes</span></div><div class="choice"><input type="radio" name="q" value="No"><span>No</span></div></div></form>',
      false,
    ],
    [
      'a lone invisible radio in a hidden block directly inside a form',
      '<form><div data-test-hidden><input type="radio" name="q" value="1"></div></form>',
      false,
    ],
    [
      'a hidden option label is not replaced by the list item around it',
      '<ul><li><label data-test-hidden><input type="radio" name="q" value="Yes">Yes</label></li><li><label data-test-hidden><input type="radio" name="q" value="No">No</label></li></ul>',
      false,
    ],
    [
      'a visible question label around all radios does not stand in for hidden option labels (Lever\'s nested labels)',
      '<label><div class="application-label">Race</div><ul><li><label data-test-hidden><input type="radio" name="q" value="A"><span>A</span></label></li><li><label data-test-hidden><input type="radio" name="q" value="B"><span>B</span></label></li></ul></label>',
      false,
    ],
    // Every option that could be chosen has to be visible.
    [
      'one option hidden, the others visible',
      '<label><input type="radio" name="q" value="Yes">Yes</label><label data-test-hidden><input type="radio" name="q" value="No">No</label>',
      false,
    ],
    [
      'one option in a hidden block',
      '<label><input type="radio" name="q" value="Yes">Yes</label><div hidden><label><input type="radio" name="q" value="No">No</label></div>',
      false,
    ],
    ['aria-hidden radios (the hidden twin of a custom radio)', '<input type="radio" name="q" aria-hidden="true"><input type="radio" name="q" aria-hidden="true">', false],
    // Disabled options cannot be chosen, so they do not have to be visible; a group of only those is not shown.
    [
      'a disabled option that is hidden, next to visible ones',
      '<label><input type="radio" name="q" value="Yes">Yes</label><label><input type="radio" name="q" value="No">No</label><label data-test-hidden><input type="radio" name="q" value="Later" disabled>Later</label>',
      true,
    ],
    ['every option disabled', '<label><input type="radio" name="q" value="Yes" disabled>Yes</label><label><input type="radio" name="q" value="No" disabled>No</label>', false],
    ['the group inside a disabled fieldset', '<fieldset disabled><label><input type="radio" name="q" value="Yes">Yes</label><label><input type="radio" name="q" value="No">No</label></fieldset>', false],
    ['an option marked read-only', '<label><input type="radio" name="q" value="Yes" aria-readonly="true">Yes</label><label><input type="radio" name="q" value="No">No</label>', false],
    // Visible radios need no stand-in.
    ['visible radios whose labels are hidden', '<input type="radio" id="y" name="q"><label for="y" data-test-hidden>Yes</label><input type="radio" id="n" name="q"><label for="n" data-test-hidden>No</label>', true],
    ['visible radios without any label', '<input type="radio" name="q" value="1"><input type="radio" name="q" value="2">', true],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    expect(shown(html, 'input[type="radio"]')).toBe(want);
  });

  it('is never shown just because there is no layout to ask', () => {
    mount(LEVER_RADIOS);

    expect(isShown(controlAt('input[type="radio"]'), noLayout)).toBe(false);
  });
});

describe('isShown: a file input may hide behind a label or button of its own upload widget', () => {
  // Verbatim from a live Greenhouse form. The class visually-hidden is a 1px clipped box: the label
  // and the input carry it (marked data-test-hidden here), the Attach button does not.
  const greenhouseUpload = (groupAttributes = ''): string => `
    <div class="field-wrapper"><div role="group" aria-labelledby="upload-label-resume" aria-required="true" class="file-upload" data-allow-s3="false" ${groupAttributes}><div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="resume" data-test-hidden>Attach</label><input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" data-test-hidden/></div></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="resume-text">Enter manually</button><label class="visually-hidden" for="resume_text" data-test-hidden>Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>`;

  // Verbatim from a live Lever form (SVG icons left out). The input is an opacity:0 overlay on the link.
  const LEVER_UPLOAD = `
    <li class="application-question resume"><label><div class="application-label">Resume/CV <span class="required">✱</span></div><div class="application-field"><a href="#" class="postings-btn template-btn-utility visible-resume-upload"><span class="filename"></span><span class="default-label">ATTACH RESUME/CV</span><input class="application-file-input invisible-resume-upload" data-qa="input-resume" id="resume-upload-input" name="resume" tabindex="-1" type="file" data-test-hidden></a><span class="resume-upload-failure"><div class="resume-upload-label">Couldn't auto-read resume.</div></span><span class="resume-upload-working"><div class="loading-indicator"></div><div class="resume-upload-label">Analyzing resume...</div></span><span class="resume-upload-success"><div class="loading-indicator completed"></div><div class="resume-upload-label">Success!</div></span></div></label><span class="resume-upload-oversize"><p class="error-message">File exceeds the maximum upload size of <b>100MB</b>. Please try a smaller size.</p></span></li>`;

  // Shaped like Ashby's file field as its bundle renders it: a 1px clipped react-dropzone input.
  const ASHBY_UPLOAD = `
    <div class="ashby-application-form-field-entry" data-field-path="_systemfield_resume">
      <label class="ashby-application-form-question-title" for="_systemfield_resume">Resume</label>
      <div class="ashby-application-form-input-file" role="presentation"><input id="_systemfield_resume" type="file" tabindex="-1" required data-test-hidden><div><button type="button">Upload File</button><p>or drag and drop here</p></div></div>
    </div>`;

  const cases: [name: string, html: string, want: boolean][] = [
    ['Greenhouse: clipped input, clipped label, visible Attach button', greenhouseUpload(), true],
    ['Lever: invisible input inside a visible label', LEVER_UPLOAD, true],
    ['Ashby: clipped input, visible label[for] and button', ASHBY_UPLOAD, true],
    ['a plain file input that is visible itself', '<input id="resume" type="file">', true],
    [
      'the classic styled upload: hidden input, visible label[for] as the button',
      '<input id="resume" type="file" data-test-hidden><label for="resume" class="btn">Upload résumé</label>',
      true,
    ],
    ['a div with role=button as the visible control', '<div class="upload"><div role="button">Choose file</div><input type="file" data-test-hidden></div>', true],
    ['an <input type="button"> as the visible control', '<div class="upload"><input type="button" value="Browse…"><input type="file" data-test-hidden></div>', true],
    // The hostile shape: a concealed file input with nothing a person could click.
    ['a bare hidden file input', '<div>Thanks!<input type="file" name="resume" data-test-hidden></div>', false],
    ['a hidden file input with only text around it', '<div class="upload"><p>Resume/CV</p><span>Drop your file</span><input type="file" name="resume" data-test-hidden></div>', false],
    ['a file input in a block that is not rendered', `<div data-test-hidden>${greenhouseUpload()}</div>`, false],
    ['the Greenhouse widget in a hidden block', `<div hidden>${greenhouseUpload()}</div>`, false],
    ['the Greenhouse widget marked aria-hidden', greenhouseUpload('aria-hidden="true"'), false],
    [
      'the only visible button belongs to another field',
      '<div class="row"><div class="field"><input name="email" type="email"><button type="button">Verify</button></div><div class="field"><input type="file" name="resume" data-test-hidden></div></div>',
      false,
    ],
    [
      'a visible button in a wrapper shared with another field',
      '<div class="row"><input name="email" type="email"><button type="button">Send</button><input type="file" name="resume" data-test-hidden></div>',
      false,
    ],
    ['hidden input, hidden label, hidden button', '<div class="upload"><button data-test-hidden>Attach</button><label for="resume" data-test-hidden>Attach</label><input id="resume" type="file" data-test-hidden></div>', false],
    ['a visible button directly inside the form is too far away to vouch for it', '<form><input type="file" name="resume" data-test-hidden><button type="submit">Continue</button></form>', false],
    ['a disabled file input', '<label>Resume <input id="resume" type="file" disabled></label>', false],
    ['a file input in a disabled fieldset', '<fieldset disabled><label>Resume <input id="resume" type="file"></label></fieldset>', false],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    expect(shown(html, 'input[type="file"]')).toBe(want);
  });

  it('is never shown just because there is no layout to ask', () => {
    mount(greenhouseUpload());

    expect(isShown(controlAt('input[type="file"]'), noLayout)).toBe(false);
  });
});

describe('isShown: names chosen by the page cannot break it', () => {
  it('never reads a property off the form around the controls', () => {
    mount(`
      <form id="application-form">
        <div class="field"><input id="first_name" name="name"></div>
        <div class="choice"><input type="radio" name="id" value="Yes" data-test-hidden><span>Yes</span></div>
        <div class="choice"><input type="radio" name="id" value="No" data-test-hidden><span>No</span></div>
        <div class="upload"><button type="button">Attach</button><input id="resume" type="file" name="elements" data-test-hidden></div>
        <input id="direct" name="parentElement">
        <input id="bare" type="file" name="children" data-test-hidden>
        <input id="lone" type="radio" name="matches" data-test-hidden>
      </form>`);
    trap(find<HTMLFormElement>('#application-form'));

    const got = ['#first_name', 'input[name="id"]', '#resume', '#direct', '#bare', '#lone'].map((selector) =>
      isShown(controlAt(selector), env),
    );

    expect(got).toEqual([true, true, true, true, false, false]);
  });
});

// ---------------------------------------------------------------------------
// lib/page/layout.ts — the PageEnv for real browsers
// ---------------------------------------------------------------------------

describe('browserEnv.isRendered where there is no layout', () => {
  it('is false in jsdom, which has no checkVisibility: nothing is shown just because it cannot be measured', () => {
    mount('<input id="email" type="email"><label for="email">Email</label><button>Attach</button>');

    expect(['#email', 'label', 'button'].map((selector) => browserEnv.isRendered(find(selector)))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('is false for an element that claims to be visible but has no box (0 by 0)', () => {
    mount('<input id="email" type="email">');
    const input = find('#email');
    Object.defineProperty(input, 'checkVisibility', { configurable: true, value: () => true });

    expect(input.getBoundingClientRect().width).toBe(0);
    expect(browserEnv.isRendered(input)).toBe(false);
  });

  it('is false for an element of a document that is not shown in any window', () => {
    const detached = new DOMParser().parseFromString('<input id="email">', 'text/html');
    const input = detached.getElementById('email');
    if (input === null) throw new Error('the fixture has no #email');
    Object.defineProperty(input, 'checkVisibility', { configurable: true, value: () => true });
    Object.defineProperty(input, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(10, 10, 200, 30) });

    expect(browserEnv.isRendered(input)).toBe(false);
  });

  it('wires browserEnv into isShown: with the real environment nothing is shown in jsdom', () => {
    mount('<input id="email" type="email">');

    expect(isShown(controlAt('#email'), browserEnv)).toBe(false);
  });
});

describe('browserEnv.isRendered with the geometry a browser would report', () => {
  // jsdom lays nothing out, so these tests hand it the numbers: each element named in a scene gets
  // the box, scroll size and checkVisibility answer a browser would give for it. They check the
  // arithmetic of layout.ts. Whether a real browser reports these numbers is for the browser tests.

  /** How an element is hidden from checkVisibility, each needing its own option to be noticed. */
  type Unseen = 'display:none' | 'opacity:0' | 'visibility:hidden' | 'content-visibility:auto, skipped';

  interface FakeBox {
    left: number;
    top: number;
    width: number;
    height: number;
    /** Size of the scrollable content and how far it is scrolled (defaults: the box itself, not scrolled). */
    scrollWidth?: number;
    scrollHeight?: number;
    scrollLeft?: number;
    scrollTop?: number;
    unseen?: Unseen;
  }

  interface Scene {
    name: string;
    html: string;
    boxes: Record<string, FakeBox>;
    /** The whole page: 1000 by 3000 and not scrolled unless a scene says otherwise. */
    page?: { width?: number; height?: number; scrollX?: number; scrollY?: number };
    want: boolean;
  }

  const box = (left: number, top: number, width: number, height: number, more: Partial<FakeBox> = {}): FakeBox => ({
    left,
    top,
    width,
    height,
    ...more,
  });

  function checkVisibilityFor(unseen: Unseen | undefined): (options?: CheckVisibilityOptions) => boolean {
    switch (unseen) {
      case undefined:
        return () => true;
      case 'display:none':
        return () => false;
      case 'opacity:0':
        return (options) => options?.opacityProperty !== true;
      case 'visibility:hidden':
        return (options) => options?.visibilityProperty !== true;
      case 'content-visibility:auto, skipped':
        return (options) => options?.contentVisibilityAuto !== true;
    }
  }

  function layOut(el: Element, fake: FakeBox): void {
    const define = (name: string, value: unknown): void => {
      Object.defineProperty(el, name, { configurable: true, value });
    };
    define('checkVisibility', checkVisibilityFor(fake.unseen));
    define('getBoundingClientRect', () => new DOMRect(fake.left, fake.top, fake.width, fake.height));
    define('scrollWidth', fake.scrollWidth ?? fake.width);
    define('scrollHeight', fake.scrollHeight ?? fake.height);
    define('scrollLeft', fake.scrollLeft ?? 0);
    define('scrollTop', fake.scrollTop ?? 0);
  }

  const root = document.documentElement;
  const realScrollX = Object.getOwnPropertyDescriptor(window, 'scrollX');
  const realScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');

  function setPage(page: Scene['page'] = {}): void {
    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: page.width ?? 1000 });
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: page.height ?? 3000 });
    Object.defineProperty(window, 'scrollX', { configurable: true, value: page.scrollX ?? 0 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: page.scrollY ?? 0 });
  }

  afterEach(() => {
    Reflect.deleteProperty(root, 'scrollWidth');
    Reflect.deleteProperty(root, 'scrollHeight');
    if (realScrollX !== undefined) Object.defineProperty(window, 'scrollX', realScrollX);
    if (realScrollY !== undefined) Object.defineProperty(window, 'scrollY', realScrollY);
  });

  function rendered(scene: Scene): boolean {
    mount(scene.html);
    setPage(scene.page);
    for (const [selector, fake] of Object.entries(scene.boxes)) layOut(find(selector), fake);
    return browserEnv.isRendered(find('#target'));
  }

  const FIELD = '<input id="target" name="email">';

  const scenes: Scene[] = [
    // The page itself: anywhere inside the document counts, wherever the viewport is.
    { name: 'on the first screen', html: FIELD, boxes: { '#target': box(100, 100, 200, 30) }, want: true },
    { name: 'three screens below the fold', html: FIELD, boxes: { '#target': box(100, 2500, 200, 30) }, want: true },
    {
      name: 'above the viewport after the page was scrolled down',
      html: FIELD,
      boxes: { '#target': box(100, -700, 200, 30) },
      page: { scrollY: 1000 },
      want: true,
    },
    {
      name: 'near the end of a scrolled page',
      html: FIELD,
      boxes: { '#target': box(100, 400, 200, 30) },
      page: { scrollY: 2500 },
      want: true,
    },
    { name: 'parked at left: -9999px', html: FIELD, boxes: { '#target': box(-9999, 100, 200, 30) }, want: false },
    { name: 'parked at top: -9999px', html: FIELD, boxes: { '#target': box(100, -9999, 200, 30) }, want: false },
    { name: 'parked beyond the right edge of the page', html: FIELD, boxes: { '#target': box(5000, 100, 200, 30) }, want: false },
    { name: 'parked below the end of the page', html: FIELD, boxes: { '#target': box(100, 4000, 200, 30) }, want: false },
    { name: 'sticking 5px into the page from the left', html: FIELD, boxes: { '#target': box(-195, 100, 200, 30) }, want: false },
    { name: 'sticking 10px into the page from the left', html: FIELD, boxes: { '#target': box(-190, 100, 200, 30) }, want: true },
    { name: 'sticking 5px into the page at its bottom edge', html: FIELD, boxes: { '#target': box(100, 2995, 200, 30) }, want: false },
    // A real box: at least 8 by 8.
    { name: 'a 1px by 1px box (the visually-hidden pattern)', html: FIELD, boxes: { '#target': box(100, 100, 1, 1) }, want: false },
    { name: 'no box at all', html: FIELD, boxes: { '#target': box(0, 0, 0, 0) }, want: false },
    { name: '7px wide', html: FIELD, boxes: { '#target': box(100, 100, 7, 30) }, want: false },
    { name: '7px high', html: FIELD, boxes: { '#target': box(100, 100, 200, 7) }, want: false },
    { name: '8px by 8px', html: FIELD, boxes: { '#target': box(100, 100, 8, 8) }, want: true },
    // checkVisibility, with the three options that make it notice these.
    { name: 'display:none', html: FIELD, boxes: { '#target': box(100, 100, 200, 30, { unseen: 'display:none' }) }, want: false },
    { name: 'opacity:0', html: FIELD, boxes: { '#target': box(100, 100, 200, 30, { unseen: 'opacity:0' }) }, want: false },
    {
      name: 'visibility:hidden',
      html: FIELD,
      boxes: { '#target': box(100, 100, 200, 30, { unseen: 'visibility:hidden' }) },
      want: false,
    },
    {
      name: 'content-visibility:auto content that is being skipped',
      html: FIELD,
      boxes: { '#target': box(100, 100, 200, 30, { unseen: 'content-visibility:auto, skipped' }) },
      want: false,
    },
    // Ancestors that cut off what sticks out of them (overflow: hidden or clip).
    {
      name: 'inside an ordinary overflow:hidden box',
      html: `<div id="clip" style="overflow:hidden">${FIELD}</div>`,
      boxes: { '#clip': box(50, 50, 500, 400), '#target': box(100, 100, 200, 30) },
      want: true,
    },
    {
      name: 'inside a zero-height overflow:hidden box',
      html: `<div id="clip" style="overflow:hidden">${FIELD}</div>`,
      boxes: { '#clip': box(100, 100, 200, 0), '#target': box(100, 100, 200, 30) },
      want: false,
    },
    {
      name: 'a normal-size input inside a 1px visually-hidden wrapper',
      html: `<span id="clip" class="visually-hidden" style="display:block;overflow:hidden">${FIELD}</span>`,
      boxes: { '#clip': box(100, 100, 1, 1), '#target': box(100, 100, 200, 30) },
      want: false,
    },
    {
      name: 'beside the box of an overflow:hidden strip (another step of a carousel)',
      html: `<div id="clip" style="overflow:hidden">${FIELD}</div>`,
      boxes: { '#clip': box(0, 0, 500, 400), '#target': box(600, 100, 200, 30) },
      want: false,
    },
    {
      name: 'cut by overflow:clip so that 5px remain',
      html: `<div id="clip" style="overflow:clip">${FIELD}</div>`,
      boxes: { '#clip': box(0, 0, 500, 105), '#target': box(100, 100, 200, 30) },
      want: false,
    },
    {
      name: 'cut by overflow:hidden so that 20px remain',
      html: `<div id="clip" style="overflow:hidden">${FIELD}</div>`,
      boxes: { '#clip': box(0, 0, 500, 120), '#target': box(100, 100, 200, 30) },
      want: true,
    },
    {
      name: 'cut away by a clipping box two levels up',
      html: `<div id="clip" style="overflow:hidden"><div><p>${FIELD}</p></div></div>`,
      boxes: { '#clip': box(0, 0, 500, 0), '#target': box(100, 100, 200, 30) },
      want: false,
    },
    {
      name: 'overflow:hidden on an inline element clips nothing',
      html: `<label id="clip" style="overflow:hidden">Email ${FIELD}</label>`,
      boxes: { '#clip': box(100, 100, 40, 0), '#target': box(150, 100, 200, 30) },
      want: true,
    },
    {
      name: 'overflow:hidden on a display:contents element clips nothing',
      html: `<div id="clip" style="display:contents;overflow:hidden">${FIELD}</div>`,
      boxes: { '#clip': box(0, 0, 0, 0), '#target': box(100, 100, 200, 30) },
      want: true,
    },
    // Ancestors that scroll: what is inside their scrollable area can be brought into view.
    {
      name: 'below the fold of a scrolling panel',
      html: `<div id="panel" style="overflow:auto">${FIELD}</div>`,
      boxes: { '#panel': box(0, 0, 500, 400, { scrollHeight: 2000 }), '#target': box(100, 1500, 200, 30) },
      want: true,
    },
    {
      name: 'scrolled out of a panel at its top',
      html: `<div id="panel" style="overflow:scroll">${FIELD}</div>`,
      boxes: { '#panel': box(0, 0, 500, 400, { scrollHeight: 2000, scrollTop: 900 }), '#target': box(100, -700, 200, 30) },
      want: true,
    },
    {
      name: 'parked at left: -9999px inside a scrolling panel',
      html: `<div id="panel" style="overflow:auto">${FIELD}</div>`,
      boxes: { '#panel': box(0, 0, 500, 400, { scrollHeight: 2000 }), '#target': box(-9999, 100, 200, 30) },
      want: false,
    },
    {
      name: 'above the start of a scrolling panel',
      html: `<div id="panel" style="overflow:auto">${FIELD}</div>`,
      boxes: { '#panel': box(0, 500, 500, 400, { scrollHeight: 2000 }), '#target': box(100, 200, 200, 30) },
      want: false,
    },
    {
      name: 'beyond the end of what a panel can scroll to',
      html: `<div id="panel" style="overflow:auto">${FIELD}</div>`,
      boxes: { '#panel': box(0, 0, 500, 400, { scrollHeight: 2000 }), '#target': box(100, 2500, 200, 30) },
      want: false,
    },
    {
      name: 'inside a scrolling panel that has no height itself',
      html: `<div id="panel" style="overflow:auto">${FIELD}</div>`,
      boxes: { '#panel': box(0, 0, 500, 0, { scrollHeight: 2000 }), '#target': box(100, 100, 200, 30) },
      want: false,
    },
    {
      name: 'inside a scrolling panel that is itself parked off the page',
      html: `<div id="panel" style="overflow:auto">${FIELD}</div>`,
      boxes: { '#panel': box(-9999, 0, 500, 400, { scrollHeight: 2000 }), '#target': box(-9899, 1500, 200, 30) },
      want: false,
    },
    {
      name: 'an app shell: the page does not scroll, a panel inside an overflow:hidden frame does',
      html: `<div id="frame" style="overflow:hidden"><div id="panel" style="overflow:auto">${FIELD}</div></div>`,
      boxes: {
        '#frame': box(0, 0, 1000, 800),
        '#panel': box(0, 60, 1000, 740, { scrollHeight: 5000 }),
        '#target': box(100, 3000, 200, 30),
      },
      page: { width: 1000, height: 800 },
      want: true,
    },
    {
      name: 'a scrolling panel inside a collapsed overflow:hidden section',
      html: `<div id="frame" style="overflow:hidden"><div id="panel" style="overflow:auto">${FIELD}</div></div>`,
      boxes: {
        '#frame': box(0, 0, 1000, 0),
        '#panel': box(0, 0, 1000, 400, { scrollHeight: 5000 }),
        '#target': box(100, 100, 200, 30),
      },
      want: false,
    },
  ];
  it.each(scenes)('$name', (scene) => {
    expect(rendered(scene)).toBe(scene.want);
  });

  it('follows a shadow tree out to its host when looking for clipping ancestors', () => {
    mount('<div id="clip" style="overflow:hidden"><div id="host"></div></div>');
    setPage();
    const shadowRoot = find('#host').attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<p><input id="inside"></p>';
    const inside = shadowRoot.getElementById('inside');
    if (inside === null) throw new Error('the fixture has no #inside');
    layOut(inside, box(100, 100, 200, 30));
    layOut(find('#clip'), box(100, 100, 200, 0));

    expect(browserEnv.isRendered(inside)).toBe(false);
  });

  it('gives up when the chain of ancestors never ends', () => {
    // In a browser a control named "parentElement" replaces that property of its form, so climbing
    // from the form leads back down into it. jsdom does not do this; the getter below does.
    mount(`<form id="loop">${FIELD}</form>`);
    setPage();
    const input = find('#target');
    layOut(input, box(100, 100, 200, 30));
    Object.defineProperty(find('#loop'), 'parentElement', { configurable: true, get: () => input });

    expect(browserEnv.isRendered(input)).toBe(false);
  });

  it('is false, not an error, when the browser cannot answer', () => {
    mount(FIELD);
    setPage();
    const input = find('#target');
    layOut(input, box(100, 100, 200, 30));
    Object.defineProperty(input, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        throw new Error('no layout');
      },
    });

    expect(browserEnv.isRendered(input)).toBe(false);
  });
});

describe('browserEnv.assignFiles', () => {
  // jsdom has no DataTransfer and refuses any `files` value that it did not make itself, so this
  // only checks how the browser API is used. That a page receives the file is for the browser tests.
  it('puts every file into a DataTransfer and hands its file list to the input', () => {
    const transfers: FakeTransfer[] = [];
    class FakeTransfer {
      added: File[] = [];
      items = { add: (file: File) => this.added.push(file) };
      files = { fake: 'the file list of this transfer' };
      constructor() {
        transfers.push(this);
      }
    }
    Object.defineProperty(globalThis, 'DataTransfer', { configurable: true, value: FakeTransfer });

    const input = document.createElement('input');
    input.type = 'file';
    const assigned: unknown[] = [];
    Object.defineProperty(input, 'files', { configurable: true, set: (value: unknown) => assigned.push(value) });
    const resume = new File(['%PDF-1.7'], 'Ada-Lovelace-Resume.pdf', { type: 'application/pdf' });
    const letter = new File(['Dear team'], 'Ada-Lovelace-Letter.txt', { type: 'text/plain' });

    try {
      browserEnv.assignFiles(input, [resume, letter]);
    } finally {
      Reflect.deleteProperty(globalThis, 'DataTransfer');
    }

    expect(transfers.map((transfer) => transfer.added)).toEqual([[resume, letter]]);
    expect(assigned).toEqual([{ fake: 'the file list of this transfer' }]);
  });
});
