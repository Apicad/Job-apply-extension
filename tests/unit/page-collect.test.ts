import { afterEach, describe, expect, it } from 'vitest';
import { collectControls, formIndex } from '../../lib/page/collect';
import type { Control } from '../../lib/types';

/** Taken before any fixture is on the page: some fixtures shadow `document.body` with an element of that name. */
const body = document.body;

/** Puts markup on the page. */
function mount(html: string): void {
  body.innerHTML = html;
}

/** One short string per control: its type, then the id (or else the name) of its element. */
function summary(controls: readonly Control[]): string[] {
  return controls.map((control) => {
    const key = control.el.id || control.el.name;
    return control.control === 'radio' ? `radio:${key}×${control.radios.length}` : `${control.control}:${key}`;
  });
}

function collected(html: string): string[] {
  mount(html);
  return summary(collectControls(document));
}

afterEach(() => {
  body.innerHTML = '';
});

describe('collectControls: what counts as a control', () => {
  it('lists text boxes, textareas, dropdowns, file inputs and radio groups in document order', () => {
    const got = collected(`
      <form>
        <input id="first_name" type="text">
        <textarea id="why"></textarea>
        <select id="state"><option>CA</option></select>
        <input id="resume" type="file">
        <label><input type="radio" name="authorized" value="Yes">Yes</label>
        <label><input type="radio" name="authorized" value="No">No</label>
        <input id="email" type="email">
      </form>`);

    expect(got).toEqual(['text:first_name', 'textarea:why', 'select:state', 'file:resume', 'radio:authorized×2', 'text:email']);
  });

  const typed: [type: string, want: string[]][] = [
    ['text', ['text:field']],
    ['email', ['text:field']],
    ['tel', ['text:field']],
    ['url', ['text:field']],
    ['number', ['text:field']],
    ['month', ['text:field']],
    // An unknown type is a text box to the browser, so it is one to us.
    ['datetime', ['text:field']],
    ['EMAIL', ['text:field']],
    ['file', ['file:field']],
    // Never collected (CLAUDE.md, "Never collected").
    ['password', []],
    ['hidden', []],
    ['search', []],
    ['submit', []],
    ['button', []],
    ['reset', []],
    ['image', []],
    ['checkbox', []],
    ['date', []],
    ['datetime-local', []],
    ['time', []],
    ['week', []],
    ['range', []],
    ['color', []],
    ['PASSWORD', []],
    ['Hidden', []],
  ];
  it.each(typed)('<input type="%s"> gives %j', (type, want) => {
    expect(collected(`<input id="field" type="${type}">`)).toEqual(want);
  });

  it('treats an input without a type attribute as a text box', () => {
    expect(collected('<input id="first_name">')).toEqual(['text:first_name']);
  });

  it('ignores look-alike elements that are not HTML form controls', () => {
    // inside <svg> the parser makes SVG elements with these names; they have no value, type or form
    const got = collected(
      '<svg><input id="svg-input"></input><textarea id="svg-textarea"></textarea><select id="svg-select"></select></svg><input id="email" type="email">',
    );

    expect(got).toEqual(['text:email']);
  });
});

