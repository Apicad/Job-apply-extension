import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { createElement, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Control } from '../../lib/types';
import { recallControl, rememberControls } from '../../lib/page/refs';

/** Puts markup on the page and hands back the elements asked for, in document order. */
function mount<T extends Element = HTMLInputElement>(html: string, selector = 'input, textarea, select'): T[] {
  document.body.innerHTML = html;
  return Array.from(document.body.querySelectorAll<T>(selector));
}

/** The first element of a list that is known not to be empty. */
function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('the fixture has no such element');
  return item;
}

// A yes/no question the way Lever renders it: two native radios, each inside its label.
const LEVER_WORK_AUTHORIZATION = `
  <div class="application-question custom-question">
    <div class="application-label">Are you legally authorized to work in the country for which you are applying?</div>
    <ul data-qa="multiple-choice">
      <li><label><input type="radio" name="cards[4f1c][field0]" value="Yes"><span>Yes</span></label></li>
      <li><label><input type="radio" name="cards[4f1c][field0]" value="No"><span>No</span></label></li>
    </ul>
  </div>`;

// The "LinkedIn Profile" box of a Greenhouse form: told apart from its neighbours by its id alone.
const GREENHOUSE_LINKEDIN =
  '<input id="question_61000001" class="input input__single-line" aria-label="LinkedIn Profile" aria-invalid="false" type="text" maxLength="255">';

// A "State" dropdown as a form offers it while the country chosen above it is the United States.
const US_STATES = `
  <select name="state">
    <option value="">Select...</option>
    <option value="CA">California</option>
    <option value="CO">Colorado</option>
  </select>`;

// Taken before any test has run, so that whatever this module adds to the world shows up as new.
const GLOBALS_AT_START = new Set(Object.getOwnPropertyNames(globalThis));

function globalsAddedSinceStart(): string[] {
  return Object.getOwnPropertyNames(globalThis).filter((name) => !GLOBALS_AT_START.has(name));
}

/** The name of the global the table is kept under, found by making sure there is a table and looking for it. */
function nameOfTheTable(): string {
  rememberControls([]);
  const added = globalsAddedSinceStart();
  if (added.length !== 1) throw new Error(`expected exactly one new global, found: ${added.join(', ')}`);
  return first(added);
}

/** Lets the current task finish: until then the engine keeps every WeakRef target alive. */
function aMomentLater(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Runs a full garbage collection now (possible in Node, where the tests run). */
function collectGarbage(): void {
  setFlagsFromString('--expose-gc');
  const gc: () => void = runInNewContext('gc');
  gc();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rememberControls', () => {
  it('numbers the controls 0, 1, 2… in the order given', () => {
    const controls = mount('<input id="first_name"><input id="last_name"><input id="email" type="email">').map(
      (el): Control => ({ control: 'text', el }),
    );

    expect(rememberControls(controls)).toEqual([0, 1, 2]);
  });

  it('gives no handles for no controls', () => {
    expect(rememberControls([])).toEqual([]);
  });
});

