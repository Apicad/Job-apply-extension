import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';
async function command(ui: Page, value: Record<string, unknown>) {
 if (['save', 'edit', 'invalidate', 'approve'].includes(String(value.type))) {
  const state = await command(ui, { type: 'state', tabId: value.tabId });
  const a = state.data.session.answer; value = { answerId: a.id, answerRevision: a.revision, ...value };
 }
 return ui.evaluate(async v => (globalThis as any).chrome.runtime.sendMessage(v), value);
}
async function bind(ui: Page, page: Page) {
 const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t: any) => t.url === url).id, page.url());
 await ui.goto(ui.url() + `?tabId=${tabId}`); await command(ui, { type: 'demo' }); return tabId;
}
async function saveDraft(ui: Page, tabId: number, plan: any, text?: string) {
 const facts = (await command(ui, { type: 'state', tabId })).data.facts;
 const row = plan.rows.find((r: any) => r.field.descriptor.control === 'textarea');
 const request = await command(ui, { type: 'request', tabId, planId: plan.id, rowKey: `${row.documentId}:${row.field.ref}`, job: 'Synthetic project role.', factIds: [facts[0].id] });
 expect(request.ok, request.error).toBe(true); const r = request.data.session.request;
 await command(ui, { type: 'send', tabId });
 const reply = { schema: 1, requestId: r.id, context: r.context, facts: r.facts.map(({ id, revision }: any) => ({ id, revision })), segments: [{ text: text ?? r.facts[0].text, sources: [{ id: r.facts[0].id, revision: 1 }] }], missing: [] };
 const response = await command(ui, { type: 'response', tabId, raw: JSON.stringify(reply) });
 expect(response.ok, response.error).toBe(true); const a = response.data.session.answer;
 expect((await command(ui, { type: 'approve', tabId, reviewed: true, revision: a.revision, text: a.text })).ok).toBe(true);
 expect((await command(ui, { type: 'save', tabId, scope: 'application' })).ok).toBe(true); return a;
}
test('C-1: completed native fill retains its outcomes and cannot be revived by answer preview', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 const scan = await command(ui, { type: 'scan', tabId });
 const filled = await command(ui, { type: 'fill', tabId, planId: scan.data.id });
 expect(filled.data.outcomes.filter((o: any) => o.ok)).toHaveLength(5);
 await saveDraft(ui, tabId, filled.data);
 const preview = await command(ui, { type: 'answer-preview', tabId });
 expect(preview.ok).toBe(false); expect(preview.error).toMatch(/scan/i);
 expect((await command(ui, { type: 'state', tabId })).data.plan).toEqual(filled.data);
 await expect(page.locator('#project')).toHaveValue('');
 // A fresh scan can still use the explicitly saved answer after renewed review.
 const saved = (await command(ui, { type: 'state', tabId })).data.library[0];
 const fresh = await command(ui, { type: 'scan', tabId }); await saveDraft(ui, tabId, fresh.data);
 const reused = await command(ui, { type: 'reuse', tabId, id: saved.id }); const a = reused.data.session.answer;
 expect((await command(ui, { type: 'approve', tabId, reviewed: true, revision: a.revision, text: a.text })).ok).toBe(true);
 await command(ui, { type: 'save', tabId, scope: 'application' });
 const ready = await command(ui, { type: 'answer-preview', tabId }); expect(ready.ok, ready.error).toBe(true);
 expect(ready.data.plan.rows.filter((r: any) => r.action)).toHaveLength(1);
 expect((await command(ui, { type: 'fill', tabId, planId: ready.data.plan.id })).data.outcomes.filter((o: any) => o.ok)).toHaveLength(1);
});
test('C-1/C-3: interrupted plan stays unknown through preview and answer invalidation', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 const scan = await command(ui, { type: 'scan', tabId }); await saveDraft(ui, tabId, scan.data);
 const preview = await command(ui, { type: 'answer-preview', tabId }); expect(preview.ok).toBe(true);
 const interrupted = { ...preview.data.plan, state: 'executing' };
 // Durable marker fault, as if the worker stopped after marking execution; not a mid-write crash claim.
 await ui.evaluate(async ({ tabId, plan }) => (globalThis as any).chrome.storage.session.set({ [`hackathon:plan:${tabId}`]: plan }), { tabId, plan: interrupted });
 expect((await command(ui, { type: 'answer-preview', tabId })).ok).toBe(false);
 expect((await command(ui, { type: 'fill', tabId, planId: interrupted.id })).ok).toBe(false);
 await command(ui, { type: 'edit', tabId, text: 'I documented the project.' });
 expect((await command(ui, { type: 'state', tabId })).data.plan).toEqual(interrupted);
 await ui.reload(); await expect(ui.getByText('Interrupted: outcome unknown', { exact: false })).toBeVisible();
 await expect(page.locator('#first')).toHaveValue('');
});
test('C-2: CRLF and CR normalize before exact approval, save and textarea readback', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 const scan = await command(ui, { type: 'scan', tabId });
 const a = await saveDraft(ui, tabId, scan.data, 'I built a Python script.\r\nI displayed synthetic sensor readings.\rI built a dashboard.');
 expect(a.text).toBe('I built a Python script.\nI displayed synthetic sensor readings.\nI built a dashboard.');
 const preview = await command(ui, { type: 'answer-preview', tabId }); expect(preview.ok, preview.error).toBe(true);
 const filled = await command(ui, { type: 'fill', tabId, planId: preview.data.plan.id });
 expect(filled.data.outcomes.filter((o: any) => o.ok)).toHaveLength(6); await expect(page.locator('#project')).toHaveValue(a.text);
});
test('C-3: UI distinguishes refused, written-unverified and unreachable outcomes', async ({ context, openExtensionPage, serviceWorker }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 const scan = await command(ui, { type: 'scan', tabId });
 await page.locator('#first').fill('Keep this');
 await page.locator('#email').evaluate(el => el.addEventListener('input', () => setTimeout(() => { (el as HTMLInputElement).value = 'rewritten@example.com'; }, 0)));
 const filled = await command(ui, { type: 'fill', tabId, planId: scan.data.id }); expect(filled.ok).toBe(true);
 const row = (id: string) => scan.data.rows.find((r: any) => r.field.descriptor.id === id);
 const outcome = (id: string) => filled.data.outcomes.find((o: any) => o.ref === row(id).field.ref);
 expect(outcome('first').status).toBe('refused'); expect(outcome('email').status).toBe('written-unverified'); expect(outcome('last').status).toBe('verified');
 await ui.reload(); await expect(ui.getByText('Write attempted, not verified', { exact: true })).toHaveCount(1); await expect(ui.getByText('Refused; field left unchanged', { exact: true })).toHaveCount(1);
 await page.reload(); const fresh = await command(ui, { type: 'scan', tabId });
 // External scripting failure before dispatch, with the real queue and report/UI modules.
 await serviceWorker.evaluate(() => { const api = (globalThis as any).chrome.scripting; const original = api.executeScript.bind(api); api.executeScript = async (details: any) => { if (details.target.documentIds) throw Error('Document unreachable test boundary'); return original(details); }; });
 const failed = await command(ui, { type: 'fill', tabId, planId: fresh.data.id }); expect(failed.ok).toBe(true);
 expect(failed.data.outcomes).toHaveLength(5); expect(failed.data.outcomes.every((o: any) => o.status === 'unreachable')).toBe(true);
 await ui.reload(); await expect(ui.getByText('Document unreachable; outcome unknown', { exact: true })).toHaveCount(5);
 await expect(page.locator('#first')).toHaveValue('');
});
test('C-4: canonical labels match execution without hiding safety cues or mutations', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 await page.locator('label').filter({ has: page.locator('#email') }).evaluate(el => { el.firstChild!.textContent = 'Em\u00ADail'; });
 const scan = await command(ui, { type: 'scan', tabId }); const email = scan.data.rows.find((r: any) => r.field.descriptor.id === 'email');
 expect(email.action).not.toBeNull();
 const filled = await command(ui, { type: 'fill', tabId, planId: scan.data.id }); expect(filled.data.outcomes.find((o: any) => o.ref === email.field.ref).ok).toBe(true);
 await expect(page.locator('#email')).toHaveValue('ada@example.com');
 await page.reload(); await page.locator('#email').evaluate(el => el.setAttribute('placeholder', 'x'.repeat(210) + ' signature'));
 const unsafe = await command(ui, { type: 'scan', tabId }); expect(unsafe.data.rows.find((r: any) => r.field.descriptor.id === 'email')?.action ?? null).toBeNull();
 await page.reload(); const before = await command(ui, { type: 'scan', tabId });
 await page.locator('#email').evaluate(el => el.setAttribute('placeholder', 'sig\u00ADnature'));
 const after = await command(ui, { type: 'fill', tabId, planId: before.data.id });
 expect(after.data.outcomes.filter((o: any) => o.ok)).toHaveLength(4); await expect(page.locator('#email')).toHaveValue('');
});
test('AB-1: real popup no-op keystrokes cannot hide unsupported claims; correction and new claims are rechecked', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page); await ui.reload();
 await ui.getByRole('button', { name: 'Scan application' }).click();
 await ui.getByLabel('Application question').selectOption({ label: 'Describe a relevant project.' });
 await ui.getByLabel('Reviewed job context', { exact: false }).fill('The job requires Rust and Kubernetes.');
 await ui.getByRole('checkbox', { name: 'I built a Python script', exact: false }).check();
 await ui.getByRole('button', { name: 'Preview exact AI request' }).click(); await ui.getByRole('button', { name: 'Copy reviewed request' }).click();
 const r = (await command(ui, { type: 'state', tabId })).data.session.request;
 const claim = 'I used Rust and Kubernetes to deploy the dashboard.';
 await ui.getByLabel('Paste AI JSON response').fill(JSON.stringify({ schema: 1, requestId: r.id, context: r.context, facts: r.facts.map(({ id, revision }: any) => ({ id, revision })), segments: [{ text: claim, sources: [{ id: r.facts[0].id, revision: 1 }] }], missing: ['Confirm deployment experience.'] }));
 await ui.getByRole('button', { name: 'Validate response' }).click();
 const editor = ui.getByLabel('Exact answer', { exact: true }); const approve = ui.getByRole('button', { name: 'Approve exact answer' });
 await expect(approve).toBeDisabled(); await editor.press('End'); await editor.press('Space'); await editor.press('Backspace');
 await ui.getByRole('button', { name: 'Apply edits for review' }).click();
 await ui.getByLabel('I compared the exact text', { exact: false }).check(); await expect(approve).toBeDisabled();
 await expect(ui.getByText(/Missing or unsupported:.*Rust/)).toBeVisible();
 await ui.getByText('Original generation trace', { exact: true }).click(); await expect(ui.getByText('Original missing information: Confirm deployment experience.', { exact: true })).toBeVisible();
 await editor.fill(r.facts[0].text); await ui.getByRole('button', { name: 'Apply edits for review' }).click();
 await ui.getByLabel('I compared the exact text', { exact: false }).check();
 // Missing notes need an explicit review action even after a genuine correction.
 await ui.getByLabel('I resolved the original missing-information notes in this edited answer', { exact: true }).check();
 await ui.getByRole('button', { name: 'Resolve reviewed missing-information notes' }).click();
 await expect(ui.getByRole('button', { name: 'Resolve reviewed missing-information notes' })).toHaveCount(0);
 await ui.getByLabel('I compared the exact text', { exact: false }).check(); await expect(approve).toBeEnabled(); await approve.click();
 await editor.fill('I deployed Kubernetes.'); await ui.getByRole('button', { name: 'Apply edits for review' }).click();
 await expect(approve).toBeDisabled(); await expect(ui.getByText(/Missing or unsupported:.*Kubernetes/)).toBeVisible();
 expect((await command(ui, { type: 'state', tabId })).data.session.answer.trace.segments[0].text).toBe(claim);
});
test('AB-2: cross-job saves fork records and preserve source scope, approval and concurrent previews', async ({ context, openExtensionPage }) => {
 const ui = await openExtensionPage('popup.html'); await command(ui, { type: 'demo' });
 const tabs: number[] = []; const pages: Page[] = [];
 for (const job of ['A','B','C']) { const p = await context.newPage(); pages.push(p); await p.goto(`${ORIGIN.main}/hackathon.html?job=${job}`); tabs.push(await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t: any) => t.url === url).id, p.url())); }
 const a = tabs[0]!; const b = tabs[1]!; const c = tabs[2]!;
 await saveDraft(ui, a, (await command(ui, { type: 'scan', tabId: a })).data);
 await command(ui, { type: 'save', tabId: a, scope: 'factual' }); const source = (await command(ui, { type: 'state', tabId: a })).data.library[0];
 const aPreview = await command(ui, { type: 'answer-preview', tabId: a });
 for (const [index, tabId] of [b,c].entries()) {
  await saveDraft(ui, tabId, (await command(ui, { type: 'scan', tabId })).data);
  const reuse = await command(ui, { type: 'reuse', tabId, id: source.id }); expect(reuse.ok, reuse.error).toBe(true); const draft = reuse.data.session.answer;
  await command(ui, { type: 'approve', tabId, reviewed: true, revision: draft.revision, text: draft.text });
  expect((await command(ui, { type: 'save', tabId, scope: index === 0 ? 'application' : 'factual' })).ok).toBe(true);
  const state = (await command(ui, { type: 'state', tabId })).data;
  expect(state.library.find((record: any) => record.id === source.id)).toEqual(source);
  expect(state.session.answer.id).not.toBe(source.id); expect(state.session.answer.derivedFrom).toEqual({ id: source.id, revision: source.revision });
 }
 expect((await command(ui, { type: 'fill', tabId: a, planId: aPreview.data.plan.id })).data.outcomes.filter((o: any) => o.ok)).toHaveLength(6);
});
test('AB-5: synthetic loading preserves raw profiles and facts even when malformed or overlong', async ({ openExtensionPage }) => {
 const ui = await openExtensionPage('popup.html');
 for (const profile of [{ firstName: 'x'.repeat(301) }, { unexpected: 'legacy payload' }, 'malformed', {}]) {
  await ui.evaluate(async value => (globalThis as any).chrome.storage.local.set({ profile: value }), profile);
  expect((await command(ui, { type: 'demo' })).ok).toBe(false);
  expect(await ui.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('profile')).profile)).toEqual(profile);
 }
 await ui.evaluate(async () => { const s = (globalThis as any).chrome.storage.local; await s.remove('profile'); await s.set({ 'hackathon:facts': [{ legacy: 'keep' }] }); });
 expect((await command(ui, { type: 'demo' })).ok).toBe(false);
 expect(await ui.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('hackathon:facts'))['hackathon:facts'])).toEqual([{ legacy: 'keep' }]);
 expect(await ui.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('profile')).profile)).toBeUndefined();
});
test('AB-6: damaged library remains inspectable and explicit recovery preserves raw data and valid answers', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html'); const tabId = await bind(ui, page);
 await saveDraft(ui, tabId, (await command(ui, { type: 'scan', tabId })).data);
 const valid = (await command(ui, { type: 'state', tabId })).data.library[0]; const damaged = { schema: 1, answers: [valid, { invalid: 'keep this record' }] };
 await ui.evaluate(async value => (globalThis as any).chrome.storage.local.set({ 'hackathon:library': value }), damaged);
 const state = await command(ui, { type: 'state', tabId }); expect(state.ok).toBe(true); expect(state.data.facts).toHaveLength(3); expect(state.data.library).toEqual([valid]); expect(state.data.libraryError).toMatch(/preserved/);
 await ui.reload(); await expect(ui.getByRole('heading', { name: 'Saved answers · 1' })).toBeVisible();
 await ui.getByRole('button', { name: 'Inspect raw library' }).click(); await expect(ui.getByTestId('raw-library')).toContainText('keep this record');
 await ui.getByLabel('Keep a backup and recover valid saved answers', { exact: true }).check();
 await ui.getByRole('button', { name: 'Recover saved answers' }).click(); await expect(ui.getByRole('status')).toContainText('Recovered');
 const recovered = await ui.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('hackathon:library'))['hackathon:library']);
 expect(recovered.answers).toEqual([valid]); expect(recovered.quarantine.raw).toEqual(damaged);
 await command(ui, { type: 'delete', tabId, id: valid.id });
 expect(await ui.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('hackathon:library'))['hackathon:library'].quarantine.raw)).toEqual(damaged);
});
