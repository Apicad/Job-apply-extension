import { browser } from 'wxt/browser';
import { readHackathon, writeHackathon } from '../storage';
import { allowedQuestion, approve, bounded, editAnswer, isFact, key, makeRequest, parseReply, promptFor } from './contracts';
import type { Answer, Context, Fact, Request } from './contracts';
import type { NativePlan, Row } from './engine';
export interface AnswerSession { planId: string; rowKey: string; context: Context; request: Request | null; sent: boolean; answer: Answer | null; savedId?: string }
export const rowKey = (row: Row): string => `${row.documentId}:${row.field.ref}`;
export function supportedQuestion(row: Row): boolean {
 const d = row.field.descriptor;
 return d.control === 'textarea' && row.field.empty && allowedQuestion(d.label) && !/signature|certif|attest|acknowledg|declar|consent|sponsor|visa|disabil|gender|race|salary|citizen|password|social.security/i.test([d.name, d.id, d.groupLabel, d.hints].join(' '));
}
export async function loadFacts(): Promise<Fact[]> {
 const facts = await readHackathon<unknown>('facts');
 if (facts === null) return [];
 if (!Array.isArray(facts) || facts.length > 100 || !facts.every(isFact) || new Set(facts.map(f => f.id)).size !== facts.length) throw Error('Saved facts are malformed; existing data was preserved.');
 return facts;
}
export const sessionKey = (tabId: number) => `answer:${tabId}`;
export async function getSession(tabId: number): Promise<AnswerSession> {
 const session = await readHackathon<AnswerSession>(sessionKey(tabId), true);
 if (!session) throw Error('Select a question and preview a request first.'); return session;
}
export async function invalidatePlan(tabId: number): Promise<void> {
 const plan = await readHackathon<NativePlan>(`plan:${tabId}`, true);
 if (plan?.answerBinding) { plan.state = 'finished'; await writeHackathon(`plan:${tabId}`, plan, true); }
}
export async function answerCommand(message: Record<string, unknown>, plan: NativePlan): Promise<unknown> {
 const tabId = plan.tabId; const facts = await loadFacts();
 if (message.type === 'state') return { facts, session: await readHackathon<AnswerSession>(sessionKey(tabId), true), plan };
 if (message.type === 'request') {
  const row = plan.rows.find(r => rowKey(r) === message.rowKey);
  if (!row || !supportedQuestion(row) || plan.id !== message.planId) throw Error('Select a current, empty supported question.');
  if (typeof message.job !== 'string' || message.job.length > 4000 || !Array.isArray(message.factIds) || message.factIds.length > 20 || !message.factIds.every(id => typeof id === 'string')) throw Error('Invalid selected facts or reviewed job context.');
  const selected = message.factIds.map(id => facts.find(f => f.id === id)); if (selected.some(f => !f)) throw Error('Selected fact no longer exists.');
  // Opaque application identity avoids transmitting URLs, query tokens or contacts to AI.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plan.url));
  const application = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const context: Context = { application, question: row.field.descriptor.label, job: message.job, control: 'textarea' };
  const request = makeRequest(context, selected as Fact[]);
  await invalidatePlan(tabId);
  const session: AnswerSession = { planId: plan.id, rowKey: rowKey(row), context, request, sent: false, answer: null };
  await writeHackathon(sessionKey(tabId), session, true);
  return { session, prompt: promptFor(request) };
 }
 if (message.type === 'fact-edit') {
  const fact = facts.find(f => f.id === message.id);
  if (!fact || !bounded(message.text, 2000)) throw Error('Invalid saved fact.');
  const updated = facts.map(f => f.id === fact.id ? { ...f, revision: f.revision + 1, text: message.text as string } : f);
  await writeHackathon('facts', updated); await invalidatePlan(tabId); return { facts: updated };
 }
 const session = await getSession(tabId);
 if ((await browser.tabs.get(tabId)).url !== plan.url || session.planId !== plan.id) throw Error('Application was rescanned or changed. Select the question again.');
 if (message.type === 'send') {
  if (!session.request || session.sent || Date.now() > session.request.expiresAt) throw Error('Request cancelled, expired or already copied. Preview a new request.');
  session.sent = true; await writeHackathon(sessionKey(tabId), session, true); return { prompt: promptFor(session.request), session };
 }
 if (message.type === 'cancel') { session.request = null; session.sent = false; await writeHackathon(sessionKey(tabId), session, true); return { session }; }
 if (message.type === 'response') {
  if (!session.request || !session.sent || typeof message.raw !== 'string') throw Error('Preview and explicitly copy the request before accepting a response.');
  const answer = parseReply(message.raw, session.request, facts);
  session.answer = answer; session.request = null; session.sent = false;
  await writeHackathon(sessionKey(tabId), session, true); return { session };
 }
 if (!session.answer) throw Error('Generate or open an answer first.');
 if (message.type === 'edit' || message.type === 'invalidate') {
  await invalidatePlan(tabId);
  session.answer = editAnswer(session.answer, message.type === 'invalidate' ? session.answer.text : String(message.text ?? ''));
 } else if (message.type === 'approve') {
  if (message.revision !== session.answer.revision || message.text !== session.answer.text) throw Error('Answer changed. Review the current revision.');
  session.answer = approve(session.answer, session.context, facts, message.reviewed === true);
 } else throw Error('Unsupported answer command.');
 await writeHackathon(sessionKey(tabId), session, true); return { session };
}
