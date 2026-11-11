import { test, expect, ORIGIN } from './extension';
import type { Page, Worker } from '@playwright/test';

async function send(ui: Page, message: Record<string, unknown>) {
  return ui.evaluate(async value => (globalThis as any).chrome.runtime.sendMessage(value), message);
}
async function tabFor(ui: Page, page: Page): Promise<number> {
  return ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((tab: any) => tab.url === url).id, page.url());
}
async function settled(ui: Page, tabId: number) {
  await expect.poll(async () => (await send(ui, { type: 'sidebar-state', tabId })).data.run?.phase, { timeout: 15_000 }).toMatch(/^(review|finished|error|cancelled)$/);
  return (await send(ui, { type: 'sidebar-state', tabId })).data;
}
async function mockAI(worker: Worker, delay: number) {
  await worker.evaluate(delayMs => {
    (globalThis as any).__draftRequests = [];
    (globalThis as any).__nativeDisconnects = 0;
    (globalThis as any).chrome.runtime.connectNative = () => {
      const messages: ((value: unknown) => void)[] = [];
      const disconnected: (() => void)[] = [];
      return {
        onMessage: { addListener: (fn: (value: unknown) => void) => messages.push(fn) },
        onDisconnect: { addListener: (fn: () => void) => disconnected.push(fn) },
        disconnect: () => { (globalThis as any).__nativeDisconnects++; },
        postMessage: (value: any) => {
          if (value.type === 'status') { queueMicrotask(() => messages.forEach(fn => fn({ id: value.id, ok: true, data: { connected: true, provider: 'Claude Code', message: 'Synthetic native test transport' } }))); return; }
          (globalThis as any).__draftRequests.push(value.request);
          const request = value.request;
          const raw = JSON.stringify({ schema: 1, requestId: request.id, context: request.context,
            facts: request.facts.map(({ id, revision }: any) => ({ id, revision })),
            segments: [{ text: request.facts[0].text, sources: [{ id: request.facts[0].id, revision: request.facts[0].revision }] }], missing: [] });
          // Intentionally deliver even after disconnect: stale replies must not be accepted.
          setTimeout(() => messages.forEach(fn => fn({ id: value.id, ok: true, data: { raw } })), delayMs);
        },
      };
    };
  }, delay);
}

