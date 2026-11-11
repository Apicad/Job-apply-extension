import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { decoder, encodeMessage, validateMessage, MAX_MESSAGE_BYTES } from '../../native-host/protocol.mjs';
import { capture, childEnvironment, draftArguments, codexArguments, codexAnswer } from '../../native-host/runner.mjs';
import { serve } from '../../native-host/host.mjs';
const request = () => ({ schema: 1, id: 'test-request', expiresAt: Date.now() + 60_000, context: { application: 'test-app', questionKey: 'question', question: 'Describe a relevant project.', job: '', control: 'textarea' }, facts: [{ id: 'fact', revision: 1, text: 'I wrote a CSV validator.', location: 'Synthetic project' }] });

test('framing handles split and coalesced messages', () => {
  const messages = []; const decode = decoder(value => messages.push(value)); const a = encodeMessage({ id: 'one', type: 'status' }); const b = encodeMessage({ id: 'two', type: 'status' });
  decode(a.subarray(0, 2)); decode(Buffer.concat([a.subarray(2), b])); assert.deepEqual(messages.map(m => m.id), ['one', 'two']);
});
test('framing rejects oversized and malformed payloads', () => {
  const large = Buffer.alloc(4); large.writeUInt32LE(MAX_MESSAGE_BYTES + 1); assert.throws(() => decoder(() => {})(large), /size/);
  assert.throws(() => decoder(() => {})(Buffer.from([1, 0, 0, 0, 123])), /JSON/);
});
test('draft validation rejects expiry, duplicate facts and command-like extra fields are dropped', () => {
  const r = request(); const valid = validateMessage({ type: 'draft', id: 'ok', request: r, executable: '/bin/sh' }); assert.equal(valid.executable, undefined);
  assert.throws(() => validateMessage({ type: 'draft', id: 'bad', request: { ...r, expiresAt: 1 } }), /Expired/);
  assert.throws(() => validateMessage({ type: 'draft', id: 'bad', request: { ...r, facts: [r.facts[0], r.facts[0]] } }), /facts/);
});
test('credentials and provider overrides are never inherited', () => {
  const env = childEnvironment({ HOME: '/home/test', PATH: '/usr/bin', ANTHROPIC_API_KEY: 'secret', OPENAI_API_KEY: 'secret', CLAUDE_CODE_USE_BEDROCK: '1', NODE_OPTIONS: '--require=evil.js', CLAUDE_CONFIG_DIR: '/other' });
  assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CODE_SAFE_MODE', 'HOME', 'PATH']);
});
test('draft invocation disables tools, MCP, customizations and persistence', () => {
  const args = draftArguments();
  for (const flag of ['--safe-mode', '--restricted', '--strict-mcp-config', '--no-session-persistence', '--no-chrome', '--disable-slash-commands']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--tools') + 1], ''); assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(args.includes('--dangerously-skip-permissions'), false); assert.equal(args.includes('--model'), false);
});
test('Codex uses saved ChatGPT auth, read-only isolated invocation and disabled tool hosts', () => {
  const args = codexArguments('/tmp/schema.json');
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--json']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  for (const key of ['shell_tool', 'code_mode_host', 'apps', 'plugins', 'multi_agent', 'browser_use', 'computer_use', 'view_image', 'hooks']) assert.ok(args.some((value, i) => value === '--disable' && args[i + 1] === key));
  assert.ok(args.includes('forced_login_method="chatgpt"')); assert.ok(args.includes('web_search="disabled"')); assert.ok(args.includes('orchestrator.mcp.enabled=false'));
});
test('Codex output requires a completed turn and rejects tool events and unexpected errors', () => {
  const message = { type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } };
  const complete = { type: 'turn.completed' };
  const encode = events => events.map(x => JSON.stringify(x)).join('\n');
  assert.equal(codexAnswer(encode([message, complete])), '{"ok":true}');
  assert.throws(() => codexAnswer(encode([message])), /did not complete/);
  assert.throws(() => codexAnswer(encode([{ type: 'item.started', item: { type: 'command_execution' } }, message, complete])), /unexpected operation/);
  assert.throws(() => codexAnswer(encode([{ type: 'item.completed', item: { type: 'error', message: 'unknown error' } }, message, complete])), /unexpected operation/);
});
test('process runner bounds output and timeout and supports cancellation', async () => {
  await assert.rejects(capture(process.execPath, ['-e', 'process.stdout.write("x".repeat(1000))'], { maxBytes: 10 }), /size limit/);
  await assert.rejects(capture(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 30 }), /too long/);
  const controller = new AbortController(); const pending = capture(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal }); controller.abort(); await assert.rejects(pending, /cancelled/);
});
test('host refuses callers outside installed origin and aborts on port disconnect', async () => {
  const origin = 'chrome-extension://' + 'a'.repeat(32) + '/'; const config = { origin, executable: '/usr/bin/claude' };
  await assert.rejects(serve({ origin: 'chrome-extension://' + 'b'.repeat(32) + '/', config }), /Unauthorized/);
  const input = new PassThrough(); const output = new PassThrough(); let receivedSignal;
  await serve({ input, output, origin, config, draft: async (_exe, _req, { signal }) => { receivedSignal = signal; await new Promise(resolve => signal.addEventListener('abort', resolve)); return '{}'; } });
  input.write(encodeMessage({ id: 'draft', type: 'draft', request: request() })); await new Promise(resolve => setImmediate(resolve)); input.end(); await new Promise(resolve => setImmediate(resolve)); assert.equal(receivedSignal.aborted, true);
});
test('host returns request-correlated status and rejects concurrent requests', async () => {
  const origin = 'chrome-extension://' + 'a'.repeat(32) + '/'; const input = new PassThrough(); const output = new PassThrough(); const messages = []; output.on('data', decoder(value => messages.push(value)));
  let finish; await serve({ input, output, origin, config: { origin, executable: '/usr/bin/claude' }, account: () => new Promise(resolve => { finish = resolve; }) });
  input.write(encodeMessage({ id: 'one', type: 'status' })); input.write(encodeMessage({ id: 'two', type: 'status' })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages[0].id, 'two'); assert.equal(messages[0].ok, false);
  finish({ connected: true, provider: 'Claude Code' }); await new Promise(resolve => setImmediate(resolve)); assert.equal(messages[1].id, 'one'); assert.equal(messages[1].ok, true); input.end();
});
