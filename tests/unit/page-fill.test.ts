import { act, createElement, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageEnv } from '../../lib/types';
import { fillFile, fillRadio, fillSelect, fillText } from '../../lib/page/fill';

/** Puts markup on the page and hands back the controls in it, in document order. */
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

interface SeenEvent {
  type: string;
  bubbles: boolean;
  composed: boolean;
  /** What the control held at the moment the event arrived. */
  held: unknown;
}

const stopWatching: (() => void)[] = [];

/**
 * Records every event of the kinds a form reacts to as it arrives at the
 * document, where a page's framework listens. Focus events are included so a
 * test can show that there were none. `read` says what to note about the
 * control each time: its value unless told otherwise.
 */
function watchEvents<T extends Element = HTMLInputElement>(
  read: (control: T) => unknown = (control) => (control as unknown as HTMLInputElement).value,
): SeenEvent[] {
  const seen: SeenEvent[] = [];
  const record = (event: Event): void => {
    const control = event.composedPath()[0] as T;
    seen.push({ type: event.type, bubbles: event.bubbles, composed: event.composed, held: read(control) });
  };
  for (const type of ['input', 'change', 'click', 'focus', 'blur', 'focusin', 'focusout']) {
    // Capturing, so that an event that does not bubble is recorded too.
    document.addEventListener(type, record, true);
    stopWatching.push(() => document.removeEventListener(type, record, true));
  }
  return seen;
}