describe('collectControls: custom dropdowns are comboboxes, never text boxes', () => {
  // Verbatim from a live Greenhouse form: every dropdown there is a React-Select search box.
  const GREENHOUSE_COUNTRY =
    '<input class="select__input" style="label:input;color:inherit;background:0;opacity:1;width:100%;grid-area:1 / 2;font:inherit;min-width:2px;border:0;margin:0;outline:0;padding:0" autoCapitalize="none" autoComplete="off" autoCorrect="off" id="country" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="country-error" aria-invalid="false" aria-labelledby="country-label" aria-required="false" role="combobox" aria-activedescendant="" aria-describedby="react-select-country-placeholder" enterKeyHint="done" value=""/>';
  // Ashby's location typeahead as its bundle renders it: no id, no name, no type.
  const ASHBY_LOCATION = '<input placeholder="Start typing..." role="combobox" aria-autocomplete="list" value="">';
  // Lever's location typeahead carries no ARIA at all, so it cannot be told from a text box here.
  const LEVER_LOCATION =
    '<input class="location-input" data-qa="location-input" id="location-input" type="text" maxlength="100" name="location" required><input id="selected-location" type="hidden" name="selectedLocation">';

  const inputs: [name: string, html: string, want: string[]][] = [
    ['Greenhouse React-Select', GREENHOUSE_COUNTRY, ['combobox:country']],
    ['Ashby location typeahead', ASHBY_LOCATION, ['combobox:']],
    ['role=combobox alone', '<input id="school" role="combobox">', ['combobox:school']],
    ['role=listbox', '<input id="school" role="listbox">', ['combobox:school']],
    ['role in capitals', '<input id="school" role="COMBOBOX">', ['combobox:school']],
    ['role with a fallback role', '<input id="school" role="textbox combobox">', ['combobox:school']],
    ['aria-autocomplete=list', '<input id="school" aria-autocomplete="list">', ['combobox:school']],
    ['aria-autocomplete=both', '<input id="school" aria-autocomplete="both">', ['combobox:school']],
    ['aria-haspopup=true', '<input id="school" aria-haspopup="true">', ['combobox:school']],
    ['aria-haspopup=listbox', '<input id="school" aria-haspopup="listbox">', ['combobox:school']],
    ['aria-haspopup=dialog (a date picker)', '<input id="start" aria-haspopup="dialog">', ['combobox:start']],
    ['aria-haspopup set but empty', '<input id="school" aria-haspopup="">', ['combobox:school']],
    ['an e-mail box that drives a popup', '<input id="email" type="email" role="combobox">', ['combobox:email']],
    // Must stay ordinary text boxes.
    ['plain text box', '<input id="first_name" type="text" autocomplete="given-name">', ['text:first_name']],
    ['autocomplete=off is not a popup', '<input id="phone" type="tel" autocomplete="off">', ['text:phone']],
    ['aria-haspopup=false', '<input id="first_name" aria-haspopup="false">', ['text:first_name']],
    ['aria-haspopup=FALSE', '<input id="first_name" aria-haspopup="FALSE">', ['text:first_name']],
    ['aria-autocomplete=none', '<input id="first_name" aria-autocomplete="none">', ['text:first_name']],
    ['aria-autocomplete=inline', '<input id="first_name" aria-autocomplete="inline">', ['text:first_name']],
    ['role=textbox', '<input id="first_name" role="textbox">', ['text:first_name']],
    ['role=searchbox', '<input id="q" role="searchbox">', ['text:q']],
    ['aria-expanded alone', '<input id="first_name" aria-expanded="false">', ['text:first_name']],
    ['Lever location (no ARIA)', LEVER_LOCATION, ['text:location-input']],
    // Only text boxes turn into comboboxes.
    ['file input with aria-haspopup', '<input id="resume" type="file" aria-haspopup="true">', ['file:resume']],
    ['native select with role=combobox', '<select id="state" role="combobox"><option>CA</option></select>', ['select:state']],
    ['textarea with role=combobox', '<textarea id="why" role="combobox"></textarea>', ['textarea:why']],
    [
      'radios with aria-haspopup',
      '<input type="radio" name="q" aria-haspopup="true"><input type="radio" name="q" aria-haspopup="true">',
      ['radio:q×2'],
    ],
  ];
  it.each(inputs)('%s', (_name, html, want) => {
    expect(collected(html)).toEqual(want);
  });
});

