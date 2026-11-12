import React, { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { stableKey } from '../../lib/hackathon/identity';
import { defaultResumeLayout } from '../../lib/resume-preview';
import { buildMaterialsRequest, materialsSourceKey, parseMaterialsReply, reviewMaterialsReply, materialsReviewNotices, emptyMaterialsBrief, normalizeMaterialsBrief } from '../../lib/materials';
import type { MaterialsBrief, MaterialsReply } from '../../lib/materials';
import { materialsReviewFingerprint } from '../../lib/materials-storage';
import type { SavedMaterials } from '../../lib/materials-storage';
import { draftMaterialsWithAI } from '../../lib/sidebar/ai';
import type { SidebarState } from '../../lib/sidebar/ui-types';
import './materials.css';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not create your documents. Please try again.';
async function send(extra: object) {
  const reply = await browser.runtime.sendMessage({ type: 'sidebar-save-materials', ...extra });
  if (!reply?.ok) throw Error(reply?.error || 'Could not save these documents.');
  return reply.data as { saved: true; materials: SavedMaterials };
}

export function useMaterials(state: SidebarState, profileDirty: boolean) {
  const [brief, setBrief] = useState<MaterialsBrief>(emptyMaterialsBrief);
  const [draft, setDraft] = useState<SavedMaterials | null>(null);
  const [base, setBase] = useState<SavedMaterials | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewPending, setReviewPending] = useState<boolean | null>(null);
  const [sourceKey, setSourceKey] = useState({ input: '', value: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'base' | 'resume' | 'letter'>('base');
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const layout = state.resumeLayout ?? defaultResumeLayout();
  const inputKey = stableKey({ profile: state.profile, facts: state.facts, layout, brief: normalizeMaterialsBrief(brief), profileDirty });
  const inputRef = useRef(inputKey); inputRef.current = inputKey;
  const dirty = stableKey(draft) !== stableKey(base) || stableKey(brief) !== stableKey(base?.request.brief ?? emptyMaterialsBrief());
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const busyRef = useRef(false); busyRef.current = generating || saving;
  const storedKey = stableKey(state.materials ?? null);
  const seenStored = useRef('');
  const conflict = stableKey(base) !== storedKey;
  const stale = profileDirty || !!draft && (sourceKey.input !== inputKey || !sourceKey.value || draft.request.sourceKey !== sourceKey.value);

  function adopt(value: SavedMaterials | null) {
    setDraft(value); setBase(value); setBrief(value?.request.brief ?? emptyMaterialsBrief());
    dirtyRef.current = false;
  }
  useEffect(() => {
    if (seenStored.current === storedKey) return;
    seenStored.current = storedKey;
    if (!dirtyRef.current && !busyRef.current) adopt(state.materials ?? null);
  }, [storedKey]);
  useEffect(() => {
    let alive = true;
    void materialsSourceKey(state.profile, state.facts, layout, brief).then(value => { if (alive) setSourceKey({ input: inputKey, value }); }).catch(e => { if (alive) setError(errorMessage(e)); });
    if (abort.current) { abort.current.abort(); abort.current = null; setGenerating(false); setMessage('Stopped because the profile or job details changed.'); }
    return () => { alive = false; };
  }, [inputKey]);
  useEffect(() => {
    mounted.current = true;
    const leaving = (event: BeforeUnloadEvent) => { if (dirtyRef.current || abort.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leaving);
    return () => { mounted.current = false; abort.current?.abort(); window.removeEventListener('beforeunload', leaving); };
  }, []);

  async function persist(value: SavedMaterials, expected: SavedMaterials | null) {
    const result = await send({ materials: value, expectedMaterials: expected });
    if (!mounted.current) return;
    adopt(result.materials); setMessage('Documents saved separately from your profile.');
  }
  async function generate() {
    if (generating || saving || profileDirty) return;
    const controller = new AbortController(); abort.current = controller;
    const capturedInput = inputRef.current; const expected = base;
    setGenerating(true); setError(''); setMessage('Creating your résumé and cover letter with your connected AI…');
    try {
      const request = await buildMaterialsRequest(state.profile, state.facts, layout, brief);
      if (controller.signal.aborted || inputRef.current !== capturedInput) return;
      const raw = await draftMaterialsWithAI(request, controller.signal);
      if (!mounted.current || controller.signal.aborted || inputRef.current !== capturedInput) return;
      const response = parseMaterialsReply(raw, request);
      const value: SavedMaterials = { schema: 1, revision: expected?.revision ?? 1, request, response, reviewedFingerprint: null };
      // Saving is short and non-cancellable: keep editors locked until the
      // optimistic write acknowledges, so a late response cannot erase edits.
      setSaving(true); setGenerating(false); abort.current = null;
      try { await persist(value, expected); }
      finally { if (mounted.current) setSaving(false); }
      if (mounted.current) { setView('resume'); setMessage('Your drafts are ready. Preview both, make any edits, then mark them reviewed to download.'); }
    } catch (e) { if (mounted.current && !controller.signal.aborted) { setError(errorMessage(e)); setMessage('Your original profile and uploaded résumé are unchanged.'); } }
    finally { if (abort.current === controller) { abort.current = null; if (mounted.current) setGenerating(false); } }
  }
  function cancel() { if (!abort.current) return; abort.current.abort(); abort.current = null; setGenerating(false); setMessage('Stopped. Your previous documents were kept.'); }
  function edit(change: (response: MaterialsReply) => MaterialsReply) {
    if (!draft || generating || saving) return;
    const response = change(draft.response);
    setDraft({ ...draft, response, reviewedFingerprint: null });
    try { setDraft({ ...draft, response: reviewMaterialsReply(draft.request, response), reviewedFingerprint: null }); setError(''); setMessage('Draft edited. Review it again before downloading.'); }
    catch (e) { setError(errorMessage(e)); }
  }
  async function review(checked: boolean) {
    if (!draft || stale || generating || saving) return;
    setSaving(true); setReviewPending(checked); setError('');
    try { const response = reviewMaterialsReply(draft.request, draft.response); const value = { ...draft, response, reviewedFingerprint: checked ? await materialsReviewFingerprint({ request: draft.request, response }) : null }; await persist(value, base); }
    catch (e) { setError(errorMessage(e)); }
    finally { if (mounted.current) { setSaving(false); setReviewPending(null); } }
  }
  async function save() {
    if (!draft || stale || saving || generating) return;
    setSaving(true); setError('');
    try { await persist(draft, base); }
    catch (e) { setError(errorMessage(e)); }
    finally { if (mounted.current) setSaving(false); }
  }
  function reload() { cancel(); adopt(state.materials ?? null); setError(''); setMessage('Loaded the saved documents.'); }
  let reviewNotices = { warnings: [] as string[], missing: [] as string[] };
  if (draft) {
    try { reviewNotices = materialsReviewNotices(draft.request, draft.response); }
    catch {
      // An incomplete editor change already shows its validation error. Keep
      // the last review notes visible until the wording becomes valid again.
      const missing = [...new Set(draft.response.missing)];
      reviewNotices = { missing, warnings: draft.response.warnings.filter(item => !missing.includes(item)) };
    }
  }
  return { brief, setBrief, draft, dirty, generating, saving, stale, conflict, message, error, view, setView, generate, cancel, edit, review, save, reload, reviewChecked: reviewPending ?? !!draft?.reviewedFingerprint,
    reviewNotices, canExport: !!draft?.reviewedFingerprint && !stale && !generating && !saving && !conflict };
}
export type MaterialsController = ReturnType<typeof useMaterials>;

export function MaterialsPanel({ model, profileDirty, disabled }: { model: MaterialsController; profileDirty: boolean; disabled: boolean }) {
  const { brief, draft } = model;
  const field = (key: keyof MaterialsBrief, label: string, placeholder: string, multiline = false, maxLength = 200) => <label className="field"><span>{label}</span>{multiline ? <textarea aria-label={label} value={brief[key]} maxLength={maxLength} placeholder={placeholder} onChange={e => model.setBrief({ ...brief, [key]: e.target.value })} /> : <input aria-label={label} value={brief[key]} maxLength={maxLength} placeholder={placeholder} onChange={e => model.setBrief({ ...brief, [key]: e.target.value })} />}</label>;
  return <section id="materials" className="materials-card" aria-labelledby="materials-heading">
    <div className="materials-heading"><span aria-hidden="true">✦</span><div><p className="eyebrow">YOUR EXPERIENCE. YOUR NEXT DIRECTION.</p><h2 id="materials-heading">Build your general résumé.</h2><p>Start with the position you want. Edit your résumé, choose what to include, and tailor it when a job comes along.</p></div></div>
    <fieldset disabled={disabled || model.generating || model.saving}>
      <div className="field-grid">{field('role', 'What position are you aiming for?', 'e.g. Data analyst, data scientist, software developer')}{field('company', 'Target company (optional)', 'Leave blank for a general résumé')}</div>
      {field('careerDirection', 'My career direction', 'The work I want to do, what I want to emphasize, and the kind of role I’m moving toward.', true, 3000)}
      <details className="materials-job"><summary>Tailor to a job posting (optional) <span>{brief.jobDescription ? 'Added' : 'Add one later'}</span></summary>{field('jobDescription', 'Job description', 'Paste the job description here. Requirements guide the writing; they are not treated as your experience.', true, 20000)}</details>
      <label className="field materials-tone"><span>Writing style</span><select aria-label="Writing style" value={brief.tone} onChange={e => model.setBrief({ ...brief, tone: e.target.value as MaterialsBrief['tone'] })}><option value="natural">Natural and professional</option><option value="concise">Short and direct</option><option value="confident">Confident and specific</option></select></label>
      <button className="primary materials-generate" type="button" disabled={profileDirty || !(brief.role.trim() || brief.jobDescription.trim() || brief.careerDirection.trim())} onClick={() => void model.generate()}>{model.generating ? 'Creating your documents…' : draft ? 'Create new drafts' : 'Create résumé & cover letter'}<span aria-hidden="true">↗</span></button>
    </fieldset>
    {model.generating && <button className="text-button" type="button" onClick={model.cancel}>Stop generating</button>}
    <p className="helper">A position is enough to start; company and posting are optional. Add or edit experience in your profile, and choose sections, summary, style and length beside the preview. Your saved general profile stays separate from AI drafts.</p><p className="helper">Uses your connected AI account and its normal limits. No app credits. Sends résumé facts, job details and career direction; contact and eligibility profile fields are excluded.</p>
    {profileDirty && <p className="materials-notice">Save your profile changes first so the AI uses the information you’ve reviewed.</p>}
    {model.error && <p className="materials-error" role="alert">{model.error}</p>}
    {model.message && <p className="materials-status" aria-live="polite">{model.message}</p>}
    {model.conflict && <p className="materials-notice">Saved documents changed in another window. <button type="button" className="text-button" onClick={model.reload}>Load saved documents</button></p>}
    {draft && <div className="materials-review" id="materials-review">
      <h3>Preview, edit, make it yours.</h3><p>Switch between the résumé and cover letter in the preview.</p>
      {model.stale && <p className="materials-notice">Your profile or target changed. Create new drafts before downloading.</p>}
      {!!model.reviewNotices.warnings.length && <div className="materials-notice"><strong>Check these details</strong><ul>{model.reviewNotices.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
      {!!model.reviewNotices.missing.length && <div className="materials-notice"><strong>Information still missing</strong><ul>{model.reviewNotices.missing.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
      <details className="materials-editor"><summary>Edit the writing</summary><fieldset disabled={model.generating || model.saving}>
        {draft.response.summary.map((segment, index) => <label className="field" key={`s${index}`}><span>Résumé summary {index + 1}</span><textarea aria-label={`Résumé summary ${index + 1}`} value={segment.text} maxLength={1500} onChange={e => model.edit(reply => ({ ...reply, summary: reply.summary.map((item, i) => i === index ? { ...item, text: e.target.value } : item) }))} /></label>)}
        {draft.response.entries.map(entry => <div key={entry.entryId}><h4>{draft.request.entries.find(item => item.id === entry.entryId)?.heading || 'Experience'}</h4>{entry.bullets.map((segment, index) => <label className="field" key={index}><span>Résumé bullet {index + 1}</span><textarea aria-label={`Résumé bullet ${entry.entryId} ${index + 1}`} value={segment.text} maxLength={1500} onChange={e => model.edit(reply => ({ ...reply, entries: reply.entries.map(item => item.entryId === entry.entryId ? { ...item, bullets: item.bullets.map((bullet, i) => i === index ? { ...bullet, text: e.target.value } : bullet) } : item) }))} /></label>)}</div>)}
        {draft.response.coverLetter.map((segment, index) => <label className="field" key={`c${index}`}><span>Cover-letter paragraph {index + 1}</span><textarea aria-label={`Cover-letter paragraph ${index + 1}`} value={segment.text} maxLength={2000} onChange={e => model.edit(reply => ({ ...reply, coverLetter: reply.coverLetter.map((item, i) => i === index ? { ...item, text: e.target.value } : item) }))} /></label>)}
      </fieldset></details>
      <details className="materials-sources"><summary>Experience used for these drafts</summary>{draft.request.evidence.map(fact => <details key={fact.id}><summary>{fact.location}</summary><p>{fact.text}</p></details>)}<p className="helper">Source references help you check the wording. They do not prove every generated claim is correct.</p></details>
      <label className="section-toggle materials-reviewed"><input type="checkbox" disabled={model.stale || model.generating || model.saving} checked={model.reviewChecked} onChange={e => void model.review(e.target.checked)} /><span>I reviewed both documents and checked the claims.</span></label>
      <button className="secondary" type="button" disabled={!model.dirty || model.stale || model.generating || model.saving} onClick={() => void model.save()}>{model.saving ? 'Saving…' : 'Save document edits'}</button>
    </div>}
  </section>;
}
