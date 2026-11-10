import { classifyField } from '../../lib/classify';
import { expect, test } from './extension';

// The two real forms of tests/fixtures/real-forms.ts, laid out by a real browser with the style
// rules that decide what can be seen. The unit tests read the same markup in jsdom, which has no
// layout: everything about visibility is checked here.

test.describe('a real Greenhouse form in a real browser', () => {
  test('sees every control a person can use, the dropdowns and the hidden file inputs included', async ({ openFixture }) => {
    const page = await openFixture('greenhouse.html');

    const controls = await page.evaluate(() => window.__pageSide.readControls());

    expect(controls.map(({ descriptor, shown }) => [descriptor.id, descriptor.control, shown])).toEqual([
      ['first_name', 'text', true],
      ['last_name', 'text', true],
      ['email', 'text', true],
      ['country', 'combobox', true],
      ['phone', 'text', true],
      ['resume', 'file', true],
      ['cover_letter', 'file', true],
      ['question_37369956002', 'text', true],
      ['question_37369961002', 'combobox', true],
      ['gender', 'combobox', true],
    ]);
  });

  test('the controls it sees through a stand-in really are out of sight themselves', async ({ openFixture }) => {
    const page = await openFixture('greenhouse.html');

    const rendered = await page.evaluate(() => {
      const side = window.__pageSide;
      return {
        // a React-Select search box: the width of one space until something is typed
        searchBox: side.isRendered('#gender'),
        searchBoxIsNarrow: (document.querySelector('#gender')?.getBoundingClientRect().width ?? 0) < 8,
        boxAroundIt: side.isRendered('.eeoc__question__wrapper .select__control'),
        // an upload: the input and its label are clipped to 1px, the button is what people see
        fileInput: side.isRendered('#resume'),
        itsLabel: side.isRendered('label[for="resume"]'),
        attachButton: side.isRendered('.file-upload button'),
      };
    });

    expect(rendered).toEqual({
      searchBox: false,
      searchBoxIsNarrow: true,
      boxAroundIt: true,
      fileInput: false,
      itsLabel: false,
      attachButton: true,
    });
  });

  test('describes and classifies the form exactly as the unit tests do without a layout', async ({ openFixture }) => {
    const page = await openFixture('greenhouse.html');

    const controls = await page.evaluate(() => window.__pageSide.readControls());
    const summary = controls.map(({ descriptor }) => [descriptor.control, descriptor.label, descriptor.groupLabel, classifyField(descriptor)]);

    expect(summary).toEqual([
      ['text', 'First Name', '', 'firstName'],
      ['text', 'Last Name', '', 'lastName'],
      ['text', 'Email', '', 'email'],
      ['combobox', 'Country', 'Phone', null],
      ['text', 'Phone', 'Phone', 'phone'],
      ['file', 'Attach', 'Resume/CV', 'resume'],
      ['file', 'Attach', 'Cover Letter', null],
      ['text', 'LinkedIn Profile', '', 'linkedin'],
      ['combobox', 'Will you now or in the future require sponsorship for a visa to remain in your current location?', '', 'sponsorship'],
      ['combobox', 'Gender', '', 'gender'],
    ]);
    expect(controls.every((control) => control.empty && control.form === 0)).toBe(true);
  });

  test('does not see a dropdown or an upload once the page hides it', async ({ openFixture }) => {
    const page = await openFixture('greenhouse.html');
    await page.evaluate(() => {
      const hide = (selector: string, style: string): void => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el === null) throw new Error(`the page has no ${selector}`);
        el.setAttribute('style', style);
      };
      hide('.eeoc__container', 'display: none');
      hide('.file-upload', 'height: 0; overflow: hidden');
      hide('.phone-input', 'opacity: 0');
    });

    const controls = await page.evaluate(() => window.__pageSide.readControls());

    expect(controls.filter(({ shown }) => !shown).map(({ descriptor }) => descriptor.id)).toEqual(['country', 'phone', 'resume', 'gender']);
  });
});

