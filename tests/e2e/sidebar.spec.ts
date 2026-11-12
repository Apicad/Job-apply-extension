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
            segments: [{ text: request.facts[0].text, sources: [{ id: request.facts[0].id, revision: request.facts[0].revision }] }], missing: (globalThis as any).__draftMissing ?? [] });
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

test('one Autofill writes AI answers directly and leaves unrelated forms untouched', async ({ context, serviceWorker, openExtensionPage }, testInfo) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  await page.evaluate(() => { const form = document.createElement('form'); form.innerHTML = '<label>Describe a relevant project.<textarea id="unrelated"></textarea></label>'; document.body.append(form); });
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  await send(ui, { type: 'demo' }); await mockAI(serviceWorker, 15);
  await send(ui, { type: 'sidebar-settings', aiEnabled: true });
  expect((await send(ui, { type: 'sidebar-autofill', tabId })).ok).toBe(true);
  const state = await settled(ui, tabId); expect(state.run.drafts).toHaveLength(1);
  expect(await serviceWorker.evaluate(() => (globalThis as any).__draftRequests.length)).toBe(1);
  const draft = state.run.drafts[0];
  expect(draft.status).toBe('filled');
  await ui.goto(`${ui.url()}?tabId=${tabId}`); await ui.setViewportSize({ width: 390, height: 900 });
  await expect(ui.getByRole('button', { name: 'Use answer', exact: true })).toHaveCount(0);
  await ui.screenshot({ path: testInfo.outputPath('sidebar-draft-review.png'), fullPage: true });
  await expect(page.locator('#project')).toHaveValue(draft.text);
  await expect(page.locator('#unrelated')).toHaveValue(''); await expect(page.locator('#submitted')).toHaveText('Not submitted');
  expect((await send(ui, { type: 'state', tabId })).data.library).toHaveLength(1);
});