afterEach(() => {
  for (const stop of stopWatching.splice(0)) stop();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('fillText', () => {
  it('writes the text and reports that the field now holds an answer', () => {
    const input = first(mount('<input id="first_name" type="text" autocomplete="given-name">'));

    const holdsAnswer = fillText(input, 'Ada');

    expect(input.value).toBe('Ada');
    expect(holdsAnswer).toBe(true);
  });

  it('tells the page with an input event and then a change event, shaped like the browser\'s own', () => {
    const input = first(mount('<input id="first_name" type="text">'));
    const seen = watchEvents();

    fillText(input, 'Ada');

    // `held` is the field's value when the event arrived: the text is written first.
    expect(seen).toEqual([
      { type: 'input', bubbles: true, composed: true, held: 'Ada' },
      { type: 'change', bubbles: true, composed: false, held: 'Ada' },
    ]);
  });

  it('writes past a value property that the page has put on the element itself', () => {
    // This is how React keeps track of a controlled input: it defines `value`
    // on the element, notes every write made through it, and later ignores an
    // input event for a value it has already noted. A fill must not be noted.
    const input = first(mount('<input id="first_name" type="text">'));
    const browsers = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const notedByThePage: string[] = [];
    Object.defineProperty(input, 'value', {
      configurable: true,
      get(this: HTMLInputElement): string {
        return browsers?.get?.call(this);
      },
      set(this: HTMLInputElement, text: string) {
        notedByThePage.push(text);
        browsers?.set?.call(this, text);
      },
    });

    const holdsAnswer = fillText(input, 'Ada');

    expect(notedByThePage).toEqual([]);
    expect(input.value).toBe('Ada');
    expect(holdsAnswer).toBe(true);
  });

  // [markup of the control, text to write]
  it.each<[string, string]>([
    ['<input id="first_name" type="text">', 'Ada'],
    ['<input id="last_name">', 'Lovelace'],
    ['<input id="email" type="email">', 'ada@example.com'],
    ['<input id="phone" type="tel">', '555-0100'],
    ['<input name="urls[Portfolio]" type="url">', 'https://example.com/ada'],
    ['<input id="gpa" type="number" step="0.01">', '3.9'],
    ['<input id="graduation" type="month">', '2027-05'],
    // A textarea keeps its value setter on a different prototype than an input does.
    ['<textarea name="comments"></textarea>', 'Analytical Engine, 1843'],
  ])('writes into %s', (html, text) => {
    const control = first(mount<HTMLInputElement | HTMLTextAreaElement>(html));

    const holdsAnswer = fillText(control, text);

    expect(control.value).toBe(text);
    expect(holdsAnswer).toBe(true);
  });

  it('writes into a control that belongs to the document of another frame', () => {
    // Such an element is not an `instanceof` this window's HTMLTextAreaElement,
    // so the right setter can only be found on the element's own prototype chain.
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (frameDocument === null) throw new Error('the frame has no document');
    const textarea = frameDocument.createElement('textarea');
    frameDocument.body.append(textarea);
    expect(textarea instanceof HTMLTextAreaElement).toBe(false);

    const holdsAnswer = fillText(textarea, 'Analytical Engine, 1843');

    expect(textarea.value).toBe('Analytical Engine, 1843');
    expect(holdsAnswer).toBe(true);
  });

  it('writes into an input of a class that the page built on top of the browser\'s input', () => {
    // The browser's setter is then not on the element's own class but one step further up.
    if (customElements.get('masked-input') === undefined) {
      customElements.define('masked-input', class extends HTMLInputElement {}, { extends: 'input' });
    }
    const input = first(mount('<input is="masked-input" id="phone" type="tel">'));
    expect(Object.hasOwn(Object.getPrototypeOf(input), 'value')).toBe(false);

    const holdsAnswer = fillText(input, '555-0100');

    expect(input.value).toBe('555-0100');
    expect(holdsAnswer).toBe(true);
  });

  // [markup of the control, text it will not take]
  it.each<[string, string]>([
    ['<input id="gpa" type="number">', '3.9/4.0'],
    ['<input id="graduation" type="month">', 'May 2027'],
  ])('reports no answer when %s throws the text away', (html, text) => {
    const input = first(mount(html));

    const holdsAnswer = fillText(input, text);

    expect(input.value).toBe('');
    expect(holdsAnswer).toBe(false);
  });

  it.each<[string, string]>([
    ['nothing', ''],
    ['only spaces', '   '],
  ])('reports no answer when the page puts %s back in the field', (_name, putBack) => {
    const input = first(mount('<input id="first_name" type="text">'));
    input.addEventListener('input', () => {
      input.value = putBack;
    });

    expect(fillText(input, 'Ada')).toBe(false);
  });

  // '' in the profile means "no answer"; writing it would only wipe a field.
  it.each<[string, string]>([
    ['an empty text', ''],
    ['only spaces', '   '],
    ['only a line break and a tab', '\n\t'],
  ])('writes nothing and sends no events when given %s', (_name, blank) => {
    const input = first(mount('<input id="first_name" type="text">'));
    const seen = watchEvents();

    const holdsAnswer = fillText(input, blank);

    expect(input.value).toBe('');
    expect(seen).toEqual([]);
    expect(holdsAnswer).toBe(false);
  });

  it('does not wipe what a field already holds when given an empty text', () => {
    const input = first(mount('<input id="first_name" type="text" value="Grace">'));
    const seen = watchEvents();

    const holdsAnswer = fillText(input, '');

    expect(input.value).toBe('Grace');
    expect(seen).toEqual([]);
    expect(holdsAnswer).toBe(true);
  });

  it('leaves alone something that is not a control with a value', () => {
    // A rich-text editor is a <div contenteditable>; there is no value to set on it.
    const editor = first(mount<HTMLElement>('<div role="textbox" contenteditable="true"></div>', 'div'));
    const seen = watchEvents<HTMLElement>((el) => el.textContent);

    const holdsAnswer = fillText(editor as unknown as HTMLInputElement, 'Ada');

    expect(editor.textContent).toBe('');
    expect(Object.hasOwn(editor, 'value')).toBe(false);
    expect(seen).toEqual([]);
    expect(holdsAnswer).toBe(false);
  });

  it('reports an answer when the page rewrites the text in its own format', () => {
    // A phone field with an input mask: what it holds is not what was written, and that is fine.
    const input = first(mount('<input id="phone" type="tel">'));
    input.addEventListener('input', () => {
      input.value = '(555) 555-0100';
    });

    expect(fillText(input, '5555550100')).toBe(true);
    expect(input.value).toBe('(555) 555-0100');
  });
});

// The gender question of Lever's voluntary self-identification block; "Male" is already chosen.
const LEVER_GENDER = `
  <select name="eeo[gender]">
    <option value="">Select ...</option>
    <option value="Male" selected>Male</option>
    <option value="Female">Female</option>
    <option value="Decline to self-identify">Decline to self-identify</option>
  </select>`;

describe('fillSelect', () => {
  it('chooses the option at the given position and reports that it is chosen', () => {
    const select = first(mount<HTMLSelectElement>(LEVER_GENDER));

    const holdsAnswer = fillSelect(select, 2);

    expect(select.selectedIndex).toBe(2);
    expect(select.value).toBe('Female');
    expect(Array.from(select.selectedOptions, (option) => option.text)).toEqual(['Female']);
    expect(holdsAnswer).toBe(true);
  });

  it('tells the page with an input event and then a change event, once the option is chosen', () => {
    const select = first(mount<HTMLSelectElement>(LEVER_GENDER));
    const seen = watchEvents<HTMLSelectElement>((el) => el.selectedIndex);

    fillSelect(select, 3);

    expect(seen).toEqual([
      { type: 'input', bubbles: true, composed: true, held: 3 },
      { type: 'change', bubbles: true, composed: false, held: 3 },
    ]);
  });

  it('goes by position, so two options with the same value cannot be confused', () => {
    const select = first(
      mount<HTMLSelectElement>(`
        <select id="country">
          <option value="">Select...</option>
          <option value="US">United States</option>
          <option value="CA">Canada</option>
          <option value="US">United States of America</option>
        </select>`),
    );

    const holdsAnswer = fillSelect(select, 3);

    expect(select.selectedIndex).toBe(3);
    expect(holdsAnswer).toBe(true);
  });

  // [what is asked for, markup, position asked for, position chosen before and after]
  it.each<[string, string, number, number]>([
    [
      'a disabled option',
      `<select name="location">
         <option value="lon" selected>London</option>
         <option value="" disabled>── Americas ──</option>
         <option value="nyc">New York</option>
       </select>`,
      1,
      0,
    ],
    [
      'an option inside a disabled group',
      `<select name="location">
         <option value="lon" selected>London</option>
         <optgroup label="Not hiring at the moment" disabled><option value="nyc">New York</option></optgroup>
       </select>`,
      1,
      0,
    ],
    // Each of these would otherwise clear the choice already made, or land on a neighbour.
    ['a position past the last option', LEVER_GENDER, 4, 1],
    ['a negative position', LEVER_GENDER, -1, 1],
    ['a position between two options', LEVER_GENDER, 2.5, 1],
    ['a position that is not a number', LEVER_GENDER, Number.NaN, 1],
    [
      'an option of a list that takes several answers',
      `<select name="skills" multiple>
         <option selected>Mathematics</option>
         <option>Programming</option>
       </select>`,
      1,
      0,
    ],
  ])('refuses %s and leaves the list as it was', (_name, html, index, chosen) => {
    const select = first(mount<HTMLSelectElement>(html));
    const seen = watchEvents<HTMLSelectElement>((el) => el.selectedIndex);

    const holdsAnswer = fillSelect(select, index);

    expect(select.selectedIndex).toBe(chosen);
    expect(Array.from(select.selectedOptions)).toHaveLength(1);
    expect(seen).toEqual([]);
    expect(holdsAnswer).toBe(false);
  });

  it('reports no answer when the page puts its own choice back', () => {
    const select = first(mount<HTMLSelectElement>(LEVER_GENDER));
    select.addEventListener('change', () => {
      select.selectedIndex = 0;
    });

    expect(fillSelect(select, 2)).toBe(false);
  });
});

// A yes/no question the way Lever renders it: two native radios, each inside its label.
const LEVER_SPONSORSHIP = `
  <form id="application-form">
    <div class="application-label">Will you now or in the future require sponsorship for employment visa status?</div>
    <ul data-qa="multiple-choice">
      <li><label><input type="radio" name="cards[4f1c][field1]" value="Yes"><span>Yes</span></label></li>
      <li><label><input type="radio" name="cards[4f1c][field1]" value="No"><span>No</span></label></li>
    </ul>
  </form>`;

describe('fillRadio', () => {
  it('chooses the radio and reports that it is chosen', () => {
    const [yes, no] = mount(LEVER_SPONSORSHIP);
    if (yes === undefined || no === undefined) throw new Error('bad fixture');

    const holdsAnswer = fillRadio(no);

    expect(no.checked).toBe(true);
    expect(yes.checked).toBe(false);
    expect(holdsAnswer).toBe(true);
  });

  it('does it with a click, which the page hears before the input and change events', () => {
    // React answers a radio's click event; setting `checked` and sending events by hand does nothing there.
    const [, no] = mount(LEVER_SPONSORSHIP);
    if (no === undefined) throw new Error('bad fixture');
    const seen = watchEvents<HTMLInputElement>((el) => el.checked);

    fillRadio(no);

    expect(seen.map((event) => [event.type, event.held])).toEqual([
      ['click', true],
      ['input', true],
      ['change', true],
    ]);
  });

  it('leaves a radio alone that is already chosen', () => {
    // Ashby's radios are un-chosen by a second click, which would erase the answer.
    const radio = first(mount('<input type="radio" id="a1b2_q-labeled-radio-0" name="a1b2_q" checked>'));
    radio.addEventListener('click', () => {
      radio.checked = false;
    });
    const seen = watchEvents<HTMLInputElement>((el) => el.checked);

    const holdsAnswer = fillRadio(radio);

    expect(seen).toEqual([]);
    expect(radio.checked).toBe(true);
    expect(holdsAnswer).toBe(true);
  });

  it.each<[string, string]>([
    ['a disabled radio', '<input type="radio" name="q" value="Yes" disabled>'],
    ['a radio in a disabled fieldset', '<fieldset disabled><input type="radio" name="q" value="Yes"></fieldset>'],
  ])('does not click %s', (_name, html) => {
    const radio = first(mount(html));
    const click = vi.spyOn(radio, 'click');

    const holdsAnswer = fillRadio(radio);

    expect(click).not.toHaveBeenCalled();
    expect(radio.checked).toBe(false);
    expect(holdsAnswer).toBe(false);
  });

  // Product rule 1: the only thing this extension ever clicks is a radio button.
  // [what it is, markup, selector of the element handed to fillRadio]
  it.each<[string, string, string]>([
    ['a consent checkbox', '<label><input type="checkbox" name="consent"> I agree to the privacy policy</label>', 'input'],
    ['a submit button', '<form><button type="submit" id="btn-submit">Submit application</button></form>', 'button'],
    ['a submit input', '<form><input type="submit" value="Apply"></form>', 'input'],
    ['a plain button', '<button type="button" data-option="yes" aria-pressed="false">Yes</button>', 'button'],
    ['a link', '<a href="https://example.com/next">Next step</a>', 'a'],
    // Its `type` property reads "radio" too, so the type alone proves nothing.
    ['a link that gives its type as "radio"', '<a href="https://example.com/next" type="radio">Next step</a>', 'a'],
    ['the label of a radio', '<label for="yes">Yes</label><input type="radio" id="yes" name="q">', 'label'],
    ['a home-made radio', '<div role="radio" aria-checked="false" tabindex="0">Yes</div>', 'div'],
    ['a text box', '<input type="text" id="first_name">', 'input'],
  ])('never clicks %s', (_name, html, selector) => {
    const element = first(mount<HTMLElement>(html, selector));
    const seen = watchEvents<HTMLElement>(() => null);
    const submitted = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener('submit', submitted);

    const holdsAnswer = fillRadio(element as HTMLInputElement);
    document.removeEventListener('submit', submitted);

    expect(seen).toEqual([]);
    expect(submitted).not.toHaveBeenCalled();
    expect(document.querySelectorAll(':checked')).toHaveLength(0);
    expect(holdsAnswer).toBe(false);
  });

  it('reports no answer when the page undoes the choice', () => {
    const [yes] = mount(LEVER_SPONSORSHIP);
    if (yes === undefined) throw new Error('bad fixture');
    yes.addEventListener('change', () => {
      yes.checked = false;
    });

    expect(fillRadio(yes)).toBe(false);
  });

  it('chooses a radio that belongs to the document of another frame', () => {
    // Recognised by what it is (`<input type=radio>`), not by `instanceof`, which fails across frames.
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (frameDocument === null) throw new Error('the frame has no document');
    const radio = frameDocument.createElement('input');
    radio.type = 'radio';
    frameDocument.body.append(radio);
    expect(radio instanceof HTMLInputElement).toBe(false);

    const holdsAnswer = fillRadio(radio);

    expect(radio.checked).toBe(true);
    expect(holdsAnswer).toBe(true);
  });
});

// The résumé input of a Greenhouse form: hidden on purpose behind an "Attach" button.
const GREENHOUSE_RESUME = '<input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf">';

/**
 * Stands in for the browser's way of putting files into an input (a
 * DataTransfer, which jsdom does not have). The real one is covered end to end.
 */
const assignFiles: PageEnv['assignFiles'] = (input, files) => {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
};

function resumeFile(): File {
  return new File(['%PDF-1.7'], 'Ada-Lovelace-Resume.pdf', { type: 'application/pdf' });
}

describe('fillFile', () => {
  it('puts the one file into the input and reports that it is there', () => {
    const input = first(mount(GREENHOUSE_RESUME));
    const file = resumeFile();
    const assign = vi.fn(assignFiles);

    const holdsAnswer = fillFile(input, file, assign);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(input, [file]);
    expect(input.files).toHaveLength(1);
    expect(input.files?.[0]).toBe(file);
    expect(holdsAnswer).toBe(true);
  });

  it('tells the page with an input event and then a change event, once the file is in place', () => {
    // Greenhouse, Lever and Ashby all read `files[0]` in their change handler.
    const input = first(mount(GREENHOUSE_RESUME));
    const seen = watchEvents<HTMLInputElement>((el) => el.files?.[0]?.name);

    fillFile(input, resumeFile(), assignFiles);

    expect(seen).toEqual([
      { type: 'input', bubbles: true, composed: true, held: 'Ada-Lovelace-Resume.pdf' },
      { type: 'change', bubbles: true, composed: false, held: 'Ada-Lovelace-Resume.pdf' },
    ]);
  });

  it('reports no file, and tells the page nothing, when the input did not take the file', () => {
    const input = first(mount(GREENHOUSE_RESUME));
    const seen = watchEvents<HTMLInputElement>((el) => el.files?.length);
    const assignNothing: PageEnv['assignFiles'] = () => undefined;

    const holdsAnswer = fillFile(input, resumeFile(), assignNothing);

    expect(seen).toEqual([]);
    expect(holdsAnswer).toBe(false);
  });

  it('still reports the file when the page removes the input as soon as it has the file', () => {
    // Greenhouse swaps the input for the file name and a "Remove file" button.
    const input = first(mount(GREENHOUSE_RESUME));
    input.addEventListener('change', () => input.remove());

    const holdsAnswer = fillFile(input, resumeFile(), assignFiles);

    expect(input.isConnected).toBe(false);
    expect(holdsAnswer).toBe(true);
  });

  it('reports no file when the page clears the input again', () => {
    const input = first(mount(GREENHOUSE_RESUME));
    input.addEventListener('change', () => assignFiles(input, []));

    expect(fillFile(input, resumeFile(), assignFiles)).toBe(false);
  });
});

describe('every helper', () => {
  it('fills without focusing, blurring, selecting or scrolling anything', () => {
    // While the popup is open the page does not have focus, so focus() and
    // blur() would behave differently for the user than in any test; and
    // Lever's location box wipes itself on blur.
    const [firstName, comments, gender, yes, , resume] = mount<HTMLElement>(`
      <form id="application-form">
        <input id="first_name" type="text">
        <textarea name="comments"></textarea>
        ${LEVER_GENDER}
        <label><input type="radio" name="cards[4f1c][field1]" value="Yes">Yes</label>
        <label><input type="radio" name="cards[4f1c][field1]" value="No">No</label>
        ${GREENHOUSE_RESUME}
      </form>`);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const blur = vi.spyOn(HTMLElement.prototype, 'blur');
    const selectInInput = vi.spyOn(HTMLInputElement.prototype, 'select');
    const selectInTextarea = vi.spyOn(HTMLTextAreaElement.prototype, 'select');
    // jsdom has no scrollIntoView at all; give it one for this test so that a call would be noticed.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const seen = watchEvents<HTMLElement>(() => null);

    const results = [
      fillText(firstName as HTMLInputElement, 'Ada'),
      fillText(comments as HTMLTextAreaElement, 'Analytical Engine, 1843'),
      fillSelect(gender as HTMLSelectElement, 2),
      fillRadio(yes as HTMLInputElement),
      fillFile(resume as HTMLInputElement, resumeFile(), assignFiles),
    ];
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');

    expect(results).toEqual([true, true, true, true, true]);
    expect(focus).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(selectInInput).not.toHaveBeenCalled();
    expect(selectInTextarea).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    const focusEvents = seen.filter((event) => ['focus', 'blur', 'focusin', 'focusout'].includes(event.type));
    expect(focusEvents).toEqual([]);
  });
});

describe('inside an open shadow root', () => {
  /** A web component with the given controls inside its open shadow root. */
  function mountInShadow<T extends Element>(html: string): { host: HTMLElement; control: T } {
    const host = document.createElement('application-form');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = html;
    return { host, control: first(Array.from(shadow.querySelectorAll<T>('input, select'))) };
  }

  /** What a listener on the document gets to see of each input event. */
  function listenAtDocument(): { target: EventTarget | null; origin: EventTarget | undefined }[] {
    const heard: { target: EventTarget | null; origin: EventTarget | undefined }[] = [];
    const listener = (event: Event): void => {
      heard.push({ target: event.target, origin: event.composedPath()[0] });
    };
    document.addEventListener('input', listener);
    stopWatching.push(() => document.removeEventListener('input', listener));
    return heard;
  }

  // Frameworks listen at the document. An input event that is not `composed`
  // stops at the shadow root, and the page never learns the field was filled.
  it('the input event of a filled text field reaches a listener on the document', () => {
    const { host, control } = mountInShadow<HTMLInputElement>('<input id="first_name" type="text">');
    const heard = listenAtDocument();

    fillText(control, 'Ada');

    // Outside the shadow root the event appears to come from the component itself.
    expect(heard).toEqual([{ target: host, origin: control }]);
  });

  it('the input event of a chosen option reaches a listener on the document', () => {
    const { host, control } = mountInShadow<HTMLSelectElement>(LEVER_GENDER);
    const heard = listenAtDocument();

    fillSelect(control, 2);

    expect(heard).toEqual([{ target: host, origin: control }]);
  });

  it('the input event of an attached file reaches a listener on the document', () => {
    const { host, control } = mountInShadow<HTMLInputElement>(GREENHOUSE_RESUME);
    const heard = listenAtDocument();

    fillFile(control, resumeFile(), assignFiles);

    expect(heard).toEqual([{ target: host, origin: control }]);
  });
});

describe('on a form made with React 19', () => {
  interface FormState {
    firstName: string;
    gender: string;
    sponsorship: string;
    resume: string;
  }

  /**
   * A small application form of controlled components, the way Greenhouse
   * builds its form: what counts is the state inside React, which is printed
   * into the <output> element so the tests can read it.
   */
  function ApplicationForm(): ReactElement {
    const [state, setState] = useState<FormState>({ firstName: '', gender: '', sponsorship: '', resume: '' });
    const set = (change: Partial<FormState>): void => setState((before) => ({ ...before, ...change }));
    return createElement(
      'form',
      null,
      createElement('input', {
        id: 'first_name',
        type: 'text',
        value: state.firstName,
        onChange: (event: ChangeEvent<HTMLInputElement>) => set({ firstName: event.target.value }),
      }),
      createElement(
        'select',
        {
          id: 'gender',
          value: state.gender,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => set({ gender: event.target.value }),
        },
        createElement('option', { value: '' }, 'Select ...'),
        createElement('option', { value: 'Male' }, 'Male'),
        createElement('option', { value: 'Female' }, 'Female'),
      ),
      ['Yes', 'No'].map((answer) =>
        createElement(
          'label',
          { key: answer },
          createElement('input', {
            type: 'radio',
            name: 'sponsorship',
            value: answer,
            checked: state.sponsorship === answer,
            onChange: () => set({ sponsorship: answer }),
          }),
          answer,
        ),
      ),
      createElement('input', {
        id: 'resume',
        type: 'file',
        onChange: (event: ChangeEvent<HTMLInputElement>) => set({ resume: event.target.files?.[0]?.name ?? '' }),
      }),
      createElement('output', null, JSON.stringify(state)),
    );
  }

  let root: Root;

  beforeEach(() => {
    // Tells React that this is a test, so that act() may be used.
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(ApplicationForm)));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  /** The state React holds, as the form printed it. */
  const reactState = (): string | null | undefined => document.querySelector('output')?.textContent;
  const control = <T extends Element>(selector: string): T => first(Array.from(document.querySelectorAll<T>(selector)));

  it('a controlled text input takes the text into its state', () => {
    const input = control<HTMLInputElement>('#first_name');
    let holdsAnswer = false;

    act(() => {
      holdsAnswer = fillText(input, 'Ada');
    });

    expect(reactState()).toBe('{"firstName":"Ada","gender":"","sponsorship":"","resume":""}');
    expect(input.value).toBe('Ada');
    expect(holdsAnswer).toBe(true);
  });

  it('a controlled select takes the choice into its state', () => {
    const select = control<HTMLSelectElement>('#gender');
    let holdsAnswer = false;

    act(() => {
      holdsAnswer = fillSelect(select, 2);
    });

    expect(reactState()).toBe('{"firstName":"","gender":"Female","sponsorship":"","resume":""}');
    expect(select.selectedIndex).toBe(2);
    expect(holdsAnswer).toBe(true);
  });

  it('a controlled radio group takes the choice into its state', () => {
    const no = control<HTMLInputElement>('input[type=radio][value=No]');
    let holdsAnswer = false;

    act(() => {
      holdsAnswer = fillRadio(no);
    });

    expect(reactState()).toBe('{"firstName":"","gender":"","sponsorship":"No","resume":""}');
    expect(no.checked).toBe(true);
    expect(holdsAnswer).toBe(true);
  });

  it('the change handler of a file input reads the attached file', () => {
    const input = control<HTMLInputElement>('#resume');
    let holdsAnswer = false;

    act(() => {
      holdsAnswer = fillFile(input, resumeFile(), assignFiles);
    });

    expect(reactState()).toBe('{"firstName":"","gender":"","sponsorship":"","resume":"Ada-Lovelace-Resume.pdf"}');
    expect(holdsAnswer).toBe(true);
  });
});
