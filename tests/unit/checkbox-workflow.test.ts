import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { normalizeProfile } from '../../lib/profile';
import { saveProfile, writeHackathon } from '../../lib/storage';
import { scanNative, applyNative, consumeCommand } from '../../lib/hackathon/page';
import { scanTab } from '../../lib/hackathon/service';
import { handleSidebar, sidebarState, sidebarBusy, cancelForNavigation } from '../../lib/sidebar/workflow';

const env = { isRendered: () => true, assignFiles: () => {} };
let tabId = 80;
let corruptGroups = false;
beforeEach(async () => {
  tabId++; fakeBrowser.reset(); corruptGroups = false;
  document.body.innerHTML = '<form><label>First name<input></label><label>Email<input id="email"></label><label>Phone<input></label><fieldset><legend>Locations</legend><label><input type="checkbox">North</label><label><input type="checkbox" checked>South</label></fieldset><fieldset id="conditional" hidden><legend>Conditional choices</legend><label><input type="checkbox">Future</label></fieldset></form>';
  await saveProfile(normalizeProfile({ firstName: 'Ada', email: 'ada@example.com', phone: '555-0100' }));
  await writeHackathon('facts', []);
  vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: tabId, url: document.location.href } as never);
  vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async injection => {
    if (injection.func) { (injection.func as (...args: unknown[]) => unknown)(...('args' in injection ? injection.args ?? [] : [])); return []; }
    if ('files' in injection && injection.files?.[0] === '/scan.js') {
      const result = scanNative(document, env);
      if (corruptGroups) (result as unknown as Record<string, unknown>).checkboxGroups = [{ ...result.checkboxGroups![0], checkedCount: 'false' }];
      return [{ frameId: 0, documentId: 'application-document', result }] as never;
    }
    if ('files' in injection && injection.files?.[0] === '/fill.js') {
      return [{ frameId: 0, documentId: 'application-document', result: applyNative(document, env, consumeCommand()!) }] as never;
    }
    return [];
  });
});
afterEach(async () => { if (sidebarBusy(tabId)) await cancelForNavigation(tabId); vi.restoreAllMocks(); });

it('validates checkbox observations at the scan boundary before storing a scoped plan', async () => {
  const plan = await scanTab(tabId);
  expect(plan.checkboxGroups).toEqual([{ id: 'checkbox-0', form: 0, label: 'Locations', required: false, optionCount: 2, checkedCount: 1, documentId: 'application-document' }]);
  expect(plan.rows.some(row => row.field.descriptor.inputType === 'checkbox')).toBe(false);
  corruptGroups = true;
  const rejected = await scanTab(tabId);
  expect(rejected.rows).toEqual([]); expect(rejected.checkboxGroups).toEqual([]);
});

it('refreshes newly visible groups after basic fill, persists manual review, and never emits checkbox events', async () => {
  document.querySelector('#email')!.addEventListener('input', () => document.querySelector('#conditional')!.removeAttribute('hidden'));
  const checkboxEvents = vi.fn();
  for (const input of document.querySelectorAll('[type="checkbox"]')) for (const event of ['click', 'input', 'change']) input.addEventListener(event, checkboxEvents);
  await handleSidebar({ type: 'sidebar-autofill', tabId });
  await vi.waitFor(() => expect(sidebarBusy(tabId)).toBe(false));
  const run = (await sidebarState(tabId)).run!;
  expect(run.phase).toBe('review');
  expect(run.fields.filter(field => field.status === 'filled')).toHaveLength(3);
  expect(run.fields.filter(field => field.id.startsWith('checkbox:')).map(field => [field.label, field.status])).toEqual([['Locations', 'review'], ['Conditional choices', 'review']]);
  expect([...document.querySelectorAll<HTMLInputElement>('[type="checkbox"]')].map(input => input.checked)).toEqual([false, true, false]);
  expect(checkboxEvents).not.toHaveBeenCalled();
  expect((await sidebarState(tabId)).run).toEqual(run);
});