describe('collectControls: never collected', () => {
  const byAutocomplete: [autocomplete: string, want: string[]][] = [
    // Payment, one-time codes and sign-in fields are none of our business.
    ['cc-number', []],
    ['cc-name', []],
    ['cc-exp', []],
    ['cc-csc', []],
    ['billing cc-number', []],
    ['section-payment billing cc-exp-month', []],
    ['CC-NUMBER', []],
    ['one-time-code', []],
    ['username', []],
    ['current-password', []],
    ['new-password', []],
    ['  username  ', []],
    // Ordinary tokens are collected.
    ['email', ['text:field']],
    ['given-name', ['text:field']],
    ['tel', ['text:field']],
    ['shipping street-address', ['text:field']],
    ['organization', ['text:field']],
    ['off', ['text:field']],
    ['nope', ['text:field']],
    ['', ['text:field']],
    // Only whole tokens count: "cc" alone and "account-cc-me" are not card fields.
    ['cc', ['text:field']],
    ['account-cc-me', ['text:field']],
    ['usernames', ['text:field']],
  ];
  it.each(byAutocomplete)('<input autocomplete="%s"> gives %j', (autocomplete, want) => {
    expect(collected(`<input id="field" type="text" autocomplete="${autocomplete}">`)).toEqual(want);
  });

  it('applies the autocomplete rule to dropdowns and textareas too', () => {
    const got = collected(`
      <select id="exp-month" autocomplete="cc-exp-month"><option>01</option></select>
      <textarea id="code" autocomplete="one-time-code"></textarea>
      <select id="country" autocomplete="country"><option>United States</option></select>`);

    expect(got).toEqual(['select:country']);
  });

  const insideSearch: [name: string, html: string, want: string[]][] = [
    // Seen on a careers page that embeds a Greenhouse form: the site's own job search.
    [
      'a box inside role=search',
      '<div role="search"><input type="text" placeholder="Start your search" autocomplete="off" aria-label="Start your search" name="_search_input"></div>',
      [],
    ],
    ['role=search on a form', '<form role="search"><input id="q" type="text"><select id="team"><option>All</option></select></form>', []],
    ['role in capitals', '<div role="SEARCH"><input id="q" type="text"></div>', []],
    ['the <search> element', '<search><input id="q" type="text"></search>', []],
    ['deep inside the search region', '<div role="search"><div><label>Keyword <input id="q"></label></div></div>', []],
    // Not a search region.
    ['a class named search', '<div class="search"><input id="q" type="text"></div>', ['text:q']],
    ['data-role=search', '<div data-role="search"><input id="q" type="text"></div>', ['text:q']],
    ['role=form', '<div role="form"><input id="email" type="email"></div>', ['text:email']],
    ['a search region next to the field', '<div role="search"></div><input id="email" type="email">', ['text:email']],
  ];
  it.each(insideSearch)('%s', (_name, html, want) => {
    expect(collected(html)).toEqual(want);
  });

  const hiddenFromAssistiveTech: [name: string, html: string, want: string[]][] = [
    // Verbatim from Greenhouse: React-Select's validation helper beside each required dropdown.
    [
      'Greenhouse required-select helper',
      '<input required="" tabindex="-1" aria-hidden="true" class="remix-css-1a0ro4n-requiredInput" value=""/>',
      [],
    ],
    // Verbatim from a careers page built with Base UI.
    ['component-library helper input', '<input id="base-ui-:r1:-hidden-input" tabindex="-1" aria-hidden="true" value="en"/>', []],
    ['aria-hidden on an ancestor', '<div aria-hidden="true"><p><input id="email" type="email"></p></div>', []],
    ['aria-hidden in capitals', '<input id="email" aria-hidden="TRUE">', []],
    ['inert on the control', '<input id="email" inert>', []],
    ['inert on an ancestor', '<section inert><select id="state"><option>CA</option></select><textarea id="why"></textarea></section>', []],
    [
      'aria-hidden radios (the hidden twin of a custom radio)',
      '<input type="radio" name="q" aria-hidden="true" tabindex="-1"><input type="radio" name="q" aria-hidden="true" tabindex="-1">',
      [],
    ],
    // Still collected.
    ['aria-hidden=false', '<div aria-hidden="false"><input id="email" type="email"></div>', ['text:email']],
    ['aria-hidden on a sibling', '<span aria-hidden="true">*</span><input id="email" type="email">', ['text:email']],
    ['tabindex=-1 alone', '<input id="resume" type="file" tabindex="-1">', ['file:resume']],
    ['the hidden attribute is a visibility matter, not a collection one', '<input id="email" type="email" hidden>', ['text:email']],
    ['disabled and read-only controls are still collected', '<input id="a" disabled><input id="b" readonly>', ['text:a', 'text:b']],
  ];
  it.each(hiddenFromAssistiveTech)('%s', (_name, html, want) => {
    expect(collected(html)).toEqual(want);
  });
});

