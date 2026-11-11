import { test, expect } from './extension';
import { unzipSync, strFromU8 } from 'fflate';
import { readFile } from 'node:fs/promises';

test('live résumé preview uses every note, keeps optional sections separate, and exports editable Word locally', async ({ openExtensionPage, serviceWorker }, testInfo) => {
  await serviceWorker.evaluate(() => { (globalThis as any).chrome.runtime.connectNative = () => { throw Error('Preview must not invoke AI'); }; });
  const home = await openExtensionPage('home.html');
  await home.setViewportSize({ width: 1440, height: 1050 });
  const external: string[] = []; home.on('request', req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
  const paper = home.getByRole('article', { name: 'Résumé document' });
  await home.getByLabel('First name', { exact: true }).fill('Ada');
  await home.getByLabel('Last name', { exact: true }).fill('Lovelace');
  await home.getByLabel('Email', { exact: true }).fill('ada@example.com');
  await home.getByLabel('City', { exact: true }).fill('San Francisco');
  await home.getByLabel('Country', { exact: true }).fill('United States');
  await home.getByLabel('School', { exact: true }).fill('Example College');
  await home.getByLabel('Field of study', { exact: true }).fill('Computer Science');
  await home.getByLabel('Country of citizenship', { exact: true }).fill('Canada');
  await home.getByLabel('Are you a U.S. citizen?', { exact: true }).selectOption('no');
  for (const [index, title, text] of [
    [1, 'Example Labs role', 'Example Labs | Intern | San Francisco, CA | May 2025–August 2025\nBuilt a Python dashboard.'],
    [2, 'Community Center role', 'Community Center | Assistant | Oakland, CA | June 2024–July 2024\nMaintained lab computers.'],
    [3, 'Project: Trace viewer', 'Built a React trace viewer.'],
  ] as const) {
    await home.getByRole('button', { name: 'Add experience', exact: true }).click();
    await home.getByLabel(`Role or project ${index}`, { exact: true }).fill(title);
    await home.getByLabel(`Experience details ${index}`, { exact: true }).fill(text);
  }
  await expect(paper).toContainText('Ada Lovelace');
  await expect(paper).toContainText('Built a Python dashboard.');
  await expect(paper).toContainText('Maintained lab computers.');
  await expect(paper).toContainText('Built a React trace viewer.');
  await expect(paper).not.toContainText('Canada');
  await home.getByLabel('Autofill my education', { exact: true }).uncheck();
  await expect(paper).toContainText('Example College');
  await home.locator('.preview-options > summary').click();
  const options = home.locator('.preview-section-choices');
  await options.getByLabel('Education', { exact: true }).uncheck();
  await options.getByLabel('Location', { exact: true }).uncheck();
  await expect(paper).not.toContainText('Example College');
  await expect(paper.locator('.resume-document-header')).not.toContainText('San Francisco');
  await expect(home.getByLabel('City', { exact: true })).toHaveValue('San Francisco');
  await home.getByLabel('Résumé section for note 3', { exact: true }).selectOption('projects');
  await home.getByLabel('Résumé skills', { exact: true }).fill('Python, React, Git');
  await home.getByLabel('Include note 2 in résumé', { exact: true }).uncheck();
  await expect(paper).not.toContainText('Maintained lab computers.');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
  await home.reload();
  await expect(paper).toContainText('Python, React, Git');
  await expect(paper).not.toContainText('Example College');
  await expect(paper).not.toContainText('Maintained lab computers.');
  await expect(home.getByLabel('Autofill my education', { exact: true })).not.toBeChecked();
  await expect(home.getByLabel('Experience details 2', { exact: true })).toHaveValue(/Maintained lab/);
  const downloadEvent = home.waitForEvent('download');
  await home.getByRole('button', { name: 'Download Word', exact: true }).click();
  const download = await downloadEvent; const path = await download.path(); expect(path).toBeTruthy();
  const files = unzipSync(await readFile(path!)); const xml = strFromU8(files['word/document.xml']!);
  expect(xml).toContain('Ada Lovelace'); expect(xml).toContain('Built a Python dashboard.'); expect(xml).toContain('Built a React trace viewer.');
  expect(xml).not.toContain('Canada'); expect(xml).not.toContain('Example College'); expect(xml).not.toContain('Maintained lab computers.');
  expect(external).toEqual([]);
  await home.evaluate(() => window.scrollTo(0, 0));
  await home.screenshot({ path: testInfo.outputPath('profile-and-live-resume.png') });
  await home.emulateMedia({ media: 'print' });
  await expect(home.locator('.save-dock')).not.toBeVisible();
  await expect(paper).toBeVisible();
  await home.pdf({ path: testInfo.outputPath('preview.pdf'), preferCSSPageSize: true });
  await home.emulateMedia({ media: 'screen' });
  await home.setViewportSize({ width: 360, height: 900 });
  expect(await home.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('an older editor cannot overwrite saved résumé choices', async ({ openExtensionPage }) => {
  const first = await openExtensionPage('home.html'); const second = await openExtensionPage('home.html');
  await expect(first.getByLabel('First name', { exact: true })).toBeVisible();
  await expect(second.getByLabel('First name', { exact: true })).toBeVisible();
  await first.getByLabel('First name', { exact: true }).fill('Unsaved name');
  await second.locator('.preview-options > summary').click();
  await second.locator('.preview-section-choices').getByLabel('Education', { exact: true }).uncheck();
  await second.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(second.getByRole('status')).toContainText('Profile saved');
  await first.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(first.getByRole('alert')).toContainText('changed');
  await expect(first.getByLabel('First name', { exact: true })).toHaveValue('Unsaved name');
});
