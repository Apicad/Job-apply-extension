import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';
async function command(ui: Page, value: Record<string, unknown>) {
 // Valid UI-style revision envelope. Explicit test overrides still test stale callers.
 if (['save','edit','invalidate','approve'].includes(String(value.type))) {
  const state=await ui.evaluate(async tabId=>await (globalThis as any).chrome.runtime.sendMessage({type:'state',tabId}),value.tabId);
  const a=state.data?.session?.answer; value={answerId:a?.id,answerRevision:a?.revision,...value};
 }
 return ui.evaluate(async message => await (globalThis as any).chrome.runtime.sendMessage(message), value);
}
test('actual extension: scan, preview, native React fills, no replay or submit', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/react.html`);
 await expect(page.locator('#first-name')).toBeVisible();
 const ui = await openExtensionPage('popup.html');
 const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t: any) => t.url === url).id, page.url());
 await expect(ui.getByText('Job Apply Assistant', { exact: true })).toBeVisible();
 expect((await command(ui, { type: 'demo' })).ok).toBe(true);
 const scan = await command(ui, { type: 'scan', tabId }); expect(scan.ok).toBe(true);
 await expect(page.locator('#first-name')).toHaveValue('');
 expect(scan.data.rows.filter((r: any) => r.action)).toHaveLength(5);
 const filled = await command(ui, { type: 'fill', tabId, planId: scan.data.id }); expect(filled.ok).toBe(true);
 expect(filled.data.outcomes.filter((o: any) => o.ok), JSON.stringify(filled)).toHaveLength(5);
 await expect(page.locator('#first-name')).toHaveValue('Ada'); await expect(page.locator('#country')).toHaveValue('US');
 expect(JSON.parse(await page.locator('#state').innerText()).values.firstName).toBe('Ada');
 expect((await command(ui, { type: 'fill', tabId, planId: scan.data.id })).ok).toBe(false);
 expect(await page.evaluate(() => (window as any).__fixture.submitted)).toBeFalsy();
 expect(await page.evaluate(() => (window as any).__fixture.events.filter((e: any) => e.type === 'keydown' || e.type === 'click' || e.type === 'focus').length)).toBe(0);
});

test('copy/paste boundary validates identity, shows original sources and revokes edited approval', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html');
 const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t: any) => t.url === url).id, page.url());
 await ui.goto(ui.url() + `?tabId=${tabId}`);
 await ui.getByRole('button', { name: 'Load synthetic applicant' }).click();
 await expect(ui.getByRole('status')).toContainText('Synthetic applicant');
 await ui.getByRole('button', { name: 'Scan application' }).click();
 await expect(ui.getByRole('status')).toContainText('Preview ready');
 await ui.getByLabel('Application question').selectOption({ label: 'Describe a relevant project.' });
 await ui.getByLabel('Reviewed job context', { exact: false }).fill('The role asks for testing and documentation.');
 await ui.getByRole('checkbox', { name: 'I built a Python script', exact: false }).check();
 await ui.getByRole('button', { name: 'Preview exact AI request' }).click();
 await expect(ui.getByTestId('ai-payload')).toContainText('applicantFacts');
 await expect(ui.getByTestId('ai-payload')).not.toContainText('ada@example.com');
 await ui.getByRole('button', { name: 'Copy reviewed request' }).click();
 const state = await command(ui, { type: 'state', tabId }); const request = state.data.session.request;
 const reply = { schema: 1, requestId: request.id, context: request.context, facts: request.facts.map(({ id, revision }: any) => ({ id, revision })), segments: [{ text: request.facts[0].text, sources: [{ id: request.facts[0].id, revision: 1 }] }], missing: [] };
 const wrong = await command(ui, { type: 'response', tabId, raw: JSON.stringify({ ...reply, requestId: 'invented' }) }); expect(wrong.ok).toBe(false);
 await ui.getByLabel('Paste AI JSON response').fill(JSON.stringify(reply)); await ui.getByRole('button', { name: 'Validate response' }).click();
 await ui.getByText('Source: Projects', { exact: false }).click(); await expect(ui.locator('.source')).toContainText(request.facts[0].text);
 await ui.getByLabel('I compared the exact text', { exact: false }).check(); await ui.getByRole('button', { name: 'Approve exact answer' }).click();
 await expect(ui.getByText('Approved revision 1.')).toBeVisible();
 await ui.getByLabel('Exact answer', { exact: true }).fill('I built a dashboard using synthetic data.');
 await expect(ui.getByText('User edited', { exact: false })).toBeVisible();
 expect((await command(ui, { type: 'state', tabId })).data.session.answer.approval).toBeNull();
 expect((await command(ui, { type: 'response', tabId, raw: JSON.stringify(reply) })).ok).toBe(false);
});

async function prepareDraft(ui: Page, tabId: number) {
 const scan = await command(ui, { type: 'scan', tabId });
 const facts = (await command(ui, { type: 'state', tabId })).data.facts;
 const row = scan.data.rows.find((r: any) => r.field.descriptor.control === 'textarea');
 const requested = await command(ui, { type: 'request', tabId, planId: scan.data.id, rowKey: `${row.documentId}:${row.field.ref}`, job: 'Testing and documentation required.', factIds: [facts[0].id] });
 expect(requested.ok, requested.error).toBe(true);
 const request = requested.data.session.request;
 await command(ui, { type: 'send', tabId });
 const response = { schema: 1, requestId: request.id, context: request.context, facts: request.facts.map(({id,revision}:any)=>({id,revision})), segments: [{text: request.facts[0].text, sources: [{id: request.facts[0].id, revision: 1}]}], missing: [] };
 expect((await command(ui, { type: 'response', tabId, raw: JSON.stringify(response) })).ok).toBe(true);
 return (await command(ui, { type: 'state', tabId })).data.session.answer;
}
test('explicit save, reopen, renewed reuse, exact textarea readback and deleted-plan rejection', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 let ui = await openExtensionPage('popup.html');
 const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t: any) => t.url === url).id, page.url());
 expect((await command(ui, { type: 'demo' })).ok).toBe(true);
 const a = await prepareDraft(ui, tabId);
 expect((await command(ui, { type: 'state', tabId })).data.library).toHaveLength(0);
 expect((await command(ui, { type: 'save', tabId, scope: 'application' })).ok).toBe(false);
 expect((await command(ui, { type: 'approve', tabId, reviewed: true, revision: a.revision, text: a.text })).ok).toBe(true);
 expect((await command(ui, { type: 'state', tabId })).data.library).toHaveLength(0);
 expect((await command(ui, { type: 'save', tabId, scope: 'factual' })).ok).toBe(true);
 await ui.close(); ui = await openExtensionPage(`popup.html?tabId=${tabId}`);
 await expect(ui.getByRole('heading', { name: 'Saved answers · 1' })).toBeVisible();
 const saved = (await command(ui, { type: 'state', tabId })).data.library[0];
 const reused = await command(ui, { type: 'reuse', tabId, id: saved.id }); expect(reused.ok).toBe(true); expect(reused.data.session.answer.approval).toBeNull();
 expect((await command(ui, { type: 'answer-preview', tabId })).ok).toBe(false);
 const fresh = reused.data.session.answer;
 expect((await command(ui, { type: 'approve', tabId, reviewed: true, revision: fresh.revision, text: fresh.text })).ok).toBe(true);
 expect((await command(ui, { type: 'save', tabId, scope: 'factual' })).ok).toBe(true);
 const preview = await command(ui, { type: 'answer-preview', tabId }); expect(preview.ok, preview.error).toBe(true);
 const filled = await command(ui, { type: 'fill', tabId, planId: preview.data.plan.id }); expect(filled.ok, filled.error).toBe(true);
 expect(filled.data.outcomes.filter((o:any)=>o.ok)).toHaveLength(6);
 await expect(page.locator('#project')).toHaveValue(a.text); await expect(page.locator('#existing')).toHaveValue('Keep my answer');
 await expect(page.locator('#signature')).toHaveValue(''); await expect(page.locator('#location')).toHaveValue(''); await expect(page.locator('#hidden')).toHaveValue(''); await expect(page.locator('#consent')).not.toBeChecked(); await expect(page.locator('#submitted')).toHaveText('Not submitted');
 expect(await page.evaluate(()=> (window as any).events.filter((e:any)=>e.type==='keydown'||e.type==='click').length)).toBe(0);
 await page.goto(`${ORIGIN.main}/hackathon.html?job=two`); await prepareDraft(ui, tabId);
 const second = await command(ui, {type:'reuse',tabId,id:saved.id}); expect(second.ok).toBe(true); expect(second.data.session.answer.approval).toBeNull();
 const b = second.data.session.answer; await command(ui,{type:'approve',tabId,reviewed:true,revision:b.revision,text:b.text}); await command(ui,{type:'save',tabId,scope:'factual'});
 const pending = await command(ui,{type:'answer-preview',tabId}); expect(pending.ok).toBe(true);
 expect((await command(ui,{type:'delete',tabId,id:saved.id})).ok).toBe(true);
 expect((await command(ui,{type:'fill',tabId,planId:pending.data.plan.id})).ok).toBe(false);
 await expect(page.locator('#project')).toHaveValue('');
});

test('context changes and changing selected question revoke previous approval and plan', async ({ context, openExtensionPage }) => {
 const page = await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui = await openExtensionPage('popup.html');
 const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await command(ui,{type:'demo'}); const a=await prepareDraft(ui,tabId);
 await page.locator('h1').evaluate(el=>el.textContent='Different job');
 const approval=await command(ui,{type:'approve',tabId,reviewed:true,revision:a.revision,text:a.text});
 expect(approval.ok).toBe(false);
});

test('two tabs, rescans, changed question, cancelled AI and native fallback', async ({ context, openExtensionPage }) => {
 const p1=await context.newPage(); await p1.goto(`${ORIGIN.main}/hackathon.html?job=one`);
 const p2=await context.newPage(); await p2.goto(`${ORIGIN.main}/hackathon.html?job=two`);
 const ui=await openExtensionPage('popup.html');
 const ids=await ui.evaluate(async urls => { const tabs=await (globalThis as any).chrome.tabs.query({}); return urls.map(url=>tabs.find((t:any)=>t.url===url).id); },[p1.url(),p2.url()]); const [t1,t2]=ids;
 await command(ui,{type:'demo'}); const a=await prepareDraft(ui,t1);
 await command(ui,{type:'approve',tabId:t1,reviewed:true,revision:a.revision,text:a.text}); await command(ui,{type:'save',tabId:t1,scope:'application'});
 const saved=(await command(ui,{type:'state',tabId:t1})).data.library[0];
 await prepareDraft(ui,t2);
 expect((await command(ui,{type:'reuse',tabId:t2,id:saved.id})).ok).toBe(false);
 const firstPlan=(await command(ui,{type:'state',tabId:t1})).data.plan;
 const secondPlan=(await command(ui,{type:'state',tabId:t2})).data.plan;
 expect((await command(ui,{type:'fill',tabId:t2,planId:firstPlan.id})).ok).toBe(false);
 await command(ui,{type:'scan',tabId:t1}); expect((await command(ui,{type:'fill',tabId:t1,planId:firstPlan.id})).ok).toBe(false);
 const a2=(await command(ui,{type:'state',tabId:t2})).data.session.answer;
 await p2.locator('label').filter({has:p2.locator('#project')}).evaluate(el=>el.firstChild!.textContent='Explain salary expectations.');
 expect((await command(ui,{type:'approve',tabId:t2,reviewed:true,revision:a2.revision,text:a2.text})).ok).toBe(false);
 await p2.goto(`${ORIGIN.main}/hackathon.html?job=two`);
 expect((await command(ui,{type:'fill',tabId:t2,planId:secondPlan.id})).data?.outcomes?.some((o:any)=>o.ok)).not.toBe(true);
 const scan=await command(ui,{type:'scan',tabId:t2}); const row=scan.data.rows.find((r:any)=>r.field.descriptor.control==='textarea');
 const requested=await command(ui,{type:'request',tabId:t2,planId:scan.data.id,rowKey:`${row.documentId}:${row.field.ref}`,job:'',factIds:['demo-project-build']});
 await command(ui,{type:'send',tabId:t2}); await command(ui,{type:'cancel',tabId:t2});
 expect((await command(ui,{type:'response',tabId:t2,raw:'{}'})).ok).toBe(false);
 expect(requested.ok).toBe(true);
 const native=await command(ui,{type:'fill',tabId:t2,planId:scan.data.id}); expect(native.ok).toBe(true); expect(native.data.outcomes.filter((o:any)=>o.ok)).toHaveLength(5);
 await expect(p2.locator('#project')).toHaveValue('');
});

test('worker restart restores preview; interrupted execution marker prevents replay', async ({ context, openExtensionPage, extensionId }) => {
 const page=await context.newPage(); await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('popup.html'); const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await command(ui,{type:'demo'}); const preview=await command(ui,{type:'scan',tabId});
 const cdp=await context.newCDPSession(ui); const targets=await cdp.send('Target.getTargets');
 const target=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url.includes(extensionId)); expect(target).toBeTruthy();
 await cdp.send('Target.closeTarget',{targetId:target!.targetId});
 const fill=await command(ui,{type:'fill',tabId,planId:preview.data.id}); expect(fill.ok,fill.error).toBe(true); await expect(page.locator('#first')).toHaveValue('Ada');
 await page.reload(); const fresh=await command(ui,{type:'scan',tabId});
 // Fault injection at the durable execution boundary, representing a stopped worker after marking executing.
 await ui.evaluate(async id=>{const k=`hackathon:plan:${id}`;const data=await (globalThis as any).chrome.storage.session.get(k);data[k].state='executing';await (globalThis as any).chrome.storage.session.set(data);},tabId);
 const stopped=await command(ui,{type:'fill',tabId,planId:fresh.data.id}); expect(stopped.ok).toBe(false); expect(stopped.error).toContain('partial/unknown'); await expect(page.locator('#first')).toHaveValue('');
});

test('source change and malformed library, no storage success or unsafe fill', async ({ context, openExtensionPage }) => {
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('popup.html');const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await command(ui,{type:'demo'});const a=await prepareDraft(ui,tabId);await command(ui,{type:'approve',tabId,reviewed:true,revision:a.revision,text:a.text});await command(ui,{type:'save',tabId,scope:'application'});const preview=await command(ui,{type:'answer-preview',tabId});
 await command(ui,{type:'fact-edit',tabId,id:'demo-project-build',revision:1,text:'I documented the synthetic dashboard.'});
 expect((await command(ui,{type:'fill',tabId,planId:preview.data.plan.id})).ok).toBe(false);await expect(page.locator('#project')).toHaveValue('');
 await ui.evaluate(async()=>{await (globalThis as any).chrome.storage.local.set({'hackathon:library':{schema:999,answers:[]}});});
 const malformed=await command(ui,{type:'state',tabId});expect(malformed.ok).toBe(false);expect(malformed.error).toContain('preserved');
 expect(await ui.evaluate(async()=>(await (globalThis as any).chrome.storage.local.get('hackathon:library'))['hackathon:library'].schema)).toBe(999);
});

test('storage quota error reaches UI without a saved-success message', async ({ context, openExtensionPage, serviceWorker }) => {
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('popup.html');const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await command(ui,{type:'demo'});const a=await prepareDraft(ui,tabId);await command(ui,{type:'approve',tabId,reviewed:true,revision:a.revision,text:a.text});
 await ui.goto(ui.url()+`?tabId=${tabId}`); await expect(ui.getByRole('button',{name:'Save approved answer'})).toBeVisible();
 // External storage boundary fault only; all extension service and UI modules are real.
 await serviceWorker.evaluate(()=>{ const storage=(globalThis as any).chrome.storage.local; const original=storage.set.bind(storage); storage.set=async (items:any)=>{if(Object.hasOwn(items,'hackathon:library'))throw Error('QUOTA test boundary');return original(items);}; });
 await ui.getByRole('button',{name:'Save approved answer'}).click(); await expect(ui.getByRole('status')).toContainText('QUOTA');
 await expect(ui.getByRole('heading',{name:'Saved answers · 0'})).toBeVisible(); await expect(ui.getByRole('status')).not.toContainText('answer saved');
});

test('native descriptor/options mutations, prefilled files, overlength and delayed rewrite are not reported as verified', async ({ context, openExtensionPage }) => {
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('popup.html');const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await command(ui,{type:'demo'});await page.locator('#resume').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic resume')});
 const scan=await command(ui,{type:'scan',tabId});
 await page.locator('#first').fill('Already typed');
 await page.locator('#last').evaluate(el=>el.setAttribute('hidden',''));
 await page.locator('#email').evaluate(el=>el.addEventListener('input',()=>setTimeout(()=>{(el as HTMLInputElement).value='unexpected@example.com';},0)));
 await page.locator('#country option').nth(1).evaluate(el=>el.textContent='Canada');
 await page.locator('#phone').evaluate(el=>el.setAttribute('maxlength','2'));
 const fill=await command(ui,{type:'fill',tabId,planId:scan.data.id});expect(fill.ok).toBe(true);expect(fill.data.outcomes.filter((o:any)=>o.ok)).toHaveLength(0);
 await expect(page.locator('#first')).toHaveValue('Already typed');await expect(page.locator('#last')).toHaveValue('');await expect(page.locator('#country')).toHaveValue('');await expect(page.locator('#phone')).toHaveValue('');
 expect(await page.locator('#resume').evaluate(el=>(el as HTMLInputElement).files?.[0]?.name)).toBe('synthetic.txt');
});

test('all maintained sample fixtures execute through the actual extension without arbitrary actions', async ({context,openExtensionPage}, testInfo) => {
 const ui=await openExtensionPage('popup.html');await command(ui,{type:'demo'});
 const metrics: object[] = [];
 const oracle: Record<string,Record<string,string>> = { generic:{'first-name':'Ada','last-name':'Lovelace',email:'ada@example.com',city:'San Francisco',country:'US'}, greenhouse:{first_name:'Ada',last_name:'Lovelace',email:'ada@example.com',phone:'555-0100'}, lever:{name:'Ada Lovelace',email:'ada@example.com',phone:'555-0100'}, ashby:{_systemfield_name:'Ada Lovelace',_systemfield_email:'ada@example.com','2f6c1c0e-5b7a-4f0d-9a3e-6d1b8c2e4f01':'555-0100'}, hostile:{'full-name':'Ada Lovelace',email:'ada@example.com'}, shadow:{'first-name':'Ada','last-name':'Lovelace',email:'ada@example.com',phone:'555-0100'}, 'same-origin-frame':{}, 'embed-hidden':{}, 'embed-host':{}, 'embed-blocked':{} };
 const fixtures=['generic','greenhouse','lever','ashby','hostile','shadow','same-origin-frame','embed-hidden','embed-host','embed-blocked'];
 for (const fixture of fixtures) {
  const page=await context.newPage();await page.goto(`${ORIGIN.main}/${fixture}.html`);
  const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
  const before=await page.locator('input,select,textarea').evaluateAll(els=>els.map(el=>({key:(el as HTMLInputElement).id||(el as HTMLInputElement).name,value:(el as HTMLInputElement).value,checked:(el as HTMLInputElement).checked})));
  const scan=await command(ui,{type:'scan',tabId});expect(scan.ok,fixture).toBe(true);
  const fill=await command(ui,{type:'fill',tabId,planId:scan.data.id});expect(fill.ok,fixture).toBe(true);
  const outcome=await page.evaluate(()=>{const f=(window as any).__fixture;return {submitted:!!f?.submitted,actions:(f?.events??[]).filter((e:any)=>e.type==='keydown'||e.type==='click'||e.type==='focus'),writes:(f?.events??[]).filter((e:any)=>e.type==='input')};});
  const after=await page.locator('input,select,textarea').evaluateAll(els=>els.map(el=>({key:(el as HTMLInputElement).id||(el as HTMLInputElement).name,value:(el as HTMLInputElement).value,checked:(el as HTMLInputElement).checked})));
  let writes=0;
  for(let i=0;i<after.length;i++){const current=after[i]!;const previous=before[i]!;expect(current.checked,fixture+':'+current.key).toBe(previous.checked);if(current.value!==previous.value){writes++;expect(current.value,fixture+':'+current.key).toBe(oracle[fixture]![current.key]);}}
  expect(writes,fixture).toBe(Object.keys(oracle[fixture]!).length);
  metrics.push({fixture,discovered:scan.data.rows.length,planned:scan.data.rows.filter((r:any)=>r.action).length,verified:fill.data.outcomes.filter((o:any)=>o.ok).length,manual:scan.data.rows.filter((r:any)=>!r.action).length,wrongWrites:0});
  expect(outcome.submitted,fixture).toBe(false);expect(outcome.actions,fixture).toEqual([]);
  // Every actual successful write must be one of the exact previewed actions.
  for (const result of fill.data.outcomes.filter((o:any)=>o.ok)) expect(scan.data.rows.some((r:any)=>r.documentId===result.documentId&&r.field.ref===result.ref&&r.action),fixture).toBe(true);
  await page.close();
 }
 await testInfo.attach('fixture-metrics.json',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
});

test('persistent review workspace remains bound to the application tab', async ({context,openExtensionPage})=>{
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);
 const ui=await openExtensionPage('popup.html');const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await ui.goto(ui.url()+`?tabId=${tabId}`);
 const opened=context.waitForEvent('page');await ui.getByRole('button',{name:'Open review workspace'}).click();const workspace=await opened;
 await workspace.waitForLoadState();expect(new URL(workspace.url()).searchParams.get('tabId')).toBe(String(tabId));
 await workspace.getByRole('button',{name:'Scan application'}).click();await expect(workspace.getByRole('status')).toContainText('Preview ready');await expect(page.locator('#first')).toHaveValue('');
});

test('stale fact and answer editors cannot replace newer revisions',async({context,openExtensionPage})=>{
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);const ui=await openExtensionPage('popup.html');
 const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await command(ui,{type:'demo'});const original=await prepareDraft(ui,tabId);
 expect((await command(ui,{type:'edit',tabId,text:'I built a Python dashboard.'})).ok).toBe(true);
 const stale=await command(ui,{type:'edit',tabId,answerId:original.id,answerRevision:original.revision,text:'Old editor overwrite.'});expect(stale.ok).toBe(false);
 expect((await command(ui,{type:'fact-edit',tabId,id:'demo-project-build',revision:1,text:'New source revision.'})).ok).toBe(true);
 expect((await command(ui,{type:'fact-edit',tabId,id:'demo-project-build',revision:1,text:'Old source overwrite.'})).ok).toBe(false);
 expect((await command(ui,{type:'state',tabId})).data.facts[0].text).toBe('New source revision.');
});
