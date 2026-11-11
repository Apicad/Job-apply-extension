import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { invalidateNativePlan } from '../../lib/hackathon/service';
import type { NativePlan, Row } from '../../lib/hackathon/engine';

const world = globalThis as typeof globalThis & { __jaaScan?: { id: string; url: string }; __jaaCommand?: { scanId: string; url: string } };
const url = 'https://job-boards.greenhouse.io/embed/job_app?for=test&token=1';
function plan(rows: Partial<Row>[]): NativePlan {
 return { id: 'old-plan', tabId: 7, url, state: 'executing', profileKey: 'profile', rows: rows as Row[] };
}
beforeEach(() => { fakeBrowser.reset(); delete world.__jaaScan; delete world.__jaaCommand; });
afterEach(() => { vi.restoreAllMocks(); delete world.__jaaScan; delete world.__jaaCommand; });

it('invalidates only the exact scan and pending command, scoped to recorded documents', async () => {
 world.__jaaScan = { id: 'scan-a', url }; world.__jaaCommand = { scanId: 'scan-a', url };
 const execute = vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async injection => {
  if (injection.func) (injection.func as (...args: unknown[]) => unknown)(...('args' in injection ? injection.args ?? [] : []));
  return [];
 });
 await invalidateNativePlan(plan([{ documentId: 'document-a', scanId: 'scan-a', url }, { documentId: 'document-a', scanId: 'scan-a', url }]));
 expect(execute).toHaveBeenCalledOnce();
 expect(execute.mock.calls[0]![0].target).toEqual({ tabId: 7, documentIds: ['document-a'] });
 expect(world.__jaaScan).toBeUndefined(); expect(world.__jaaCommand).toBeUndefined();
});
it('a delayed cancellation leaves a newer scan and command untouched', async () => {
 let invoke: (() => void) | undefined; let release: (() => void) | undefined;
 vi.spyOn(browser.scripting, 'executeScript').mockImplementation(injection => new Promise(resolve => {
  invoke = () => { if (injection.func) (injection.func as (...args: unknown[]) => unknown)(...('args' in injection ? injection.args ?? [] : [])); };
  release = () => resolve([]);
 }));
 const pending = invalidateNativePlan(plan([{ documentId: 'document-a', scanId: 'old-scan', url }]));
 world.__jaaScan = { id: 'new-scan', url }; world.__jaaCommand = { scanId: 'new-scan', url };
 invoke!(); release!(); await pending;
 expect(world.__jaaScan?.id).toBe('new-scan'); expect(world.__jaaCommand?.scanId).toBe('new-scan');
});
it('does not clear a newer command when the old scan is still present', async () => {
 world.__jaaScan = { id: 'old-scan', url }; world.__jaaCommand = { scanId: 'new-scan', url };
 vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async injection => {
  if (injection.func) (injection.func as (...args: unknown[]) => unknown)(...('args' in injection ? injection.args ?? [] : [])); return [];
 });
 await invalidateNativePlan(plan([{ documentId: 'document-a', scanId: 'old-scan', url }]));
 expect(world.__jaaScan).toBeUndefined(); expect(world.__jaaCommand?.scanId).toBe('new-scan');
});
it('tolerates navigated or closed documents and never broadcasts to all frames', async () => {
 const execute = vi.spyOn(browser.scripting, 'executeScript').mockRejectedValue(Error('No document with this ID'));
 await expect(invalidateNativePlan(plan([{ documentId: 'gone', scanId: 'old-scan', url }]))).resolves.toBeUndefined();
 expect(execute.mock.calls[0]![0].target).toEqual({ tabId: 7, documentIds: ['gone'] });
});
