import { describe, it, expect } from 'vitest';
import { approve, editAnswer, makeRequest, parseReply, reusableDraft, currentApproval, factsCurrent } from '../../lib/hackathon/contracts';
import { DEMO_FACTS } from '../../lib/hackathon/demo';
const context = { questionKey: 'synthetic-question-1', application: 'https://example.test/job/1', question: 'Describe a relevant project.', job: 'Sample developer role', control: 'textarea' as const };
const request = () => makeRequest(context, DEMO_FACTS, 100);
const reply = (r = request()) => JSON.stringify({ schema: 1, requestId: r.id, context: r.context, facts: r.facts.map(({ id, revision }) => ({ id, revision })), segments: [{ text: DEMO_FACTS[0]!.text, sources: [{ id: DEMO_FACTS[0]!.id, revision: 1 }] }], missing: [] });
describe('evidence and approval contracts', () => {
 it('derives text only from validated segments and binds exact approval', () => {
  const r = request(); const a = parseReply(reply(r), r, DEMO_FACTS, 101);
  expect(a.text).toBe(DEMO_FACTS[0]!.text); expect(currentApproval(a, context, DEMO_FACTS)).toBe(false);
  const approved = approve(a, context, DEMO_FACTS, true, 102);
  expect(currentApproval(approved, context, DEMO_FACTS)).toBe(true);
  expect(currentApproval({ ...approved, text: 'Other text' }, context, DEMO_FACTS)).toBe(false);
  const edited = editAnswer(approved, 'My corrected project.');
  expect(edited.approval).toBeNull(); expect(edited.segments).toEqual([]); expect(edited.trace).toEqual(a.trace);
 });
 it.each(['invented', 'stale', 'job', 'identity', 'late', 'oversized', 'malformed'])('rejects %s response', (kind) => {
  const r = request(); const data = JSON.parse(reply(r)); let now = 101;
  if (kind === 'invented' || kind === 'job') data.segments[0].sources[0].id = kind;
  if (kind === 'stale') data.segments[0].sources[0].revision = 2;
  if (kind === 'identity') data.context.application = 'another';
  if (kind === 'late') now = r.expiresAt + 1;
  if (kind === 'oversized') data.segments[0].text = 'a'.repeat(9000);
  expect(() => parseReply(kind === 'malformed' ? '{' : JSON.stringify(data), r, DEMO_FACTS, now)).toThrow();
 });
 it('blocks missing support and unsupported numbers, even with a valid citation', () => {
  const r = request(); const data = JSON.parse(reply(r)); data.segments[0].text = 'I increased revenue by 90%.';
  const a = parseReply(JSON.stringify(data), r, DEMO_FACTS, 101);
  expect(a.gaps.join(' ')).toMatch(/90/); expect(() => approve(a, context, DEMO_FACTS, true)).toThrow();
  data.segments[0].sources = []; expect(parseReply(JSON.stringify(data), r, DEMO_FACTS, 101).gaps.length).toBeGreaterThan(0);
 });
 it('requires explicit review; context and source changes revoke approval', () => {
  const r = request(); const a = parseReply(reply(r), r, DEMO_FACTS, 101);
  expect(() => approve(a, context, DEMO_FACTS, false)).toThrow();
  const approved = approve(a, context, DEMO_FACTS, true);
  expect(currentApproval(approved, { ...context, question: 'New question' }, DEMO_FACTS)).toBe(false);
  expect(factsCurrent(a.facts, [])).toBe(false);
  expect(currentApproval(approved, context, DEMO_FACTS.map(f => ({ ...f, revision: 2 })))).toBe(false);
 });
 it('requires scope selection and fresh review on reuse', () => {
  const r = request(); const a = approve(parseReply(reply(r), r, DEMO_FACTS, 101), context, DEMO_FACTS, true);
  const other = { ...context, application: 'https://example.test/job/2' };
  expect(() => reusableDraft(a, other, DEMO_FACTS)).toThrow();
  const draft = reusableDraft({ ...a, scope: 'factual' }, other, DEMO_FACTS);
  expect(draft.approval).toBeNull(); expect(currentApproval(draft, other, DEMO_FACTS)).toBe(false);
 });
});

it('canonical identity survives storage key reordering and rejects unsupported job technology', () => {
 const r = makeRequest({...context, job: 'The job requires Rust.'}, DEMO_FACTS, 100);
 const response = JSON.parse(reply(r)); response.context = { questionKey: r.context.questionKey, control: r.context.control, job: r.context.job, question: r.context.question, application: r.context.application };
 response.facts = response.facts.map((f:any)=>({revision:f.revision,id:f.id}));
 response.segments[0].text = 'I used Rust to build the dashboard.';
 expect(parseReply(JSON.stringify(response),r,DEMO_FACTS,101).gaps.join(' ')).toMatch(/Rust/);
});
