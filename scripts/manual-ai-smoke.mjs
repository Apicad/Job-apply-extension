/** Manual external-model boundary. NEVER synthesizes a model reply or invokes a paid API.
 * Run after npm run build:e2e. Read request.txt in an authorized AI chat;
 * put that actual model's JSON into response.json. The runner then validates via the UI.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const source = { sha: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').length > 0 };
if (source.dirty) throw Error('Use a clean committed checkout for the real model smoke.');
const dir = path.resolve(process.env.JAA_SMOKE_DIR ?? 'docs/hackathon/smoke');
await fs.mkdir(dir, { recursive: true });
try { await fs.access(path.join(dir, 'response.json')); throw Error('Use an empty smoke directory; this runner will not replay an old response.'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
const server = await createServer({ configFile: 'tests/fixtures/vite.config.ts', server: { port: 0, open: false } });
await server.listen(); const port=server.httpServer.address().port;
const extension=path.resolve('.output/chrome-mv3-e2e');
await fs.mkdir('test-results',{recursive:true});
const profile=await fs.mkdtemp(path.resolve('test-results/manual-smoke-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 const page=await context.newPage();await page.goto(`http://localhost:${port}/hackathon.html`);
 let ui=await context.newPage();await ui.goto(`chrome-extension://${id}/popup.html`);
 const tabId=await ui.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,page.url());
 await ui.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`);
 await ui.getByRole('button',{name:'Load synthetic applicant'}).click();await expect(ui.getByRole('status')).toContainText('Synthetic applicant');
 await ui.getByRole('button',{name:'Scan application'}).click();await expect(ui.getByRole('status')).toContainText('Preview ready');
 await ui.getByLabel('Application question').selectOption({label:'Describe a relevant project.'});
 await ui.getByLabel('Reviewed job context',{exact:false}).fill('Fictional Community Tools needs small Python tools, tests for missing data, and clear local setup documentation. These are job requirements, not applicant facts.');
 await ui.getByRole('checkbox',{name:'I built a Python script',exact:false}).check();
 await ui.getByRole('checkbox',{name:'I wrote tests for missing',exact:false}).check();
 await ui.getByRole('button',{name:'Preview exact AI request'}).click();
 await expect(ui.getByTestId('ai-payload')).toBeVisible();
 await fs.writeFile(path.join(dir,'request.txt'),await ui.getByTestId('ai-payload').innerText());
 await ui.getByRole('button',{name:'Copy reviewed request'}).click();
 const state=await ui.evaluate(async tabId=>await chrome.runtime.sendMessage({type:'state',tabId}),tabId);
 await fs.writeFile(path.join(dir,'request.json'),JSON.stringify(state.data.session.request,null,2)+'\n');
 console.log(`WAITING_FOR_ACTUAL_MODEL_RESPONSE ${dir}/response.json`);
 const deadline=Date.now()+15*60_000;
 while(true){try{await fs.access(path.join(dir,'response.json'));break;}catch{if(Date.now()>deadline)throw Error('No actual model response supplied within 15 minutes.');await new Promise(r=>setTimeout(r,500));}}
 const raw=await fs.readFile(path.join(dir,'response.json'),'utf8');
 await ui.getByLabel('Paste AI JSON response').fill(raw);await ui.getByRole('button',{name:'Validate response'}).click();
 await expect(ui.getByRole('heading',{name:'Review answer and sources'})).toBeVisible();
 for(const source of await ui.locator('.source summary').all())await source.click();
 await ui.getByRole('heading',{name:'Review answer and sources'}).scrollIntoViewIfNeeded();await ui.screenshot({path:path.join(dir,'source-review.png')});
 // Synthetic smoke reviewer checks the exact two generated statements against original snippets.
 const draft=(await ui.evaluate(async tabId=>await chrome.runtime.sendMessage({type:'state',tabId}),tabId)).data.session.answer;
 await fs.writeFile(path.join(dir,'validated-draft.json'),JSON.stringify(draft,null,2)+'\n');
 await ui.getByLabel('I compared the exact text',{exact:false}).check();await ui.getByRole('button',{name:'Approve exact answer'}).click();
 await ui.getByRole('button',{name:'Save approved answer'}).click();await expect(ui.getByRole('status')).toContainText('answer saved');
 await ui.close();ui=await context.newPage();await ui.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`);
 await expect(ui.getByRole('heading',{name:'Saved answers · 1'})).toBeVisible();
 await ui.getByRole('button',{name:'Preview approved textarea fill'}).click();await ui.getByRole('button',{name:'Fill previewed fields'}).click();
 await expect(page.locator('#project')).toHaveValue(draft.text);await expect(page.locator('#submitted')).toHaveText('Not submitted');
 const final=(await ui.evaluate(async tabId=>await chrome.runtime.sendMessage({type:'state',tabId}),tabId)).data;
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({...source,date:new Date().toISOString(),chromium:context.browser()?.version(),requestId:draft.trace.request.id,answer: draft.text,sourceReferences:draft.segments.map(s=>s.sources),savedCount:final.library.length,reopened:true,verifiedWrites:final.plan.outcomes.filter(o=>o.ok).length,textareaExact:await page.locator('#project').inputValue()===draft.text,submitted:false},null,2)+'\n');
 await page.screenshot({path:path.join(dir,'filled-sample.png'),fullPage:true});console.log('REAL_RESPONSE_UI_SMOKE_PASSED');
} finally { await context.close();await server.close(); }
