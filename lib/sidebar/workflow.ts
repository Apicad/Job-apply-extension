import { automaticAnswer } from './automatic-answer';
import { classifyField } from '../classify';
import { missingFieldDetail } from './question-analysis';
import { browser } from 'wxt/browser';
import { loadProfile, loadResumeToAttach, readHackathon, writeHackathon, saveProfile, saveResume } from '../storage';
import { normalizeProfile } from '../profile';
import { normalizeResumeLayout } from '../resume-preview';
import { loadSavedMaterials, saveMaterials } from '../materials-storage';
import { record, key, isFact, makeRequest, parseReply, approve, editAnswer, currentApproval, sameContext, resolveMissing } from '../hackathon/contracts';
import type { Answer, Fact } from '../hackathon/contracts';
import { scanTab, fillTab, invalidateNativePlan } from '../hackathon/service';
import { loadFacts, supportedQuestion, contextForRow, rowKey, sessionKey, answerCommand, libraryStore } from '../hackathon/answers';
import { readLibrary, saveAnswer } from '../hackathon/library';
import type { NativePlan, Row } from '../hackathon/engine';
import { eligibleApplicationRows } from '../hackathon/engine';
import { checkboxGroupViews } from '../hackathon/checkbox-groups';
import { manualControlViews } from '../hackathon/manual-controls';
import { checkAI, draftWithAI } from './ai';
import { revealSubmission } from './submission-review';
import type { SidebarRun, SidebarState, SidebarField, SidebarDraft } from './ui-types';

interface StoredRun extends SidebarRun {
  profileKey: string;
  factsKey: string;
  answers: Record<string, Answer>;
}
interface Active { run: StoredRun; abort: AbortController; plan?: NativePlan; stopping?: Promise<void> }
const active = new Map<number, Active>();
const runKey = (tabId: number) => `sidebar-run:${tabId}`;
const jobText = (row: Row) => [row.job.title, row.job.company].filter(Boolean).join(' · ');
const running = (run: SidebarRun) => ['scanning', 'filling', 'drafting'].includes(run.phase);
const fail = (error: unknown) => error instanceof Error ? error.message : 'Unable to finish. Try again.';

function publicRun(run: StoredRun): SidebarRun {
  const { profileKey: _p, factsKey: _f, answers: _a, ...view } = run;
  return view;
}
function assertActive(task: Active): void {
  if (task.abort.signal.aborted || active.get(task.run.tabId) !== task) throw Error('Autofill cancelled.');
}
async function persist(task: Active): Promise<void> {
  assertActive(task);
  await writeHackathon(runKey(task.run.tabId), task.run, true);
}
async function assertSnapshot(run: StoredRun): Promise<void> {
  if ((await browser.tabs.get(run.tabId)).url !== run.url) throw Error('The application changed. Click Autofill on the current page.');
  if (key(await loadProfile()) !== run.profileKey || key(await loadFacts()) !== run.factsKey) throw Error('Your saved information changed. Click Autofill again.');
}
function fieldViews(plan: NativePlan): SidebarField[] {
  return [...eligibleApplicationRows(plan.rows).map((row): SidebarField => {
    const outcome = plan.outcomes?.find(o => o.ref === row.field.ref && o.documentId === row.documentId);
    return { id: rowKey(row), label: row.field.descriptor.label || row.field.descriptor.name || 'Unlabelled field',
      status: !row.field.empty ? 'kept' : outcome?.ok ? 'filled' : row.action && plan.state === 'finished' ? 'failed' : 'review',
      detail: !row.field.empty ? 'Your existing answer was kept.' : outcome?.ok ? 'Filled and checked on the page.' : row.action ? plan.state === 'finished' ? 'Could not verify this field. Check it on the page.' : 'Waiting to fill…' : row.status === 'Section autofill disabled' ? 'Autofill is off for this section. Complete this field on the application.' : supportedQuestion(row) ? 'AI can draft this from saved experience. Connect AI and add any missing facts in Profile home, then review the draft here.' : missingFieldDetail(classifyField(row.field.descriptor), row.field.descriptor.label) };
  }), ...checkboxGroupViews(plan.checkboxGroups ?? []), ...manualControlViews(plan.manualControls ?? [])];
}

/** Scan handles restart at zero. Reconcile display outcomes by complete field identity,
 * never by a handle or label that a newly inserted control could have inherited. */
