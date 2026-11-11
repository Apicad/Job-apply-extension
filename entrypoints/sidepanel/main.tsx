import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { emptyProfile } from '../../lib/profile';
import { ACCEPTED_RESUME_TYPES, fileToStoredResume } from '../../lib/resume';
import type { Profile } from '../../lib/types';
import type { Fact } from '../../lib/hackathon/contracts';
import type { SidebarDraft, SidebarRun, SidebarState } from '../../lib/sidebar/ui-types';
import { visibleAttentionFields } from '../../lib/sidebar/attention';
import './style.css';

const initialState = (): SidebarState => ({ profile: emptyProfile(), facts: [], resume: null, run: null, aiEnabled: false });
const running = (run: SidebarRun | null) => !!run && ['scanning', 'filling', 'drafting'].includes(run.phase);
type Send = (type: string, extra?: object) => Promise<unknown>;
type ProfileKey = keyof Profile;
const basics: [ProfileKey, string, string?][] = [
  ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
];
const moreFields: [ProfileKey, string, string?][] = [
  ['city', 'City'], ['state', 'State / region'], ['country', 'Country'], ['postalCode', 'Postal code'],
  ['addressLine1', 'Street address'], ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Website'],
  ['currentCompany', 'Current company'], ['currentTitle', 'Current title'],
  ['school', 'School'], ['degree', 'Degree'], ['major', 'Field of study'], ['graduationDate', 'Graduation month', 'month'], ['gpa', 'GPA'],
];

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark${small ? ' small' : ''}`} aria-hidden="true"><i /><i /><i /></span>;
}

function ProfileEditor({ state, send, refresh, disabled }: { state: SidebarState; send: Send; refresh: () => Promise<void>; disabled: boolean }) {
  const [profile, setProfile] = useState(state.profile);
  const [facts, setFacts] = useState(state.facts);
  const [base, setBase] = useState({ profile: state.profile, facts: state.facts });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!dirty) { setProfile(state.profile); setFacts(state.facts); setBase({ profile: state.profile, facts: state.facts }); }
  }, [state.profile, state.facts, dirty]);
  const change = (key: ProfileKey, value: string) => { setProfile(p => ({ ...p, [key]: value })); setDirty(true); setMessage(''); };
  const field = ([key, label, type = 'text']: [ProfileKey, string, string?]) => <label key={key}>{label}<input type={type} value={profile[key]} maxLength={300} onChange={e => change(key, e.target.value)} autoComplete="off" /></label>;
  async function save() {
    setSaving(true); setMessage('');
    try {
      await send('sidebar-save-profile', { profile, facts, expectedProfile: base.profile, expectedFacts: base.facts });
      setDirty(false); await refresh(); setMessage('Saved for your next application.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your details.'); }
    finally { setSaving(false); }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setSaving(true); setMessage('');
    try {
      await send('sidebar-save-resume', { resume: await fileToStoredResume(file, Date.now()) });
      await refresh(); setMessage('Résumé saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your résumé.'); }
    finally { setSaving(false); }
  }
  const name = [state.profile.firstName, state.profile.lastName].filter(Boolean).join(' ');
  return <details className="setup-section" open={name ? undefined : true}>
    <summary><span><strong>Your details</strong><small>{name || 'Set up once, use on every application'}</small></span><span className="chevron" aria-hidden="true">⌄</span></summary>
    <div className="section-body">
      <p className="helper">Saved in this browser. Blank details stay unanswered.</p>
      <fieldset disabled={disabled || saving}>
        <div className="field-grid">{basics.map(field)}</div>
        <details className="nested"><summary>Links, location & education <span aria-hidden="true">+</span></summary><div className="field-grid">{moreFields.map(field)}</div></details>
        <div className="resume-row"><span className="file-icon" aria-hidden="true">↥</span><div><strong>{state.resume?.name ?? 'Add your résumé'}</strong><small>PDF, Word, RTF or text · up to 4 MB</small></div></div>
        <label className="file-picker">{state.resume ? 'Replace résumé' : 'Choose résumé'}<input aria-label="Upload résumé" type="file" accept={ACCEPTED_RESUME_TYPES.join(',')} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <details className="nested experience"><summary>Experience for AI <span className="count">{facts.length}</span></summary>
          <p className="helper">Add facts you want AI to use: what you built, did, or learned. It uses these saved facts, not the résumé file.</p>
          {facts.map((fact, i) => <div className="fact-editor" key={fact.id}>
            <label>Source {i + 1}<input value={fact.location} maxLength={300} placeholder="e.g. Sensor dashboard project" onChange={e => { setFacts(items => items.map(f => f.id === fact.id ? { ...f, location: e.target.value } : f)); setDirty(true); }} /></label>
            <label>Experience<textarea value={fact.text} maxLength={2000} placeholder="What you did, in your own words" onChange={e => { setFacts(items => items.map(f => f.id === fact.id ? { ...f, text: e.target.value } : f)); setDirty(true); }} /></label>
            <button className="text-button danger" type="button" onClick={() => { setFacts(items => items.filter(f => f.id !== fact.id)); setDirty(true); }}>Remove fact {i + 1}</button>
          </div>)}
          <button className="secondary full" type="button" disabled={facts.length >= 20} onClick={() => { setFacts(items => [...items, { id: crypto.randomUUID(), revision: 1, location: '', text: '' }]); setDirty(true); }}>Add experience</button>
        </details>
        {dirty && <p className="helper unsaved-note">Unsaved changes · Autofill uses your saved details.</p>}
        <button className="secondary full save-details" disabled={!dirty} type="button" onClick={() => void save()}>{saving ? 'Saving…' : 'Save details'}</button>
      </fieldset>
      {message && <p className="inline-message" role="status">{message}</p>}
      {dirty && message.includes('changed') && <button className="text-button" disabled={saving} onClick={() => { setDirty(false); setMessage(''); void refresh().catch(e => setMessage(e instanceof Error ? e.message : 'Could not reload saved details.')); }}>Reload saved details</button>}
    </div>
  </details>;
}

function DraftCard({ draft, busy, onUse }: { draft: SidebarDraft; busy: boolean; onUse: (draft: SidebarDraft, text: string) => Promise<void> }) {
  const [text, setText] = useState(draft.text);
  const [error, setError] = useState('');
  const [using, setUsing] = useState(false);
  useEffect(() => { setText(draft.text); setError(''); }, [draft.id, draft.revision, draft.text]);
  if (draft.status === 'filled') return <div className="review-card completed"><span aria-hidden="true">✓</span><p>{draft.question}<small>Your reviewed answer is filled.</small></p></div>;
  if (draft.status === 'failed') return <div className="review-card"><h3>{draft.question}</h3><p className="helper">This answer could not be filled. Check the application, then use Autofill to scan its current fields.</p></div>;
  const changed = text !== draft.text;
  return <article className="review-card draft-card">
    <div className="eyebrow">YOUR REVIEW</div>
    <h3>{draft.question}</h3>
    <label className="draft-label">Answer<textarea aria-label={`Answer: ${draft.question}`} value={text} maxLength={6000} onChange={e => { setText(e.target.value); setError(''); }} /></label>
    {draft.gaps.length > 0 && <div className="gap-list"><strong>Check before using</strong><ul>{draft.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></div>}
    <details className="sources"><summary>Saved facts used <span className="count">{draft.sources.length}</span></summary>{draft.sources.map(fact => <div key={fact.id}><strong>{fact.location}</strong><p>{fact.text}</p></div>)}</details>
    <p className="helper">Check the wording and facts. “Use answer” saves this version and fills this question.</p>
    {draft.gaps.length > 0 && changed && <p className="helper">Using your corrected answer confirms you resolved the notes above.</p>}
    <button className="secondary full" disabled={busy || using || !text.trim() || (draft.gaps.length > 0 && !changed)} onClick={async () => { setUsing(true); setError(''); try { await onUse(draft, text); } catch (e) { setError(e instanceof Error ? e.message : 'Could not use this answer.'); } finally { setUsing(false); } }}>{using ? 'Filling answer…' : 'Use answer'}</button>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </article>;
}

function App() {
  const [state, setState] = useState<SidebarState>(initialState);
  const [tabId, setTabId] = useState<number>();
  const [tabTitle, setTabTitle] = useState('Current application');
  const [tabUrl, setTabUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiStatus, setAiStatus] = useState<{ connected: boolean; message: string; provider?: 'Codex' | 'Claude Code' } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const currentTab = useRef<number | undefined>(undefined);
  const currentWindow = useRef<number | undefined>(undefined);
  const selectionSequence = useRef(0);
  const requestSequence = useRef(0);
  const mounted = useRef(true);
  const run = state.run;
  const active = running(run);
  const testTab = import.meta.env.MODE === 'e2e' ? new URLSearchParams(location.search).get('tabId') : null;

  async function send(type: string, extra: object = {}): Promise<any> {
    const response = await browser.runtime.sendMessage({ type, tabId: currentTab.current, ...extra });
    if (!response || !response.ok) throw Error(response?.error ?? 'The assistant could not respond. Try opening it again.');
    return response.data;
  }
  async function refresh() {
    const sequence = ++requestSequence.current;
    const data = await send('sidebar-state') as SidebarState;
    if (mounted.current && sequence === requestSequence.current) { setState(data); setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    async function selectTab(id?: number) {
      const selection = ++selectionSequence.current;
      if (id === undefined || !Number.isSafeInteger(id)) {
        currentTab.current = undefined; setTabId(undefined); setTabUrl(''); setTabTitle('Open an application');
      } else {
        const tab = await browser.tabs.get(id).catch(() => undefined);
        if (!mounted.current || selection !== selectionSequence.current) return;
        currentWindow.current = tab?.windowId;
        currentTab.current = tab?.id; setTabId(tab?.id); setTabUrl(tab?.url ?? ''); setTabTitle(tab?.title || 'Current application');
      }
      setState(s => ({ ...s, run: null })); setError('');
      await refresh().catch(e => { if (mounted.current) { setLoading(false); setError(e instanceof Error ? e.message : 'Could not open the assistant.'); } });
    }
    if (testTab !== null) void selectTab(Number(testTab));
    else void browser.tabs.query({ active: true, currentWindow: true }).then(tabs => selectTab(tabs[0]?.id));
    const activated = (info: { tabId: number; windowId: number }) => { if (testTab === null && info.windowId === currentWindow.current) void selectTab(info.tabId); };
    const updated = (id: number, change: { url?: string; status?: string }) => { if (id === currentTab.current && (change.url || change.status === 'complete')) void selectTab(id); };
    browser.tabs.onActivated.addListener(activated); browser.tabs.onUpdated.addListener(updated);
    return () => { mounted.current = false; requestSequence.current++; selectionSequence.current++; browser.tabs.onActivated.removeListener(activated); browser.tabs.onUpdated.removeListener(updated); };
  }, []);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await refresh(); } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not refresh progress.'); }
      if (!cancelled) timer = setTimeout(() => void poll(), 750);
    }
    timer = setTimeout(() => void poll(), 750);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, tabId]);
  useEffect(() => {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && ['profile', 'resume', 'hackathon:facts', 'hackathon:sidebar-ai-enabled'].some(key => key in changes)) {
        void refresh().catch(e => setError(e instanceof Error ? e.message : 'Could not refresh your profile.'));
      }
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, []);
  async function perform(type: string, extra: object = {}) {
    setBusy(true); setError('');
    try { await send(type, extra); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not finish that action.'); }
    finally { setBusy(false); }
  }
  async function connect(enable: boolean) {
    setConnecting(true); setError('');
    try {
      if (enable) setAiStatus(await send('sidebar-ai-status'));
      await send('sidebar-settings', { aiEnabled: enable }); await refresh();
    } catch (e) { setAiStatus({ connected: false, message: e instanceof Error ? e.message : 'Could not connect your AI.' }); }
    finally { setConnecting(false); }
  }
  const pending = run?.fields.filter(f => f.status === 'review' || f.status === 'failed') ?? [];
  const attentionFields = visibleAttentionFields(pending, run?.drafts ?? []);
  const filled = run?.fields.filter(f => f.status === 'filled') ?? [];
  const kept = run?.fields.filter(f => f.status === 'kept') ?? [];
  const hasProfile = !!(state.profile.firstName || state.profile.email);
  const httpTab = tabId !== undefined && (!tabUrl || /^https?:\/\//.test(tabUrl));
  let host = ''; try { host = new URL(run?.url || tabUrl).hostname; } catch { /* An inaccessible browser page has no application host. */ }
  const setupCommand = `node scripts/install-ai-host.mjs --extension-id ${browser.runtime.id}`;

  return <main>
    <header className="brand"><Mark /><div><h1>Job Apply</h1><p>Your application, a little easier.</p></div></header>
    <section className="action-section" aria-label="Application">
      <div className="context"><span className="eyebrow">CURRENT APPLICATION</span><h2>{run?.job.title || tabTitle}</h2><p>{run?.job.company || host || 'Open a job application in this tab.'}</p></div>
      <button className="autofill" disabled={loading || busy || active || !httpTab} onClick={() => void perform('sidebar-autofill')}><span aria-hidden="true">✦</span> Autofill</button>
      <p className="under-button">Fills saved details. You review and submit.</p>
      {!httpTab && !loading && <p className="inline-message">Open an application, then click the extension’s toolbar icon.</p>}
      {!hasProfile && !loading && <p className="inline-message">Open your profile home to save your details once.</p>}
      {active && <div className="run-progress"><div><span className="pulse" aria-hidden="true" /><p>{run?.message || 'Working on your application…'}</p><button className="text-button" disabled={busy} onClick={() => void perform('sidebar-cancel', { tabId: run?.tabId, runId: run?.id })}>Cancel</button></div><progress aria-label="Autofill progress" /></div>}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </section>

    {run && <section className="results" aria-label="Autofill results">
      <div className="result-summary"><span className="status-mark" aria-hidden="true">{run.phase === 'error' ? '!' : active ? '·' : '✓'}</span><div><h2>{active ? 'Working through the form' : run.phase === 'cancelled' ? 'Autofill stopped' : run.phase === 'error' ? 'Needs a closer look' : 'Ready for your review'}</h2><p role="status" aria-live="polite">{run.message}</p></div></div>
      <div className="counts"><span><b>{filled.length}</b> filled</span><span><b>{kept.length}</b> kept</span><span><b>{pending.length}</b> to check</span></div>
      {run.drafts.map(draft => <DraftCard key={draft.id} draft={draft} busy={busy || active} onUse={async (current, text) => { setBusy(true); try { await send('sidebar-approve', { tabId: run.tabId, runId: run.id, draftId: current.id, revision: current.revision, text }); await refresh(); } finally { setBusy(false); } }} />)}
      {attentionFields.length > 0 && <details className="attention" open><summary>Needs your attention <span className="count">{attentionFields.length}</span></summary><ul>{attentionFields.map(f => <li key={f.id}><span className="attention-dot" aria-hidden="true" /><div><strong>{f.label || 'Unlabelled field'}</strong><p>{f.detail || 'Complete this field on the application.'}</p></div></li>)}</ul></details>}
      {(filled.length > 0 || kept.length > 0) && <details className="completed-fields"><summary>Completed details <span className="count">{filled.length + kept.length}</span></summary><ul>{[...filled, ...kept].map(f => <li key={f.id}><span aria-hidden="true">✓</span><span>{f.label || 'Field'}<small>{f.status === 'kept' ? 'Your existing answer was kept' : f.detail || 'Filled and checked'}</small></span></li>)}</ul></details>}
      {['review', 'finished'].includes(run.phase) && run.fields.length > 0 && <div className="submission-review">
        <button className="secondary full" disabled={busy || active} onClick={() => void perform('sidebar-review-submission', { runId: run.id })}>Review &amp; submit</button>
        <p className="helper">Shows the employer’s Submit button. Check every answer and remaining item, then submit on the application yourself.</p>
      </div>}
    </section>}

    <div className="setup">
      <a className="profile-home" href={browser.runtime.getURL('/home.html')} target="_blank" rel="noreferrer"><span><strong>Profile home</strong><small>Your résumé, experience and saved answers</small></span><span aria-hidden="true">↗</span></a>
      <ProfileEditor state={state} send={send} refresh={refresh} disabled={busy || active || loading} />
      <details className="setup-section ai-section"><summary><span><strong>AI connection</strong><small><span className={`connection-dot${state.aiEnabled && aiStatus?.connected ? ' connected' : ''}`} />{state.aiEnabled ? aiStatus?.connected && aiStatus.provider ? `${aiStatus.provider} connected` : aiStatus ? 'Connection needs attention' : 'Check AI connection' : 'Use your existing AI account'}</small></span><span className="chevron" aria-hidden="true">⌄</span></summary>
        <div className="section-body"><p className="helper">Saved experience and application questions go to your signed-in AI account. Its plan limits apply. No app credits.</p><label className="toggle"><input type="checkbox" checked={state.aiEnabled} disabled={connecting || active || busy} onChange={e => void connect(e.target.checked)} /><span>Draft answers with connected AI</span></label>
          <button className="secondary full" disabled={connecting || active || busy} onClick={() => void connect(true)}>{connecting ? 'Connecting…' : 'Check connection'}</button>
          {aiStatus && <p role="status" className={aiStatus.connected ? 'inline-message' : 'inline-error'}>{aiStatus.message}</p>}
          <details className="nested connector-help"><summary>First-time setup <span aria-hidden="true">+</span></summary><p className="helper">On macOS or Linux Google Chrome, the connector uses Codex or Claude Code signed in on this computer. From the extracted demo bundle or project folder, run:</p><code>{setupCommand}</code><button className="text-button" onClick={() => { void navigator.clipboard.writeText(setupCommand).then(() => setAiStatus({ connected: false, message: 'Setup command copied. Run it in the extracted bundle or project folder, then check the connection.' })).catch(() => setAiStatus({ connected: false, message: 'Copy the displayed setup command manually.' })); }}>Copy setup command</button><p className="helper">Basic autofill and base résumé previews work without this connection. Windows AI setup is not supported in this release. See START-HERE in your demo bundle.</p></details>
        </div>
      </details>
    </div>
    <footer><Mark small /><span>Nothing is submitted automatically.</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
