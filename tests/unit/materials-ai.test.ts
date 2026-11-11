import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { draftMaterialsWithAI } from '../../lib/sidebar/ai';
import type { MaterialsRequest } from '../../lib/materials/types';
import { parseMaterialsReply } from '../../lib/materials/reply';
import { readFileSync } from 'node:fs';

const request = (): MaterialsRequest => ({ schema: 1, kind: 'materials', id: 'materials-client', expiresAt: Date.now() + 60_000, sourceKey: 'a'.repeat(64),
  brief: { role: 'Junior developer', company: 'Fictional Tools', jobDescription: 'Work on Python validation tools.', careerDirection: '', tone: 'natural' },
  entries: [{ id: 'project', revision: 1, heading: 'CSV prototype', section: 'projects', lines: ['Contributed to a Python prototype.'] }],
  evidence: [{ id: 'project', revision: 1, location: 'Synthetic project', text: 'Contributed to a Python CSV validation prototype.' }] });
let onMessage: (value: unknown) => void;
const port = { postMessage: vi.fn(), disconnect: vi.fn(), onMessage: { addListener: vi.fn(cb => { onMessage = cb; }) }, onDisconnect: { addListener: vi.fn() } };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(browser.runtime,'connectNative').mockReturnValue(port as never); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function capable() {
  const status = port.postMessage.mock.calls.at(-1)![0];
  expect(status.type).toBe('status');
  onMessage({ id: status.id, ok: true, data: { connected: true, provider: 'Codex', message: 'Connected', capabilities: ['draft','materials'], helperVersion: 2 } });
  await vi.advanceTimersByTimeAsync(0);
  return port.postMessage.mock.calls.at(-1)![0];
}
test('materials requires the new helper capability before sending explicit reviewed data', async () => {
  const r = request(); const pending = draftMaterialsWithAI(r);
  const message = await capable();
  expect(message.type).toBe('materials'); expect(message.request).toEqual(r);
  onMessage({ id: message.id, ok: true, data: { raw: '{"kind":"materials"}' } });
  expect(await pending).toBe('{"kind":"materials"}');
  expect(port.disconnect).toHaveBeenCalledTimes(2);
});
test('old helper returns a clear update message and receives no materials payload', async () => {
  const pending = draftMaterialsWithAI(request()); const failure = expect(pending).rejects.toThrow('Update the local AI helper');
  const status = port.postMessage.mock.calls[0]![0];
  onMessage({ id: status.id, ok: true, data: { connected: true, provider: 'Codex', message: 'Connected' } });
  await failure; expect(port.postMessage).toHaveBeenCalledTimes(1);
});
test('role-only general resumes require the new helper capability before evidence is sent', async () => {
  const r = request(); r.brief.jobDescription = ''; r.brief.careerDirection = ''; r.brief.role = 'Data analyst';
  const pending = draftMaterialsWithAI(r); const failure = expect(pending).rejects.toThrow('Update the local AI helper');
  await capable(); await failure;
  expect(port.postMessage).toHaveBeenCalledTimes(1);
});
test('capability preflight cannot change the reviewed request snapshot', async () => {
  const r = request(); const pending = draftMaterialsWithAI(r); r.evidence[0]!.text = 'Changed after the request began.';
  const message = await capable(); expect(message.request.evidence[0].text).toContain('CSV validation prototype');
  onMessage({ id: message.id, ok: true, data: { raw: '{}' } }); await pending;
});
test('malformed, sensitive or expired input never connects to the helper', async () => {
  for (const r of [{ ...request(), sourceKey: 'bad' }, { ...request(), expiresAt: 1 }, { ...request(), evidence: [{ id: 'project', revision: 1, location: 'Synthetic', text: 'My email is person@example.com.' }] }]) {
    await expect(draftMaterialsWithAI(r)).rejects.toThrow(/Invalid|expired/);
  }
  expect(browser.runtime.connectNative).not.toHaveBeenCalled();
});
test('abort before or during materials discards replies and disconnects the active port', async () => {
  const stopped = new AbortController(); stopped.abort();
  await expect(draftMaterialsWithAI(request(),stopped.signal)).rejects.toThrow('cancelled');
  expect(browser.runtime.connectNative).not.toHaveBeenCalled();
  const controller = new AbortController(); const pending = draftMaterialsWithAI(request(),controller.signal); const failure = expect(pending).rejects.toThrow('cancelled');
  const message = await capable(); controller.abort();
  onMessage({ id: message.id, ok: true, data: { raw: '{}' } });
  await failure; expect(port.disconnect).toHaveBeenCalledTimes(2);
});
test('materials timeout preserves saved information and never falls back to another provider', async () => {
  const pending = draftMaterialsWithAI(request()); const failure = expect(pending).rejects.toThrow('saved profile');
  await capable(); await vi.advanceTimersByTimeAsync(75_000); await failure;
  expect(browser.runtime.connectNative).toHaveBeenCalledTimes(2);
});
test.each([{ raw: 'x'.repeat(100_001) }, { raw: 'not JSON' }, { raw: '[]' }, { raw: 42 }])('rejects an invalid raw materials payload', async data => {
  const pending = draftMaterialsWithAI(request()); const failure = expect(pending).rejects.toThrow('invalid materials');
  const message = await capable(); onMessage({ id: message.id, ok: true, data }); await failure;
});
test('recorded live synthetic Codex materials pass the evidence contract without tools or stronger claims', () => {
  const evidence = JSON.parse(readFileSync('native-host/materials-smoke-result.json','utf8'));
  const reply = parseMaterialsReply(JSON.stringify(evidence.reply),evidence.request,evidence.request.expiresAt - 1);
  expect(evidence).toMatchObject({ provider: 'Codex', syntheticOnly: true, noToolEvents: true, installedHelperChanged: false });
  expect(reply.entries[0]?.entryId).toBe('prototype');
  expect(reply.entries[0]?.bullets[0]?.text).toContain('prototype');
  expect(reply.entries[0]?.bullets.some(segment => segment.text.includes('not been deployed to production'))).toBe(true);
  expect(reply.summary.some(segment => segment.text.includes('no degree has been awarded'))).toBe(true);
  const wording = [...reply.summary,...reply.coverLetter,...reply.entries.flatMap(entry => entry.bullets)].map(segment => segment.text).join(' ');
  expect(wording).not.toContain('Kubernetes');
  expect(reply.missing.some(item => item.includes('Kubernetes'))).toBe(true);
  expect(reply.missing.some(item => /contact|review|header|links/i.test(item))).toBe(false);
});
