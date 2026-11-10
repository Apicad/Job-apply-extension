/**
 * A small application form of React 19 controlled components (see react-form.html).
 *
 * A controlled component shows what React's state says, not what the DOM was last told. Writing
 * into such a control only counts when React hears of it and takes it into its state, so the form
 * prints that state into its <output> for the tests to read.
 */
import { createElement, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

interface FormState {
  firstName: string;
  gender: string;
  sponsorship: string;
  resume: string;
}

function ApplicationForm(): ReactElement {
  const [state, setState] = useState<FormState>({ firstName: '', gender: '', sponsorship: '', resume: '' });
  const set = (change: Partial<FormState>): void => setState((before) => ({ ...before, ...change }));

  return createElement(
    'form',
    { id: 'application-form' },
    createElement(
      'label',
      null,
      'First Name ',
      createElement('input', {
        id: 'first_name',
        type: 'text',
        value: state.firstName,
        onChange: (event: ChangeEvent<HTMLInputElement>) => set({ firstName: event.target.value }),
      }),
    ),
    createElement(
      'label',
      null,
      'Gender ',
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
    ),
    createElement(
      'fieldset',
      null,
      createElement('legend', null, 'Do you require visa sponsorship?'),
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
          ` ${answer} `,
        ),
      ),
    ),
    createElement(
      'label',
      null,
      'Resume ',
      createElement('input', {
        id: 'resume',
        type: 'file',
        onChange: (event: ChangeEvent<HTMLInputElement>) => set({ resume: event.target.files?.[0]?.name ?? '' }),
      }),
    ),
    createElement('output', { id: 'state' }, JSON.stringify(state)),
  );
}

const container = document.querySelector('#root');
if (container === null) throw new Error('react-form.html has no #root');
// flushSync: the form is on the page before the page calls itself ready
flushSync(() => createRoot(container).render(createElement(ApplicationForm)));
document.documentElement.setAttribute('data-ready', '');
