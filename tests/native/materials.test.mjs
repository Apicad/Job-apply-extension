import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { decoder, encodeMessage, validateMessage, materialsPrompt, materialsResponseSchema, MAX_MATERIALS_REPLY_BYTES, RESPONSE_SCHEMA } from '../../native-host/protocol.mjs';
import { generate, draftArguments, codexAnswer } from '../../native-host/runner.mjs';
import { serve } from '../../native-host/host.mjs';

const request = () => ({ schema: 1, kind: 'materials', id: 'synthetic-materials', expiresAt: Date.now() + 60_000, sourceKey: 'a'.repeat(64),
  brief: { role: 'Junior developer', company: 'Fictional Tools', jobDescription: 'Develop Python validation tools.', careerDirection: 'Interested in implementation work.', tone: 'natural' },
  entries: [{ id: 'project', revision: 2, heading: 'Example CSV project', section: 'projects', lines: ['Built a Python CSV validation prototype.'] }],
  evidence: [{ id: 'project', revision: 2, location: 'Synthetic project', text: 'I contributed a Python CSV validation prototype; it was a personal project.' }] });
const reply = r => ({ schema: 1, kind: 'materials', requestId: r.id, sourceKey: r.sourceKey, expiresAt: r.expiresAt,
  summary: [], entries: [{ entryId: 'project', bullets: [{ text: 'Contributed a Python CSV validation prototype.', sources: [{ id: 'project', revision: 2 }] }] }],
  coverLetter: [{ text: 'I contributed a Python CSV validation prototype.', sources: [{ id: 'project', revision: 2 }] }], missing: [] });

test('materials validates an isolated request and rejects malformed, stale and command-bearing input', () => {
  const r = request();
  assert.deepEqual(validateMessage({ id: 'native-id', type: 'materials', request: r }).request, r);
  for (const bad of [
    { ...r, kind: 'draft' }, { ...r, expiresAt: 1 }, { ...r, sourceKey: 'not-a-digest' },
    { ...r, brief: { ...r.brief, command: 'run a shell' } }, { ...r, brief: { ...r.brief, jobDescription: '', careerDirection: '' } },
    { ...r, brief: { ...r.brief, tone: 'aggressive' } }, { ...r, brief: { ...r.brief, jobDescription: 'x'.repeat(20_001) } },
    { ...r, entries: [r.entries[0], r.entries[0]] }, { ...r, entries: [{ ...r.entries[0], section: 'employment' }] },
    { ...r, entries: [{ ...r.entries[0], lines: Array(41).fill('text') }] },
    { ...r, entries: [{ ...r.entries[0], executable: '/bin/sh' }] },
    { ...r, evidence: [r.evidence[0], r.evidence[0]] }, { ...r, evidence: [{ ...r.evidence[0], revision: 0 }] },
    { ...r, executable: '/bin/sh' },
  ]) assert.throws(() => validateMessage({ id: 'native-id', type: 'materials', request: bad }), /materials|facts|Expired/i);
});