test('changing saved facts while AI is running prevents stale automatic writes', async ({ context, serviceWorker, openExtensionPage }) => {
 const page=await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('sidepanel.html'); const tabId=await tabFor(ui,page);
 await send(ui,{type:'demo'}); await mockAI(serviceWorker,1200); await send(ui,{type:'sidebar-settings',aiEnabled:true});
 const state=(await send(ui,{type:'sidebar-state',tabId})).data;
 await send(ui,{type:'sidebar-autofill',tabId});
 await expect.poll(()=>serviceWorker.evaluate(()=>(globalThis as any).__draftRequests.length)).toBe(1);
 const facts=state.facts.map((f:any,i:number)=>i?f:{...f,text:'I documented a different project.'});
 expect((await send(ui,{type:'sidebar-save-profile',profile:state.profile,facts,expectedProfile:state.profile,expectedFacts:state.facts})).ok).toBe(true);
 await new Promise(resolve=>setTimeout(resolve,1500));
 await expect(page.locator('#project')).toHaveValue('');
 await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

test('partial AI answers fill while missing facts stay visible in the sidebar', async ({context,serviceWorker,openExtensionPage})=>{
 const page=await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('sidepanel.html'); const tabId=await tabFor(ui,page);
 await send(ui,{type:'demo'}); await mockAI(serviceWorker,15);
 await serviceWorker.evaluate(()=>{(globalThis as any).__draftMissing=['Confirm approximate years of experience.'];});
 await send(ui,{type:'sidebar-settings',aiEnabled:true}); await send(ui,{type:'sidebar-autofill',tabId});
 const state=await settled(ui,tabId); const draft=state.run.drafts[0];
 expect(draft.status).toBe('filled'); expect(draft.gaps).toContain('Confirm approximate years of experience.');
 await expect(page.locator('#project')).toHaveValue(draft.text);
 await ui.goto(`${ui.url()}?tabId=${tabId}`);
 await expect(ui.getByText('Confirm approximate years of experience.',{exact:true})).toBeVisible();
 await expect(ui.getByRole('button',{name:'Use answer',exact:true})).toHaveCount(0);
 await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

test('an answer typed while AI is pending is never overwritten',async({context,serviceWorker,openExtensionPage})=>{
 const page=await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('sidepanel.html'); const tabId=await tabFor(ui,page);
 await send(ui,{type:'demo'}); await mockAI(serviceWorker,1200); await send(ui,{type:'sidebar-settings',aiEnabled:true});
 await send(ui,{type:'sidebar-autofill',tabId});
 await expect.poll(()=>serviceWorker.evaluate(()=>(globalThis as any).__draftRequests.length)).toBe(1);
 await page.locator('#project').fill('My own answer.'); await settled(ui,tabId);
 await expect(page.locator('#project')).toHaveValue('My own answer.');
 await expect(page.locator('#submitted')).toHaveText('Not submitted');
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

test('newly revealed required fields appear for review without another write or losing verified fills', async ({ context, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  await page.evaluate(() => {
    document.querySelector('form')!.innerHTML = '<div id="dependent" hidden><label>State<select id="state" required><option value="">Select...</option><option value="CA">California</option></select></label></div><label>First name<input id="first"></label><label>Email<input id="email" type="email"></label><label>Phone<input id="phone" type="tel"></label><label>Country<select id="country"><option value="">Select...</option><option value="US">United States</option></select></label><button type="submit">Submit sample application manually</button>';
    document.querySelector('#country')!.addEventListener('change', () => document.querySelector('#dependent')!.removeAttribute('hidden'));
  });
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  const before = (await send(ui, { type: 'sidebar-state', tabId })).data;
  const profile = { ...before.profile, firstName: 'Ada', email: 'ada@example.com', phone: '555-0100', country: 'United States', state: 'California' };
  expect((await send(ui, { type: 'sidebar-save-profile', profile, facts: [], expectedProfile: before.profile, expectedFacts: before.facts })).ok).toBe(true);
  await ui.goto(`${ui.url()}?tabId=${tabId}`);
  await ui.getByRole('button', { name: 'Autofill', exact: true }).click();
  const state = await settled(ui, tabId);
  expect(state.run.phase).toBe('review');
  expect(state.run.fields.filter((field: any) => field.status === 'filled').map((field: any) => field.label)).toEqual(['First name', 'Email', 'Phone', 'Country']);
  expect(state.run.fields.find((field: any) => field.label === 'State')).toMatchObject({ status: 'review', detail: 'Check this saved detail in Profile home. If it is already saved, choose the matching option on the application; this control may need a manual selection.' });
  expect(new Set(state.run.fields.map((field: any) => field.id)).size).toBe(state.run.fields.length);
  await expect(page.locator('#state')).toBeVisible(); await expect(page.locator('#state')).toHaveValue('');
  await expect(ui.getByText('State', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).events.filter((event: any) => event.id === 'state'))).toEqual([]);
  await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

test('ARIA-only controls are reported once for manual review without events or submission', async ({ context, openExtensionPage }) => {
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
  await page.evaluate(() => {
    document.querySelector('form')!.innerHTML = '<label>First name<input id="first"></label><label>Email<input id="email" type="email"></label><label>Phone<input id="phone" type="tel"></label><div><span id="department-label">Department</span><button id="department" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-required="true" aria-labelledby="department-label">Choose...</button></div><div id="custom-consent" role="checkbox" aria-label="Application data consent" aria-checked="true" aria-required="true" tabindex="0">Application data consent</div><div id="custom-schedule" role="radiogroup" aria-label="Available schedule" aria-required="true"><div id="morning" role="radio" aria-checked="false" tabindex="0">Morning</div><div id="evening" role="radio" aria-checked="true" tabindex="-1">Evening</div></div><div hidden role="checkbox" aria-label="Hidden manual question">Hidden manual question</div><button type="submit">Submit sample application manually</button>';
    document.body.insertAdjacentHTML('beforeend', '<form><div role="checkbox" aria-label="Unrelated newsletter">Unrelated newsletter</div></form>');
  });
  const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
  expect((await send(ui, { type: 'demo' })).ok).toBe(true);
  await ui.goto(`${ui.url()}?tabId=${tabId}`);
  await ui.getByRole('button', { name: 'Autofill', exact: true }).click();
  const state = await settled(ui, tabId);
  expect(state.run.phase).toBe('review');
  expect(state.run.fields.filter((field: any) => field.status === 'filled')).toHaveLength(3);
  expect(state.run.fields.filter((field: any) => field.id.startsWith('manual:')).map((field: any) => [field.label, field.status])).toEqual([
    ['Department', 'review'], ['Application data consent', 'review'], ['Available schedule', 'review'],
  ]);
  for (const label of ['Department', 'Application data consent', 'Available schedule']) await expect(ui.getByText(label, { exact: true })).toBeVisible();
  expect(state.run.fields.some((field: any) => /Hidden manual question|Unrelated newsletter/.test(field.label))).toBe(false);
  expect(await page.locator('[aria-checked]').evaluateAll(elements => elements.map(el => el.getAttribute('aria-checked')))).toEqual(['true', 'false', 'true']);
  expect(await page.evaluate(() => (window as any).events.filter((event: any) => ['department', 'custom-consent', 'custom-schedule', 'morning', 'evening'].includes(event.id)))).toEqual([]);
  await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

test('review submission reveals the employer control without activating it', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 await page.locator('button[type=submit]').evaluate(el => { el.textContent = 'Submit application'; el.addEventListener('click', () => { el.setAttribute('data-clicked', 'yes'); }); });
 const ui = await openExtensionPage('sidepanel.html'); const tabId = await tabFor(ui, page);
 await send(ui, { type: 'demo' }); await ui.goto(`${ui.url()}?tabId=${tabId}`);
 await ui.getByRole('button', { name: 'Autofill', exact: true }).click(); await settled(ui, tabId);
 await ui.getByRole('button', { name: 'Review & submit', exact: true }).click();
 await expect(page.locator('#submitted')).toHaveText('Not submitted');
 await expect(page.locator('button[type=submit]')).not.toHaveAttribute('data-clicked', 'yes');
 await expect(page.locator('button[type=submit]')).toBeInViewport();
});

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


test('sidebar previews the saved PDF locally and highlights an unresolved question without changing it', async ({context,openExtensionPage},testInfo)=>{
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('sidepanel.html');const tabId=await tabFor(ui,page);
 await send(ui,{type:'demo'});
 const pdf=syntheticPdf('Ada Lovelace\nSoftware engineer\nBuilt a React dashboard.');
 await send(ui,{type:'sidebar-save-resume',resume:{name:'Preview.pdf',type:'application/pdf',size:pdf.length,dataUrl:`data:application/pdf;base64,${pdf.toString('base64')}`,updatedAt:1}});
 await send(ui,{type:'sidebar-autofill',tabId});await settled(ui,tabId);
 await ui.goto(`${ui.url()}?tabId=${tabId}`);await ui.setViewportSize({width:440,height:1000});
 await ui.getByRole('button',{name:'Preview résumé',exact:true}).click();
 await expect(ui.getByText('Résumé preview ready.',{exact:true})).toBeVisible();
 const canvas=ui.getByLabel('Résumé page 1');await expect(canvas).toBeVisible();
 expect(await canvas.evaluate((el:HTMLCanvasElement)=>el.width)).toBeGreaterThan(500);
 const card=ui.locator('.attention li').filter({hasText:'Signature'});
 await card.getByRole('button',{name:'Show field on application'}).click();
 await expect(page.locator('#signature')).toHaveCSS('outline-style','solid');
 await expect(page.locator('#signature')).toHaveValue('');await expect(page.locator('#submitted')).toHaveText('Not submitted');
 expect(await ui.locator('.helper').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
 await ui.screenshot({path:testInfo.outputPath('readable-sidebar-resume.png'),fullPage:true});
});