describe('collectControls: a form with a password field is a sign-in form', () => {
  it('drops every control of that form and keeps the other forms', () => {
    const got = collected(`
      <form id="login">
        <input id="login-email" type="email" name="email">
        <input id="login-password" type="password" name="password">
        <select id="login-language"><option>English</option></select>
      </form>
      <form id="application-form">
        <input id="first_name" type="text">
        <input id="email" type="email">
      </form>`);

    expect(got).toEqual(['text:first_name', 'text:email']);
  });

  it('drops controls that belong to the sign-in form through the form attribute', () => {
    const got = collected(`
      <form id="login"><input id="secret" type="password"></form>
      <input id="remember-email" type="email" form="login">
      <input id="newsletter" type="email">`);

    expect(got).toEqual(['text:newsletter']);
  });

  it('drops radio groups and file inputs of the sign-in form as well', () => {
    const got = collected(`
      <form>
        <input type="password">
        <input type="radio" name="remember" value="yes"><input type="radio" name="remember" value="no">
        <input id="avatar" type="file">
        <textarea id="note"></textarea>
      </form>`);

    expect(got).toEqual([]);
  });

  it('keeps controls without a form when a password field without a form sits elsewhere on the page', () => {
    // There is no form to judge here, so only the password field itself is left out.
    const got = collected(`
      <div class="header-sign-in"><input id="pw" type="password"></div>
      <div class="application"><input id="first_name" type="text"><input id="email" type="email"></div>`);

    expect(got).toEqual(['text:first_name', 'text:email']);
  });
});

