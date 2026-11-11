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
