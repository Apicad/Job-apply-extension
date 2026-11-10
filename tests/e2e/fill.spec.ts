import type { Page } from '@playwright/test';
import { expect, test } from './extension';

// Writing into controls in a real browser. The unit tests cover the same helpers in jsdom; what
// only a browser can show is that a real React 19 form takes the answers into its state, that a
// file reaches the page, and what each strict input type does with text it cannot hold.

/** What the React form of tests/fixtures/react-form.html holds in its state. */
async function reactState(page: Page): Promise<unknown> {
  return JSON.parse((await page.locator('#state').textContent()) ?? 'null');
}

test.describe('a form of React 19 controlled components', () => {
  test('takes typed text into its state', async ({ openFixture }) => {
    const page = await openFixture('react-form.html');

    const holdsAnswer = await page.evaluate(() => window.__pageSide.typeInto('#first_name', 'Ada'));

    expect(holdsAnswer).toBe(true);
    expect(await reactState(page)).toEqual({ firstName: 'Ada', gender: '', sponsorship: '', resume: '' });
    await expect(page.locator('#first_name')).toHaveValue('Ada');
  });

  test('takes a chosen option into its state', async ({ openFixture }) => {
    const page = await openFixture('react-form.html');

    const holdsAnswer = await page.evaluate(() => window.__pageSide.chooseOption('#gender', 2));

    expect(holdsAnswer).toBe(true);
    expect(await reactState(page)).toEqual({ firstName: '', gender: 'Female', sponsorship: '', resume: '' });
  });

  test('takes a chosen radio into its state', async ({ openFixture }) => {
    const page = await openFixture('react-form.html');

    const holdsAnswer = await page.evaluate(() => window.__pageSide.chooseRadio('input[type="radio"][value="No"]'));

    expect(holdsAnswer).toBe(true);
    expect(await reactState(page)).toEqual({ firstName: '', gender: '', sponsorship: 'No', resume: '' });
    await expect(page.locator('input[type="radio"][value="No"]')).toBeChecked();
    await expect(page.locator('input[type="radio"][value="Yes"]')).not.toBeChecked();
  });

  test('reads an attached file in its change handler', async ({ openFixture }) => {
    const page = await openFixture('react-form.html');

    const holdsAnswer = await page.evaluate(() =>
      window.__pageSide.attachFile('#resume', 'Ada-Lovelace-Resume.pdf', 'application/pdf', '%PDF-1.7 made up for a test'),
    );

    expect(holdsAnswer).toBe(true);
    expect(await reactState(page)).toEqual({ firstName: '', gender: '', sponsorship: '', resume: 'Ada-Lovelace-Resume.pdf' });
  });

  test('keeps every answer when all four are written one after another', async ({ openFixture }) => {
    const page = await openFixture('react-form.html');

    const results = await page.evaluate(() => {
      const side = window.__pageSide;
      return [
        side.typeInto('#first_name', 'Ada'),
        side.chooseOption('#gender', 2),
        side.chooseRadio('input[type="radio"][value="Yes"]'),
        side.attachFile('#resume', 'Ada-Lovelace-Resume.pdf', 'application/pdf', '%PDF-1.7'),
      ];
    });

    expect(results).toEqual([true, true, true, true]);
    expect(await reactState(page)).toEqual({ firstName: 'Ada', gender: 'Female', sponsorship: 'Yes', resume: 'Ada-Lovelace-Resume.pdf' });
  });

  test('does not click a radio that is already chosen', async ({ openFixture }) => {
    const page = await openFixture('react-form.html');
    await page.evaluate(() => window.__pageSide.chooseRadio('input[type="radio"][value="Yes"]'));
    const clicks = await page.evaluate(() => {
      let heard = 0;
      document.addEventListener('click', () => heard++, true);
      window.__pageSide.chooseRadio('input[type="radio"][value="Yes"]');
      return heard;
    });

    expect(clicks).toBe(0);
    expect(await reactState(page)).toEqual({ firstName: '', gender: '', sponsorship: 'Yes', resume: '' });
  });
});

