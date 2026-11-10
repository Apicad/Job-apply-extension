import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
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

// Taken before any test has run, so that whatever this module adds to the world shows up as new.
const GLOBALS_AT_START = new Set(Object.getOwnPropertyNames(globalThis));

function globalsAddedSinceStart(): string[] {
  return Object.getOwnPropertyNames(globalThis).filter((name) => !GLOBALS_AT_START.has(name));
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
    for (const name of globalsAddedSinceStart()) Reflect.deleteProperty(globalThis, name);

    expect(recallControl(0)).toBeNull();
  });

  // A browser lets every script reach the elements of the page by their id, as properties of the
  // global object, and an extension's own world is no exception (checked in Chromium). So until a
  // scan has put its table there, the page decides what is found under the table's name.
  describe('when the page has an element whose id is the name of the table', () => {
    const TABLE_NAME = '__jobApplyAssistantControls';

    /** What the global object answers until the first scan: the page's element with that id. */
    function plant(html: string, selector: string): void {
      for (const name of globalsAddedSinceStart()) Reflect.deleteProperty(globalThis, name);
      const planted = first(mount<Element>(html, selector));
      Object.defineProperty(globalThis, TABLE_NAME, { configurable: true, writable: true, value: planted });
    }

    afterEach(() => {
      Reflect.deleteProperty(globalThis, TABLE_NAME);
    });

    it.each<[string, string, string]>([
      // `form[0]` is the form's first control, so a form stands in for a list quite well.
      ['a form', `<form id="${TABLE_NAME}"><input name="control" value="text"><input name="el"></form>`, 'form'],
      ['a dropdown, whose [0] is its first option', `<select id="${TABLE_NAME}"><option>text</option></select>`, 'select'],
      ['a plain block', `<div id="${TABLE_NAME}"></div>`, 'div'],
    ])('gives null for every handle when it is %s', (_name, html, selector) => {
      plant(html, selector);

      expect([recallControl(0), recallControl(1), recallControl(-1)]).toEqual([null, null, null]);
    });

    it('gives null when the table holds something that is not an entry of ours', () => {
      for (const name of globalsAddedSinceStart()) Reflect.deleteProperty(globalThis, name);
      const input = first(mount('<input id="first_name">'));
      const notOurs = [input, null, 'text', { control: 'text' }, { control: 'bogus', el: {} }, { control: 'radio', el: {}, radios: 'no list' }];
      Object.defineProperty(globalThis, TABLE_NAME, { configurable: true, writable: true, value: notOurs });

      expect(notOurs.map((_entry, handle) => recallControl(handle))).toEqual([null, null, null, null, null, null]);
    });

    it('puts its own table in the place of the planted element at the next scan', () => {
      plant(`<form id="${TABLE_NAME}"><input name="control"></form><input id="first_name">`, 'form');
      const input = first(mount('<input id="first_name">'));

      const handle = first(rememberControls([{ control: 'text', el: input }]));

      expect(recallControl(handle)?.el).toBe(input);
    });
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
