import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { checkAI, draftWithAI } from '../../lib/sidebar/ai';
import { makeRequest } from '../../lib/hackathon/contracts';
import { parseReply } from '../../lib/hackathon/contracts';
import { readFileSync } from 'node:fs';
const request = () => makeRequest({ application: 'test', questionKey: 'project', question: 'Describe a relevant project.', job: '', control: 'textarea' }, [{ id: 'fact', revision: 1, text: 'I built a CSV validator.', location: 'Synthetic test' }]);
let onMessage: (value: unknown) => void; let onDisconnect: () => void;
const port = { postMessage: vi.fn(), disconnect: vi.fn(), onMessage: { addListener: vi.fn((cb) => { onMessage = cb; }) }, onDisconnect: { addListener: vi.fn((cb) => { onDisconnect = cb; }) } };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(browser.runtime, 'connectNative').mockReturnValue(port as never); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
test('status validates the actual provider and correlates reply IDs', async () => {
  const pending = checkAI(); const message = port.postMessage.mock.calls[0]![0]; onMessage({ id: message.id, ok: true, data: { connected: true, provider: 'Claude Code', message: 'Connected' } }); expect(await pending).toEqual({ connected: true, provider: 'Claude Code', message: 'Connected' }); expect(port.disconnect).toHaveBeenCalledOnce();
});
test('missing helper gives a setup state rather than disabling ordinary fill', async () => {
  const pending = checkAI(); onDisconnect(); expect(await pending).toMatchObject({ connected: false });
});
test('reports the native connection failure while preserving setup guidance', async () => {
  vi.spyOn(browser.runtime, 'lastError', 'get').mockReturnValue({ message: 'Specified native messaging host not found.' });
  const pending = checkAI(); onDisconnect();
  expect(await pending).toMatchObject({ connected: false, message: expect.stringContaining('Specified native messaging host not found.') });
});
test('reports a bounded synchronous native API error instead of hiding it behind setup guidance', async () => {
  vi.mocked(browser.runtime.connectNative).mockImplementation(() => { throw Error(`Native API unavailable: ${'x'.repeat(800)}`); });
  const status = await checkAI();
  expect(status.connected).toBe(false);
  expect(status.message).toContain('AI connection could not start: Native API unavailable:');
  expect(status.message.length).toBeLessThan(600);
  expect(status.message).toContain('Your saved profile still works without AI.');
});
test('draft only returns bounded structured raw text, rejecting mismatched response', async () => {
  const pending = draftWithAI(request()); const failure = expect(pending).rejects.toThrow('Unexpected reply'); onMessage({ id: 'wrong-request', ok: true, data: { raw: '{}' } }); await failure;
});
test('cancellation disconnects native port and discards late replies', async () => {
  const controller = new AbortController(); const pending = draftWithAI(request(), controller.signal); const failure = expect(pending).rejects.toThrow('cancelled'); const message = port.postMessage.mock.calls[0]![0]; controller.abort(); onMessage({ id: message.id, ok: true, data: { raw: '{}' } }); await failure; expect(port.disconnect).toHaveBeenCalledOnce();
});
test('draft deadline disconnects helper', async () => {
  const pending = draftWithAI(request()); const failure = expect(pending).rejects.toThrow('too long'); await vi.advanceTimersByTimeAsync(75_000); await failure; expect(port.disconnect).toHaveBeenCalledOnce();
});
test('recorded real synthetic Codex output passes the application evidence contract', () => {
  const evidence = JSON.parse(readFileSync('native-host/smoke-result.json', 'utf8'));
  const answer = parseReply(JSON.stringify(evidence.reply), evidence.request, evidence.request.facts, evidence.request.expiresAt - 1);
  expect(evidence.provider).toBe('Codex'); expect(evidence.syntheticOnly).toBe(true); expect(evidence.noToolEvents).toBe(true);
  expect(answer.gaps).toEqual([]); expect(answer.approval).toBeNull(); expect(answer.segments[0]?.sources).toEqual([{ id: 'project', revision: 1 }]);
});