test.describe('a real Lever form in a real browser', () => {
  test('sees every control a person can use, the transparent file input included', async ({ openFixture }) => {
    const page = await openFixture('lever.html');

    const controls = await page.evaluate(() => window.__pageSide.readControls());

    expect(controls.map(({ descriptor, shown }) => [descriptor.name, descriptor.control, shown])).toEqual([
      ['resume', 'file', true],
      ['name', 'text', true],
      ['email', 'text', true],
      ['phone', 'text', true],
      ['location', 'text', true],
      ['org', 'text', true],
      ['urls[LinkedIn]', 'text', true],
      ['cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]', 'radio', true],
      ['cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]', 'select', true],
      ['cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][field0]', 'textarea', true],
      ['comments', 'textarea', true],
    ]);
    // the upload is seen through its label: the input itself is fully transparent
    expect(await page.evaluate(() => window.__pageSide.isRendered('#resume-upload-input'))).toBe(false);
  });

  test('describes and classifies the form exactly as the unit tests do without a layout', async ({ openFixture }) => {
    const page = await openFixture('lever.html');

    const controls = await page.evaluate(() => window.__pageSide.readControls());
    const summary = controls.map(({ descriptor }) => [descriptor.control, descriptor.label, classifyField(descriptor)]);

    expect(summary).toEqual([
      ['file', 'Resume/CV', 'resume'],
      ['text', 'Full name', 'fullName'],
      ['text', 'Email', 'email'],
      ['text', 'Phone', 'phone'],
      ['text', 'Current location', 'location'],
      ['text', 'Current company', 'currentCompany'],
      ['text', 'LinkedIn URL', 'linkedin'],
      ['radio', 'Are you legally authorized to work in the country for which you are applying?', 'workAuthorization'],
      ['select', 'Please tell us how you heard about this opportunity.', null],
      ['textarea', 'What has been your favorite project or proudest accomplishment? Why?', null],
      ['textarea', 'Additional information', null],
    ]);
  });

  test('a form whose controls are named like its own properties changes nothing', async ({ openFixture }) => {
    // Real browsers let a control shadow a property of its form: here `form.name` is an <input>.
    // jsdom does not do this, so only a real browser can show that nothing was read off the form.
    const page = await openFixture('lever.html');

    const shadowed = await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('#application-form');
      return form === null ? 'no form' : Object.prototype.toString.call(form.name);
    });
    const controls = await page.evaluate(() => window.__pageSide.readControls());

    expect(shadowed).toBe('[object HTMLInputElement]');
    expect(controls).toHaveLength(11);
    expect(controls.every((control) => control.form === 0)).toBe(true);
  });

  test('does not see honeypots planted among the real fields', async ({ openFixture }) => {
    const page = await openFixture('lever.html');
    await page.evaluate(() => {
      const question = document.querySelector('li.application-question');
      if (question === null) throw new Error('the form has no question to plant beside');
      question.insertAdjacentHTML(
        'afterend',
        `<li><input id="trap-offscreen" name="website" style="position:absolute;left:-9999px">
             <input id="trap-transparent" name="url" style="opacity:0">
             <div style="height:0;overflow:hidden"><input id="trap-clipped" name="email2"></div>
             <div style="display:none"><input id="trap-gone" name="fax"></div>
             <input id="trap-tiny" name="hp" style="width:1px;height:1px;border:0;padding:0"></li>`,
      );
    });

    const controls = await page.evaluate(() => window.__pageSide.readControls());
    const traps = controls.filter(({ descriptor }) => descriptor.id.startsWith('trap-'));

    expect(traps.map(({ descriptor, shown }) => [descriptor.id, shown])).toEqual([
      ['trap-offscreen', false],
      ['trap-transparent', false],
      ['trap-clipped', false],
      ['trap-gone', false],
      ['trap-tiny', false],
    ]);
    // and the real fields are all still seen
    expect(controls.filter(({ shown }) => shown)).toHaveLength(11);
  });
});
