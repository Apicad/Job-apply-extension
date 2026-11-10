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

describe('isShown: the input of a custom dropdown may be next to invisible inside its styled box', () => {
  // Verbatim from a live Greenhouse form (React-Select; <style> blocks and the SVG icon left out).
  // React-Select keeps this input a few pixels wide while it is empty and gives it opacity:0 once
  // an option is chosen, so the input itself is marked as not rendered here. The box a person
  // sees is the div.select__control around it.
  const greenhouseSelect = (shellAttributes = ''): string => `
    <div class="field-wrapper"><div class="select"><div class="select__container"><label id="question_37369961002-label" for="question_37369961002" class="label select__label">Will you now or in the future require sponsorship for a visa to remain in your current location?<span aria-hidden="true">*</span></label><div class="select-shell remix-css-b62m3t-container" ${shellAttributes}><span id="react-select-question_37369961002-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-question_37369961002-placeholder">Select...</div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="label:input;color:inherit;background:0;opacity:1;width:100%;grid-area:1 / 2;font:inherit;min-width:2px;border:0;margin:0;outline:0;padding:0" autoCapitalize="none" autoComplete="off" autoCorrect="off" id="question_37369961002" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="question_37369961002-error" aria-invalid="false" aria-labelledby="question_37369961002-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-question_37369961002-placeholder" enterKeyHint="done" value="" data-test-hidden/></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"></button></div></div></div><input required="" tabindex="-1" aria-hidden="true" class="remix-css-1a0ro4n-requiredInput" value=""/></div></div></div></div>`;

  const cases: [name: string, html: string, want: boolean][] = [
    ['Greenhouse React-Select: a tiny input inside a visible box', greenhouseSelect(), true],
    ['the same dropdown with its whole box not rendered', greenhouseSelect('data-test-hidden'), false],
    ['the same dropdown in a hidden block', `<div hidden>${greenhouseSelect()}</div>`, false],
    ['the same dropdown marked aria-hidden', greenhouseSelect('aria-hidden="true"'), false],
    [
      'an invisible combobox input in a wrapper shared with another field',
      '<div class="row"><input role="combobox" data-test-hidden><input name="email" type="email"></div>',
      false,
    ],
    ['an invisible combobox input directly inside the form', '<form><input role="combobox" data-test-hidden></form>', false],
    ['a disabled combobox', '<div class="select"><input role="combobox" disabled></div>', false],
    ['a combobox input with the hidden attribute inside a visible box', '<div class="select"><input role="combobox" hidden></div>', false],
  ];
  it.each(cases)('%s', (_name, html, want) => {
    expect(shown(html, 'input[role="combobox"]')).toBe(want);
  });

  it('gives no such allowance to a text box: it may be written to, so it must be visible itself', () => {
    expect(shown('<div class="field"><div class="styled-box"><input id="target" name="email" data-test-hidden></div></div>')).toBe(false);
  });

  it('is never shown just because there is no layout to ask', () => {
    mount(greenhouseSelect());

    expect(isShown(controlAt('input[role="combobox"]'), noLayout)).toBe(false);
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
    [
      'a visible wrapper three levels up still vouches for a label-less radio',
      '<div class="choice"><span data-test-hidden><i data-test-hidden><input type="radio" name="q" value="Yes"></i></span><span>Yes</span></div><div class="choice"><span data-test-hidden><i data-test-hidden><input type="radio" name="q" value="No"></i></span><span>No</span></div>',
      true,
    ],
    [
      'a visible wrapper four levels up is too far away',
      '<div class="choice"><span data-test-hidden><b data-test-hidden><i data-test-hidden><input type="radio" name="q" value="Yes"></i></b></span><span>Yes</span></div><div class="choice"><span data-test-hidden><b data-test-hidden><i data-test-hidden><input type="radio" name="q" value="No"></i></b></span><span>No</span></div>',
      false,
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
    [
      'a visible question label around all radios does not vouch for the first option either',
      '<label><div class="application-label">Race</div><ul><li><label data-test-hidden><input type="radio" name="q" value="A"><span>A</span></label></li><li><label><input type="radio" name="q" value="B"><span>B</span></label></li></ul></label>',
      false,
    ],
    // What the markup itself hides stays hidden, whatever stands beside it.
    ['radios with the hidden attribute beside visible labels', '<input type="radio" id="y" name="q" hidden><label for="y">Yes</label><input type="radio" id="n" name="q" hidden><label for="n">No</label>', false],
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
    ['a visible label inside the widget that is not tied to the input', '<div class="upload"><label class="btn">Choose file</label><input type="file" data-test-hidden></div>', true],
    [
      'a visible button four wrappers up is still inside the widget',
      '<div class="upload"><button type="button">Attach</button><div><div><div><input type="file" data-test-hidden></div></div></div></div>',
      true,
    ],
    [
      'a visible button five wrappers up is outside the widget',
      '<div class="upload"><button type="button">Attach</button><div><div><div><div><input type="file" data-test-hidden></div></div></div></div></div>',
      false,
    ],
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
    // What the markup itself hides stays hidden, whatever stands beside it.
    ['a file input with the hidden attribute beside a visible button', '<div class="upload"><button type="button">Upload</button><input type="file" hidden></div>', false],
    ['a file input in a closed <details> with a visible label elsewhere', '<details><summary>More</summary><input id="cv" type="file"></details><label for="cv">Upload CV</label>', false],
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

  it('takes a field inside a web component for the neighbour it is: its wrapper is shared, the button may be the neighbour\'s', () => {
    // the same shape as "a visible button in a wrapper shared with another field", with the e-mail
    // box inside the shadow tree of a component
    mount('<div class="row"><x-input></x-input><button type="button">Send</button><input type="file" name="resume" data-test-hidden></div>');
    find('x-input').attachShadow({ mode: 'open' }).innerHTML = '<input name="email" type="email">';

    expect(isShown(controlAt('input[type="file"]'), env)).toBe(false);
  });

  it('still lets the button stand in when the web component beside it holds no field', () => {
    mount('<div class="row"><x-icon></x-icon><button type="button">Attach</button><input type="file" name="resume" data-test-hidden></div>');
    find('x-icon').attachShadow({ mode: 'open' }).innerHTML = '<svg><title>Paperclip</title></svg>';

    expect(isShown(controlAt('input[type="file"]'), env)).toBe(true);
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
  const realWindow = (['scrollX', 'scrollY', 'innerWidth', 'innerHeight'] as const).map(
    (name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const,
  );

  /** The page is 1000 by 3000 and not scrolled unless a scene says otherwise; the window shows 1000 by 800 of it. */
  function setPage(page: Scene['page'] = {}): void {
    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: page.width ?? 1000 });
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: page.height ?? 3000 });
    Object.defineProperty(window, 'scrollX', { configurable: true, value: page.scrollX ?? 0 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: page.scrollY ?? 0 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  }

  afterEach(() => {
    Reflect.deleteProperty(root, 'scrollWidth');
    Reflect.deleteProperty(root, 'scrollHeight');
    for (const [name, descriptor] of realWindow) {
      if (descriptor !== undefined) Object.defineProperty(window, name, descriptor);
    }
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
    {
      name: 'below the end of a page that is scrolled down',
      html: FIELD,
      boxes: { '#target': box(100, 600, 200, 30) },
      page: { scrollY: 2500 },
      want: false,
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
    // Nearly transparent counts as invisible too; checkVisibility itself only notices exactly 0.
    {
      name: 'opacity: 0.05 on the field',
      html: '<input id="target" name="email" style="opacity:0.05">',
      boxes: { '#target': box(100, 100, 200, 30) },
      want: false,
    },
    {
      name: 'opacity: 0.3 on a wrapper and 0.3 on the field (0.09 together)',
      html: `<div style="opacity:0.3"><p><input id="target" name="email" style="opacity:0.3"></p></div>`,
      boxes: { '#target': box(100, 100, 200, 30) },
      want: false,
    },
    {
      name: 'opacity: 0.5 (a dimmed but readable field)',
      html: `<div style="opacity:0.5">${FIELD}</div>`,
      boxes: { '#target': box(100, 100, 200, 30) },
      want: true,
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
      name: 'far to the right inside a panel that scrolls sideways',
      html: `<div id="panel" style="overflow:auto">${FIELD}</div>`,
      boxes: { '#panel': box(0, 0, 500, 100, { scrollWidth: 2000 }), '#target': box(1500, 10, 200, 30) },
      want: true,
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
    // Fixed to the window (position: fixed): scrolling the page never moves it, so "further down the
    // page" does not exist for it. Only what lies inside the window (1000 by 800 here) can be seen.
    {
      name: 'position:fixed inside the window (a dialog)',
      html: `<div id="fixed" style="position:fixed">${FIELD}</div>`,
      boxes: { '#fixed': box(100, 50, 600, 500), '#target': box(150, 100, 200, 30) },
      page: { scrollY: 2000 },
      want: true,
    },
    {
      name: 'position:fixed, parked below the window of a long page (a closed bottom sheet)',
      html: `<div id="fixed" style="position:fixed">${FIELD}</div>`,
      boxes: { '#fixed': box(0, 900, 1000, 300), '#target': box(100, 950, 200, 30) },
      want: false,
    },
    {
      name: 'position:fixed on the field itself at top: 120vh',
      html: '<input id="target" name="email" style="position:fixed">',
      boxes: { '#target': box(100, 960, 200, 30) },
      want: false,
    },
    {
      name: 'position:fixed at top: -200px, after the page was scrolled down',
      html: '<input id="target" name="email" style="position:fixed">',
      boxes: { '#target': box(100, -200, 200, 30) },
      page: { scrollY: 1000 },
      want: false,
    },
    {
      name: 'position:fixed, beyond the right edge of the window of a wide page',
      html: '<input id="target" name="email" style="position:fixed">',
      boxes: { '#target': box(1200, 100, 200, 30) },
      page: { width: 4000 },
      want: false,
    },
    {
      name: 'position:fixed, left of the window after the page was scrolled sideways',
      html: '<input id="target" name="email" style="position:fixed">',
      boxes: { '#target': box(-250, 100, 200, 30) },
      page: { width: 4000, scrollX: 500 },
      want: false,
    },
    {
      name: 'position:fixed, sticking 5px into the window from below',
      html: '<input id="target" name="email" style="position:fixed">',
      boxes: { '#target': box(100, 795, 200, 30) },
      want: false,
    },
    {
      name: 'position:fixed, sticking 10px into the window from below',
      html: '<input id="target" name="email" style="position:fixed">',
      boxes: { '#target': box(100, 790, 200, 30) },
      want: true,
    },
    {
      name: 'below the fold of a fixed panel that scrolls (a long form in a dialog)',
      html: `<div id="fixed" style="position:fixed;overflow:auto">${FIELD}</div>`,
      boxes: { '#fixed': box(0, 0, 1000, 800, { scrollHeight: 4000 }), '#target': box(100, 2500, 200, 30) },
      want: true,
    },
    // A panel that scrolls does not move what is fixed to the window, even when it is its ancestor.
    {
      name: 'a fixed dialog inside an app shell that scrolls',
      html: `<div id="panel" style="overflow:auto"><div id="fixed" style="position:fixed">${FIELD}</div></div>`,
      boxes: {
        '#panel': box(0, 0, 1000, 800, { scrollHeight: 5000 }),
        '#fixed': box(100, 50, 600, 500),
        '#target': box(150, 100, 200, 30),
      },
      page: { height: 800 },
      want: true,
    },
    {
      name: 'a fixed sheet parked below the window, inside an app shell that scrolls',
      html: `<div id="panel" style="overflow:auto"><div id="fixed" style="position:fixed">${FIELD}</div></div>`,
      boxes: {
        '#panel': box(0, 0, 1000, 800, { scrollHeight: 5000 }),
        '#fixed': box(0, 900, 1000, 300),
        '#target': box(100, 950, 200, 30),
      },
      page: { height: 800 },
      want: false,
    },
    {
      name: 'a fixed drawer parked beyond the right edge of the window, inside a panel that scrolls sideways',
      html: `<div id="panel" style="overflow:auto"><div id="fixed" style="position:fixed">${FIELD}</div></div>`,
      boxes: {
        '#panel': box(0, 0, 1000, 800, { scrollWidth: 4000 }),
        '#fixed': box(1100, 0, 400, 800),
        '#target': box(1200, 100, 200, 30),
      },
      page: { height: 800 },
      want: false,
    },
    {
      name: 'position:sticky is part of the page: below the fold still counts',
      html: `<div id="sticky" style="position:sticky">${FIELD}</div>`,
      boxes: { '#sticky': box(0, 2400, 1000, 200), '#target': box(100, 2500, 200, 30) },
      want: true,
    },
  ];
  it.each(scenes)('$name', (scene) => {
    expect(rendered(scene)).toBe(scene.want);
  });

  it('does not count the scroll of the page twice when the root element itself is styled to scroll', () => {
    // Many sites set html { overflow-y: scroll }. The root element is then the page's own scroller:
    // its box moves up as the page scrolls and its scrollTop is the page's scroll position.
    mount(FIELD);
    setPage({ height: 3000, scrollY: 2500 });
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: root });
    root.style.overflowY = 'scroll';
    layOut(root, box(0, -2500, 1000, 3000, { scrollHeight: 3000, scrollTop: 2500 }));
    layOut(find('#target'), box(100, 400, 200, 30));

    try {
      expect(browserEnv.isRendered(find('#target'))).toBe(true);
    } finally {
      Reflect.deleteProperty(document, 'scrollingElement');
      root.style.overflowY = '';
      for (const name of ['checkVisibility', 'getBoundingClientRect', 'scrollLeft', 'scrollTop']) Reflect.deleteProperty(root, name);
    }
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

  // clip and clip-path cut an element and everything inside it, whatever size its box has.
  // In these scenes the wrapper spans 100..500 across and 100..300 down (400 by 200); the field
  // spans 150..350 across and 150..180 down.
  const clipped = (style: string): Pick<Scene, 'html' | 'boxes'> => ({
    html: `<div id="clip" style="${style}">${FIELD}</div>`,
    boxes: { '#clip': box(100, 100, 400, 200), '#target': box(150, 150, 200, 30) },
  });
  const clippedItself = (style: string): Pick<Scene, 'html' | 'boxes'> => ({
    html: `<input id="target" name="email" style="${style}">`,
    boxes: { '#target': box(150, 150, 200, 30) },
  });

  // Verbatim from chosen.css 1.8.7, a dropdown library still common on older career sites. The
  // search box of a closed dropdown keeps its full size; the drop around it is clipped to nothing.
  const CHOSEN_CSS = `
    .chosen-container .chosen-drop { position: absolute; top: 100%; z-index: 1010; width: 100%; border: 1px solid #aaa; border-top: 0; background: #fff; clip: rect(0, 0, 0, 0); -webkit-clip-path: inset(100% 100%); clip-path: inset(100% 100%); }
    .chosen-container.chosen-with-drop .chosen-drop { clip: auto; -webkit-clip-path: none; clip-path: none; }`;
  const chosen = (containerClass: string): Pick<Scene, 'html' | 'boxes'> => ({
    html: `<style>${CHOSEN_CSS}</style><select name="country" style="display: none;"><option value=""></option><option value="US">United States</option></select><div class="chosen-container chosen-container-single ${containerClass}" title="" style="width: 350px;"><a class="chosen-single chosen-default"><span>Country</span><div><b></b></div></a><div class="chosen-drop"><div class="chosen-search"><input id="target" class="chosen-search-input" type="text" autocomplete="off"></div><ul class="chosen-results"></ul></div></div>`,
    boxes: { '.chosen-container': box(100, 100, 350, 30), '.chosen-drop': box(100, 130, 350, 60), '#target': box(104, 134, 342, 26) },
  });

  const clipScenes: Scene[] = [
    { name: 'Chosen: the search box of a closed dropdown', ...chosen(''), want: false },
    { name: 'Chosen: the search box of an open dropdown', ...chosen('chosen-with-drop chosen-container-active'), want: true },
    // clip-path: inset(), the shape "visually hidden" recipes and reveal animations use.
    { name: 'clip-path: inset(50%) on the field itself', ...clippedItself('clip-path:inset(50%)'), want: false },
    { name: 'clip-path: inset(100%) on a wrapper', ...clipped('clip-path:inset(100%)'), want: false },
    { name: 'clip-path: inset(0px), left behind by a reveal animation', ...clipped('clip-path:inset(0px)'), want: true },
    { name: 'clip-path: inset(0px round 12px), a card with rounded corners', ...clipped('clip-path:inset(0px round 12px)'), want: true },
    { name: 'clip-path: inset(10px 20px) leaves the field alone', ...clipped('clip-path:inset(10px 20px)'), want: true },
    { name: 'clip-path: inset(0px 0px 100%), a panel rolled up from below', ...clipped('clip-path:inset(0px 0px 100%)'), want: false },
    { name: 'cut from the top so that 20px of the field remain', ...clipped('clip-path:inset(60px 0px 0px)'), want: true },
    { name: 'cut from the top so that 5px of the field remain', ...clipped('clip-path:inset(75px 0px 0px)'), want: false },
    { name: 'cut from the right so that 5px of the field remain', ...clipped('clip-path:inset(0px 345px 0px 0px)'), want: false },
    { name: 'cut from the bottom so that 5px of the field remain', ...clipped('clip-path:inset(0px 0px 145px)'), want: false },
    { name: 'cut from the left so that 5px of the field remain', ...clipped('clip-path:inset(0px 0px 0px 245px)'), want: false },
    { name: 'two values: the second cuts left and right alike', ...clipped('clip-path:inset(0px 245px)'), want: false },
    {
      // a tall, narrow wrapper (220 by 600): 107px from each side leaves 6px of its width
      name: 'one value cuts left and right as well',
      html: `<div id="clip" style="clip-path:inset(107px)">${FIELD}</div>`,
      boxes: { '#clip': box(100, 100, 220, 600), '#target': box(110, 300, 200, 30) },
      want: false,
    },
    {
      // a wide, flat wrapper (600 by 100) with the field at its lower edge: 35px from below leaves 5px of it
      name: 'one value cuts the bottom as well',
      html: `<div id="clip" style="clip-path:inset(35px)">${FIELD}</div>`,
      boxes: { '#clip': box(100, 100, 600, 100), '#target': box(300, 160, 200, 30) },
      want: false,
    },
    // Percentages are of the wrapper's own size: of its height (200) from the top, of its width (400) from the left.
    { name: '20% from the top is 40px, above the field', ...clipped('clip-path:inset(20% 0% 0%)'), want: true },
    { name: '61% from the left is 244px, leaving 6px of the field', ...clipped('clip-path:inset(0% 0% 0% 61%)'), want: false },
    { name: '87% from the right is 348px, leaving 2px of the field', ...clipped('clip-path:inset(0% 87% 0% 0%)'), want: false },
    { name: '55% from the bottom is 110px, below the field', ...clipped('clip-path:inset(0% 0% 55%)'), want: true },
    { name: 'percentages on all four sides that leave the field', ...clipped('clip-path:inset(5% 10% 15% 20%)'), want: true },
    // Shapes that cannot be measured here count as cutting everything away.
    { name: 'clip-path: circle(0px)', ...clipped('clip-path:circle(0px)'), want: false },
    { name: 'clip-path: polygon(…), a slanted section', ...clipped('clip-path:polygon(0px 0px, 100% 0px, 100% 85%, 0px 100%)'), want: false },
    { name: 'clip-path: url(…)', ...clipped('clip-path:url(#shape)'), want: false },
    { name: 'clip-path: inset() with a calculated length', ...clipped('clip-path:inset(calc(100% - 4px))'), want: false },
    // clip, the older property: it only works on absolutely positioned and fixed elements.
    { name: 'clip: rect(0 0 0 0) on an absolutely positioned field', ...clippedItself('position:absolute;clip:rect(0px, 0px, 0px, 0px)'), want: false },
    { name: 'clip: rect(0 0 0 0) on a fixed wrapper', ...clipped('position:fixed;clip:rect(0px, 0px, 0px, 0px)'), want: false },
    { name: 'clip: rect(0 0 0 0) written without commas', ...clipped('position:absolute;clip:rect(0px 0px 0px 0px)'), want: false },
    { name: 'clip on a field that is not absolutely positioned has no effect', ...clippedItself('clip:rect(0px, 0px, 0px, 0px)'), want: true },
    { name: 'clip on a relatively positioned wrapper has no effect', ...clipped('position:relative;clip:rect(0px, 0px, 0px, 0px)'), want: true },
    { name: 'clip: rect(auto, auto, auto, auto) cuts nothing', ...clipped('position:absolute;clip:rect(auto, auto, auto, auto)'), want: true },
    { name: 'clip: a rectangle around the field', ...clipped('position:absolute;clip:rect(10px, 300px, 100px, 0px)'), want: true },
    { name: 'clip: a rectangle around the field, written without commas', ...clipped('position:absolute;clip:rect(10px 300px 100px 0px)'), want: true },
    { name: 'clip: its top edge leaves 5px of the field', ...clipped('position:absolute;clip:rect(75px, 400px, 200px, 0px)'), want: false },
    { name: 'clip: its right edge leaves 5px of the field', ...clipped('position:absolute;clip:rect(0px, 55px, 200px, 0px)'), want: false },
    { name: 'clip: its bottom edge leaves 5px of the field', ...clipped('position:absolute;clip:rect(0px, 400px, 55px, 0px)'), want: false },
    { name: 'clip: its left edge leaves 5px of the field', ...clipped('position:absolute;clip:rect(0px, 400px, 200px, 245px)'), want: false },
    // Both at once, as the "visually hidden" recipes write them: each one cuts.
    { name: 'a clip that leaves the field and a clip-path that does not', ...clipped('position:absolute;clip:rect(auto, auto, auto, auto);clip-path:inset(50%)'), want: false },
    { name: 'a clip-path that leaves the field and a clip that does not', ...clipped('position:absolute;clip:rect(0px, 0px, 0px, 0px);clip-path:inset(0px)'), want: false },
    // An element without a box of its own (display: contents) clips nothing.
    { name: 'clip-path on a display:contents wrapper has no effect', ...clipped('display:contents;clip-path:inset(50%)'), want: true },
  ];
  it.each(clipScenes)('$name', (scene) => {
    expect(rendered(scene)).toBe(scene.want);
  });

  it('counts a shape it cannot measure as cutting everything away, also on the outermost element', () => {
    mount(FIELD);
    setPage();
    layOut(find('#target'), box(100, 100, 200, 30));
    root.style.clipPath = 'circle(40%)';

    try {
      expect(browserEnv.isRendered(find('#target'))).toBe(false);
    } finally {
      root.style.clipPath = '';
    }
  });

  // A web component draws its children where its <slot> is. The body of an accordion component is
  // such a slot inside a wrapper of the shadow tree; the field stays a child of the host element.
  const slotted: [name: string, wrapperStyle: string, wrapperBox: FakeBox, want: boolean][] = [
    ['a collapsed wrapper around the slot cuts the field away', 'overflow:hidden', box(100, 100, 200, 0), false],
    ['an open wrapper around the slot leaves it visible', 'overflow:hidden', box(100, 100, 200, 300), true],
    ['a nearly transparent wrapper around the slot hides it', 'opacity:0.05', box(100, 100, 200, 300), false],
  ];
  it.each(slotted)('follows a slotted field into the shadow tree that draws it: %s', (_name, wrapperStyle, wrapperBox, want) => {
    mount(`<div id="host">${FIELD}</div>`);
    setPage();
    const shadowRoot = find('#host').attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `<div id="wrapper" style="${wrapperStyle}"><slot></slot></div>`;
    const wrapper = shadowRoot.getElementById('wrapper');
    if (wrapper === null) throw new Error('the fixture has no #wrapper');
    layOut(wrapper, wrapperBox);
    layOut(find('#target'), box(100, 100, 200, 30));

    expect(browserEnv.isRendered(find('#target'))).toBe(want);
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