describe('the handle table', () => {
  it('is shared by two separately bundled copies of this module', async () => {
    // The scan script and the fill script each carry their own copy of this
    // module; all they have in common is the global object of their world.
    vi.resetModules();
    const scanScript = await import('../../lib/page/refs');
    vi.resetModules();
    const fillScript = await import('../../lib/page/refs');
    expect(fillScript.recallControl).not.toBe(scanScript.recallControl);

    const input = first(mount('<input id="first_name">'));
    const handle = first(scanScript.rememberControls([{ control: 'text', el: input }]));

    expect(fillScript.recallControl(handle)?.el).toBe(input);
  });

  it('is the only global this module adds, and is named after the extension', () => {
    const input = first(mount('<input id="first_name">'));

    rememberControls([{ control: 'text', el: input }]);

    const added = globalsAddedSinceStart();
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/jobApplyAssistant/i);
  });

  // Job sites built with React replace form elements all the time; a table
  // that held on to them would pin every discarded copy of the form in memory.
  it('does not keep an element alive once the page has dropped it', async () => {
    // In a function of its own, so that no variable of the test still points at the element.
    const rememberThenDrop = (): WeakRef<HTMLInputElement> => {
      const input = first(mount('<input id="first_name">'));
      rememberControls([{ control: 'text', el: input }]);
      input.remove();
      return new WeakRef(input);
    };

    const dropped = rememberThenDrop();
    await aMomentLater();
    collectGarbage();

    expect(dropped.deref()).toBeUndefined();
  });

  it('does not keep one dropped radio alive while the rest of its group stays on the page', async () => {
    const rememberThenDropTheSecondRadio = (): WeakRef<HTMLInputElement> => {
      const radios = mount(LEVER_WORK_AUTHORIZATION);
      rememberControls([{ control: 'radio', el: first(radios), radios }]);
      const second = first(radios.slice(1));
      second.closest('li')?.remove();
      return new WeakRef(second);
    };

    const dropped = rememberThenDropTheSecondRadio();
    await aMomentLater();
    collectGarbage();

    expect(dropped.deref()).toBeUndefined();
    expect(document.querySelectorAll('input[type=radio]')).toHaveLength(1);
  });

  it('does not keep a dropped dropdown or its options alive', async () => {
    // What a dropdown offered is remembered too; that must not mean holding on to its options.
    const rememberThenDrop = (): WeakRef<Element>[] => {
      const select = first(mount<HTMLSelectElement>(US_STATES));
      rememberControls([{ control: 'select', el: select }]);
      const option = first(Array.from(select.options));
      select.remove();
      return [new WeakRef(select), new WeakRef(option)];
    };

    const dropped = rememberThenDrop();
    await aMomentLater();
    collectGarbage();

    expect(dropped.map((ref) => ref.deref())).toEqual([undefined, undefined]);
  });
});