describe('collectControls: radios with the same name and form owner are one control', () => {
  /** The values of each radio group, in the order the groups were collected. */
  function groups(html: string): string[][] {
    mount(html);
    return collectControls(document).flatMap((control) =>
      control.control === 'radio' ? [control.radios.map((radio) => radio.value)] : [],
    );
  }

  it('keeps the radios of a group in document order, with the first one as the element', () => {
    mount(`
      <ul>
        <li><label><input type="radio" name="cards[1c71][field0]" value="Yes" required="required" /><span>Yes</span></label></li>
        <li><label><input type="radio" name="cards[1c71][field0]" value="No" required="required" /><span>No</span></label></li>
      </ul>`);

    const controls = collectControls(document);
    const radios = Array.from(document.querySelectorAll('input'));

    expect(controls).toEqual([{ control: 'radio', el: radios[0], radios }]);
  });

  it('places a group where its first radio is, even when other controls sit between its radios', () => {
    const got = collected(`
      <input id="first_name">
      <input type="radio" name="authorized" value="Yes">
      <input id="other" type="text">
      <input type="radio" name="authorized" value="No">
      <select id="state"><option>CA</option></select>`);

    expect(got).toEqual(['text:first_name', 'radio:authorized×2', 'text:other', 'select:state']);
  });

  const grouping: [name: string, html: string, want: string[][]][] = [
    [
      'two questions with different names',
      '<input type="radio" name="authorized" value="Yes"><input type="radio" name="authorized" value="No"><input type="radio" name="sponsorship" value="Yes"><input type="radio" name="sponsorship" value="No">',
      [
        ['Yes', 'No'],
        ['Yes', 'No'],
      ],
    ],
    [
      'the same name in two forms is two questions',
      '<form><input type="radio" name="q" value="a1"><input type="radio" name="q" value="a2"></form><form><input type="radio" name="q" value="b1"><input type="radio" name="q" value="b2"></form>',
      [
        ['a1', 'a2'],
        ['b1', 'b2'],
      ],
    ],
    [
      'the same name inside a form and outside any form is two questions',
      '<form><input type="radio" name="q" value="in1"><input type="radio" name="q" value="in2"></form><input type="radio" name="q" value="out1"><input type="radio" name="q" value="out2">',
      [
        ['in1', 'in2'],
        ['out1', 'out2'],
      ],
    ],
    [
      'a radio attached to a form with the form attribute joins that form\'s group',
      '<form id="f"><input type="radio" name="q" value="in"></form><input type="radio" name="q" value="attached" form="f"><input type="radio" name="q" value="loose">',
      [['in', 'attached'], ['loose']],
    ],
    [
      'radios without a name are never grouped',
      '<input type="radio" value="a"><input type="radio" value="b"><input type="radio" name="" value="c">',
      [['a'], ['b'], ['c']],
    ],
    [
      'names differ by case',
      '<input type="radio" name="Q" value="upper"><input type="radio" name="q" value="lower">',
      [['upper'], ['lower']],
    ],
    [
      'a radio that is never collected leaves its group',
      '<input type="radio" name="q" value="shown"><span aria-hidden="true"><input type="radio" name="q" value="helper"></span><input type="radio" name="q" value="also shown">',
      [['shown', 'also shown']],
    ],
  ];
  it.each(grouping)('%s', (_name, html, want) => {
    expect(groups(html)).toEqual(want);
  });

  it('does not treat checkboxes that share a name as a group (they are not collected at all)', () => {
    // Lever's language question: 33 checkboxes with one name.
    const got = collected(`
      <ul data-qa="checkboxes">
        <li><label><input type="checkbox" name="cards[a69a][field0]" value="English (ENG)" /><span>English (ENG)</span></label></li>
        <li><label><input type="checkbox" name="cards[a69a][field0]" value="Spanish (SPA)" /><span>Spanish (SPA)</span></label></li>
      </ul>`);

    expect(got).toEqual([]);
  });
});