function refreshedFieldViews(previous: NativePlan, fresh: NativePlan): SidebarField[] {
  const before = eligibleApplicationRows(previous.rows); const after = eligibleApplicationRows(fresh.rows);
  const first = before[0]; const current = after[0];
  // A changed application selection must not import another form's questions.
  if (!first || !current || first.documentId !== current.documentId || first.field.form !== current.field.form) return fieldViews(previous);
  const identity = (row: Row) => key([row.documentId, row.url, row.job, row.field.form, row.field.descriptor, row.field.maxLength]);
  const previousViews = fieldViews(previous);
  const byIdentity = new Map<string, Row[]>();
  for (const row of before) { const id = identity(row); byIdentity.set(id, [...(byIdentity.get(id) ?? []), row]); }
  const counts = new Map<string, number>();
  for (const row of after) { const id = identity(row); counts.set(id, (counts.get(id) ?? 0) + 1); }
  // This second scan is observation-only. A newly revealed field is never queued
  // for another write or labelled "Waiting to fill" after the fill already ended.
  const views = fieldViews({ ...fresh, rows: fresh.rows.map(row => ({ ...row, action: null })) });
  for (const row of after) {
    const candidates = byIdentity.get(identity(row));
    if (candidates?.length !== 1 || counts.get(identity(row)) !== 1) continue;
    const old = previousViews.find(view => view.id === rowKey(candidates[0]!));
    const view = views.find(item => item.id === rowKey(row));
    if (!old || !view) continue;
    if (old.status === 'failed' || old.status === 'filled' && !row.field.empty) {
      view.status = old.status; view.detail = old.detail;
    }
  }
  // Upload widgets may remove their input after success. Preserve that verified
  // outcome as history without attributing it to a fresh control's numeric handle.
  for (const row of before) {
    if (counts.has(identity(row))) continue;
    const old = previousViews.find(view => view.id === rowKey(row));
    if (old?.status === 'filled') views.push({ ...old, id: `previous:${old.id}` });
  }
  return views;
}

export async function sidebarState(tabId?: number): Promise<SidebarState> {
  let run = tabId === undefined ? null : await readHackathon<StoredRun>(runKey(tabId), true);
  if (run && (await browser.tabs.get(run.tabId).catch(() => null))?.url !== run.url) run = null;
  if (run && running(run) && !active.has(run.tabId)) {
    run.phase = 'error'; run.message = 'Autofill was interrupted. Check the page before starting again; writes are never replayed automatically.';
    await writeHackathon(runKey(run.tabId), run, true);
  }
  const resume = await loadResumeToAttach();
  return { profile: await loadProfile(), facts: await loadFacts(), resume: resume ? { name: resume.name, updatedAt: resume.updatedAt } : null,
    run: run ? publicRun(run) : null, aiEnabled: await readHackathon<boolean>('sidebar-ai-enabled') === true,
    resumeLayout: normalizeResumeLayout(await readHackathon('resume-layout')), materials: await loadSavedMaterials() };
}

