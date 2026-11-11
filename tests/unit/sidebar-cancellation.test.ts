import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { normalizeProfile } from '../../lib/profile';
import { saveProfile, writeHackathon, loadProfile } from '../../lib/storage';
import { scanNative } from '../../lib/hackathon/page';
import { planNative, type NativePlan } from '../../lib/hackathon/engine';
import { key } from '../../lib/hackathon/contracts';

vi.mock('../../lib/hackathon/service', async original => {
 const actual = await original<typeof import('../../lib/hackathon/service')>();
 return { ...actual, scanTab: vi.fn(), fillTab: vi.fn() };
});
import { scanTab, fillTab } from '../../lib/hackathon/service';
import { handleSidebar, cancelForNavigation, sidebarBusy, sidebarState } from '../../lib/sidebar/workflow';

const profile = normalizeProfile({ firstName: 'Ada', email: 'ada@example.com', phone: '555-0100' });
const world = globalThis as typeof globalThis & { __jaaScan?: { id: string; url: string }; __jaaCommand?: { scanId: string; url: string } };
let tabId = 30;
let plan: NativePlan;
let finishFill: (value: NativePlan) => void;
beforeEach(async () => {
 tabId++; fakeBrowser.reset(); vi.clearAllMocks();
 await saveProfile(profile); await writeHackathon('facts', []);
 document.body.innerHTML = '<form><label>First name<input></label><label>Email<input></label><label>Phone<input></label></form>';
 const scan = scanNative(document, { isRendered: () => true, assignFiles: () => {} });
 plan = { id: `plan-${tabId}`, tabId, url: scan.url, profileKey: key(profile), state: 'preview', rows: planNative([{ documentId: `document-${tabId}`, frameId: 0, scan }], profile) };
 vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: tabId, url: scan.url } as never);
 vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async injection => {
  if (injection.func) (injection.func as (...args: unknown[]) => unknown)(...('args' in injection ? injection.args ?? [] : [])); return [];
 });
 vi.mocked(scanTab).mockResolvedValue(plan);
 vi.mocked(fillTab).mockImplementation(() => new Promise(resolve => { finishFill = resolve; }));
});
afterEach(async () => {
 if (sidebarBusy(tabId)) { await cancelForNavigation(tabId); finishFill?.({ ...plan, state: 'finished' }); await vi.waitFor(() => expect(sidebarBusy(tabId)).toBe(false)); }
 vi.restoreAllMocks();
});
async function start() {
 const result = await handleSidebar({ type: 'sidebar-autofill', tabId }) as { run: { id: string } };
 await vi.waitFor(() => expect(fillTab).toHaveBeenCalledOnce());
 return result.run.id;
}

it.each(['sidebar-cancel', 'sidebar-save-profile', 'sidebar-save-resume', 'navigation'])('propagates %s into the exact active page scan', async action => {
 const runId = await start(); expect(world.__jaaScan).toBeDefined();
 if (action === 'navigation') await cancelForNavigation(tabId);
 else if (action === 'sidebar-save-profile') await handleSidebar({ type: action, profile: { ...profile, firstName: 'Grace' }, facts: [], expectedProfile: await loadProfile(), expectedFacts: [] });
 else if (action === 'sidebar-save-resume') await handleSidebar({ type: action, resume: { name: 'Ada.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 } });
 else await handleSidebar({ type: action, tabId, runId });
 expect(world.__jaaScan).toBeUndefined();
 expect((await sidebarState(tabId)).run?.phase).toBe('cancelled');
 await expect(handleSidebar({ type: 'sidebar-autofill', tabId })).rejects.toThrow('still stopping');
 finishFill({ ...plan, state: 'finished' });
 await vi.waitFor(() => expect(sidebarBusy(tabId)).toBe(false));
 expect((await sidebarState(tabId)).run?.phase).toBe('cancelled');
});
it('ignores a cancellation for another run', async () => {
 await start(); const scan = world.__jaaScan;
 await handleSidebar({ type: 'sidebar-cancel', tabId, runId: 'stale-run' });
 expect(world.__jaaScan).toBe(scan); expect((await sidebarState(tabId)).run?.phase).toBe('filling');
});
it('invalidates a scan that returns after cancellation without starting a fill', async () => {
 let finishScan: (value: NativePlan) => void = () => {};
 vi.mocked(scanTab).mockImplementation(() => new Promise(resolve => { finishScan = resolve; }));
 const result = await handleSidebar({ type: 'sidebar-autofill', tabId }) as { run: { id: string } };
 await vi.waitFor(() => expect(scanTab).toHaveBeenCalledOnce());
 await handleSidebar({ type: 'sidebar-cancel', tabId, runId: result.run.id });
 finishScan(plan);
 await vi.waitFor(() => expect(sidebarBusy(tabId)).toBe(false));
 expect(world.__jaaScan).toBeUndefined(); expect(fillTab).not.toHaveBeenCalled();
});