describe('collectControls: shadow trees', () => {
  /** Attaches a shadow tree to the element with this id and fills it with markup. */
  function shadow(hostId: string, mode: 'open' | 'closed', html: string): ShadowRoot {
    const host = document.getElementById(hostId);
    if (host === null) throw new Error(`the fixture has no #${hostId}`);
    const root = host.attachShadow({ mode });
    root.innerHTML = html;
    return root;
  }

  it('walks open shadow roots and keeps document order: the tree comes where its host is', () => {
    mount('<input id="before"><div id="host"><input id="slotted"></div><input id="after">');
    shadow('host', 'open', '<input id="in-shadow"><slot></slot>');

    expect(summary(collectControls(document))).toEqual(['text:before', 'text:in-shadow', 'text:slotted', 'text:after']);
  });

  it('walks a shadow root inside a shadow root', () => {
    mount('<div id="outer"></div>');
    const outer = shadow('outer', 'open', '<input id="level-1"><div id="inner"></div>');
    const inner = outer.getElementById('inner');
    if (inner === null) throw new Error('the fixture has no #inner');
    inner.attachShadow({ mode: 'open' }).innerHTML = '<select id="level-2"><option>a</option></select>';

    expect(summary(collectControls(document))).toEqual(['text:level-1', 'select:level-2']);
  });

  it('never looks inside a closed shadow root', () => {
    mount('<div id="host"></div><input id="email" type="email">');
    shadow('host', 'closed', '<input id="private" type="email">');

    expect(summary(collectControls(document))).toEqual(['text:email']);
  });

  const hiddenHosts: [name: string, hostAttributes: string][] = [
    ['aria-hidden', 'aria-hidden="true"'],
    ['inert', 'inert'],
    ['role=search', 'role="search"'],
  ];
  it.each(hiddenHosts)('drops the controls of a shadow tree whose host is %s', (_name, hostAttributes) => {
    mount(`<div><div id="host" ${hostAttributes}></div></div><input id="email" type="email">`);
    shadow('host', 'open', '<p><input id="in-shadow"></p>');

    expect(summary(collectControls(document))).toEqual(['text:email']);
  });

  it('keeps radios of a shadow tree apart from same-named radios of the page', () => {
    mount('<input type="radio" name="q" value="page-1"><div id="host"></div><input type="radio" name="q" value="page-2">');
    shadow('host', 'open', '<input type="radio" name="q" value="shadow-1"><input type="radio" name="q" value="shadow-2">');

    const got = collectControls(document).map((control) =>
      control.control === 'radio' ? control.radios.map((radio) => radio.value) : [],
    );

    expect(got).toEqual([
      ['page-1', 'page-2'],
      ['shadow-1', 'shadow-2'],
    ]);
  });

  it('drops a sign-in form that lives in a shadow tree, and only that form', () => {
    mount('<div id="host"></div><input id="email" type="email">');
    shadow('host', 'open', '<form><input id="user" type="email"><input type="password"></form><input id="search-jobs">');

    expect(summary(collectControls(document))).toEqual(['text:search-jobs', 'text:email']);
  });
});

/**
 * In a browser a <form> exposes its controls as properties named after them, and those names win over
 * the built-in ones: with <input name="id"> inside it, `form.id` is that input (Lever's form has an
 * <input name="name">). jsdom does not copy this, so the trap goes further: every built-in property of
 * this one form throws when read. Code that still works never read a property off the form.
 */
function trap(form: HTMLFormElement): void {
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
}

function trappedForm(id: string): HTMLFormElement {
  const form = document.getElementById(id);
  if (form === null || form.localName !== 'form') throw new Error(`the fixture has no <form id="${id}">`);
  trap(form as HTMLFormElement);
  return form as HTMLFormElement;
}

describe('collectControls: names chosen by the page cannot break it', () => {
  it('never reads a property off a form', () => {
    mount(`
      <form id="application-form" role="search">
        <input type="text" name="name" id="full-name">
        <input type="text" name="id" id="employee-id">
        <input type="text" name="elements" id="elements">
        <input type="text" name="children" id="children">
        <input type="radio" name="parentElement" value="Yes"><input type="radio" name="parentElement" value="No">
      </form>
      <form id="login"><input id="user" type="email" name="localName"><input type="password" name="querySelectorAll"></form>
      <form id="plain"><input id="email" type="email" name="shadowRoot"></form>`);
    trappedForm('application-form');
    trappedForm('login');
    trappedForm('plain');

    // the first form is a search form, the second a sign-in form
    expect(summary(collectControls(document))).toEqual(['text:email']);
  });

  it('still finds the controls when elements shadow the document\'s own properties', () => {
    // document.forms, document.querySelectorAll… are replaced by elements with these names
    mount(`
      <img name="querySelectorAll"><img name="getElementsByTagName"><img name="body"><img name="documentElement">
      <form name="forms"><input id="first_name"></form>
      <form name="children"><input id="email" type="email"></form>`);

    expect(summary(collectControls(document))).toEqual(['text:first_name', 'text:email']);
  });
});

