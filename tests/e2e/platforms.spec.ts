import { test, expect, ORIGIN } from './extension';

const cases = [
  { platform: 'Greenhouse', file: 'greenhouse-live.html', name: '#first_name', value: 'Ada', email: '#email', resume: '.file-upload__filename', manual: 'Please choose the single location that you are most interested in.' },
  { platform: 'Lever', file: 'lever.html', name: '[name="name"]', value: 'Ada Lovelace', email: '[name="email"]', resume: '#resume-upload-input', manual: 'Current location' },
  { platform: 'Ashby', file: 'ashby.html', name: '#_systemfield_name', value: 'Ada Lovelace', email: '#_systemfield_email', resume: '#_systemfield_resume', manual: 'Location' },
];

for (const sample of cases) test(`${sample.platform}: fresh profile, application recognition, one-button fill, manual review and preserved edits`, async ({ context, serviceWorker, openExtensionPage }, testInfo) => {
  const externalRequests: string[] = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:' || ['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    externalRequests.push(url.origin); return route.abort();
  });
  await serviceWorker.evaluate(() => {
    (globalThis as any).chrome.runtime.connectNative = () => { throw Error('Basic platform test must not call AI'); };
  });
  const home = await openExtensionPage('home.html');
  await home.getByLabel('First name', { exact: true }).fill('Ada');
  await home.getByLabel('Last name', { exact: true }).fill('Lovelace');
  await home.getByLabel('Email', { exact: true }).fill('ada@example.com');
  await home.getByLabel('Phone', { exact: true }).fill('(415) 555-0100');
  await home.getByLabel('Country', { exact: true }).fill('United States');
  await home.getByLabel('City', { exact: true }).fill('San Francisco');
  await home.getByRole('button', { name: 'Save profile', exact: true }).click();
  const resume = { name: 'Synthetic-Ada.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 };
  expect(await home.evaluate(async resume => (await (globalThis as any).chrome.runtime.sendMessage({ type: 'sidebar-save-resume', resume })).ok, resume)).toBe(true);
  await home.reload();
  await expect(home.getByLabel('Email', { exact: true })).toHaveValue('ada@example.com');
  const page = await context.newPage(); await page.goto(`${ORIGIN.main}/${sample.file}`);
  const checksBefore = await page.locator('input[type="checkbox"]').evaluateAll(inputs => inputs.map(el => (el as HTMLInputElement).checked));
  const ui = await openExtensionPage('sidepanel.html');
  const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((tab: any) => tab.url === url).id, page.url());
  await ui.goto(`${ui.url()}?tabId=${tabId}`);
  async function run() {
    await ui.getByRole('button', { name: 'Autofill', exact: true }).click();
    await expect.poll(async () => ui.evaluate(async tabId => (await (globalThis as any).chrome.runtime.sendMessage({ type: 'sidebar-state', tabId })).data.run?.phase, tabId), { timeout: 20_000 }).toMatch(/^(review|finished|error)$/);
    return ui.evaluate(async tabId => (await (globalThis as any).chrome.runtime.sendMessage({ type: 'sidebar-state', tabId })).data.run, tabId);
  }
  const result = await run();
  expect(result.phase).not.toBe('error');
  await expect(page.locator(sample.name)).toHaveValue(sample.value);
  await expect(page.locator(sample.email)).toHaveValue('ada@example.com');
  expect(result.fields.some((field: any) => /resume/i.test(field.label) && field.status === 'filled'), JSON.stringify(result.fields)).toBe(true);
  expect(result.fields.some((field: any) => field.label.toLowerCase().includes(sample.manual.toLowerCase()) && field.status === 'review'), JSON.stringify(result.fields)).toBe(true);
  await expect(ui.getByRole('heading', { name: 'Ready for your review' })).toBeVisible();
  await page.locator(sample.email).fill('edited@example.com');
  await run();
  await expect(page.locator(sample.email)).toHaveValue('edited@example.com');
  expect(await page.locator('input[type="checkbox"]').evaluateAll(inputs => inputs.map(el => (el as HTMLInputElement).checked))).toEqual(checksBefore);
  expect(await page.evaluate(() => Boolean((window as any).__fixture?.submitted))).toBe(false);
  if (sample.platform === 'Greenhouse') await expect(page.locator('#submitted')).toHaveText('Not submitted');
  expect(externalRequests).toEqual([]);
  await ui.screenshot({ path: testInfo.outputPath('sidebar.png'), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath('application.png'), fullPage: true });
  await testInfo.attach('platform-result', { body: JSON.stringify({ platform: sample.platform, fields: result.fields.map(({ label, status, detail }: any) => ({ label, status, detail })), externalRequests, submitted: false }, null, 2), contentType: 'application/json' });
});

test('a job description without an application is not counted as filled', async ({ context, openExtensionPage }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN.main}/hackathon.html`);
  await page.evaluate(() => { document.body.innerHTML = '<h1>Example Tools seeks a developer</h1><p>Build useful tools with Python.</p><label>Search jobs<input type="search" id="search"></label>'; });
  const ui = await openExtensionPage('sidepanel.html');
  await ui.evaluate(() => (globalThis as any).chrome.runtime.sendMessage({ type: 'demo' }));
  const tabId = await ui.evaluate(async url => (await (globalThis as any).chrome.tabs.query({})).find((tab: any) => tab.url === url).id, page.url());
  await ui.goto(`${ui.url()}?tabId=${tabId}`);
  await ui.getByRole('button', { name: 'Autofill', exact: true }).click();
  await expect.poll(async () => ui.evaluate(async tabId => (await (globalThis as any).chrome.runtime.sendMessage({ type: 'sidebar-state', tabId })).data.run?.phase, tabId), { timeout: 15_000 }).toMatch(/^(review|finished|error)$/);
  const run = await ui.evaluate(async tabId => (await (globalThis as any).chrome.runtime.sendMessage({ type: 'sidebar-state', tabId })).data.run, tabId);
  expect(run.fields.filter((field: any) => field.status === 'filled')).toHaveLength(0);
  expect(run.message).toMatch(/no .*field|no .*application|could.*find|could.*recogn|not.*found/i);
  await expect(page.locator('#search')).toHaveValue('');
});
