import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { normalizeProfile } from '../../lib/profile';
import { saveProfile, writeHackathon } from '../../lib/storage';
import { scanNative, applyNative, consumeCommand } from '../../lib/hackathon/page';
import { scanTab } from '../../lib/hackathon/service';
import { handleSidebar, sidebarState, sidebarBusy, cancelForNavigation } from '../../lib/sidebar/workflow';
import { visibleAttentionFields } from '../../lib/sidebar/attention';

const env = { isRendered: () => true, assignFiles: () => {} };
const basics = '<label>First name<input></label><label>Email<input id="email"></label><label>Phone<input></label>';
const manual = '<div><span id="department-label">Department</span><button id="department" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-required="true" aria-labelledby="department-label">Choose...</button></div><div role="checkbox" aria-label="Application data consent" aria-checked="false" aria-required="true" tabindex="0"></div><div role="radiogroup" aria-label="Available schedule" aria-required="true"><div role="radio" aria-checked="false" tabindex="0">Morning</div><div role="radio" aria-checked="false" tabindex="-1">Evening</div></div>';
let tabId = 200;
let corruptManual = false;
beforeEach(async () => {
  tabId++; fakeBrowser.reset(); corruptManual = false;
  document.body.innerHTML = `<form id="application">${basics}${manual}</form>`;
  await saveProfile(normalizeProfile({ firstName: 'Ada', email: 'ada@example.com', phone: '555-0100' }));
  await writeHackathon('facts', []);
  vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: tabId, url: document.location.href } as never);
  vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async injection => {
    if (injection.func) { (injection.func as (...args: unknown[]) => unknown)(...('args' in injection ? injection.args ?? [] : [])); return []; }
    if ('files' in injection && injection.files?.[0] === '/scan.js') {
      const result = scanNative(document, env);
      if (corruptManual) (result as unknown as Record<string, unknown>).manualControls = [{ id: 'manual-0', form: 0, label: 'Injected', kind: 'text', required: true }];
      return [{ frameId: 0, documentId: 'application-document', result }] as never;
    }
    if ('files' in injection && injection.files?.[0] === '/fill.js') return [{ frameId: 0, documentId: 'application-document', result: applyNative(document, env, consumeCommand()!) }] as never;
    return [];
  });
});
afterEach(async () => { if (sidebarBusy(tabId)) await cancelForNavigation(tabId); vi.restoreAllMocks(); });

it('reports required ARIA-only controls for review while never operating them or submitting', async () => {
  const events = vi.fn(); const submit = vi.fn(event => event.preventDefault());
  document.querySelector('form')!.addEventListener('submit', submit);
  for (const el of document.querySelectorAll('[role]')) for (const event of ['click', 'input', 'change']) el.addEventListener(event, events);
  const plan = await scanTab(tabId);
  expect(plan.rows).toHaveLength(3); expect(plan.manualControls).toHaveLength(3);
  expect(plan.rows.every(row => row.action?.type === 'text')).toBe(true);
  await handleSidebar({ type: 'sidebar-autofill', tabId });
  await vi.waitFor(() => expect(sidebarBusy(tabId)).toBe(false));
  const run = (await sidebarState(tabId)).run!;
  expect(run.phase).toBe('review');
  expect(run.fields.filter(field => field.status === 'filled')).toHaveLength(3);
  expect(run.fields.filter(field => field.id.startsWith('manual:')).map(field => [field.label, field.status])).toEqual([
    ['Department', 'review'], ['Application data consent', 'review'], ['Available schedule', 'review'],
  ]);
  expect([...document.querySelectorAll('[aria-checked]')].map(el => el.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
  expect(events).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
});

it('does not let unsupported controls nominate another application or bypass scan validation', async () => {
  document.body.insertAdjacentHTML('beforeend', '<form><div role="checkbox" aria-label="Newsletter" aria-checked="false"></div></form>');
  const plan = await scanTab(tabId);
  expect(plan.manualControls?.map(control => control.label)).toEqual(['Department', 'Application data consent', 'Available schedule']);
  document.querySelector('#application')!.remove();
  expect((await scanTab(tabId)).manualControls).toEqual([]);
  document.body.innerHTML = `<form>${basics}${manual}</form>`;
  corruptManual = true;
  const rejected = await scanTab(tabId);
  expect(rejected.rows).toEqual([]); expect(rejected.manualControls).toEqual([]);
});

it('includes newly revealed manual controls and keeps their warnings despite an AI-label collision', async () => {
  document.body.innerHTML = `<form>${basics}<div id="conditional" hidden>${manual}</div></form>`;
  document.querySelector('#email')!.addEventListener('input', () => document.querySelector('#conditional')!.removeAttribute('hidden'));
  await handleSidebar({ type: 'sidebar-autofill', tabId });
  await vi.waitFor(() => expect(sidebarBusy(tabId)).toBe(false));
  const run = (await sidebarState(tabId)).run!;
  const fields = run.fields.filter(field => field.id.startsWith('manual:'));
  expect(fields).toHaveLength(3); expect(run.phase).toBe('review');
  expect(visibleAttentionFields(fields, [{ question: 'Department' }])).toEqual(fields);
});