describe('formIndex', () => {
  function indexes(): number[] {
    return collectControls(document).map(formIndex);
  }

  it('numbers a control by its form among the forms of the document, and gives -1 without a form', () => {
    mount(`
      <input id="loose">
      <form id="newsletter"><input id="news-email" type="email"></form>
      <form id="application-form">
        <input id="first_name">
        <select id="state"><option>CA</option></select>
        <textarea id="why"></textarea>
        <input id="resume" type="file">
        <input type="radio" name="authorized" value="Yes"><input type="radio" name="authorized" value="No">
      </form>
      <textarea id="loose-too"></textarea>`);

    expect(summary(collectControls(document))).toEqual([
      'text:loose',
      'text:news-email',
      'text:first_name',
      'select:state',
      'textarea:why',
      'file:resume',
      'radio:authorized×2',
      'textarea:loose-too',
    ]);
    expect(indexes()).toEqual([-1, 0, 1, 1, 1, 1, 1, -1]);
  });

  it('follows the form attribute, not the position in the page', () => {
    mount(`
      <form id="first"></form>
      <form id="second"><input id="inside-second"></form>
      <input id="attached-to-first" form="first">
      <input id="attached-to-nothing" form="no-such-form">`);

    expect(indexes()).toEqual([1, 0, -1]);
  });

  it('counts forms that hold no collected control', () => {
    mount('<form><input type="search"></form><form></form><form><input id="email" type="email"></form>');

    expect(indexes()).toEqual([2]);
  });

  it('works on Lever-shaped forms whose controls are named after form properties', () => {
    mount(`
      <form id="search-form"><input id="keyword"></form>
      <form id="application-form" enctype="multipart/form-data" method="POST">
        <input type="text" data-qa="name-input" name="name" required>
        <input type="text" name="id">
        <input type="text" name="elements">
        <input type="text" name="length">
        <input type="radio" name="ownerDocument" value="Yes"><input type="radio" name="ownerDocument" value="No">
      </form>`);
    trappedForm('search-form');
    trappedForm('application-form');

    expect(indexes()).toEqual([0, 1, 1, 1, 1, 1]);
  });

  it('still counts the forms when an element shadows document.forms', () => {
    mount(`
      <img name="forms"><img name="querySelectorAll">
      <form name="forms"><input id="a"></form>
      <form><input id="b"></form>`);

    expect(indexes()).toEqual([0, 1]);
  });

  it('gives a form inside an open shadow root a number after the forms of the document', () => {
    mount('<form><input id="page-1"></form><div id="host"></div><form><input id="page-2"></form>');
    const host = document.getElementById('host');
    if (host === null) throw new Error('the fixture has no #host');
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<form><input id="shadow-1"></form><input id="shadow-loose"><form><input id="shadow-2"></form>';

    expect(summary(collectControls(document))).toEqual([
      'text:page-1',
      'text:shadow-1',
      'text:shadow-loose',
      'text:shadow-2',
      'text:page-2',
    ]);
    expect(indexes()).toEqual([0, 2, -1, 3, 1]);
  });
});

describe('collectControls on real application forms', () => {
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

  it('Greenhouse: text boxes, React-Select comboboxes and the two uploads; no validation helper', () => {
    mount(GREENHOUSE);
    const controls = collectControls(document);

    expect(summary(controls)).toEqual([
      'text:first_name',
      'text:last_name',
      'text:email',
      'combobox:country',
      'text:phone',
      'file:resume',
      'file:cover_letter',
      'text:question_37369956002',
      'combobox:question_37369961002',
      'combobox:gender',
    ]);
    expect(controls.map(formIndex)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Lever: plain controls and one radio question; no checkboxes, no hidden bookkeeping inputs', () => {
    mount(LEVER);
    const controls = collectControls(document);

    expect(summary(controls)).toEqual([
      'file:resume-upload-input',
      'text:name',
      'text:email',
      'text:phone',
      'text:location-input',
      'text:org',
      'text:urls[LinkedIn]',
      'radio:cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]×2',
      'select:cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]',
      'textarea:cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][field0]',
      'textarea:additional-information',
    ]);
    expect(controls.map(formIndex)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
