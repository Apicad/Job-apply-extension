import { test, expect } from './extension';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

async function send(page: Page, value: Record<string, unknown>) { return page.evaluate(async message => (globalThis as any).chrome.runtime.sendMessage(message), value); }
async function seed(home: Page) {
  const before = (await send(home, { type: 'sidebar-state' })).data;
  const profile = { ...before.profile, firstName: 'Ada', preferredFirstName: 'Addie', lastName: 'Lovelace', email: 'private@example.com', phone: '(415) 555-0199', country: 'United States', citizenshipCountry: 'Canada', usCitizenship: 'no', school: 'Example College', major: 'Computer Science coursework' };
  const facts = [
    { id: 'role', revision: 1, location: 'Example Labs internship', text: 'Example Labs | Intern | Remote | May 2025–August 2025\nBuilt a Python CSV validation prototype.\nDocumented edge cases for the team.' },
    { id: 'project', revision: 1, location: 'Project: Trace viewer', text: 'Built a React trace viewer prototype for a personal project.' },
  ];
  expect((await send(home, { type: 'sidebar-save-profile', profile, facts, expectedProfile: before.profile, expectedFacts: before.facts })).ok).toBe(true);
  expect((await send(home, { type: 'sidebar-save-resume', resume: { name: 'original.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 } })).ok).toBe(true);
  await expect(home.getByLabel('First name', { exact: true })).toHaveValue('Ada');
  await home.getByLabel('Target role', { exact: true }).fill('Implementation engineer');
  await home.getByLabel('Target company', { exact: true }).fill('Fictional Tools');
  await home.getByLabel('My career direction', { exact: true }).fill('Build practical developer and implementation tools.');
  await home.locator('.materials-job > summary').click();
  await home.getByLabel('Job description', { exact: true }).fill('Help customers build Python validation tools and explain edge cases clearly.');
  return { profile, facts };
}

async function nativeStub(home: Page, hold = false, capable = true) {
  await home.evaluate(({ hold, capable }) => {
    (globalThis as any).__materialsRequests = []; (globalThis as any).__materialsDisconnects = 0;
    (globalThis as any).chrome.runtime.connectNative = () => {
      let messageListener: (m: any) => void = () => {};
      return { onMessage: { addListener: (cb: any) => { messageListener = cb; } }, onDisconnect: { addListener: () => {} }, disconnect: () => { (globalThis as any).__materialsDisconnects++; }, postMessage: (message: any) => {
        if (message.type === 'status') { queueMicrotask(() => messageListener({ id: message.id, ok: true, data: { connected: true, provider: 'Codex', message: 'Synthetic test helper', capabilities: capable ? ['materials'] : [] } })); return; }
        const r = message.request; (globalThis as any).__materialsRequests.push(r);
        const ref = (id: string) => { const fact = r.evidence.find((f: any) => f.id === id); return { id, revision: fact.revision }; };
        const reply = { schema: 1, kind: 'materials', requestId: r.id, sourceKey: r.sourceKey, expiresAt: r.expiresAt,
          summary: [{ text: 'Built Python and React prototypes for validation and visualization.', sources: [ref('role'), ref('project')] }],
          entries: [{ entryId: 'role', bullets: [{ text: 'Built a Python CSV validation prototype and documented edge cases.', sources: [ref('role')] }] }],
          coverLetter: [{ text: 'My Python CSV validation prototype and documented edge cases connect with the implementation work described in this role.', sources: [ref('role')] }, { text: 'I also built a React trace viewer prototype as a personal project.', sources: [ref('project')] }], missing: [] };
        const deliver = () => messageListener({ id: message.id, ok: true, data: { raw: JSON.stringify(reply) } });
        if (hold) (globalThis as any).__releaseMaterials = deliver; else setTimeout(deliver, 10);
      } };
    };
  }, { hold, capable });
}

test('one generation uses saved evidence, previews both documents, preserves originals and exports reviewed edits', async ({ openExtensionPage }, testInfo) => {
  const home = await openExtensionPage('home.html'); await home.setViewportSize({ width: 1600, height: 1100 });
  await seed(home); await nativeStub(home);
  const original = (await send(home, { type: 'sidebar-state' })).data;
  await home.getByRole('button', { name: 'Create résumé & cover letter', exact: true }).click();
  await expect(home.locator('.materials-status')).toContainText('Your drafts are ready');
  await expect(home.getByRole('button', { name: 'Tailored résumé', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const paper = home.getByRole('article', { name: 'Résumé document' });
  await expect(home.getByLabel('Preferred first name', { exact: true })).toHaveValue('Addie');
  await expect(paper.locator('.resume-document-header')).toContainText('Addie Lovelace');
  await expect(paper).toContainText('Built a Python CSV validation prototype and documented edge cases.');
  await expect(paper).toContainText('Example Labs'); await expect(paper).toContainText('May 2025–August 2025');
  await expect(home.getByRole('button', { name: 'Download Word', exact: true })).toBeDisabled();
  const requests = await home.evaluate(() => (globalThis as any).__materialsRequests);
  expect(requests).toHaveLength(1); expect(JSON.stringify(requests)).not.toContain('private@example.com'); expect(JSON.stringify(requests)).not.toContain('Canada'); expect(JSON.stringify(requests)).not.toContain('Addie'); expect(JSON.stringify(requests)).not.toContain('data:text');
  const saved = (await send(home, { type: 'sidebar-state' })).data;
  expect(saved.profile).toEqual(original.profile); expect(saved.facts).toEqual(original.facts); expect(saved.resume).toEqual(original.resume);
  await home.getByRole('button', { name: 'Cover letter', exact: true }).click(); await expect(paper).toContainText('Dear hiring team,');
  await home.getByLabel('I reviewed both documents and checked the claims.', { exact: true }).check();
  await expect(home.getByRole('button', { name: 'Download Word', exact: true })).toBeEnabled();
  await home.locator('.materials-editor > summary').click();
  await home.getByLabel('Cover-letter paragraph 2', { exact: true }).fill('I built a React trace viewer prototype for a personal project.');
  await expect(home.getByRole('button', { name: 'Download Word', exact: true })).toBeDisabled();
  await home.getByLabel('I reviewed both documents and checked the claims.', { exact: true }).check();
  await expect(home.getByRole('button', { name: 'Download Word', exact: true })).toBeEnabled();
  const pending = home.waitForEvent('download'); await home.getByRole('button', { name: 'Download Word', exact: true }).click();
  const download = await pending; await download.saveAs(testInfo.outputPath('cover-letter.docx'));
  const xml = strFromU8(unzipSync(await readFile(testInfo.outputPath('cover-letter.docx')))['word/document.xml']!);
  expect(xml).toContain('Dear hiring team,'); expect(xml).toContain('Sincerely,'); expect(xml).not.toContain('•'); expect(xml).toContain('Fictional Tools');
  expect(xml).toContain('Addie Lovelace');
  await home.evaluate(() => window.scrollTo(0, 0)); await home.screenshot({ path: testInfo.outputPath('materials-cover-preview.png') });
  await home.emulateMedia({ media: 'print' }); await home.pdf({ path: testInfo.outputPath('cover-letter.pdf'), preferCSSPageSize: true }); await home.emulateMedia({ media: 'screen' });
  await home.getByRole('button', { name: 'Tailored résumé', exact: true }).click();
  const resumeDownload = home.waitForEvent('download'); await home.getByRole('button', { name: 'Download Word', exact: true }).click();
  await (await resumeDownload).saveAs(testInfo.outputPath('tailored-resume.docx'));
  await home.screenshot({ path: testInfo.outputPath('materials-resume-preview.png') });
  await home.reload();
  await expect(home.getByLabel('My career direction', { exact: true })).toHaveValue('Build practical developer and implementation tools.');
  await home.getByRole('button', { name: 'Cover letter', exact: true }).click();
  await expect(paper).toContainText('I built a React trace viewer prototype for a personal project.');
  await expect(home.getByRole('button', { name: 'Download Word', exact: true })).toBeEnabled();
  await home.getByLabel('My career direction', { exact: true }).fill('A different target.');
  await expect(home.getByRole('button', { name: 'Download Word', exact: true })).toBeDisabled();
  await expect(home.locator('.materials-review')).toContainText('Your profile or target changed');
});

test('stop and source edits discard late AI replies without replacing saved data', async ({ openExtensionPage }) => {
  const home = await openExtensionPage('home.html'); await seed(home); await nativeStub(home, true);
  await home.getByRole('button', { name: 'Create résumé & cover letter', exact: true }).click();
  await expect.poll(() => home.evaluate(() => (globalThis as any).__materialsRequests.length)).toBe(1);
  await home.getByRole('button', { name: 'Stop generating', exact: true }).click();
  await home.evaluate(() => (globalThis as any).__releaseMaterials());
  expect((await send(home, { type: 'sidebar-state' })).data.materials).toBeNull();
  await home.getByRole('button', { name: 'Create résumé & cover letter', exact: true }).click();
  await expect.poll(() => home.evaluate(() => (globalThis as any).__materialsRequests.length)).toBe(2);
  await home.getByLabel('First name', { exact: true }).fill('Ada revised');
  await expect(home.locator('.materials-status')).toContainText('Stopped because');
  await home.evaluate(() => (globalThis as any).__releaseMaterials());
  expect((await send(home, { type: 'sidebar-state' })).data.materials).toBeNull();
  expect(await home.evaluate(() => (globalThis as any).__materialsDisconnects)).toBeGreaterThan(1);
});

test('an older helper receives no new evidence and ordinary profile editing stays usable', async ({ openExtensionPage }) => {
  const home = await openExtensionPage('home.html'); await seed(home); await nativeStub(home, false, false);
  await home.getByRole('button', { name: 'Create résumé & cover letter', exact: true }).click();
  await expect(home.locator('.materials-error')).toContainText('Update the local AI helper');
  expect(await home.evaluate(() => (globalThis as any).__materialsRequests.length)).toBe(0);
  await home.getByLabel('City', { exact: true }).fill('San Francisco');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(home.getByRole('status')).toContainText('Profile saved');
});

test('generation save acknowledgement cannot be cancelled into an unlocked target editor', async ({ openExtensionPage }) => {
  const home = await openExtensionPage('home.html'); await seed(home); await nativeStub(home);
  await home.evaluate(() => {
    const runtime = (globalThis as any).chrome.runtime; const original = runtime.sendMessage.bind(runtime);
    runtime.sendMessage = async (message: any) => { const reply = await original(message); if (message.type === 'sidebar-save-materials') { (globalThis as any).__materialsSaveWaiting = true; await new Promise(resolve => { (globalThis as any).__releaseMaterialsSave = resolve; }); } return reply; };
  });
  await home.getByRole('button', { name: 'Create résumé & cover letter', exact: true }).click();
  await expect.poll(() => home.evaluate(() => (globalThis as any).__materialsSaveWaiting)).toBe(true);
  await expect(home.getByLabel('Target role', { exact: true })).toBeDisabled();
  await expect(home.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  await home.evaluate(() => (globalThis as any).__releaseMaterialsSave());
  await expect(home.locator('.materials-status')).toContainText('Your drafts are ready');
  await expect(home.getByLabel('Target role', { exact: true })).toBeEnabled();
});
