import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';

async function state(ui: Page, tabId: number) {
 const r = await ui.evaluate(async id => (globalThis as any).chrome.runtime.sendMessage({ type: 'state', tabId: id }), tabId);
 expect(r.ok, r.error).toBe(true); return r.data;
}
async function bind(ui: Page, page: Page) {
 const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t: any) => t.url === url).id, page.url());
 await ui.goto(ui.url() + `?tabId=${tabId}`);
 await ui.getByRole('button', { name: 'Load synthetic applicant' }).click();
 await expect(ui.getByRole('status')).toContainText('Synthetic applicant'); return tabId;
}
async function start(ui: Page, job: string, all = false) {
 await ui.getByRole('button', { name: 'Scan application' }).click();
 await expect(ui.getByRole('status')).toContainText('Preview ready');
 await ui.getByLabel('Application question').selectOption({ label: 'Describe a relevant project.' });
 await ui.getByLabel('Reviewed job context', { exact: false }).fill(job);
 await ui.getByRole('checkbox', { name: 'I built a Python script', exact: false }).check();
 if (all) {
  await ui.getByRole('checkbox', { name: 'I wrote tests for missing', exact: false }).check();
  await ui.getByRole('checkbox', { name: 'I worked with two classmates', exact: false }).check();
 }
 await ui.getByRole('button', { name: 'Preview exact AI request' }).click();
 await expect(ui.getByTestId('ai-payload')).toBeVisible();
}
async function reply(ui: Page, tabId: number, text = 'I built a Python script that cleaned synthetic sensor readings.', fact = 0) {
 await ui.getByRole('button', { name: 'Copy reviewed request' }).click();
 const r = (await state(ui, tabId)).session.request;
 await ui.getByLabel('Paste AI JSON response').fill(JSON.stringify({ schema: 1, requestId: r.id, context: r.context, facts: r.facts.map(({ id, revision }: any) => ({ id, revision })), segments: [{ text, sources: [{ id: r.facts[fact].id, revision: r.facts[fact].revision }] }], missing: [] }));
 await ui.getByRole('button', { name: 'Validate response' }).click();
 await expect(ui.getByLabel('Exact answer', { exact: true })).toHaveValue(text);
}
async function approve(ui: Page) {
 await ui.getByLabel('I compared the exact text', { exact: false }).check();
 await ui.getByRole('button', { name: 'Approve exact answer' }).click();
 await expect(ui.getByRole('status')).toContainText('Exact answer approved');
}
async function save(ui: Page) {
 await ui.getByRole('button', { name: 'Save approved answer' }).click();
 await expect(ui.getByRole('status')).toContainText('answer saved');
}
async function preview(ui: Page) {
 await ui.getByRole('button', { name: 'Preview approved textarea fill' }).click();
 await expect(ui.getByRole('status')).toContainText('Updated');
}

for (const revision of [1, 2]) for (const changedContext of [false, true]) test(`N7: reused revision ${revision}, changed context=${changedContext}, must save before preview/fill`, async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 await start(ui, 'Original synthetic role.'); await reply(ui, tabId); await approve(ui); await save(ui);
 if (revision === 2) await save(ui);
 const original = (await state(ui, tabId)).library[0]; expect(original.revision).toBe(revision);
 const job = changedContext ? 'Different reviewed role for this application.' : original.context.job;
 await start(ui, job); await ui.getByRole('button', { name: 'Open for review', exact: true }).click();
 await expect(ui.getByRole('status')).toContainText('Updated'); await approve(ui);
 // Worker enforcement is required even if a stale or alternate extension UI sends the command.
 const attempt = await ui.evaluate(async id => (globalThis as any).chrome.runtime.sendMessage({ type: 'answer-preview', tabId: id }), tabId);
 expect(attempt.ok).toBe(false); expect(attempt.error).toContain('Save this exact approved revision');
 await expect(ui.getByRole('button', { name: 'Preview approved textarea fill' })).toBeDisabled();
 const beforeSave = await state(ui, tabId); expect(beforeSave.library[0]).toEqual(original);
 expect(beforeSave.session.answer.id).not.toBe(original.id); expect(beforeSave.plan.answerBinding).toBeUndefined();
 await expect(page.locator('#project')).toHaveValue('');
 await save(ui); const saved = (await state(ui, tabId)).session.answer;
 expect(saved.id).toBe(original.id); expect(saved.revision).toBe(revision + 1); expect(saved.context.job).toBe(job);
 expect((await state(ui, tabId)).library[0]).toEqual(saved);
 await preview(ui); await ui.getByRole('button', { name: 'Fill previewed fields' }).click();
 await expect(ui.getByRole('status')).toContainText('Fill finished'); await expect(page.locator('#project')).toHaveValue(saved.text);
 await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

for (const mismatch of ['draft-id', 'saved-context', 'saved-approval'] as const) test(`N7: execution rejects persisted binding mismatch ${mismatch} before any write`, async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 await start(ui, 'Synthetic role.'); await reply(ui, tabId); await approve(ui); await save(ui); await preview(ui);
 const data = await state(ui, tabId);
 // Seed a legacy persisted plan/session or an independently changed saved approval.
 // The real worker, storage boundary and page writers run; no application module is mocked.
 await ui.evaluate(async ({ tabId, data, mismatch }) => {
  const chrome = (globalThis as any).chrome;
  if (mismatch === 'draft-id') {
   const id = crypto.randomUUID(); data.session.answer.id = id; data.plan.answerBinding.id = id;
   await chrome.storage.session.set({ [`hackathon:answer:${tabId}`]: data.session, [`hackathon:plan:${tabId}`]: data.plan });
  } else {
   if (mismatch === 'saved-context') data.library[0].approval.contextKey = 'stale-reviewed-context';
   else data.library[0].approval = null;
   await chrome.storage.local.set({ 'hackathon:library': { schema: 1, answers: data.library } });
  }
 }, { tabId, data, mismatch });
 await ui.getByRole('button', { name: 'Fill previewed fields' }).click();
 await expect(ui.getByRole('status')).toContainText('became stale');
 await expect(page.locator('#project')).toHaveValue(''); await expect(page.locator('input').first()).toHaveValue('');
 await expect(page.locator('#submitted')).toHaveText('Not submitted');
 const after = await state(ui, tabId); expect(after.plan.state).toBe('preview'); expect(after.plan.outcomes).toBeUndefined();
});

