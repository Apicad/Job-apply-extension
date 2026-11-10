import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { outcomeLabel } from '../../lib/hackathon/outcomes';
import type { NativePlan } from '../../lib/hackathon/engine';
import type { Answer, Fact } from '../../lib/hackathon/contracts';
import { promptFor } from '../../lib/hackathon/contracts';
import type { AnswerSession } from '../../lib/hackathon/answers';
import { rowKey, supportedQuestion } from '../../lib/hackathon/answers';
import './style.css';
function App() {
 const [tabId, setTab] = useState<number>();
 const [plan, setPlan] = useState<NativePlan | null>(null);
 const [facts, setFacts] = useState<Fact[]>([]); const [selected, setSelected] = useState<string[]>([]);
 const [library, setLibrary] = useState<Answer[]>([]); const [scope, setScope] = useState('application');
 const [session, setSession] = useState<AnswerSession | null>(null);
 const [question, setQuestion] = useState(''); const [job, setJob] = useState('');
 const [raw, setRaw] = useState(''); const [text, setText] = useState(''); const [dirty, setDirty] = useState(false);
 const [missingReviewed, setMissingReviewed] = useState(false);
 const [libraryError, setLibraryError] = useState(''); const [recoveryToken, setRecoveryToken] = useState(''); const [rawLibrary, setRawLibrary] = useState(''); const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
 const [reviewed, setReviewed] = useState(false); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
 useEffect(() => { const requested = new URLSearchParams(location.search).get('tabId'); if (requested) setTab(Number(requested)); else void browser.tabs.query({ active: true, currentWindow: true }).then(tabs => setTab(tabs[0]?.id)); }, []);
 async function send(type: string, extra: object = {}) {
  const response = await browser.runtime.sendMessage({ type, tabId, planId: plan?.id, answerId: session?.answer?.id, answerRevision: session?.answer?.revision, ...extra });
  if (!response.ok) throw Error(response.error); return response.data;
 }
 async function refresh() {
  if (tabId === undefined) return;
  const data = await send('state'); setPlan(data.plan); setFacts(data.facts); setLibrary(data.library ?? []); setLibraryError(data.libraryError ?? ''); setRecoveryToken(data.recoveryToken ?? ''); setRawLibrary(''); setRecoveryConfirmed(false); setSession(data.session); setScope(data.session?.answer?.scope ?? 'application');
  setJob(data.session?.context.job ?? ''); setQuestion(data.session?.rowKey ?? ''); setSelected((data.session?.request?.facts ?? data.session?.answer?.trace.request.facts ?? []).map((f: Fact) => f.id));
  setText(data.session?.answer?.text ?? ''); setDirty(false); setReviewed(false); setMissingReviewed(false);
 }
 useEffect(() => { void refresh().catch(e => setNotice(String(e))); }, [tabId]);
 async function run(type: string, extra: object = {}) {
  setBusy(true); setNotice('');
  try {
   const data = await send(type, extra);
   if (type === 'library-inspect') { setRawLibrary(data.raw); setRecoveryToken(data.recoveryToken ?? ''); setRecoveryConfirmed(false); }
   else if (type === 'library-recover') { await refresh(); setNotice('Recovered valid saved answers. The original raw library is retained in quarantine.'); }
   else if (type === 'scan') { setPlan(data); setSession(null); setQuestion(''); setScope('application'); setNotice('Preview ready. Nothing has been written.'); }
   else if (type === 'fill') { setPlan(data); setNotice('Fill finished. Check each outcome and inspect the page. You submit manually.'); }
   else if (type === 'send') {
    setSession(data.session);
    try { await navigator.clipboard.writeText(data.prompt); setNotice('Request copied. Paste it into your AI chat, then paste its JSON response below.'); }
    catch { setNotice('Clipboard unavailable. Select and copy the exact request text below manually.'); }
   } else if (type === 'save') { await refresh(); setNotice('Approved answer saved. Reopen this extension to retrieve it.'); }
   else if (data.session) { if (data.plan) setPlan(data.plan); setSession(data.session); setText(data.session.answer?.text ?? ''); setDirty(false); setReviewed(false); setMissingReviewed(false); if (type === 'reuse' || type === 'response') setScope(data.session.answer?.scope ?? 'application'); setNotice(type === 'approve' ? 'Exact answer approved. It has not been saved or filled.' : 'Updated. Review before continuing.'); }
   else { await refresh(); setNotice(type === 'demo' ? 'Synthetic applicant saved in this browser.' : 'Saved.'); }
  } catch (e) { setNotice(String(e)); } finally { setBusy(false); }
 }
 function resetContext() { if (session) { setSession(null); setReviewed(false); void send('context-reset').catch(e => setNotice(String(e))); } }
 const answer = session?.answer;
 return <main>
  <header><small>HACKERSQUAD · REVIEWED APPLICATION ASSISTANT</small><h1>Job Apply Assistant</h1><p>Draft from saved experience. Review every claim. Submit yourself.</p></header>
  <button disabled={busy} onClick={() => void run('demo')}>Load synthetic applicant</button>
  <button disabled={busy || tabId === undefined} onClick={() => void run('scan')}>Scan application</button>
  <button disabled={busy || tabId === undefined} onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') + `?tabId=${tabId}` })}>Open review workspace</button>
  <p role="status">{notice}</p>
  <details><summary>Saved experience · {facts.length} facts</summary>{facts.map(f => <article key={`${f.id}:${f.revision}`}><strong>{f.location}</strong><p>{f.text}</p><small>{f.id} · revision {f.revision}</small><label>Edit saved fact<textarea defaultValue={f.text} id={`fact-${f.id}`} /></label><button disabled={busy} onClick={() => void run('fact-edit', { id: f.id, revision: f.revision, text: (document.getElementById(`fact-${f.id}`) as HTMLTextAreaElement).value })}>Save fact revision</button></article>)}</details>
  {plan && <section><h2>Draft one project answer</h2><p className="warning">Only the listed project questions are supported. Eligibility, demographics, consent and other questions stay manual.</p>
   <label>Application question<select value={question} onChange={e => { setQuestion(e.target.value); resetContext(); }}><option value="">Select a question</option>{plan.rows.filter(supportedQuestion).map(r => <option key={rowKey(r)} value={rowKey(r)}>{r.field.descriptor.label}</option>)}</select></label>
   <label>Reviewed job context · requirements, not applicant experience<textarea value={job} maxLength={4000} onChange={e => { setJob(e.target.value); resetContext(); }} placeholder="Paste only the relevant, reviewed job requirements. Do not include contacts or private information." /></label>
   <p>Select the saved facts to send:</p>{facts.map(f => <label key={f.id}><input type="checkbox" checked={selected.includes(f.id)} onChange={e => { setSelected(e.target.checked ? [...selected, f.id] : selected.filter(id => id !== f.id)); resetContext(); }} />{f.text}</label>)}
   <button disabled={busy || !question || !selected.length} onClick={() => void run('request', { rowKey: question, job, factIds: selected })}>Preview exact AI request</button>
  </section>}
  {session?.request && <section><h2>Exact request to AI</h2><p>Only the selected facts and the context below leave the extension when you manually paste them. The extension makes no AI network requests. Free AI chat access may have account and rate limits.</p><pre data-testid="ai-payload">{promptFor(session.request)}</pre><button disabled={busy || session.sent} onClick={() => void run('send')}>Copy reviewed request</button><button disabled={busy} onClick={() => void run('cancel')}>Cancel request</button>{session.sent && <><label>Paste AI JSON response<textarea aria-label="Paste AI JSON response" value={raw} maxLength={30001} onChange={e => setRaw(e.target.value)} /></label><button disabled={busy || !raw} onClick={() => void run('response', { raw })}>Validate response</button></>}</section>}
  {answer && <section><h2>Review answer and sources</h2><p>Question: {answer.context.question}</p><p>Reviewed job context: {answer.context.job || 'None supplied'}</p><p className="warning">Saved facts are user-provided. Valid source IDs do not prove factual correctness. Compare every sentence with its sources; remove unsupported claims.</p>
   {answer.origin === 'edited' && <p className="warning">User edited · current sentence mappings removed. Compare the edited text with the original trace before approving.</p>}
   {answer.segments.map((s, i) => <article key={i}><p>{s.text}</p>{s.sources.map(ref => { const fact = answer.trace.request.facts.find(f => f.id === ref.id && f.revision === ref.revision); return <details className="source" key={ref.id}><summary>Source: {fact?.location} · r{ref.revision}</summary><p>{fact?.text}</p><small>{ref.id}</small></details>; })}{!s.sources.length && <b className="warning">Not supported by saved facts</b>}</article>)}
   {answer.gaps.map((g, i) => <p className="warning" key={i}>Missing or unsupported: {g}</p>)}
   <details><summary>Original generation trace</summary>{answer.trace.segments.map((s, i) => <p key={i}>{s.text}</p>)}{answer.trace.missing.map((note, i) => <p key={`missing-${i}`} className="warning">Original missing information: {note}</p>)}{answer.trace.request.facts.map(f => <article key={`${f.id}:${f.revision}`}><strong>{f.location} · r{f.revision}</strong><p>{f.text}</p></article>)}</details>
   <label>Exact answer<textarea aria-label="Exact answer" value={text} maxLength={6000} onChange={e => { setText(e.target.value); setReviewed(false); setMissingReviewed(false); if (!dirty) { setDirty(true); void send('invalidate').then(data => setSession(data.session)).catch(e => setNotice(String(e))); } }} /></label>
   {answer.origin === 'edited' && answer.trace.missing.length > 0 && !answer.missingReviewed && <><p>Original missing-information notes remain unresolved. Correct the answer, then confirm that your edits resolve them.</p>{answer.trace.missing.map((note, i) => <p key={i}>{note}</p>)}<label><input type="checkbox" disabled={busy || dirty} checked={missingReviewed} onChange={e => setMissingReviewed(e.target.checked)} />I resolved the original missing-information notes in this edited answer</label><button disabled={busy || dirty || !missingReviewed} onClick={() => void run('resolve-missing', { reviewed: missingReviewed })}>Resolve reviewed missing-information notes</button></>}
   {dirty && <button disabled={busy || !text.trim()} onClick={() => void run('edit', { text })}>Apply edits for review</button>}
   <label><input type="checkbox" disabled={busy || dirty} checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I compared the exact text with the original saved facts, removed unsupported claims, and reviewed its relevance to this application.</label>
   <button disabled={busy || dirty || !reviewed || !!answer.gaps.length} onClick={() => void run('approve', { reviewed, revision: answer.revision, text: answer.text })}>Approve exact answer</button>
   {answer.approval && <><p>Approved revision {answer.revision}. Approval alone does not save or fill.</p><label>Save scope<select value={scope} onChange={e => setScope(e.target.value)}><option value="application">Current application only</option><option value="factual">Reusable factual experience · new review each application</option></select></label><button disabled={busy || dirty} onClick={() => void run('save', { scope })}>Save approved answer</button><button disabled={busy || dirty || !session.savedId} onClick={() => void run('answer-preview')}>Preview approved textarea fill</button></>}
  </section>}
  <section><h2>Saved answers · {library.length}</h2>{libraryError && <div><p className="warning">{libraryError} Saving and reuse remain blocked until recovery.</p><button disabled={busy} onClick={() => void run('library-inspect')}>Inspect raw library</button>{rawLibrary && <><pre data-testid="raw-library">{rawLibrary}</pre><button onClick={() => { const url = URL.createObjectURL(new Blob([rawLibrary], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'saved-answer-library-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Export raw library</button><label><input type="checkbox" checked={recoveryConfirmed} onChange={e => setRecoveryConfirmed(e.target.checked)} />Keep a backup and recover valid saved answers</label><button disabled={busy || !recoveryConfirmed} onClick={() => void run('library-recover', { recoveryToken, confirmed: recoveryConfirmed })}>Recover saved answers</button></>}</div>}<p>Open a saved answer as a draft for renewed review. Select a question and preview its current context first.</p>{library.map(a => <article key={a.id}><details><summary>{a.context.question} · {a.scope === 'factual' ? 'Reusable factual experience' : 'Current application'} · r{a.revision}</summary><p>{a.text}</p><p>Reviewed job context: {a.context.job || 'None supplied'}</p>{a.trace.request.facts.map(f => <p key={f.id}>{f.location}: {f.text}</p>)}</details><p>{a.facts.every(ref => facts.some(f => f.id === ref.id && f.revision === ref.revision)) ? 'Review required before reuse' : 'Stale sources · generate a new answer'}</p><button disabled={busy || !session} onClick={() => void run('reuse', { id: a.id })}>Open for review</button><button disabled={busy} onClick={() => void run('delete', { id: a.id })}>Delete saved answer</button></article>)}</section>
  {plan && <section><h2>Fill preview</h2>{plan.state === 'invalidated' && <p className="warning">Preview invalidated before execution. Scan again to create a current preview.</p>}{plan.state === 'executing' && <p className="warning">Interrupted: outcome unknown. Inspect the page and scan again. This plan cannot be replayed.</p>}<p>{plan.url}</p>{plan.rows.map(r => <article key={rowKey(r)}><strong>{r.field.descriptor.label || r.field.descriptor.name}</strong><p>{r.action ? 'value' in r.action ? r.action.value : r.field.descriptor.options[r.action.index]?.label : r.status}</p>{plan.state === 'finished' && r.action && <b>{outcomeLabel(plan.outcomes?.find(o => o.documentId === r.documentId && o.ref === r.field.ref)?.status)}</b>}</article>)}{plan.errors?.map((e, i) => <p key={i} className="warning">{e}</p>)}<button disabled={busy || dirty || plan.state !== 'preview' || !plan.rows.some(r => r.action)} onClick={() => void run('fill')}>Fill previewed fields</button></section>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
