import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';

async function send(ui: Page, message: Record<string, unknown>) {
  return ui.evaluate(async value => (globalThis as any).chrome.runtime.sendMessage(value), message);
}

const resumeText = `Ada Lovelace
ada@example.com | (415) 555-0100
San Francisco, California, United States
https://linkedin.com/in/ada-lovelace
Education
Example College
Bachelor of Science in Computer Science
Expected graduation: May 2027
GPA: 3.8
Projects
Algorithm visualizer
Built a React visualizer with step-by-step traces.`;

// A real, self-contained PDF: exercises the extension's bundled PDF worker,
// font/text extraction, and import UI instead of mocking the parser.
function syntheticPdf(text: string): Buffer {
  const escape = (value: string) => value.replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 12 Tf 16 TL 40 750 Td\n${text.split('\n').map((line, i) => `${i ? 'T* ' : ''}(${escape(line)}) Tj`).join('\n')}\nET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
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

test('résumé text populates only blank draft fields, preserves projects, avoids duplicate imports, and saves for reuse', async ({ openExtensionPage, serviceWorker }) => {
  const home = await openExtensionPage('home.html');
  await expect(home.getByLabel('First name', { exact: true })).toBeVisible();
  await home.getByLabel('First name', { exact: true }).fill('User preferred name');
  await home.getByRole('button', { name: 'Add experience', exact: true }).click();
  await home.getByLabel('Role or project 1', { exact: true }).fill('Existing project');
  await home.getByLabel('Experience details 1', { exact: true }).fill('I documented a community tool.');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
  await serviceWorker.evaluate(() => { (globalThis as any).__importNativeCalls = 0; (globalThis as any).chrome.runtime.connectNative = () => { (globalThis as any).__importNativeCalls++; throw Error('Résumé extraction must stay local.'); }; });
  const file = { name: 'Ada-resume.txt', mimeType: 'text/plain', buffer: Buffer.from(resumeText) };
  await home.getByLabel('Upload résumé', { exact: true }).setInputFiles(file);
  await expect(home.getByRole('heading', { name: 'Résumé details ready to review' })).toBeVisible();
  await expect(home.getByLabel('First name', { exact: true })).toHaveValue('User preferred name');
  await expect(home.getByLabel('Last name', { exact: true })).toHaveValue('Lovelace');
  await expect(home.getByLabel('Email', { exact: true })).toHaveValue('ada@example.com');
  await expect(home.getByLabel('School', { exact: true })).toHaveValue('Example College');
  await expect(home.getByLabel('Graduation month', { exact: true })).toHaveValue('2027-05');
  await expect(home.getByLabel('Experience details 1', { exact: true })).toHaveValue('I documented a community tool.');
  await expect(home.getByLabel('Experience details 2', { exact: true })).toHaveValue(/Built a React visualizer/);
  await expect(home.getByLabel('Authorized to work in your country?', { exact: true })).toHaveValue('');
  let stored = (await send(home, { type: 'sidebar-state' })).data;
  expect(stored.profile.email).toBe(''); expect(stored.facts).toHaveLength(1); expect(stored.resume.name).toBe('Ada-resume.txt');
  await home.getByLabel('Upload résumé', { exact: true }).setInputFiles(file);
  await expect(home.getByRole('heading', { name: 'Résumé details ready to review' })).toBeVisible();
  await expect(home.getByLabel('Experience details 3', { exact: true })).toHaveCount(0);
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
  stored = (await send(home, { type: 'sidebar-state' })).data;
  expect(stored.profile.firstName).toBe('User preferred name'); expect(stored.profile.email).toBe('ada@example.com'); expect(stored.facts).toHaveLength(2);
  await home.reload();
  await expect(home.getByLabel('School', { exact: true })).toHaveValue('Example College');
  await expect(home.getByLabel('Experience details 2', { exact: true })).toHaveValue(/Built a React visualizer/);
  expect(await serviceWorker.evaluate(() => (globalThis as any).__importNativeCalls)).toBe(0);
});

test('a real PDF is parsed locally in the extension and its extracted text remains reviewable', async ({ openExtensionPage }, testInfo) => {
  const home = await openExtensionPage('home.html'); const externalRequests: string[] = []; const errors: string[] = [];
  home.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  home.on('pageerror', error => errors.push(error.message));
  await expect(home.getByLabel('Upload résumé', { exact: true })).toBeAttached();
  await home.getByLabel('Upload résumé', { exact: true }).setInputFiles({ name: 'Ada-resume.pdf', mimeType: 'application/pdf', buffer: syntheticPdf(resumeText) });
  await expect(home.getByRole('heading', { name: 'Résumé details ready to review' })).toBeVisible({ timeout: 20_000 });
  await expect(home.getByLabel('First name', { exact: true })).toHaveValue('Ada');
  await expect(home.getByLabel('Email', { exact: true })).toHaveValue('ada@example.com');
  await home.getByText('Extracted résumé text', { exact: false }).first().click();
  await expect(home.getByLabel('Extracted résumé text', { exact: true })).toHaveValue(/Algorithm visualizer/);
  await expect(home.getByLabel('Experience details 1', { exact: true })).toHaveValue(/Built a React visualizer/);
  expect((await send(home, { type: 'sidebar-state' })).data.profile.firstName).toBe('');
  expect(externalRequests).toEqual([]); expect(errors).toEqual([]);
  await home.setViewportSize({ width: 1440, height: 1000 });
  await home.locator('#resume').scrollIntoViewIfNeeded();
  await home.screenshot({ path: testInfo.outputPath('home-resume-import.png'), fullPage: false });
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
});

test('a corrupt PDF preserves the saved profile and projects while clearly reporting that text import failed', async ({ openExtensionPage }) => {
  const home = await openExtensionPage('home.html');
  await expect(home.getByLabel('First name', { exact: true })).toBeVisible();
  await home.getByLabel('First name', { exact: true }).fill('Existing applicant');
  await home.getByRole('button', { name: 'Add experience', exact: true }).click();
  await home.getByLabel('Role or project 1', { exact: true }).fill('Existing project');
  await home.getByLabel('Experience details 1', { exact: true }).fill('I wrote tests for a community dashboard.');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
  const before = (await send(home, { type: 'sidebar-state' })).data;
  await home.getByLabel('Upload résumé', { exact: true }).setInputFiles({ name: 'Corrupt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nThis is not a complete PDF document.\n') });
  await expect(home.getByRole('alert')).toContainText('text could not be imported', { timeout: 20_000 });
  await expect(home.getByRole('status')).toContainText('Your profile details were left unchanged');
  await expect(home.getByRole('heading', { name: 'Résumé details ready to review' })).toHaveCount(0);
  await expect(home.getByLabel('First name', { exact: true })).toHaveValue('Existing applicant');
  await expect(home.getByLabel('Experience details 1', { exact: true })).toHaveValue('I wrote tests for a community dashboard.');
  await expect(home.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled();
  const after = (await send(home, { type: 'sidebar-state' })).data;
  expect(after.profile).toEqual(before.profile); expect(after.facts).toEqual(before.facts);
  expect(after.resume.name).toBe('Corrupt.pdf');
});
