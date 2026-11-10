import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';
async function state(ui: Page, tabId: number) { const r=await ui.evaluate(async id=>(globalThis as any).chrome.runtime.sendMessage({type:'state',tabId:id}),tabId);expect(r.ok,r.error).toBe(true);return r.data; }
async function start(ui: Page, question='Describe a relevant project.', all=false) {
 await ui.getByRole('button',{name:'Scan application'}).click();await expect(ui.getByRole('status')).toContainText('Preview ready');
 await ui.getByLabel('Application question').selectOption({label:question});
 await ui.getByLabel('Reviewed job context',{exact:false}).fill('Synthetic developer role.');
 await ui.getByRole('checkbox',{name:'I built a Python script',exact:false}).check();
 if(all){await ui.getByRole('checkbox',{name:'I wrote tests for missing',exact:false}).check();await ui.getByRole('checkbox',{name:'I worked with two classmates',exact:false}).check();}
 await ui.getByRole('button',{name:'Preview exact AI request'}).click();await expect(ui.getByTestId('ai-payload')).toBeVisible();
}
async function reply(ui: Page, tabId:number,text:string,sourceIndex=0) {
 await ui.getByRole('button',{name:'Copy reviewed request'}).click();
 const r=(await state(ui,tabId)).session.request;
 await ui.getByLabel('Paste AI JSON response').fill(JSON.stringify({schema:1,requestId:r.id,context:r.context,facts:r.facts.map(({id,revision}:any)=>({id,revision})),segments:[{text,sources:[{id:r.facts[sourceIndex].id,revision:1}]}],missing:[]}));
 await ui.getByRole('button',{name:'Validate response'}).click();await expect(ui.getByLabel('Exact answer',{exact:true})).toHaveValue(text.replace(/\r\n?/g,'\n'));
}
async function approveSave(ui: Page) {
 await ui.getByLabel('I compared the exact text',{exact:false}).check();await ui.getByRole('button',{name:'Approve exact answer'}).click();
 await expect(ui.getByRole('button',{name:'Save approved answer'})).toBeVisible();
 await ui.getByRole('button',{name:'Save approved answer'}).click();await expect(ui.getByRole('status')).toContainText('answer saved');
}
async function bind(ui:Page,page:Page) {
 const tabId=await ui.evaluate(async url=>(await (globalThis as any).chrome.tabs.query({})).find((t:any)=>t.url===url).id,page.url());
 await ui.goto(ui.url()+`?tabId=${tabId}`);await ui.getByRole('button',{name:'Load synthetic applicant'}).click();await expect(ui.getByRole('status')).toContainText('Synthetic applicant');return tabId;
}
test('N1: real no-op keystrokes retain per-sentence warnings with all facts selected',async({context,openExtensionPage})=>{
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);const ui=await openExtensionPage('popup.html');const tabId=await bind(ui,page);
 await start(ui,undefined,true);await reply(ui,tabId,'I wrote two test suites in Python for missing readings.',1);
 await expect(ui.getByText(/Missing or unsupported:.*two/)).toBeVisible();await expect(ui.getByText(/Missing or unsupported:.*Python/)).toBeVisible();
 const editor=ui.getByLabel('Exact answer',{exact:true});await editor.press('End');await editor.press('Space');await editor.press('Backspace');await ui.getByRole('button',{name:'Apply edits for review'}).click();await expect(ui.getByRole('button',{name:'Apply edits for review'})).toHaveCount(0);
 await ui.getByLabel('I compared the exact text',{exact:false}).check();await expect(ui.getByRole('button',{name:'Approve exact answer'})).toBeDisabled();
 await expect(ui.getByText(/Missing or unsupported:.*two/)).toBeVisible();await expect(ui.getByText(/Missing or unsupported:.*Python/)).toBeVisible();
 await editor.fill('I wrote tests for missing readings.');await ui.getByRole('button',{name:'Apply edits for review'}).click();await expect(ui.getByRole('button',{name:'Apply edits for review'})).toHaveCount(0);await approveSave(ui);
 const a=(await state(ui,tabId)).session.answer;expect(a.trace.segments[0].text).toBe('I wrote two test suites in Python for missing readings.');expect(a.segments).toEqual([]);
});
test('N2: UI reuse on another question preserves original record and concurrent preview in the same application',async({context,openExtensionPage})=>{
 const url=`${ORIGIN.main}/hackathon-two-questions.html`;const page=await context.newPage();await page.goto(url);const ui=await openExtensionPage('popup.html');const tabId=await bind(ui,page);
 await start(ui);await reply(ui,tabId,'I built a Python script that cleaned synthetic sensor readings.');await approveSave(ui);
 const source=(await state(ui,tabId)).library[0];await ui.getByRole('button',{name:'Preview approved textarea fill'}).click();await expect(ui.getByRole('status')).toContainText('Updated');
 const secondPromise=context.waitForEvent('page');const secondTab=await ui.evaluate(async url=>(globalThis as any).chrome.tabs.create({url}),url);const second=await secondPromise;await second.waitForLoadState();
 const ui2=await openExtensionPage(`popup.html?tabId=${secondTab.id}`);await start(ui2,'Tell us about a project you built.');
 await ui2.getByRole('button',{name:'Open for review',exact:true}).click();await expect(ui2.getByLabel('Exact answer',{exact:true})).toHaveValue(source.text);await approveSave(ui2);
 const data=await state(ui2,secondTab.id);expect(data.library).toHaveLength(2);expect(data.library.find((a:any)=>a.id===source.id)).toEqual(source);expect(data.session.answer.context.application).toBe(source.context.application);expect(data.session.answer.context.questionKey).not.toBe(source.context.questionKey);expect(data.session.answer.scope).toBe('application');
 await ui2.getByRole('button',{name:'Preview approved textarea fill'}).click();await expect(ui2.getByRole('status')).toContainText('Updated');await ui2.getByRole('button',{name:'Fill previewed fields'}).click();await expect(ui2.getByRole('status')).toContainText('Fill finished');await expect(second.locator('#project-two')).toHaveValue(source.text);await expect(second.locator('#project')).toHaveValue('');
 await ui.getByRole('button',{name:'Fill previewed fields'}).click();await expect(ui.getByRole('status')).toContainText('Fill finished');await expect(page.locator('#project')).toHaveValue(source.text);await expect(page.locator('#project-two')).toHaveValue('');await expect(page.locator('#submitted')).toHaveText('Not submitted');
});
test('N3: ordinary one-part prose passes review while an unsupported quantity stays blocked',async({context,openExtensionPage})=>{
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);const ui=await openExtensionPage('popup.html');const tabId=await bind(ui,page);
 await start(ui);await reply(ui,tabId,'One part of my project was a Python script that cleaned synthetic sensor readings.');await approveSave(ui);
 await ui.getByLabel('Exact answer',{exact:true}).fill('I supported one hundred users.');await ui.getByRole('button',{name:'Apply edits for review'}).click();await expect(ui.getByRole('button',{name:'Apply edits for review'})).toHaveCount(0);await ui.getByLabel('I compared the exact text',{exact:false}).check();await expect(ui.getByRole('button',{name:'Approve exact answer'})).toBeDisabled();await expect(ui.getByText(/Missing or unsupported:.*hundred/)).toBeVisible();
});
for(const rewritten of [false,true]) test(`N6: legacy CRLF reuse with exact approval, changed readback=${rewritten}`,async({context,openExtensionPage})=>{
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);const ui=await openExtensionPage('popup.html');const tabId=await bind(ui,page);
 await start(ui);await reply(ui,tabId,'I built a Python script. I displayed synthetic sensor readings.');await approveSave(ui);
 const data=await state(ui,tabId);const a=data.library[0];const text='I built a Python script.\r\nI displayed synthetic sensor readings.\rI made a dashboard.';
 const segment={...a.segments[0],text};const legacy={...a,text,segments:[segment],trace:{...a.trace,segments:[segment]},approval:{...a.approval,text}};
 // External persisted record from the pre-normalization format, not a mocked module.
 await ui.evaluate(async value=>(globalThis as any).chrome.storage.local.set({'hackathon:library':{schema:1,answers:[value]}}),legacy);await ui.reload();
 await ui.getByRole('button',{name:'Open for review',exact:true}).click();await expect(ui.getByRole('status')).toContainText('Updated');
 const draft=(await state(ui,tabId)).session.answer;expect(draft.text).toBe(text.replace(/\r\n?/g,'\n'));expect(draft.approval).toBeNull();expect(draft.trace).toEqual(legacy.trace);await approveSave(ui);
 await ui.getByRole('button',{name:'Preview approved textarea fill'}).click();await expect(ui.getByRole('status')).toContainText('Updated');
 if(rewritten)await page.locator('#project').evaluate(el=>el.addEventListener('input',()=>{(el as HTMLTextAreaElement).value+=' Changed by page';}));
 await ui.getByRole('button',{name:'Fill previewed fields'}).click();await expect(ui.getByRole('status')).toContainText('Fill finished');
 const result=await state(ui,tabId);const row=result.plan.rows.find((r:any)=>r.field.descriptor.id==='project');const outcome=result.plan.outcomes.find((o:any)=>o.ref===row.field.ref);
 expect(row.action.value).toBe(draft.text);expect(result.session.answer.approval.text).toBe(draft.text);expect(outcome.status).toBe(rewritten?'written-unverified':'verified');await expect(page.locator('#project')).toHaveValue(draft.text+(rewritten?' Changed by page':''));await expect(page.locator('#submitted')).toHaveText('Not submitted');
});