test.describe('a real Lever form', () => {
  test('holds what was written, and the page hears of each write', async ({ openFixture }) => {
    const page = await openFixture('lever.html');
    await page.evaluate(() => {
      // what a page's own script would hear, by control name
      const heard: string[] = [];
      for (const type of ['input', 'change']) {
        document.addEventListener(type, (event) => heard.push(`${type}:${(event.target as HTMLInputElement).name}`));
      }
      Object.assign(window, { heardByThePage: heard });
    });

    const results = await page.evaluate(() => {
      const side = window.__pageSide;
      return [
        side.typeInto('[name="name"]', 'Ada Lovelace'),
        side.typeInto('[name="email"]', 'ada@example.com'),
        side.chooseRadio('input[type="radio"][value="Yes"]'),
        side.chooseOption('select', 2),
        side.attachFile('#resume-upload-input', 'Ada-Lovelace-Resume.pdf', 'application/pdf', '%PDF-1.7'),
      ];
    });

    expect(results).toEqual([true, true, true, true, true]);
    await expect(page.locator('[name="name"]')).toHaveValue('Ada Lovelace');
    await expect(page.locator('[name="email"]')).toHaveValue('ada@example.com');
    await expect(page.locator('input[type="radio"][value="Yes"]')).toBeChecked();
    await expect(page.locator('select')).toHaveValue('LinkedIn');
    expect(await page.evaluate(() => document.querySelector<HTMLInputElement>('#resume-upload-input')?.files?.[0]?.name)).toBe('Ada-Lovelace-Resume.pdf');
    expect(await page.evaluate(() => (window as unknown as { heardByThePage: string[] }).heardByThePage)).toEqual([
      'input:name',
      'change:name',
      'input:email',
      'change:email',
      'input:cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]',
      'change:cards[1c719ca9-5069-4afe-9e82-39ca420e0edb][field0]',
      'input:cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]',
      'change:cards[a6197d84-549e-4a91-8bb0-6af972510013][field0]',
      'input:resume',
      'change:resume',
    ]);
  });

  test('gives the page the bytes of the attached file, not only its name', async ({ openFixture }) => {
    const page = await openFixture('lever.html');
    await page.evaluate(() => window.__pageSide.attachFile('#resume-upload-input', 'Ada-Lovelace-Resume.txt', 'text/plain', 'Analytical Engine, 1843'));

    const read = await page.evaluate(async () => {
      const file = document.querySelector<HTMLInputElement>('#resume-upload-input')?.files?.[0];
      return file === undefined ? null : { name: file.name, type: file.type, size: file.size, text: await file.text() };
    });

    expect(read).toEqual({ name: 'Ada-Lovelace-Resume.txt', type: 'text/plain', size: 23, text: 'Analytical Engine, 1843' });
  });

  test('fills without moving the focus, scrolling the page or submitting anything', async ({ openFixture }) => {
    const page = await openFixture('lever.html');
    await page.evaluate(() => {
      const seen: string[] = [];
      for (const type of ['focus', 'blur', 'focusin', 'focusout', 'scroll', 'submit']) {
        document.addEventListener(type, () => seen.push(type), true);
      }
      Object.assign(window, { seenByThePage: seen });
      const side = window.__pageSide;
      // the comments box is at the very end of a long form
      side.typeInto('[name="name"]', 'Ada Lovelace');
      side.chooseRadio('input[type="radio"][value="No"]');
      side.chooseOption('select', 1);
      side.attachFile('#resume-upload-input', 'Ada-Lovelace-Resume.pdf', 'application/pdf', '%PDF-1.7');
    });
    // scroll events arrive with the next frame
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const after = await page.evaluate(() => ({
      seen: (window as unknown as { seenByThePage: string[] }).seenByThePage,
      focused: document.activeElement?.localName,
      scrolled: [window.scrollX, window.scrollY],
    }));

    expect(after).toEqual({ seen: [], focused: 'body', scrolled: [0, 0] });
  });
});

test.describe('input types that are strict about what they hold', () => {
  // [type, text, what the box holds afterwards]. An empty box means the browser threw the text
  // away, which fillText reports as "no answer". lib/profile.ts decides from these same facts
  // which text is safe to send to which type of box.
  const strict: [type: string, text: string, held: string][] = [
    ['number', '3.9', '3.9'],
    ['number', '3.9/4.0', ''],
    ['number', 'four', ''],
    ['month', '2027-05', '2027-05'],
    ['month', 'May 2027', ''],
    ['month', '2027-13', ''],
    // These three keep any text: a wrong one only fails the form's own validation later.
    ['email', 'ada@example.com', 'ada@example.com'],
    ['email', 'not an e-mail', 'not an e-mail'],
    ['url', 'https://example.com/ada', 'https://example.com/ada'],
    ['url', 'example.com/ada', 'example.com/ada'],
    ['tel', '555-0100', '555-0100'],
    ['text', 'Ada', 'Ada'],
  ];

  for (const [type, text, held] of strict) {
    test(`<input type="${type}"> given "${text}" holds "${held}"`, async ({ openFixture }) => {
      const page = await openFixture('lever.html');

      const got = await page.evaluate(
        ([inputType, value]) => {
          const input = document.createElement('input');
          input.id = 'strict';
          input.type = inputType ?? 'text';
          document.body.append(input);
          const holdsAnswer = window.__pageSide.typeInto('#strict', value ?? '');
          return { holdsAnswer, value: input.value };
        },
        [type, text],
      );

      expect(got).toEqual({ holdsAnswer: held !== '', value: held });
    });
  }
});