test('materials schema fixes identity, entry IDs and exact source revisions without changing draft flags', () => {
  const r = request(); const schema = materialsResponseSchema(r);
  assert.equal(schema.properties.requestId.const, r.id);
  assert.equal(schema.properties.sourceKey.const, r.sourceKey);
  assert.equal(schema.properties.expiresAt.const, r.expiresAt);
  assert.equal(schema.additionalProperties, false);
  const serialized = JSON.stringify(schema);
  assert.ok(serialized.includes('"const":"project"'));
  assert.ok(serialized.includes('"const":2'));
  assert.equal(serialized.includes('uniqueItems'), false); // Unsupported by Codex strict structured output.
  const args = draftArguments(schema);
  assert.deepEqual(JSON.parse(args[args.indexOf('--json-schema') + 1]), schema);
  for (const flag of ['--safe-mode','--restricted','--strict-mcp-config','--no-session-persistence','--no-chrome']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--tools') + 1], '');
});
test('materials blocks explicit personal answers while allowing ordinary technical terms', () => {
  for (const text of ['My email is person@example.com.', 'Phone: 555-555-0100', 'Citizenship: Canada', 'I require visa sponsorship.']) {
    const r = request(); r.evidence[0].text = text;
    assert.throws(() => validateMessage({ id: 'native', type: 'materials', request: r }), /facts/);
  }
  const r = request(); r.evidence[0].text = 'Investigated race conditions in a citizen science project with a gender-neutral interface.';
  assert.doesNotThrow(() => validateMessage({ id: 'native', type: 'materials', request: r }));
});

test('materials prompt treats career direction and the posting as intent, retains scope, and prohibits tools', () => {
  const prompt = materialsPrompt(request());
  for (const term of ['untrusted','not applicant','prototype','contributor','education','tools','entry']) assert.ok(prompt.toLowerCase().includes(term), term);
  assert.ok(prompt.includes('Fictional Tools'));
  assert.ok(prompt.includes('synthetic-materials'));
  assert.ok(prompt.includes('Names, contact details, document headers and links are assembled locally by the app.'));
  assert.ok(prompt.includes('Do not report their absence or routine review instructions as missing qualifications'));
  assert.ok(prompt.includes('zero-based statement indexes'));
  assert.ok(prompt.includes('"statement":0'));
});

test('materials citations bind statement indexes to their own saved fact without broadening answer schemas', () => {
  const r = request();
  r.evidence[0].text = 'Project heading\nBuilt a Python prototype.\n\nDocumented edge cases.';
  r.evidence.push({ id: 'other-employer', revision: 9, location: 'Other employer', text: 'Built a production dashboard.' });
  const schema = materialsResponseSchema(r);
  const entrySources = schema.properties.entries.items.anyOf[0].properties.bullets.items.properties.sources;
  assert.equal(entrySources.items.anyOf.length, 1);
  const source = entrySources.items.anyOf[0];
  assert.equal(source.properties.id.const, 'project');
  assert.deepEqual(source.properties.statement.enum, [0, 1, 3]);
  assert.deepEqual(source.required, ['id', 'revision', 'statement']);
  assert.equal(source.additionalProperties, false);
  assert.equal(schema.properties.summary.items.properties.sources.items.anyOf.length, 2);
  assert.ok(materialsPrompt(r).includes('"statement":3,"text":"Documented edge cases."'));
  assert.deepEqual(Object.keys(RESPONSE_SCHEMA.properties.segments.items.properties.sources.items.properties).sort(), ['id', 'revision']);
});

test('new materials reply envelope is bounded independently of unchanged draft limits', () => {
  assert.throws(() => encodeMessage({ raw: 'x'.repeat(110_000) }), /large/);
  assert.ok(encodeMessage({ raw: 'x'.repeat(110_000) }, MAX_MATERIALS_REPLY_BYTES).length > 110_000);
  assert.throws(() => encodeMessage({ raw: 'x'.repeat(MAX_MATERIALS_REPLY_BYTES) }, MAX_MATERIALS_REPLY_BYTES), /large/);
  const events = text => [{ type: 'item.completed', item: { type: 'agent_message', text } }, { type: 'turn.completed' }].map(x => JSON.stringify(x)).join('\n');
  assert.throws(() => codexAnswer(events('x'.repeat(30_001))), /invalid/);
  assert.equal(codexAnswer(events('x'.repeat(40_000)), 100_000).length, 40_000);
  assert.throws(() => codexAnswer(events('x'.repeat(100_001)), 100_000), /invalid/);
});

test('host advertises materials and routes it under the same origin and cancellation controls', async () => {
  const origin = 'chrome-extension://' + 'a'.repeat(32) + '/';
  const input = new PassThrough(); const output = new PassThrough(); const messages = [];
  output.on('data', decoder(value => messages.push(value)));
  let seen;
  await serve({ input, output, origin, config: { origin, executable: '/usr/bin/codex', provider: 'codex' },
    account: async () => ({ connected: true, provider: 'Codex', message: 'Connected' }),
    draft: async (_exe, r, options) => { seen = { r, options }; return JSON.stringify(reply(r)); } });
  input.write(encodeMessage({ id: 'status', type: 'status' })); await new Promise(resolve => setImmediate(resolve));
  assert.ok(messages[0].data.capabilities.includes('materials'));
  input.write(encodeMessage({ id: 'materials', type: 'materials', request: request() })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(seen.r.kind, 'materials'); assert.equal(seen.options.provider, 'codex');
  assert.equal(messages[1].id, 'materials'); assert.equal(messages[1].ok, true);
  input.end(); await new Promise(resolve => setImmediate(resolve)); assert.equal(seen.options.signal.aborted, true);
});

test('materials generation uses the existing Codex auth and no-tools arguments with a request-bound schema', async () => {
  const r = request(); const calls = []; let schema;
  const spawnProcess = (executable, args, options) => {
    calls.push({ executable, args, options });
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
    let input = ''; child.stdin.on('data', chunk => { input += chunk; });
    child.stdin.on('finish', async () => {
      if (args[0] === 'login') child.stderr.end('Logged in using ChatGPT');
      else {
        schema = JSON.parse(await readFile(args[args.indexOf('--output-schema') + 1], 'utf8'));
        assert.ok(input.includes('"kind":"materials"'));
        child.stdout.end([{ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(reply(r)) } }, { type: 'turn.completed' }].map(x => JSON.stringify(x)).join('\n'));
      }
      setImmediate(() => child.emit('close', 0));
    });
    return child;
  };
  assert.deepEqual(JSON.parse(await generate('/synthetic/codex', r, { provider: 'codex', spawnProcess })), reply(r));
  assert.equal(calls.length, 2); assert.deepEqual(calls[0].args, ['login','status']);
  const args = calls[1].args;
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(args.includes('forced_login_method="chatgpt"')); assert.ok(args.includes('web_search="disabled"'));
  assert.ok(args.some((value, i) => value === '--disable' && args[i+1] === 'code_mode_host'));
  assert.equal(schema.properties.sourceKey.const, r.sourceKey);
});
