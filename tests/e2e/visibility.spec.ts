import { expect, test } from './extension';

// Product rule 4, "never fill a field the user cannot see", against a real layout.
//
// tests/fixtures/visibility.html is the list: one control per block, and each block says whether a
// person could see and use that control (data-expect). The unit tests check the arithmetic of
// lib/page/layout.ts with made-up boxes; only a browser can say what boxes real style rules give.

test('sees exactly the controls a person could see', async ({ openFixture }) => {
  const page = await openFixture('visibility.html');

  const wanted = await page.$$eval('[data-case]', (blocks) =>
    blocks.map((block) => [block.getAttribute('data-case') ?? '', block.getAttribute('data-expect') ?? ''] as [string, string]),
  );
  const cases = await page.evaluate(() => window.__pageSide.readVisibilityCases());
  // A control that is never collected has no case: "absent".
  const verdicts = new Map(cases.map(({ name, shown }) => [name, shown ? 'shown' : 'hidden']));
  const got = wanted.map(([name]) => [name, verdicts.get(name) ?? 'absent']);

  // the page is long enough to mean something, and every block was read once
  expect(wanted.length).toBeGreaterThan(60);
  expect(new Set(wanted.map(([name]) => name)).size).toBe(wanted.length);
  expect(got).toEqual(wanted);
});

test('answers the same wherever the page is scrolled to', async ({ openFixture }) => {
  // Boxes are measured from the window, so every measurement moves when the page scrolls. What a
  // person could see, by scrolling if need be, does not.
  const page = await openFixture('visibility.html');
  const read = (): Promise<[string, boolean][]> =>
    page.evaluate(() => window.__pageSide.readVisibilityCases().map(({ name, shown }) => [name, shown] as [string, boolean]));

  const atTheTop = await read();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const atTheBottom = await read();
  await page.evaluate(() => window.scrollTo(0, 1234));
  const inBetween = await read();

  expect(atTheBottom).toEqual(atTheTop);
  expect(inBetween).toEqual(atTheTop);
});

test('answers the same in a narrow window', async ({ openFixture }) => {
  const page = await openFixture('visibility.html');
  const read = (): Promise<[string, boolean][]> =>
    page.evaluate(() => window.__pageSide.readVisibilityCases().map(({ name, shown }) => [name, shown] as [string, boolean]));
  const wide = await read();

  await page.setViewportSize({ width: 360, height: 640 });

  expect(await read()).toEqual(wide);
});
