import { browser } from 'wxt/browser';
import type { NativePlan, Row } from './engine';
import { fieldSignature } from './engine';
import type { NativeCommand } from './page';
/** Read-only revalidation. Does not rescan or invalidate existing handles. */
export async function assertLiveRow(plan: NativePlan, row: Row): Promise<void> {
 if ((await browser.tabs.get(plan.tabId)).url !== plan.url) throw Error('Application changed. Scan and review again.');
 const command: NativeCommand = { job: row.job, scanId: row.scanId, url: row.url, actions: [{ ref: row.field.ref, type: 'answer', value: '', signature: fieldSignature(row.field.descriptor, row.field.form, row.field.maxLength) }] };
 try {
  await browser.scripting.executeScript({ target: { tabId: plan.tabId, documentIds: [row.documentId] }, func: (value: NativeCommand) => { (globalThis as typeof globalThis & { __jaaCommand?: NativeCommand }).__jaaCommand = value; }, args: [command] });
  const results = await browser.scripting.executeScript({ target: { tabId: plan.tabId, documentIds: [row.documentId] }, files: ['/inspect.js'] });
  if (results.length !== 1 || results[0]?.result !== true) throw Error('changed');
 } catch { throw Error('Job, question, document or field changed. Scan and review again.'); }
}