async function execute(task: Active): Promise<void> {
  const run = task.run;
  try {
    let plan = await scanTab(run.tabId); task.plan = plan; assertActive(task); await assertSnapshot(run);
    run.job = plan.rows[0]?.job ?? { title: '', company: '' };
    run.fields = fieldViews(plan);
    run.phase = 'filling'; run.message = 'Filling your saved details…'; await persist(task);
    if (plan.rows.some(r => r.action)) { assertActive(task); plan = await fillTab(run.tabId, plan.id, () => assertActive(task)); }
    assertActive(task); run.fields = fieldViews(plan);
    // Re-read after basic writes, which can reveal or change dependent fields.
    const questionsPlan = await scanTab(run.tabId); task.plan = questionsPlan; assertActive(task); await assertSnapshot(run);
    // Include dependent questions without another write, preserving verified outcomes.
    run.fields = refreshedFieldViews(plan, questionsPlan);
    const questions = eligibleApplicationRows(questionsPlan.rows).filter(supportedQuestion).slice(0, 5);
    const facts = (await loadFacts()).slice(0, 20);
    const enabled = await readHackathon<boolean>('sidebar-ai-enabled') === true;
    const library = await readLibrary(libraryStore);
    if (questions.length && facts.length) {
      run.phase = 'drafting'; run.message = 'Saved details filled. Writing and filling AI answers…'; await persist(task);
      for (const row of questions) {
        assertActive(task); await assertSnapshot(run);
        const context = await contextForRow(questionsPlan, row, jobText(row));
        const cached = library.find(a => a.approval?.method !== 'autofill' && currentApproval(a, context, facts));
        if (!cached && !enabled) continue;
        let answer: Answer;
        try {
          if (cached) answer = structuredClone(cached);
          else {
            const request = makeRequest(context, facts);
            const raw = await draftWithAI(request, task.abort.signal);
            assertActive(task); await assertSnapshot(run);
            answer = parseReply(raw, request, await loadFacts());
          }
          const id = crypto.randomUUID();
          run.answers[id] = answer;
          run.drafts.push({ id, revision: answer.revision, question: context.question, text: answer.text,
            sources: answer.trace.request.facts, gaps: answer.gaps, status: 'review' });
          await persist(task);
          if (enabled) await fillAutomaticAnswer(task, run.drafts[run.drafts.length - 1]!, answer);
        } catch (error) {
          assertActive(task);
          run.message = `Basic autofill finished. AI could not finish: ${fail(error)}`;
          run.phase = 'review'; await persist(task); return;
        }
      }
    }
    run.phase = run.fields.some(f => f.status === 'review' || f.status === 'failed') || run.drafts.length ? 'review' : 'finished';
    run.message = !plan.rows.length ? 'No supported application fields found on this page.'
      : questions.length && !facts.length ? 'Basic autofill finished. Add your experience to draft application answers.'
      : questions.length && !enabled && !run.drafts.length ? 'Basic autofill finished. Connect your AI to draft answers, or complete them on the page.'
      : 'Autofill finished. Review the remaining items, then submit on the application.';
    await persist(task);
  } catch (error) {
    if (!task.abort.signal.aborted) { run.phase = 'error'; run.message = fail(error); await persist(task); }
  } finally {
    // Cancellation may have arrived while scanTab was still returning its new
    // handles. Invalidate that exact late plan before allowing another run.
    if (task.abort.signal.aborted) await invalidateNativePlan(task.plan);
    if (task.stopping) await task.stopping;
    if (active.get(run.tabId) === task) active.delete(run.tabId);
  }
}

async function cancel(tabId: number, id?: string): Promise<void> {
  const task = active.get(tabId);
  if (task && (!id || task.run.id === id)) {
    if (!task.stopping) {
      task.abort.abort(); task.run.phase = 'cancelled'; task.run.message = 'Stopped. Fields already filled remain on the page; review them before continuing.';
      task.stopping = (async () => {
        await invalidateNativePlan(task.plan);
        if (active.get(tabId) === task) await writeHackathon(runKey(tabId), task.run, true);
      })();
    }
    await task.stopping;
  }
}
async function cancelAll(): Promise<void> { for (const [tabId, task] of Array.from(active)) await cancel(tabId, task.run.id); }
export function sidebarBusy(tabId: number): boolean { return active.has(tabId); }
export async function cancelForNavigation(tabId: number): Promise<void> { await cancel(tabId); }

async function fillAutomaticAnswer(task: Active, draft: SidebarDraft, original: Answer): Promise<void> {
  const run = task.run;
  assertActive(task); await assertSnapshot(run);
  const facts = await loadFacts();
  const answer = automaticAnswer(original, facts);
  if (!answer) { draft.text = ''; await persist(task); return; }
  const plan = await scanTab(run.tabId); task.plan = plan;
  assertActive(task); await assertSnapshot(run);
  const candidates = await Promise.all(eligibleApplicationRows(plan.rows).filter(supportedQuestion).map(async row => ({row, context: await contextForRow(plan,row,jobText(row))})));
  const matches = candidates.filter(c => sameContext(c.context, original.context));
  if (matches.length !== 1) { draft.status = 'failed'; draft.gaps.push('The question changed or already has an answer. Your page edits were preserved.'); await persist(task); return; }
  const target = matches[0]!;
  const approved = approve(answer, target.context, facts, true);
  // User-initiated Autofill authorizes this write, not a claim of human review.
  approved.approval!.method = 'autofill';
  assertActive(task); await assertSnapshot(run);
  const saved = await saveAnswer(libraryStore, approved, facts, 'application');
  for (const row of plan.rows) row.action = null;
  assertActive(task);
  await writeHackathon(`plan:${run.tabId}`, plan, true);
  await writeHackathon(sessionKey(run.tabId), { planId: plan.id, rowKey: rowKey(target.row), context: target.context,
    request: null, sent: false, answer: saved, savedId: saved.id, savedRevision: saved.revision }, true);
  const preview = await answerCommand({type:'answer-preview'},plan) as {plan:NativePlan}; task.plan=preview.plan;
  assertActive(task); await assertSnapshot(run);
  const filled = await fillTab(run.tabId,preview.plan.id,()=>assertActive(task));
  assertActive(task);
  const ok = filled.outcomes?.some(o=>o.documentId===target.row.documentId && o.ref===target.row.field.ref && o.ok);
  draft.status=ok?'filled':'failed'; draft.text=saved.text;
  const field = run.fields.find(f=>f.id===rowKey(target.row));
  if(field) { field.status=ok?'filled':'failed'; field.detail=ok?'AI answer filled. Review it on the application.':'Could not verify the AI answer on the page.'; }
  await persist(task);
}