for (const crossApplication of [false, true]) test(`N8: reuse origin and original context remain visible across save/reopen, cross-application=${crossApplication}`, async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 let ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 await start(ui, 'Job A context: synthetic tools role.'); await reply(ui, tabId); await approve(ui);
 await ui.getByLabel('Save scope').selectOption('factual'); await save(ui);
 const original = (await state(ui, tabId)).library[0];
 if (crossApplication) await page.goto(`${ORIGIN.main}/hackathon.html?application=B`);
 await start(ui, 'Job B context: synthetic frontend role.');
 await ui.getByRole('button', { name: 'Open for review', exact: true }).click(); await expect(ui.getByRole('status')).toContainText('Updated');
 const origin = ui.getByTestId('reuse-origin');
 await expect(origin).toContainText('Reused from saved answer'); await expect(origin).toContainText(original.id); await expect(origin).toContainText('revision 1');
 await expect(origin).toContainText('No new AI response');
 await expect(ui.getByText('Current reviewed job context: Job B context: synthetic frontend role.', { exact: true })).toBeVisible();
 const trace = ui.locator('details').filter({ has: ui.locator('summary', { hasText: 'Original generation trace' }) }).first();
 await trace.locator('summary').first().click();
 await expect(trace).toContainText('Original job context: Job A context: synthetic tools role.');
 await expect(trace).toContainText('Original question: Describe a relevant project.');
 expect((await state(ui, tabId)).session.answer.trace).toEqual(original.trace);
 await approve(ui); await save(ui);
 const url = ui.url(); await ui.close(); ui = await openExtensionPage(`popup.html?tabId=${tabId}`); expect(ui.url()).toBe(url);
 await expect(ui.getByTestId('reuse-origin')).toContainText(original.id);
 await expect(ui.getByTestId('reuse-origin')).toContainText('revision 1');
 const after = await state(ui, tabId); expect(after.session.answer.trace).toEqual(original.trace);
 expect(after.session.answer.derivedFrom).toEqual({ id: original.id, revision: original.revision });
 expect(after.library.length).toBe(crossApplication ? 2 : 1);
 if (crossApplication) expect(after.library.find((a: any) => a.id === original.id)).toEqual(original);
 await preview(ui); await ui.getByRole('button', { name: 'Fill previewed fields' }).click();
 await expect(ui.getByRole('status')).toContainText('Fill finished'); await expect(page.locator('#project')).toHaveValue(original.text);
});

test('N1b: a small rewrite keeps original warnings visible and edited prose explicitly unverified', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 await start(ui, 'Synthetic role.', true); await reply(ui, tabId, 'I wrote two test suites in Python for missing readings.', 1);
 await ui.getByLabel('Exact answer', { exact: true }).fill('I wrote two test suites in Python for missing data.');
 await ui.getByRole('button', { name: 'Apply edits for review' }).click();
 await expect(ui.getByRole('button', { name: 'Apply edits for review' })).toHaveCount(0);
 await expect(ui.getByTestId('edited-provenance')).toContainText('not verified');
 await expect(ui.getByTestId('original-warning-review')).toContainText('Python');
 await expect(ui.getByTestId('original-warning-review')).toContainText('two');
 await expect(ui.getByTestId('original-warning-review')).toBeVisible();
 await expect(ui.locator('details.source')).toHaveCount(0);
 await expect(ui.getByRole('button', { name: 'Approve exact answer' })).toBeDisabled();
 const answer = (await state(ui, tabId)).session.answer;
 expect(answer.origin).toBe('edited'); expect(answer.segments).toEqual([]);
 expect(answer.trace.segments[0].text).toContain('missing readings');
 // This documented heuristic cannot establish whether a paraphrase resolves a warning.
 expect(answer.gaps).toEqual([]); expect(answer.approval).toBeNull();
});