describe('recallControl', () => {
  it('finds the element a handle was given for', () => {
    const inputs = mount('<input id="first_name"><input id="last_name">');
    const handles = rememberControls(inputs.map((el): Control => ({ control: 'text', el })));

    const recalled = recallControl(first(handles.slice(1)));

    expect(recalled?.control).toBe('text');
    expect(recalled?.el).toBe(inputs[1]);
  });

  it.each<[Control['control'], string]>([
    ['text', '<input id="first_name" type="text">'],
    ['combobox', '<input id="country" class="select__input" role="combobox" aria-autocomplete="list">'],
    ['file', '<input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf">'],
    ['textarea', '<textarea name="comments"></textarea>'],
    ['select', '<select name="eeo[gender]"><option value="">Select ...</option><option>Female</option></select>'],
  ])('gives back a %s control as it was remembered', (kind, html) => {
    const el = first(mount<HTMLElement>(html));
    const handle = first(rememberControls([{ control: kind, el } as Control]));

    const recalled = recallControl(handle);

    expect(recalled?.control).toBe(kind);
    expect(recalled?.el).toBe(el);
  });

  it('gives back a radio group with every radio, in order', () => {
    const radios = mount(LEVER_WORK_AUTHORIZATION);
    const handle = first(rememberControls([{ control: 'radio', el: first(radios), radios }]));

    const recalled = recallControl(handle);

    if (recalled?.control !== 'radio') throw new Error(`expected a radio group, got ${recalled?.control}`);
    expect(recalled.el).toBe(radios[0]);
    expect(recalled.radios).toHaveLength(2);
    expect(recalled.radios[0]).toBe(radios[0]);
    expect(recalled.radios[1]).toBe(radios[1]);
  });

  it('gives null for a radio group once any of its radios has left the page', () => {
    // An action names a radio by its position in the group; with one gone, positions no longer mean what was planned.
    const radios = mount(LEVER_WORK_AUTHORIZATION);
    const handle = first(rememberControls([{ control: 'radio', el: first(radios), radios }]));

    radios[1]?.closest('li')?.remove();

    expect(recallControl(handle)).toBeNull();
  });

  // An action names an option by its position in the list too (FillAction in lib/types.ts), and
  // the position was worked out from the options the scan saw. Once the list is a different one,
  // the same position can stand for another answer than the one shown in the preview.
  // [what the page has done, how]
  it.each<[string, (select: HTMLSelectElement) => void]>([
    [
      // What a "State" dropdown does when the "Country" above it changes: position 2 was Colorado.
      'filled the list with other options',
      (select) => {
        select.innerHTML =
          '<option value="">Select...</option><option value="AB">Alberta</option><option value="BC">British Columbia</option>';
      },
    ],
    ['put a new option in front of the others', (select) => select.prepend(new Option('Please choose', ''))],
    ['taken the "Select..." option away', (select) => select.options[0]?.remove()],
    ['added an option at the end', (select) => select.append(new Option('Connecticut', 'CT'))],
    ['moved the first option to the end', (select) => select.append(first(Array.from(select.options)))],
    // The same elements as before, saying something else: how a page built with React may swap a list.
    [
      'reworded an option where it stands',
      (select) => {
        first(Array.from(select.options).slice(2)).textContent = 'Connecticut';
      },
    ],
    ['given an option another value', (select) => select.options[2]?.setAttribute('value', 'CT')],
    ['given an option another label to show', (select) => select.options[2]?.setAttribute('label', 'Connecticut')],
  ])('gives null for a dropdown once the page has %s', (_name, change) => {
    const select = first(mount<HTMLSelectElement>(US_STATES));
    const handle = first(rememberControls([{ control: 'select', el: select }]));

    change(select);

    expect(recallControl(handle)).toBeNull();
  });

  // [what has happened, how]
  it.each<[string, (select: HTMLSelectElement) => void]>([
    ['nothing has happened to it', () => undefined],
    [
      'the user has chosen an option',
      (select) => {
        select.selectedIndex = 2;
      },
    ],
    // The same options in the same places: every position still means what it meant.
    [
      'the page has built the very same list again',
      (select) => {
        select.innerHTML =
          '<option value="">Select...</option><option value="CA">California</option><option value="CO">Colorado</option>';
      },
    ],
  ])('still finds a dropdown when %s', (_name, change) => {
    const select = first(mount<HTMLSelectElement>(US_STATES));
    const handle = first(rememberControls([{ control: 'select', el: select }]));

    change(select);

    const recalled = recallControl(handle);
    expect(recalled?.control).toBe('select');
    expect(recalled?.el).toBe(select);
  });

  // A page built with React may hand the element of one question to another. When a follow-up
  // question appears above "LinkedIn Profile", the box that was LinkedIn's can become the box of
  // the new question. It is the very same element, still on the page: only what the element says
  // about itself gives the change away.
  // [what the page has done to the text box, markup of the box, how]
  it.each<[string, string, (input: HTMLInputElement) => void]>([
    [
      'given it another id',
      GREENHOUSE_LINKEDIN,
      (input) => {
        input.id = 'question_61000007';
      },
    ],
    ['taken its id away', GREENHOUSE_LINKEDIN, (input) => input.removeAttribute('id')],
    [
      'given it another name',
      '<input type="text" name="urls[LinkedIn]">',
      (input) => {
        input.name = 'cards[4f1c][field2]';
      },
    ],
    [
      'made it another kind of input',
      GREENHOUSE_LINKEDIN,
      (input) => {
        input.type = 'email';
      },
    ],
    // Or the box has turned into a custom dropdown, which is never typed into (CLAUDE.md).
    ['given it the role of a custom dropdown', GREENHOUSE_LINKEDIN, (input) => input.setAttribute('role', 'combobox')],
    ['made it suggest its answers from a list', GREENHOUSE_LINKEDIN, (input) => input.setAttribute('aria-autocomplete', 'list')],
    ['given it a popup to choose from', GREENHOUSE_LINKEDIN, (input) => input.setAttribute('aria-haspopup', 'listbox')],
  ])('gives null for a text box once the page has %s', (_name, html, change) => {
    const input = first(mount(html));
    const handle = first(rememberControls([{ control: 'text', el: input }]));

    change(input);

    expect(recallControl(handle)).toBeNull();
  });

  // None of these makes it another question. (Whether it may still be written is the caller's to say.)
  // [what has happened to the text box, how]
  it.each<[string, (input: HTMLInputElement) => void]>([
    [
      'the user has typed into it',
      (input) => {
        input.value = 'https://www.linkedin.com/in/ada-lovelace';
      },
    ],
    [
      'the page has marked it as wrongly filled in',
      (input) => {
        input.className = 'input input__single-line input--error';
        input.setAttribute('aria-invalid', 'true');
      },
    ],
    [
      'the page has switched it off',
      (input) => {
        input.disabled = true;
      },
    ],
    ['the page has given it a hint', (input) => input.setAttribute('placeholder', 'linkedin.com/in/…')],
  ])('still finds a text box when %s', (_name, change) => {
    const input = first(mount(GREENHOUSE_LINKEDIN));
    const handle = first(rememberControls([{ control: 'text', el: input }]));

    change(input);

    expect(recallControl(handle)?.el).toBe(input);
  });

  it('gives null for a radio group once one of its radios belongs to another question', () => {
    const radios = mount(LEVER_WORK_AUTHORIZATION);
    const handle = first(rememberControls([{ control: 'radio', el: first(radios), radios }]));

    first(radios.slice(1)).name = 'cards[4f1c][field1]';

    expect(recallControl(handle)).toBeNull();
  });

  it('still finds a radio group when one of its radios has been chosen', () => {
    const radios = mount(LEVER_WORK_AUTHORIZATION);
    const handle = first(rememberControls([{ control: 'radio', el: first(radios), radios }]));

    first(radios).checked = true;

    expect(recallControl(handle)?.el).toBe(radios[0]);
  });

  it('gives null for a dropdown once it carries the name of another question', () => {
    const select = first(mount<HTMLSelectElement>(US_STATES));
    const handle = first(rememberControls([{ control: 'select', el: select }]));

    select.name = 'province';

    expect(recallControl(handle)).toBeNull();
  });

  it('gives null for the box that a form made with React has handed to a new question', () => {
    // A form drawn from a list of questions, each keyed by its place in the list. Answering "No"
    // puts a follow-up question in second place, and React gives it the element that was third.
    function Questions(): ReactElement {
      const [authorized, setAuthorized] = useState('');
      const names = ['authorized', ...(authorized === 'No' ? ['visa_details'] : []), 'linkedin'];
      return createElement(
        'form',
        null,
        names.map((name, place) =>
          name === 'authorized'
            ? createElement(
                'select',
                { key: place, name, value: authorized, onChange: (event: ChangeEvent<HTMLSelectElement>) => setAuthorized(event.target.value) },
                createElement('option', { value: '' }, 'Select...'),
                createElement('option', { value: 'Yes' }, 'Yes'),
                createElement('option', { value: 'No' }, 'No'),
              )
            : createElement('input', { key: place, type: 'text', name }),
        ),
      );
    }
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(createElement(Questions)));
    const select = first(Array.from(container.querySelectorAll('select')));
    const linkedin = first(Array.from(container.querySelectorAll('input')));
    const [selectHandle, linkedinHandle] = rememberControls([
      { control: 'select', el: select },
      { control: 'text', el: linkedin },
    ]);
    if (selectHandle === undefined || linkedinHandle === undefined) throw new Error('two controls were remembered');

    // The first planned answer: "No". React draws the form again before the event is over.
    select.selectedIndex = 2;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const nameOfTheBoxNow = linkedin.name;
    const recalledBox = recallControl(linkedinHandle);
    const recalledDropdown = recallControl(selectHandle);
    flushSync(() => root.unmount());

    expect(nameOfTheBoxNow).toBe('visa_details');
    expect(recalledBox).toBeNull();
    expect(recalledDropdown?.el).toBe(select);
  });

  it('gives null once the element has been taken off the page', () => {
    const input = first(mount('<form><input id="first_name"></form>'));
    const handle = first(rememberControls([{ control: 'text', el: input }]));

    input.remove();

    expect(recallControl(handle)).toBeNull();
  });

  it('gives null once the form around the element has been taken off the page', () => {
    // Ashby re-mounts its whole form after parsing an uploaded résumé.
    const input = first(mount('<form id="application-form"><input id="first_name"></form>'));
    const handle = first(rememberControls([{ control: 'text', el: input }]));

    document.getElementById('application-form')?.remove();

    expect(recallControl(handle)).toBeNull();
  });

  it('still finds an element that the page has only moved to another place', () => {
    const input = first(mount('<div id="step-1"><input id="first_name"></div><div id="step-2"></div>'));
    const handle = first(rememberControls([{ control: 'text', el: input }]));

    document.getElementById('step-2')?.append(input);

    expect(recallControl(handle)?.el).toBe(input);
  });

  it('finds an element inside an open shadow root, until its host leaves the page', () => {
    const host = document.createElement('application-form');
    document.body.append(host);
    const input = document.createElement('input');
    host.attachShadow({ mode: 'open' }).append(input);
    const handle = first(rememberControls([{ control: 'text', el: input }]));

    expect(recallControl(handle)?.el).toBe(input);

    host.remove();

    expect(recallControl(handle)).toBeNull();
  });

  it('gives null once the element has been moved into another document', () => {
    // It is on a page, but not the page that was scanned and shown to the user.
    const input = first(mount('<input id="first_name">'));
    const handle = first(rememberControls([{ control: 'text', el: input }]));
    const frame = document.createElement('iframe');
    document.body.append(frame);

    frame.contentDocument?.body.append(input);

    expect(input.isConnected).toBe(true);
    expect(input.ownerDocument).toBe(frame.contentDocument);
    expect(recallControl(handle)).toBeNull();
  });

  it.each<[string, number]>([
    ['one past the last handle', 2],
    ['a negative number', -1],
    ['a fraction', 0.5],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    // Not a number at all, though it names something every list has.
    ['the word "length"', 'length' as unknown as number],
  ])('gives null for %s', (_name, handle) => {
    const inputs = mount('<input id="first_name"><input id="last_name">');
    rememberControls(inputs.map((el): Control => ({ control: 'text', el })));

    expect(recallControl(handle)).toBeNull();
  });

  it('gives null when nothing has been remembered in this world yet', () => {
    Reflect.deleteProperty(globalThis, nameOfTheTable());

    expect(recallControl(0)).toBeNull();
  });

  it('gives null when the name of the table leads to an element of the page instead', () => {
    // In a browser every element with an id is also reachable as a global of
    // that name, so before the first scan a page can plant <form id="…"> under
    // the very name this module uses. A form even answers form[0] with its
    // first control, which is not a control anybody remembered.
    const form = first(mount<HTMLFormElement>('<form><input id="first_name"></form>', 'form'));
    Reflect.set(globalThis, nameOfTheTable(), form);

    expect(form[0]).toBe(form.querySelector('input'));
    expect(recallControl(0)).toBeNull();
  });
});

describe('remembering again', () => {
  it('replaces the table and starts the numbering over', () => {
    const [firstName, lastName, email] = mount(
      '<input id="first_name"><input id="last_name"><input id="email" type="email">',
    );
    if (firstName === undefined || lastName === undefined || email === undefined) throw new Error('bad fixture');
    rememberControls([
      { control: 'text', el: firstName },
      { control: 'text', el: lastName },
    ]);

    const handles = rememberControls([{ control: 'text', el: email }]);

    expect(handles).toEqual([0]);
    expect(recallControl(0)?.el).toBe(email);
    expect(recallControl(1)).toBeNull();
  });
});
