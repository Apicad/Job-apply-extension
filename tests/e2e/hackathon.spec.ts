import { test, expect, ORIGIN } from './extension';
import type { Page } from '@playwright/test';
async function command(ui: Page, value: object) { return ui.evaluate(async message => await (globalThis as any).chrome.runtime.sendMessage(message), value); }
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