async function useAnswer(message: Record<string, unknown>, tabId: number): Promise<SidebarRun> {
  if (active.has(tabId)) throw Error('Wait for Autofill to finish before using an answer.');
  const run = await readHackathon<StoredRun>(runKey(tabId), true);
  if (!run || run.id !== message.runId || !['review', 'finished'].includes(run.phase)) throw Error('This review is no longer current. Click Autofill again.');
  const draft = run.drafts.find(d => d.id === message.draftId);
  const original = draft && run.answers[draft.id];
  if (!draft || !original || draft.status !== 'review' || draft.revision !== message.revision || typeof message.text !== 'string') throw Error('This draft changed. Reopen the current answer.');
  await assertSnapshot(run);
  const facts = await loadFacts();
  const plan = await scanTab(tabId);
  const candidates = await Promise.all(eligibleApplicationRows(plan.rows).filter(supportedQuestion).map(async row => ({ row, context: await contextForRow(plan, row, jobText(row)) })));
  const matches = candidates.filter(c => sameContext(c.context, original.context));
  if (matches.length !== 1) throw Error('This question changed or already has an answer. Click Autofill again.');
  const target = matches[0]!;
  let answer = message.text === original.text ? original : editAnswer(original, message.text);
  if (answer.origin === 'edited' && message.text !== original.text && answer.trace.missing.length) answer = resolveMissing(answer, true);
  const approved = approve(answer, target.context, facts, true);
  // One explicit review action replaces separate approve/save/preview/fill screens.
  const saved = await saveAnswer(libraryStore, approved, facts, 'application');
  for (const row of plan.rows) row.action = null;
  await writeHackathon(`plan:${tabId}`, plan, true);
  await writeHackathon(sessionKey(tabId), { planId: plan.id, rowKey: rowKey(target.row), context: target.context,
    request: null, sent: false, answer: saved, savedId: saved.id, savedRevision: saved.revision }, true);
  const preview = await answerCommand({ type: 'answer-preview' }, plan) as { plan: NativePlan };
  const filled = await fillTab(tabId, preview.plan.id);
  const outcome = filled.outcomes?.find(o => o.documentId === target.row.documentId && o.ref === target.row.field.ref);
  draft.status = outcome?.ok ? 'filled' : 'failed'; draft.text = saved.text; draft.revision = saved.revision;
  run.answers[draft.id] = saved;
  const field = run.fields.find(f => f.label === draft.question && f.status === 'review');
  if (field) { field.status = outcome?.ok ? 'filled' : 'failed'; field.detail = outcome?.ok ? 'Reviewed answer filled and checked.' : 'Check this answer on the page.'; }
  run.message = outcome?.ok ? 'Answer saved and filled. Review the application before submitting.' : 'The answer was saved, but its fill could not be verified. Check the page.';
  await writeHackathon(runKey(tabId), run, true);
  return publicRun(run);
}

