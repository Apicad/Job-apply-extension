import { assertLiveRow } from './live';
import { readLibrary, saveAnswer, deleteAnswer, libraryState } from './library';
import { currentApproval, reusableDraft, resolveMissing, answerGaps, sameAnswerTarget } from './contracts';
import { fieldSignature } from './engine';
import { browser } from 'wxt/browser';
import { readHackathon, writeHackathon } from '../storage';
import { allowedQuestion, approve, bounded, editAnswer, isFact, key, makeRequest, parseReply, promptFor } from './contracts';
import type { Answer, Context, Fact, Request } from './contracts';
import type { NativePlan, Row } from './engine';
export interface AnswerSession { planId: string; rowKey: string; context: Context; request: Request | null; sent: boolean; answer: Answer | null; savedId?: string; savedRevision?: number }
export const rowKey = (row: Row): string => `${row.documentId}:${row.field.ref}`;
export function supportedQuestion(row: Row): boolean {
 const d = row.field.descriptor;
 return d.control === 'textarea' && row.field.empty && allowedQuestion(d.label) && !/signature|certif|attest|acknowledg|declar|consent|sponsor|visa|disabil|gender|race|salary|citizen|password|social.security/i.test([d.name, d.id, d.groupLabel, d.hints, d.placeholder].join(' '));
}
export async function loadFacts(): Promise<Fact[]> {
 const facts = await readHackathon<unknown>('facts');
 if (facts === null) return [];
 if (!Array.isArray(facts) || facts.length > 100 || !facts.every(isFact) || new Set(facts.map(f => f.id)).size !== facts.length) throw Error('Saved facts are malformed; existing data was preserved.');
 return facts;
}
export const libraryStore = { read: () => readHackathon<unknown>('library'), write: (value: unknown) => writeHackathon('library', value) };
export const sessionKey = (tabId: number) => `answer:${tabId}`;
function matchesSavedApproval(saved: Answer | undefined, session: AnswerSession, facts: Fact[]): boolean {
 const answer = session.answer;
 return !!saved && !!answer && saved.id === answer.id && session.savedId === saved.id && session.savedRevision === saved.revision && saved.revision === answer.revision && saved.text === answer.text && key(saved.approval) === key(answer.approval) && currentApproval(saved, session.context, facts) && currentApproval(answer, session.context, facts);
}
export async function getSession(tabId: number): Promise<AnswerSession> {
 const session = await readHackathon<AnswerSession>(sessionKey(tabId), true);
 if (!session) throw Error('Select a question and preview a request first.'); return session;
}
export async function invalidatePlan(tabId: number): Promise<void> {
 const plan = await readHackathon<NativePlan>(`plan:${tabId}`, true);
 if (plan?.answerBinding && plan.state === 'preview') { plan.state = 'invalidated'; delete plan.answerBinding; for (const row of plan.rows) if (row.action?.type === 'answer') { row.action = null; row.status = 'Review required'; } await writeHackathon(`plan:${tabId}`, plan, true); }
}
export async function answerCommand(message: Record<string, unknown>, plan: NativePlan): Promise<unknown> {
 const tabId = plan.tabId; const facts = await loadFacts();
 if (message.type === 'state') {
  const session = await readHackathon<AnswerSession>(sessionKey(tabId), true);
  if (session?.answer) { session.answer.gaps = answerGaps(session.answer); if (!currentApproval(session.answer, session.context, facts)) session.answer.approval = null; await writeHackathon(sessionKey(tabId), session, true); }
  return { ...await libraryState(libraryStore), facts, session, plan };
 }
 if (message.type === 'context-reset') { await invalidatePlan(tabId); await writeHackathon(sessionKey(tabId), null, true); return { reset: true }; }
 if (message.type === 'request') {
  const row = plan.rows.find(r => rowKey(r) === message.rowKey);
  if (!row || !supportedQuestion(row) || plan.id !== message.planId) throw Error('Select a current, empty supported question.');
  if (typeof message.job !== 'string' || message.job.length > 4000 || !Array.isArray(message.factIds) || message.factIds.length > 20 || !message.factIds.every(id => typeof id === 'string')) throw Error('Invalid selected facts or reviewed job context.');
  await assertLiveRow(plan, row);
  const selected = message.factIds.map(id => facts.find(f => f.id === id)); if (selected.some(f => !f)) throw Error('Selected fact no longer exists.');
  // Opaque application identity avoids transmitting URLs, query tokens or contacts to AI.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key([plan.url, row.job])));
  const application = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const questionDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fieldSignature(row.field.descriptor, row.field.form, row.field.maxLength)));
  const questionKey = Array.from(new Uint8Array(questionDigest), b => b.toString(16).padStart(2, '0')).join('');
  const context: Context = { application, questionKey, question: row.field.descriptor.label, job: message.job, control: 'textarea' };
  const request = makeRequest(context, selected as Fact[]);
  await invalidatePlan(tabId);
  const session: AnswerSession = { planId: plan.id, rowKey: rowKey(row), context, request, sent: false, answer: null };
  await writeHackathon(sessionKey(tabId), session, true);
  return { session, prompt: promptFor(request) };
 }
 if (message.type === 'fact-edit') {
  const fact = facts.find(f => f.id === message.id);
  if (!fact || fact.revision !== message.revision || !bounded(message.text, 2000)) throw Error('Saved fact changed or input is invalid. Reopen the current revision.');
  const updated = facts.map(f => f.id === fact.id ? { ...f, revision: f.revision + 1, text: message.text as string } : f);
  await writeHackathon('facts', updated); await invalidatePlan(tabId); return { facts: updated };
 }
 if (message.type === 'delete') { if (typeof message.id !== 'string') throw Error('Invalid answer ID.'); await deleteAnswer(libraryStore, message.id); await invalidatePlan(tabId); return { deleted: true }; }
 const session = await getSession(tabId);
 if ((await browser.tabs.get(tabId)).url !== plan.url || session.planId !== plan.id) throw Error('Application was rescanned or changed. Select the question again.');
 if (!['cancel', 'edit', 'invalidate'].includes(message.type as string)) { const row = plan.rows.find(r => rowKey(r) === session.rowKey); if (!row) throw Error('Question changed.'); await assertLiveRow(plan, row); }
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
 if (message.type === 'reuse') {
  const saved = (await readLibrary(libraryStore)).find(a => a.id === message.id);
  if (!saved) throw Error('Saved answer was deleted.');
  await invalidatePlan(tabId); session.answer = reusableDraft(saved, session.context, facts); session.savedId = sameAnswerTarget(saved.context, session.context) ? saved.id : undefined; session.savedRevision = session.savedId ? saved.revision : undefined; session.request = null; session.sent = false;
  await writeHackathon(sessionKey(tabId), session, true); return { session };
 }
 if (!session.answer) throw Error('Generate or open an answer first.');
 if (['save','edit','invalidate','approve','resolve-missing'].includes(String(message.type)) && (message.answerId !== session.answer.id || message.answerRevision !== session.answer.revision)) throw Error('Answer changed in another editor. Reopen its current revision.');
 if (message.type === 'save') {
  const saved = await saveAnswer(libraryStore, session.answer, facts, message.scope, session.savedId, session.savedRevision);
  session.answer = saved; session.savedId = saved.id; session.savedRevision = saved.revision; await invalidatePlan(tabId);
 } else if (message.type === 'answer-preview') {
  if (plan.state !== 'preview') throw Error('This plan was used or invalidated. Scan again before previewing an answer; prior outcomes are preserved.');
  const saved = (await readLibrary(libraryStore)).find(a => a.id === session.savedId);
  if (!saved || !matchesSavedApproval(saved, session, facts)) throw Error('Save this exact approved revision before previewing. Deleted or stale answers cannot fill.');
  const row = plan.rows.find(r => rowKey(r) === session.rowKey);
  if (!row || !supportedQuestion(row) || (row.field.maxLength >= 0 && saved.text.length > row.field.maxLength)) throw Error('Question is unavailable or answer exceeds its length limit.');
  for (const other of plan.rows) if (other.action?.type === 'answer') { other.action = null; other.status = 'Manual / unsupported'; }
  plan.id = crypto.randomUUID(); plan.state = 'preview'; plan.outcomes = undefined;
  plan.answerBinding = { id: session.answer.id, revision: session.answer.revision, savedId: saved.id };
  row.action = { ref: row.field.ref, type: 'answer', value: saved.text, signature: fieldSignature(row.field.descriptor, row.field.form, row.field.maxLength) }; row.status = 'Approved saved answer';
  session.planId = plan.id; await writeHackathon(`plan:${tabId}`, plan, true);
  await writeHackathon(sessionKey(tabId), session, true); return { session, plan };
 } else if (message.type === 'edit' || message.type === 'invalidate') {
  await invalidatePlan(tabId);
  session.answer = message.type === 'invalidate' ? { ...session.answer, revision: session.answer.revision + 1, approval: null } : editAnswer(session.answer, String(message.text ?? ''));
 } else if (message.type === 'resolve-missing') {
  await invalidatePlan(tabId); session.answer = resolveMissing(session.answer, message.reviewed === true);
 } else if (message.type === 'approve') {
  if (message.revision !== session.answer.revision || message.text !== session.answer.text) throw Error('Answer changed. Review the current revision.');
  session.answer = approve(session.answer, session.context, facts, message.reviewed === true);
 } else throw Error('Unsupported answer command.');
 await writeHackathon(sessionKey(tabId), session, true); return { session };
}

export async function validateAnswerBinding(plan: NativePlan): Promise<void> {
 if (!plan.answerBinding) return;
 const session = await getSession(plan.tabId); const a = session.answer;
 const saved = (await readLibrary(libraryStore)).find(s => s.id === plan.answerBinding!.savedId);
 if (!a || session.planId !== plan.id || a.id !== plan.answerBinding.id || a.revision !== plan.answerBinding.revision || !matchesSavedApproval(saved, session, await loadFacts())) throw Error('Answer was edited, deleted, or became stale. Review and preview again.');
 const row = plan.rows.find(r => rowKey(r) === session.rowKey);
 if (!row || row.action?.type !== 'answer' || row.action.value !== a.text) throw Error('Answer plan mismatch.');
}
