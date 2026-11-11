import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';

async function send(ui: Page, message: Record<string, unknown>) {
  return ui.evaluate(async value => (globalThis as any).chrome.runtime.sendMessage(value), message);
}
async function prepare(ui: Page, page: Page, education: boolean) {
  await send(ui, { type: 'demo' });
  const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((tab: any) => tab.url === url).id, page.url());
  const state = (await send(ui, { type: 'sidebar-state', tabId })).data;
  const profile = { ...state.profile, phone: '(415) 555-0100', country: 'United States', city: 'San Francisco', state: 'California', school: 'Example Community College', degree: education ? 'Associate of Science' : '', major: 'Computer Science', graduationDate: education ? '2027-06' : '', linkedin: 'https://www.linkedin.com/in/synthetic-ada', workAuthorization: '', sponsorship: '', gender: '', race: '', veteran: '', disability: '' };
  expect((await send(ui, { type: 'sidebar-save-profile', profile, facts: state.facts, expectedProfile: state.profile, expectedFacts: state.facts })).ok).toBe(true);
  expect((await send(ui, { type: 'sidebar-save-resume', resume: { name: 'Ada.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 } })).ok).toBe(true);
  await ui.goto(`${ui.url()}?tabId=${tabId}`);
  return tabId;
}
async function run(ui: Page, tabId: number) {
  await ui.getByRole('button', { name: 'Autofill', exact: true }).click();
  await expect.poll(async () => (await send(ui, { type: 'sidebar-state', tabId })).data.run?.phase, { timeout: 20_000 }).toMatch(/^(review|finished|error)$/);
  return (await send(ui, { type: 'sidebar-state', tabId })).data.run;
}

test('Greenhouse-shaped async dropdowns, education, formatted phone and replaced upload all verify without submission', async ({ context, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/greenhouse-live.html`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await prepare(ui, page, true);
  const result = await run(ui, tabId);
  expect(result.phase).toBe('review');
  await expect(page.locator('#phone')).toHaveValue('4155550100');
  await expect(page.locator('.file-upload').first()).toContainText('Ada.txt');
  await expect(page.locator('#resume')).toHaveCount(0);
  for (const [name, value] of [['country', 'US'], ['candidate-location', 'sf-ca-us'], ['school--0', 'college-1'], ['degree--0', 'AS'], ['discipline--0', 'CS'], ['end-month--0', '6']] as const) {
    await expect(page.locator(`input[type="hidden"][name="${name}"]`)).toHaveValue(value);
  }
  await expect(page.locator('#end-year--0')).toHaveValue('2027');
  for (const label of ['Phone', 'Resume/CV', 'Country', 'Location (City)', 'School', 'Degree', 'Discipline', 'End date month', 'End date year']) {
    const field = result.fields.find((field: any) => field.label.replace(/\*/g, '').trim() === label);
    expect(field?.status, `${label}: ${JSON.stringify(result.fields)}`).toBe('filled');
  }
  expect(await page.locator('#transcript').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  await expect(page.locator('#question_authorization')).toHaveValue('');
  await expect(page.locator('#unrelated-school')).toHaveValue('');
  await expect(page.locator('#consent')).not.toBeChecked();
  await expect(page.locator('#submitted')).toHaveText('Not submitted');
  expect(await page.evaluate(() => (window as any).__fixture.uploads)).toBe(1);
  expect(await page.evaluate(() => (window as any).__fixture.events.some((event: any) => event.type === 'click' && ['submit-application', 'attach-resume'].includes(event.id)))).toBe(false);
});

test('Greenhouse preserves a selected country, refuses ambiguous school choices, and leaves unsaved education unanswered', async ({ context, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/greenhouse-live.html?ambiguous=1&prefilledCountry=1`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await prepare(ui, page, false);
  const result = await run(ui, tabId);
  expect(result.phase).toBe('review');
  await expect(page.locator('input[type="hidden"][name="country"]')).toHaveValue('CA');
  for (const name of ['school--0', 'degree--0', 'end-month--0']) await expect(page.locator(`input[type="hidden"][name="${name}"]`)).toHaveValue('');
  await expect(page.locator('#end-year--0')).toHaveValue('');
  const selections = await page.evaluate(() => (window as any).__fixture.selections);
  expect(selections.some((choice: any) => ['school--0', 'degree--0', 'end-month--0', 'country', 'question_authorization'].includes(choice.id))).toBe(false);
  await expect(page.locator('#unrelated-school')).toHaveValue('');
  await expect(page.locator('#consent')).not.toBeChecked();
  await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

test('Greenhouse leaves dependent education untouched when the saved school cannot be uniquely selected', async ({ context, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/greenhouse-live.html?ambiguous=1`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await prepare(ui, page, true);
  const result = await run(ui, tabId);
  expect(result.phase).toBe('review');
  for (const name of ['school--0', 'degree--0', 'discipline--0', 'end-month--0']) {
    await expect(page.locator(`input[type="hidden"][name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('#end-year--0')).toHaveValue('');
  const selections = await page.evaluate(() => (window as any).__fixture.selections);
  expect(selections.some((choice: any) => /^(school|degree|discipline|end-)/.test(choice.id))).toBe(false);
  await expect(page.locator('#consent')).not.toBeChecked();
  await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

for (const prechecked of [false, true]) {
  test(`Greenhouse reports checkbox questions once without changing ${prechecked ? 'existing selections or newly revealed groups' : 'unchecked choices'}`, async ({ context, openExtensionPage }) => {
    const page = await context.newPage();
    await page.goto(`${ORIGIN.main}/greenhouse-live.html${prechecked ? '?prechecked=1&conditional=1' : ''}`);
    const checkboxState = () => page.locator('input[type="checkbox"]').evaluateAll(inputs => inputs.map(input => ({ id: input.id, checked: (input as HTMLInputElement).checked })));
    const before = await checkboxState();
    const ui = await openExtensionPage('sidepanel.html'); const tabId = await prepare(ui, page, true);
    const result = await run(ui, tabId);
    const questions = [
      'Please choose the single location that you are most interested in.',
      'Please confirm which export-control conditions apply. Select all that apply.',
      'Please review the additional status categories. Select all that apply.',
      'I certify my application is accurate',
      ...(prechecked ? ['Additional application checklist'] : []),
    ];
    for (const label of questions) {
      const fields = result.fields.filter((field: any) => field.label === label);
      expect(fields, `one manual row for ${label}`).toHaveLength(1);
      expect(fields[0].status).toBe('review');
      expect(fields[0].detail).toMatch(/checkbox|select|review/i);
      await expect(ui.locator('.attention li').filter({ hasText: label })).toHaveCount(1);
    }
    for (const label of ['North office', 'South office', 'Condition listed by employer', 'None of the above', 'Example category', 'Not applicable', 'Hidden application checkbox', 'Unrelated newsletter']) {
      expect(result.fields.some((field: any) => field.label === label), label).toBe(false);
    }
    const pending = result.fields.filter((field: any) => field.status === 'review' || field.status === 'failed').length;
    await expect(ui.locator('.attention > summary .count')).toHaveText(String(pending));
    expect(await checkboxState()).toEqual(before);
    const checkboxIds = before.map(input => input.id);
    expect(await page.evaluate(ids => (window as any).__fixture.events.filter((event: any) => ids.includes(event.id)), checkboxIds)).toEqual([]);
    await expect(page.locator('#submitted')).toHaveText('Not submitted');
    await ui.reload();
    for (const label of questions) await expect(ui.locator('.attention li').filter({ hasText: label })).toHaveCount(1);
    expect(await checkboxState()).toEqual(before);
  });
}
