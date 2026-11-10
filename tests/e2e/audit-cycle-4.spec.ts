import { test, expect, ORIGIN } from './extension';
import { fieldSignature } from '../../lib/hackathon/engine';
import type { Page } from '@playwright/test';

async function state(ui: Page, tabId: number) {
 const r = await ui.evaluate(async id => (globalThis as any).chrome.runtime.sendMessage({ type: 'state', tabId: id }), tabId);
 expect(r.ok, r.error).toBe(true); return r.data;
}
async function start(ui: Page, question = 'Describe a relevant project.') {
 await ui.getByRole('button', { name: 'Scan application' }).click(); await expect(ui.getByRole('status')).toContainText('Preview ready');
 await ui.getByLabel('Application question').selectOption({ label: question });
 await ui.getByLabel('Reviewed job context', { exact: false }).fill('Synthetic tools role.');
 await ui.getByRole('checkbox', { name: 'I built a Python script', exact: false }).check();
 await ui.getByRole('button', { name: 'Preview exact AI request' }).click(); await expect(ui.getByTestId('ai-payload')).toBeVisible();
}
async function approveSave(ui: Page, factual = false) {
 await ui.getByLabel('I compared the exact text', { exact: false }).check();
 await ui.getByRole('button', { name: 'Approve exact answer' }).click(); await expect(ui.getByRole('status')).toContainText('Exact answer approved');
 if (factual) await ui.getByLabel('Save scope').selectOption('factual');
 await ui.getByRole('button', { name: 'Save approved answer' }).click(); await expect(ui.getByRole('status')).toContainText('answer saved');
}
async function prepare(ui: Page, page: Page, factual = false) {
 const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t: any) => t.url === url).id, page.url());
 await ui.goto(ui.url() + `?tabId=${tabId}`);
 await ui.getByRole('button', { name: 'Load synthetic applicant' }).click(); await expect(ui.getByRole('status')).toContainText('Synthetic applicant');
 await start(ui); await ui.getByRole('button', { name: 'Copy reviewed request' }).click();
 const r = (await state(ui, tabId)).session.request;
 await ui.getByLabel('Paste AI JSON response').fill(JSON.stringify({ schema: 1, requestId: r.id, context: r.context, facts: r.facts.map(({ id, revision }: any) => ({ id, revision })), segments: [{ text: 'I built a Python script that cleaned synthetic sensor readings.', sources: [{ id: r.facts[0].id, revision: r.facts[0].revision }] }], missing: [] }));
 await ui.getByRole('button', { name: 'Validate response' }).click(); await expect(ui.getByLabel('Exact answer', { exact: true })).toBeVisible();
 await approveSave(ui, factual); return tabId;
}

for (const stage of ['preview', 'fill'] as const) for (const target of ['question', 'application'] as const) test(`C4-1: privileged ${target} target desynchronization is refused at ${stage} before writes`, async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon-two-questions.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await prepare(ui, page);
 if (stage === 'fill') {
  await ui.getByRole('button', { name: 'Preview approved textarea fill' }).click(); await expect(ui.getByRole('status')).toContainText('Updated');
 }
 const original = await state(ui, tabId);
 if (target === 'application') await page.goto(`${ORIGIN.main}/hackathon-two-questions.html?application=B`);
 await ui.getByRole('button', { name: 'Scan application' }).click(); await expect(ui.getByRole('status')).toContainText('Preview ready');
 const next = await state(ui, tabId); const row = next.plan.rows.find((r: any) => r.field.descriptor.id === (target === 'question' ? 'project-two' : 'project'));
 const session = { ...original.session, planId: next.plan.id, rowKey: `${row.documentId}:${row.field.ref}` };
 if (stage === 'fill') {
  next.plan.answerBinding = original.plan.answerBinding;
  row.action = { ref: row.field.ref, type: 'answer', value: original.session.answer.text, signature: fieldSignature(row.field.descriptor, row.field.form, row.field.maxLength) };
 }
 // Privileged extension-context injection only: this is NOT page or normal message reachability.
 // Keep the approved context/library untouched while redirecting persisted plan/session targets.
 await ui.evaluate(async ({ tabId, session, plan }) => {
  await (globalThis as any).chrome.storage.session.set({ [`hackathon:answer:${tabId}`]: session, [`hackathon:plan:${tabId}`]: plan });
 }, { tabId, session, plan: next.plan });
 const result = await ui.evaluate(async ({ tabId, planId, stage }) => (globalThis as any).chrome.runtime.sendMessage({ type: stage === 'preview' ? 'answer-preview' : 'fill', tabId, planId }), { tabId, planId: next.plan.id, stage });
 expect(result.ok).toBe(false); expect(result.error).toContain('Answer target does not match');
 await expect(page.locator('#project')).toHaveValue(''); await expect(page.locator('#project-two')).toHaveValue('');
 await expect(page.locator('input').first()).toHaveValue(''); await expect(page.locator('#submitted')).toHaveText('Not submitted');
 const after = await state(ui, tabId); expect(after.library).toEqual(original.library); expect(after.plan.state).toBe('preview'); expect(after.plan.outcomes).toBeUndefined();
});

for (const target of ['same', 'question', 'application'] as const) test(`C4-1 positive: explicit ${target} reuse/review/save retains target and source record semantics`, async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon-two-questions.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await prepare(ui, page, target === 'application');
 const original = (await state(ui, tabId)).library[0];
 if (target === 'application') await page.goto(`${ORIGIN.main}/hackathon-two-questions.html?application=B`);
 await start(ui, target === 'question' ? 'Tell us about a project you built.' : undefined);
 await ui.getByRole('button', { name: 'Open for review', exact: true }).click(); await expect(ui.getByRole('status')).toContainText('Updated');
 await approveSave(ui); const data = await state(ui, tabId);
 expect(data.library.length).toBe(target === 'same' ? 1 : 2);
 if (target !== 'same') expect(data.library.find((a: any) => a.id === original.id)).toEqual(original);
 await ui.getByRole('button', { name: 'Preview approved textarea fill' }).click(); await expect(ui.getByRole('status')).toContainText('Updated');
 await ui.getByRole('button', { name: 'Fill previewed fields' }).click(); await expect(ui.getByRole('status')).toContainText('Fill finished');
 await expect(page.locator(target === 'question' ? '#project-two' : '#project')).toHaveValue(original.text);
 await expect(page.locator(target === 'question' ? '#project' : '#project-two')).toHaveValue('');
 await expect(page.locator('#submitted')).toHaveText('Not submitted');
 const filled = await state(ui, tabId); expect(filled.plan.outcomes.filter((o: any) => o.status === 'verified')).toHaveLength(6);
});