/** Called only by the extension-origin listener; setup mutations are serialized. */
export async function handleSidebar(message: Record<string, unknown>): Promise<unknown> {
  const tabId = Number.isSafeInteger(message.tabId) && Number(message.tabId) >= 0 ? Number(message.tabId) : undefined;
  if (message.type === 'sidebar-state') return sidebarState(tabId);
  if (message.type === 'sidebar-resume-preview') return {resume:await loadResumeToAttach()};
  if (message.type === 'sidebar-ai-status') return checkAI();
  if (message.type === 'sidebar-save-materials') return { saved: true, materials: await saveMaterials(message.materials, message.expectedMaterials) };
  if (message.type === 'sidebar-settings') {
    if (typeof message.aiEnabled !== 'boolean') throw Error('Invalid AI setting.');
    if (!message.aiEnabled) await cancelAll();
    await writeHackathon('sidebar-ai-enabled', message.aiEnabled); return { saved: true };
  }
  if (message.type === 'sidebar-save-profile') {
    if (!record(message.profile) || !Array.isArray(message.facts) || message.facts.length > 20 || !message.facts.every(isFact) || new Set(message.facts.map(f => f.id)).size !== message.facts.length) throw Error('Save up to 20 experience notes with valid text.');
    const before = await loadFacts();
    if (key(message.expectedProfile) !== key(await loadProfile()) || key(message.expectedFacts) !== key(before)) throw Error('Your saved information changed in another window. Reopen it before saving.');
    const hasLayout = Object.hasOwn(message, 'resumeLayout');
    if (hasLayout && key(message.expectedResumeLayout) !== key(normalizeResumeLayout(await readHackathon('resume-layout')))) throw Error('Your résumé choices changed in another window. Reload the saved profile before saving.');
    const facts: Fact[] = message.facts.map((f: Fact) => { const old = before.find(v => v.id === f.id); return { id: f.id, text: f.text, location: f.location, revision: old ? old.revision + (old.text !== f.text || old.location !== f.location ? 1 : 0) : 1 }; });
    await cancelAll(); await saveProfile(normalizeProfile(message.profile)); await writeHackathon('facts', facts);
    if (hasLayout) await writeHackathon('resume-layout', normalizeResumeLayout(message.resumeLayout));
    return { saved: true };
  }
  if (message.type === 'sidebar-save-resume') { await cancelAll(); await saveResume(message.resume); return { saved: true }; }
  if (tabId === undefined) throw Error('Open an application tab first.');
  if (message.type === 'sidebar-highlight-question') {
    const run=await readHackathon<StoredRun>(runKey(tabId),true);
    if(!run || run.id!==message.runId || active.has(tabId) || typeof message.question!=='string' || ![...run.fields.map(f=>f.label),...run.drafts.map(d=>d.question)].includes(message.question)) throw Error('Run Autofill and select a current question first.');
    if((await browser.tabs.get(tabId)).url!==run.url)throw Error('The application changed. Run Autofill again.');
    await browser.scripting.executeScript({target:{tabId},func:(request:{url:string;label:string})=>{(globalThis as typeof globalThis & {__jaaHighlight?:typeof request}).__jaaHighlight=request;},args:[{url:run.url,label:message.question}]});
    const results=await browser.scripting.executeScript({target:{tabId},files:['/highlight.js']});
    if(!results.some(r=>r.frameId===0&&r.result===true))throw Error('Could not locate one visible matching question. Find this label on the application.');
    return {highlighted:true};
  }
  if (message.type === 'sidebar-review-submission') {
    const run = await readHackathon<StoredRun>(runKey(tabId), true);
    if (!run || run.id !== message.runId || active.has(tabId) || !['review', 'finished'].includes(run.phase) || !run.fields.length) throw Error('Run Autofill on this application before reviewing submission.');
    const tab = await browser.tabs.get(tabId);
    if (tab.url !== run.url) throw Error('The application changed. Run Autofill on the current page.');
    const results = await browser.scripting.executeScript({ target: { tabId }, func: revealSubmission, args: [run.url] });
    if (!results.some(result => result.frameId === 0 && result.result?.found === true)) throw Error('Could not identify one Submit application button. Review the page and use the employer’s button yourself.');
    return { revealed: true };
  }
  if (message.type === 'sidebar-cancel') { await cancel(tabId, String(message.runId)); return { cancelled: true }; }
  if (message.type === 'sidebar-approve') return { run: await useAnswer(message, tabId) };
  if (message.type === 'sidebar-autofill') {
    if (active.has(tabId)) throw Error('The previous run is still stopping. Please wait.');
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !/^https?:/.test(tab.url)) throw Error('Open a job application and click the extension icon on that tab.');
    const run: StoredRun = { id: crypto.randomUUID(), tabId, url: tab.url, job: { title: '', company: '' }, phase: 'scanning', message: 'Finding application fields…', fields: [], drafts: [], answers: {}, profileKey: key(await loadProfile()), factsKey: key(await loadFacts()) };
    const task: Active = { run, abort: new AbortController() }; active.set(tabId, task);
    await persist(task); void execute(task).catch(() => undefined); return { run: publicRun(run) };
  }
  throw Error('Unknown sidebar action.');
}