test('demo cross-check: native fill then explicit rescan and saved-answer review fills only the textarea',async({context,openExtensionPage})=>{
 const page=await context.newPage();await page.goto(`${ORIGIN.main}/hackathon.html`);const ui=await openExtensionPage('popup.html');const tabId=await bind(ui,page);
 await start(ui);await reply(ui,tabId,'I built a Python script that cleaned synthetic sensor readings.');await approveSave(ui);
 await ui.getByRole('button',{name:'Fill previewed fields'}).click();await expect(ui.getByRole('status')).toContainText('Fill finished');await expect(page.locator('#project')).toHaveValue('');
 await ui.getByRole('button',{name:'Preview approved textarea fill'}).click();await expect(ui.getByRole('status')).toContainText('Scan again');
 await start(ui);await ui.getByRole('button',{name:'Open for review',exact:true}).click();await expect(ui.getByRole('status')).toContainText('Updated');await approveSave(ui);
 await ui.getByRole('button',{name:'Preview approved textarea fill'}).click();await expect(ui.getByRole('status')).toContainText('Updated');await ui.getByRole('button',{name:'Fill previewed fields'}).click();await expect(ui.getByRole('status')).toContainText('Fill finished');
 const result=await state(ui,tabId);expect(result.plan.outcomes).toHaveLength(1);expect(result.plan.outcomes[0].status).toBe('verified');await expect(ui.getByText('Kept existing answer',{exact:true})).toHaveCount(6);await expect(page.locator('#submitted')).toHaveText('Not submitted');
});
