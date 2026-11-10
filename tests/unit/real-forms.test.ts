import { afterEach, describe, expect, it } from 'vitest';
import { classifyField } from '../../lib/classify';
import { collectControls } from '../../lib/page/collect';
import { describeControl, isEmpty } from '../../lib/page/describe';
import type { FieldDescriptor, FieldKind } from '../../lib/types';
import { GREENHOUSE, LEVER } from '../fixtures/real-forms';

// What a scan makes of a whole application form: every control found on the page, described by
// the page side and then classified by the trusted side. The two halves are tested apart
// elsewhere; these tests hold them to each other on real markup.

/** Taken before any form is on the page: Lever's form has controls named like properties of the page. */
const body = document.body;

interface Reading {
  descriptor: FieldDescriptor;
  kind: FieldKind | null;
  empty: boolean;
}

function read(html: string): Reading[] {
  body.innerHTML = html;
  return collectControls(document).map((control) => {
    const descriptor = describeControl(control);
    return { descriptor, kind: classifyField(descriptor), empty: isEmpty(control) };
  });
}

/** One line per control: what it is, what it is called, the group it sits in, and what it was taken for. */
function summary(readings: readonly Reading[]): [control: string, label: string, groupLabel: string, kind: FieldKind | null][] {
  return readings.map(({ descriptor, kind }) => [descriptor.control, descriptor.label, descriptor.groupLabel, kind]);
}

afterEach(() => {
  body.innerHTML = '';
});

describe('a real Greenhouse form, read from end to end', () => {
  it('recognises the standard fields, the résumé upload and the two questions it can answer', () => {
    expect(summary(read(GREENHOUSE))).toEqual([
      ['text', 'First Name', '', 'firstName'],
      ['text', 'Last Name', '', 'lastName'],
      ['text', 'Email', '', 'email'],
      // the dial-code picker of the phone number: never the country of residence
      ['combobox', 'Country', 'Phone', null],
      ['text', 'Phone', 'Phone', 'phone'],
      // both uploads are labelled "Attach"; the id tells the résumé from the cover letter
      ['file', 'Attach', 'Resume/CV', 'resume'],
      ['file', 'Attach', 'Cover Letter', null],
      ['text', 'LinkedIn Profile', '', 'linkedin'],
      ['combobox', 'Will you now or in the future require sponsorship for a visa to remain in your current location?', '', 'sponsorship'],
      ['combobox', 'Gender', '', 'gender'],
    ]);
  });

  it('reads what is required from aria-required, on the control or on its upload group', () => {
    const required = read(GREENHOUSE).map(({ descriptor }) => [descriptor.id, descriptor.required]);

    expect(required).toEqual([
      ['first_name', true],
      ['last_name', true],
      ['email', true],
      ['country', false],
      ['phone', false],
      ['resume', true],
      ['cover_letter', false],
      ['question_37369956002', false],
      ['question_37369961002', true],
      ['gender', false],
    ]);
  });

  it('offers no options for its dropdowns: each is a custom one whose list is not in the page', () => {
    expect(read(GREENHOUSE).flatMap(({ descriptor }) => descriptor.options)).toEqual([]);
  });

  it('finds every control unanswered on a fresh form', () => {
    expect(read(GREENHOUSE).map(({ empty }) => empty)).toEqual(Array.from({ length: 10 }, () => true));
  });
});

describe('a real Lever form, read from end to end', () => {
  it('recognises the standard fields, the résumé upload and the work-authorization question', () => {
    expect(summary(read(LEVER))).toEqual([
      ['file', 'Resume/CV', '', 'resume'],
      ['text', 'Full name', '', 'fullName'],
      ['text', 'Email', '', 'email'],
      ['text', 'Phone', '', 'phone'],
      // recognised, and never written: it is a typeahead
      ['text', 'Current location', '', 'location'],
      ['text', 'Current company', '', 'currentCompany'],
      ['text', 'LinkedIn URL', '', 'linkedin'],
      // no <label>, no fieldset: the question is the block beside the options
      ['radio', 'Are you legally authorized to work in the country for which you are applying?', '', 'workAuthorization'],
      ['select', 'Please tell us how you heard about this opportunity.', '', null],
      ['textarea', 'What has been your favorite project or proudest accomplishment? Why?', '', null],
      ['textarea', 'Additional information', '', null],
    ]);
  });

  it('lists the options of the radio question and of the dropdown as the page shows them', () => {
    const withOptions = read(LEVER).filter(({ descriptor }) => descriptor.options.length > 0);

    expect(withOptions.map(({ descriptor }) => [descriptor.control, descriptor.options])).toEqual([
      [
        'radio',
        [
          { label: 'Yes', value: 'Yes', disabled: false },
          { label: 'No', value: 'No', disabled: false },
        ],
      ],
      [
        'select',
        [
          { label: 'Select...', value: '', disabled: false },
          { label: 'BuiltIn', value: 'BuiltIn', disabled: false },
          { label: 'LinkedIn', value: 'LinkedIn', disabled: false },
        ],
      ],
    ]);
  });

  it('reads what is required from the required attribute', () => {
    const required = read(LEVER).map(({ descriptor }) => [descriptor.name, descriptor.required]);

    expect(required).toEqual([
      // Lever marks the résumé with a star for people only
      ['resume', false],
      ['name', true],
      ['email', true],
      ['phone', false],
      ['location', true],
      ['org', false],
      ['urls[LinkedIn]', false],
      ['cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]', true],
      ['cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]', true],
      ['cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][field0]', false],
      ['comments', false],
    ]);
  });

  it('finds every control unanswered on a fresh form, the dropdown showing "Select..." included', () => {
    expect(read(LEVER).map(({ empty }) => empty)).toEqual(Array.from({ length: 11 }, () => true));
  });

  it('notices what the user has answered since', () => {
    body.innerHTML = LEVER;
    const controls = collectControls(document);
    const named = (name: string): HTMLInputElement | HTMLSelectElement => {
      const el = body.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
      if (el === null) throw new Error(`the form has no control named ${name}`);
      return el;
    };
    named('name').value = 'Ada Lovelace';
    (named('cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]') as HTMLSelectElement).selectedIndex = 2;
    const no = body.querySelector<HTMLInputElement>('input[type="radio"][value="No"]');
    if (no === null) throw new Error('the form has no radio "No"');
    no.checked = true;

    const answered = controls.filter((control) => !isEmpty(control)).map((control) => describeControl(control).label);

    expect(answered).toEqual([
      'Full name',
      'Are you legally authorized to work in the country for which you are applying?',
      'Please tell us how you heard about this opportunity.',
    ]);
  });
});