test('one Autofill action fills basics and resume, preserves existing answers, and never submits', async ({ context, openExtensionPage }, testInfo) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  expect((await send(ui, { type: 'demo' })).ok).toBe(true);
  const resume = { name: 'Ada.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 };
  expect((await send(ui, { type: 'sidebar-save-resume', resume })).ok).toBe(true);
  await ui.goto(`${ui.url()}?tabId=${tabId}`); await ui.setViewportSize({ width: 390, height: 900 });
  await expect(ui.getByRole('button', { name: 'Autofill', exact: true })).toBeEnabled();
  await ui.screenshot({ path: testInfo.outputPath('sidebar-ready.png'), fullPage: true });
  await ui.getByRole('button', { name: 'Autofill', exact: true }).click();
  const state = await settled(ui, tabId); expect(state.run.phase).toBe('review');
  await expect(page.locator('#first')).toHaveValue('Ada'); await expect(page.locator('#email')).toHaveValue('ada@example.com');
  expect(await page.locator('#resume').evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe('Ada.txt');
  expect(state.run.fields.filter((field: any) => field.status === 'filled')).toHaveLength(6);
  await expect(page.locator('#existing')).toHaveValue('Keep my answer'); await expect(page.locator('#signature')).toHaveValue('');
  await expect(page.locator('#location')).toHaveValue(''); await expect(page.locator('#project')).toHaveValue('');
  await expect(page.locator('#consent')).not.toBeChecked(); await expect(page.locator('#submitted')).toHaveText('Not submitted');
  await expect(ui.getByRole('heading', { name: 'Ready for your review' })).toBeVisible();
  await ui.screenshot({ path: testInfo.outputPath('sidebar-filled.png'), fullPage: true });
  await page.locator('#first').fill('User revision');
  expect((await send(ui, { type: 'sidebar-autofill', tabId })).ok).toBe(true); await settled(ui, tabId);
  await expect(page.locator('#first')).toHaveValue('User revision');
  expect(await page.locator('#resume').evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe('Ada.txt');
});

test('native AI draft appears beside the form, only explicit review fills it, and unrelated forms stay excluded', async ({ context, serviceWorker, openExtensionPage }, testInfo) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  await page.evaluate(() => { const form = document.createElement('form'); form.innerHTML = '<label>Describe a relevant project.<textarea id="unrelated"></textarea></label>'; document.body.append(form); });
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  await send(ui, { type: 'demo' }); await mockAI(serviceWorker, 15);
  await send(ui, { type: 'sidebar-settings', aiEnabled: true });
  expect((await send(ui, { type: 'sidebar-autofill', tabId })).ok).toBe(true);
  const state = await settled(ui, tabId); expect(state.run.drafts).toHaveLength(1);
  expect(await serviceWorker.evaluate(() => (globalThis as any).__draftRequests.length)).toBe(1);
  await expect(page.locator('#project')).toHaveValue('');
  const draft = state.run.drafts[0];
  await ui.goto(`${ui.url()}?tabId=${tabId}`); await ui.setViewportSize({ width: 390, height: 900 });
  await expect(ui.getByRole('button', { name: 'Use answer', exact: true })).toBeEnabled();
  await ui.screenshot({ path: testInfo.outputPath('sidebar-draft-review.png'), fullPage: true });
  await ui.getByRole('button', { name: 'Use answer', exact: true }).click();
  await expect(page.locator('#project')).toHaveValue(draft.text);
  await expect(page.locator('#unrelated')).toHaveValue(''); await expect(page.locator('#submitted')).toHaveText('Not submitted');
  expect((await send(ui, { type: 'state', tabId })).data.library).toHaveLength(1);
});

test('changing saved facts prevents an old draft from being filled', async ({ context, serviceWorker, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  await send(ui, { type: 'demo' }); await mockAI(serviceWorker, 15); await send(ui, { type: 'sidebar-settings', aiEnabled: true });
  await send(ui, { type: 'sidebar-autofill', tabId }); const state = await settled(ui, tabId);
  const draft = state.run.drafts[0]; expect(draft).toBeTruthy();
  const changed = state.facts.map((fact: any, i: number) => i ? fact : { ...fact, text: 'I documented a different synthetic project.' });
  expect((await send(ui, { type: 'sidebar-save-profile', profile: state.profile, facts: changed, expectedProfile: state.profile, expectedFacts: state.facts })).ok).toBe(true);
  const result = await send(ui, { type: 'sidebar-approve', tabId, runId: state.run.id, draftId: draft.id, revision: draft.revision, text: draft.text });
  expect(result.ok).toBe(false); expect(result.error).toMatch(/saved information changed/i);
  await expect(page.locator('#project')).toHaveValue('');
});

test('cancel disconnects AI and a late model reply cannot fill or restore the cancelled run', async ({ context, serviceWorker, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  await send(ui, { type: 'demo' }); await mockAI(serviceWorker, 1200); await send(ui, { type: 'sidebar-settings', aiEnabled: true });
  const started = await send(ui, { type: 'sidebar-autofill', tabId });
  await expect.poll(async () => serviceWorker.evaluate(() => (globalThis as any).__draftRequests.length)).toBe(1);
  expect((await send(ui, { type: 'sidebar-cancel', tabId, runId: started.data.run.id })).ok).toBe(true);
  expect((await settled(ui, tabId)).run.phase).toBe('cancelled');
  // Wait beyond the synthetic reply boundary, not an implementation polling interval.
  await new Promise(resolve => setTimeout(resolve, 1500));
  const final = (await send(ui, { type: 'sidebar-state', tabId })).data;
  expect(final.run.phase).toBe('cancelled'); expect(final.run.drafts).toHaveLength(0);
  expect(await serviceWorker.evaluate(() => (globalThis as any).__nativeDisconnects)).toBeGreaterThan(0);
  await expect(page.locator('#project')).toHaveValue(''); await expect(page.locator('#first')).toHaveValue('Ada');
});

test('a persisted in-flight run is reported interrupted and is never replayed', async ({ context, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  await send(ui, { type: 'demo' });
  await ui.evaluate(async ({ tabId, url }) => (globalThis as any).chrome.storage.session.set({ [`hackathon:sidebar-run:${tabId}`]: { id: 'interrupted-run', tabId, url, phase: 'filling', message: 'Filling', fields: [], drafts: [], answers: {}, job: { title: '', company: '' }, profileKey: '', factsKey: '' } }), { tabId, url: page.url() });
  const state = (await send(ui, { type: 'sidebar-state', tabId })).data;
  expect(state.run.phase).toBe('error'); expect(state.run.message).toMatch(/interrupted/);
  await expect(page.locator('#first')).toHaveValue(''); await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

test('cancellation between command preparation and fill dispatch prevents future page writes', async ({ context, serviceWorker, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  await send(ui, { type: 'demo' });
  await serviceWorker.evaluate(() => {
    const api = (globalThis as any).chrome.scripting;
    const executeScript = api.executeScript.bind(api);
    (globalThis as any).__fillDispatches = 0;
    api.executeScript = async (details: any) => {
      if (details.files?.includes('/fill.js')) (globalThis as any).__fillDispatches++;
      const result = await executeScript(details);
      if (details.func && details.args?.[0]?.actions) {
        await new Promise<void>(resolve => { (globalThis as any).__releasePreparedCommand = resolve; });
      }
      return result;
    };
  });
  const started = await send(ui, { type: 'sidebar-autofill', tabId }); expect(started.ok).toBe(true);
  await expect.poll(() => serviceWorker.evaluate(() => typeof (globalThis as any).__releasePreparedCommand)).toBe('function');
  expect((await send(ui, { type: 'sidebar-cancel', tabId, runId: started.data.run.id })).ok).toBe(true);
  await serviceWorker.evaluate(() => (globalThis as any).__releasePreparedCommand());
  expect((await settled(ui, tabId)).run.phase).toBe('cancelled');
  expect(await serviceWorker.evaluate(() => (globalThis as any).__fillDispatches)).toBe(0);
  await expect(page.locator('#first')).toHaveValue(''); await expect(page.locator('#email')).toHaveValue('');
  await expect(page.locator('#submitted')).toHaveText('Not submitted');
});
