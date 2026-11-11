import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';

async function send(ui: Page, message: Record<string, unknown>) {
  return ui.evaluate(async value => (globalThis as any).chrome.runtime.sendMessage(value), message);
}

test('profile home saves once, survives reload, and supplies the application sidebar without AI calls', async ({ context, serviceWorker, openExtensionPage }, testInfo) => {
  await serviceWorker.evaluate(() => {
    (globalThis as any).__homeNativeCalls = 0;
    (globalThis as any).chrome.runtime.connectNative = () => { (globalThis as any).__homeNativeCalls++; throw new Error('No native calls should be made while editing a profile.'); };
  });
  const home = await openExtensionPage('home.html');
  await home.setViewportSize({ width: 1440, height: 1000 });
  await expect(home.getByRole('heading', { name: 'Your next application starts here.' })).toBeVisible();
  await home.getByLabel('First name', { exact: true }).fill('Ada');
  await home.getByLabel('Last name', { exact: true }).fill('Lovelace');
  await home.getByLabel('Email', { exact: true }).fill('ada@example.com');
  await home.getByLabel('Phone', { exact: true }).fill('555-0100');
  await home.getByLabel('City', { exact: true }).fill('San Francisco');
  await home.getByLabel('Country', { exact: true }).fill('United States');
  await home.getByLabel('School', { exact: true }).fill('Example Community College');
  await home.getByLabel('Field of study', { exact: true }).fill('Computer Science');
  await home.getByRole('button', { name: 'Add experience', exact: true }).click();
  await home.getByLabel('Role or project 1', { exact: true }).fill('Community sensor dashboard');
  await home.getByLabel('Experience details 1', { exact: true }).fill('I built a Python dashboard to display synthetic sensor readings.');
  await home.getByLabel('Upload résumé', { exact: true }).setInputFiles({ name: 'Ada.txt', mimeType: 'text/plain', buffer: Buffer.from('Ada') });
  await expect(home.getByRole('status')).toContainText('Résumé saved');
  await expect(home.getByLabel('First name', { exact: true })).toHaveValue('Ada');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
  await home.reload();
  await expect(home.getByLabel('First name', { exact: true })).toHaveValue('Ada');
  await expect(home.getByLabel('Role or project 1', { exact: true })).toHaveValue('Community sensor dashboard');
  await expect(home.getByLabel('Degree', { exact: true })).toHaveValue('');
  await expect(home.getByLabel('Graduation month', { exact: true })).toHaveValue('');
  await expect(home.getByLabel('GPA', { exact: true })).toHaveValue('');
  await expect(home.getByLabel('Authorized to work in your country?', { exact: true })).toHaveValue('');
  await expect(home.getByText('Ada.txt', { exact: true })).toBeVisible();
  await expect(home.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled();
  await home.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
  await home.setViewportSize({ width: 360, height: 900 });
  await home.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
  expect(await home.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  const tabId = await home.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((tab: any) => tab.url === url).id, page.url());
  const sidebar = await openExtensionPage(`sidepanel.html?tabId=${tabId}`);
  await sidebar.getByRole('button', { name: 'Autofill', exact: true }).click();
  await expect.poll(async () => (await send(sidebar, { type: 'sidebar-state', tabId })).data.run?.phase).toBe('review');
  await expect(page.locator('#first')).toHaveValue('Ada');
  await expect(page.locator('#email')).toHaveValue('ada@example.com');
  expect(await page.locator('#resume').evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('Ada.txt');
  await expect(page.locator('#project')).toHaveValue('');
  await expect(page.locator('#consent')).not.toBeChecked();
  await expect(page.locator('#submitted')).toHaveText('Not submitted');
  expect(await serviceWorker.evaluate(() => (globalThis as any).__homeNativeCalls)).toBe(0);
});

test('profile home preserves unsaved edits and prevents an older editor from overwriting newer saved details', async ({ openExtensionPage }) => {
  const first = await openExtensionPage('home.html');
  const second = await openExtensionPage('home.html');
  await expect(first.getByLabel('First name', { exact: true })).toBeVisible();
  await expect(second.getByLabel('First name', { exact: true })).toBeVisible();
  await first.getByLabel('First name', { exact: true }).fill('Older edit');
  await second.getByLabel('First name', { exact: true }).fill('Newer saved name');
  await second.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(second.getByRole('status')).toContainText('Profile saved');
  await first.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(first.getByRole('alert')).toContainText(/changed/i);
  await expect(first.getByLabel('First name', { exact: true })).toHaveValue('Older edit');
  expect((await send(second, { type: 'sidebar-state' })).data.profile.firstName).toBe('Newer saved name');
  await first.getByRole('button', { name: 'Reload saved profile', exact: true }).click();
  await expect(first.getByLabel('First name', { exact: true })).toHaveValue('Newer saved name');
  await expect(first.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled();
});

test('a storage refresh during save cannot discard the new profile revision or leave a false dirty state', async ({ openExtensionPage }) => {
  const home = await openExtensionPage('home.html');
  await expect(home.getByLabel('First name', { exact: true })).toBeVisible();
  await home.evaluate(() => {
    const runtime = (globalThis as any).chrome.runtime;
    (globalThis as any).chrome.storage.onChanged.addListener((changes: any) => { if (changes['home-race-event']) (globalThis as any).__homeRaceEventSeen = true; });
    const original = runtime.sendMessage.bind(runtime);
    let delayNextState = false;
    let hasDelayed = false;
    runtime.sendMessage = async (message: any) => {
      const delayThisRead = message.type === 'sidebar-state' && delayNextState;
      if (delayThisRead) { delayNextState = false; hasDelayed = true; }
      const result = await original(message);
      if (message.type === 'sidebar-save-profile' && result.ok && !hasDelayed) delayNextState = true;
      if (delayThisRead) {
        (globalThis as any).__homeSaveReadWaiting = true;
        await new Promise<void>(resolve => { (globalThis as any).__releaseHomeSaveRead = resolve; });
      }
      return result;
    };
  });
  await home.getByLabel('First name', { exact: true }).fill('Ada');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect.poll(() => home.evaluate(() => (globalThis as any).__homeSaveReadWaiting)).toBe(true);
  await home.evaluate(async () => { await (globalThis as any).chrome.storage.local.set({ 'home-race-event': 'queued' }); });
  await expect.poll(() => home.evaluate(() => (globalThis as any).__homeRaceEventSeen)).toBe(true);
  await expect(home.getByLabel('First name', { exact: true })).toBeDisabled();
  await home.evaluate(() => (globalThis as any).__releaseHomeSaveRead());
  await expect(home.getByRole('status')).toContainText('Profile saved');
  await expect(home.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled();
  await home.getByLabel('First name', { exact: true }).fill('Ada revised');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
  expect((await send(home, { type: 'sidebar-state' })).data.profile.firstName).toBe('Ada revised');
});
