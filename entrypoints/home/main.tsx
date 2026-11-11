import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { emptyProfile, YES_NO_OPTIONS, GENDER_OPTIONS, RACE_OPTIONS, VETERAN_OPTIONS, DISABILITY_OPTIONS } from '../../lib/profile';
import { ACCEPTED_RESUME_TYPES, fileToStoredResume } from '../../lib/resume';
import type { Profile } from '../../lib/types';
import type { Fact } from '../../lib/hackathon/contracts';
import type { SidebarState } from '../../lib/sidebar/ui-types';
import './style.css';

const blank = (): SidebarState => ({ profile: emptyProfile(), facts: [], resume: null, run: null, aiEnabled: false });
const sections = [['contact', 'Contact & links'], ['location', 'Location'], ['resume', 'Résumé'], ['education', 'Education'], ['experience', 'Experience & projects'], ['answers', 'Application answers']] as const;
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
type TextField = [keyof Profile, string, string?];
const contact: TextField[] = [['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel']];
const links: TextField[] = [['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Website']];
const locationFields: TextField[] = [['city', 'City'], ['state', 'State / region'], ['country', 'Country'], ['postalCode', 'Postal code']];
const education: TextField[] = [['school', 'School'], ['degree', 'Degree'], ['major', 'Field of study'], ['graduationDate', 'Graduation month', 'month'], ['gpa', 'GPA']];

async function send(type: string, extra: object = {}): Promise<any> {
  const response = await browser.runtime.sendMessage({ type, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Your profile could not be loaded. Please try again.');
  return response.data;
}
function Mark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>; }
function Section({ id, number, title, description, children }: { id: string; number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="profile-section" id={id} aria-labelledby={`${id}-heading`}>
    <header className="section-heading"><span className="section-number" aria-hidden="true">{number}</span><div><h2 id={`${id}-heading`}>{title}</h2><p>{description}</p></div></header>
    <div className="section-content">{children}</div>
  </section>;
}

function App() {
  const [state, setState] = useState<SidebarState>(blank);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [base, setBase] = useState({ profile: emptyProfile(), facts: [] as Fact[] });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [activeSection, setActiveSection] = useState('contact');
  const dirty = JSON.stringify({ profile, facts }) !== JSON.stringify(base);
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const mounted = useRef(true);
  const sequence = useRef(0);
  const adopting = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef(false);

  async function readState(discard: boolean) {
    const request = ++sequence.current;
    const next = await send('sidebar-state') as SidebarState;
    if (!mounted.current || request !== sequence.current) return;
    setState(next); setLoading(false); setLoaded(true);
    if (discard || !dirtyRef.current) { setProfile(next.profile); setFacts(next.facts); setBase({ profile: next.profile, facts: next.facts }); }
  }
  async function load(discard = false): Promise<void> {
    // Saving/reloading must adopt the new revision before allowing another edit.
    // A storage event can arrive while that read is pending; queue it rather
    // than letting its ordinary refresh supersede the explicit adoption.
    if (adopting.current) { if (!discard) refreshQueued.current = true; return adopting.current; }
    if (!discard) return readState(false);
    const pending = readState(true); adopting.current = pending;
    try { await pending; }
    finally {
      if (adopting.current === pending) adopting.current = null;
      if (refreshQueued.current && mounted.current) {
        refreshQueued.current = false;
        void load().catch(e => { if (mounted.current) setError(messageOf(e)); });
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load(true).catch(e => { if (mounted.current) { setLoading(false); setError(messageOf(e)); } });
    const changed = (_changes: unknown, area: string) => { if (area === 'local') void load().catch(e => { if (mounted.current) setError(messageOf(e)); }); };
    browser.storage.onChanged.addListener(changed);
    const leaving = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leaving);
    return () => { mounted.current = false; sequence.current++; browser.storage.onChanged.removeListener(changed); window.removeEventListener('beforeunload', leaving); };
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: '-100px 0px -60% 0px' });
    for (const [id] of sections) { const el = document.getElementById(id); if (el) observer.observe(el); }
    return () => observer.disconnect();
  }, [loading]);
  const change = (key: keyof Profile, value: string) => { setProfile(current => ({ ...current, [key]: value })); setMessage(''); setError(''); };
  const field = ([key, label, type = 'text']: TextField) => <label className="field" key={key}><span>{label}</span><input type={type} value={profile[key]} maxLength={300} onChange={e => change(key, e.target.value)} autoComplete="off" /></label>;
  const choice = (key: keyof Profile, label: string, options: readonly { value: string; label: string }[]) => <label className="field" key={key}><span>{label}</span><select aria-label={label} value={profile[key]} onChange={e => change(key, e.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try { await send('sidebar-save-profile', { profile, facts, expectedProfile: base.profile, expectedFacts: base.facts }); await load(true); setMessage('Profile saved. Autofill will use these details.'); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  async function reloadSaved() {
    setBusy(true); setError(''); setMessage('');
    try { await load(true); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setMessage('');
    try { await send('sidebar-save-resume', { resume: await fileToStoredResume(file, Date.now()) }); await load(); setMessage('Résumé saved and ready to attach.'); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  async function setting(enabled: boolean) {
    setBusy(true); setError('');
    try { await send('sidebar-settings', { aiEnabled: enabled }); await load(); setAiMessage(enabled ? 'AI drafting is enabled for supported questions. Review each draft in the sidebar.' : 'AI drafting is off. Saved details still autofill.'); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  const savedName = [state.profile.firstName, state.profile.lastName].filter(Boolean).join(' ');
  const initials = [state.profile.firstName, state.profile.lastName].map(value => value.trim().charAt(0)).join('') || 'Y';
  const savedBasics = contact.filter(([key]) => state.profile[key].trim()).length + (state.resume ? 1 : 0);
  const changeFact = (id: string, key: 'location' | 'text', value: string) => { setFacts(items => items.map(fact => fact.id === id ? { ...fact, [key]: value } : fact)); setError(''); setMessage(''); };

  return <>
    <a className="skip-link" href="#profile-content">Skip to profile</a>
    <header className="topbar"><a className="brand" href="#contact"><Mark /><span>Job Apply<span className="brand-divider">/</span><span className="brand-page">Your profile</span></span></a><span className="storage-badge"><span aria-hidden="true">●</span> Saved in this browser</span></header>
    <div className="page-shell">
      <aside className="navigation"><p className="eyebrow">YOUR WORKSPACE</p><nav aria-label="Profile sections">{sections.map(([id, label], index) => <a key={id} href={`#${id}`} onClick={() => setActiveSection(id)} aria-current={activeSection === id ? 'location' : undefined}><span className="nav-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{label}</a>)}</nav><div className="nav-note"><span className="note-icon" aria-hidden="true">↗</span><strong>Set up once.<br />Bring it to every application.</strong><p>Open a job application, click Job Apply, then Autofill.</p></div></aside>
      <main id="profile-content">
        <header className="page-heading"><p className="eyebrow">A LITTLE LESS REPETITION</p><h1>Your next application<br />starts here.</h1><p>Keep your information in one place. Autofill uses what you’ve saved, every time.</p></header>
        <div className="profile-overview"><div className="avatar" aria-hidden="true">{initials}</div><div className="profile-identity"><strong>{savedName || 'Make this profile yours'}</strong><span>{state.profile.email || 'Your details, ready when you need them'}</span></div><div className="saved-progress"><div><span>Saved basics</span><strong>{savedBasics}<span> / 5</span></strong></div><progress value={savedBasics} max={5} aria-label="Saved basics" /><small>Four contact details + your résumé</small></div></div>
        {!loaded ? <div className="loading" role="status">{loading ? 'Loading your saved profile…' : 'Your saved profile could not be loaded. Use “Reload saved profile” to try again.'}</div> : <fieldset className="profile-fields" disabled={busy}>
          <Section id="contact" number="01" title="Contact & links" description="The details you shouldn’t have to type again.">
            <div className="field-grid">{contact.map(field)}</div><div className="subheading">FIND YOUR WORK</div><div className="field-grid links-grid">{links.map(field)}</div>
          </Section>
          <Section id="location" number="02" title="Location" description="Your current location, for matching application fields.">
            {field(['addressLine1', 'Street address'])}<div className="field-grid">{locationFields.map(field)}</div>
          </Section>
          <Section id="resume" number="03" title="Résumé" description="Keep one ready to attach when you use Autofill.">
            <div className={`resume-card${state.resume ? ' has-file' : ''}`}><span className="document-icon" aria-hidden="true">▤</span><div><strong>{state.resume?.name || 'Add your résumé'}</strong><p>{state.resume ? 'Saved and ready for your next application.' : 'PDF, Word, RTF or text · up to 4 MB'}</p><label className="upload-button" htmlFor="resume-upload">{state.resume ? 'Replace résumé' : 'Choose résumé'}</label><input id="resume-upload" className="visually-hidden" aria-label="Upload résumé" type="file" accept={ACCEPTED_RESUME_TYPES.join(',')} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></div><span className="file-status" aria-hidden="true">{state.resume ? '✓' : '↑'}</span></div>
            <p className="helper">Uploading saves the file. Enter your profile details below; they aren’t extracted from the résumé automatically.</p>
          </Section>
          <Section id="education" number="04" title="Education" description="Save the school and program you want to use on applications.">
            <div className="field-grid">{education.map(field)}</div><p className="helper">Use your actual degree or program. Leave dates and other details blank if you don’t want them filled.</p>
          </Section>
          <Section id="experience" number="05" title="Experience & projects" description="Give your AI tool the facts behind your work.">
            <div className="field-grid">{field(['currentCompany', 'Current company'])}{field(['currentTitle', 'Current title'])}</div>
            <p className="helper experience-help">Add a role, project, or accomplishment in your own words. These notes support AI drafts; they don’t create employment records on applications.</p>
            <div className="fact-list">{facts.map((fact, index) => <div className="fact-card" key={fact.id}><div className="fact-header"><span>EXPERIENCE {String(index + 1).padStart(2, '0')}</span><button className="text-button remove-button" type="button" aria-label={`Remove experience ${index + 1}`} onClick={() => { setFacts(items => items.filter(item => item.id !== fact.id)); setMessage(''); }}>Remove</button></div><label className="field"><span>Role or project</span><input aria-label={`Role or project ${index + 1}`} value={fact.location} maxLength={300} placeholder="e.g. Customer dashboard project" onChange={e => changeFact(fact.id, 'location', e.target.value)} /></label><label className="field"><span>What you did</span><textarea aria-label={`Experience details ${index + 1}`} value={fact.text} maxLength={2000} placeholder="What did you build, improve, or learn? Include the tools you used and results you can support." onChange={e => changeFact(fact.id, 'text', e.target.value)} /></label></div>)}</div>
            {!facts.length && <div className="empty-experience"><span aria-hidden="true">＋</span><strong>Your work is the starting point.</strong><p>Add a few facts so drafts sound like you and stay grounded in your experience.</p></div>}
            <button className="secondary add-experience" type="button" disabled={facts.length >= 20} onClick={() => { setFacts(items => [...items, { id: crypto.randomUUID(), revision: 1, location: '', text: '' }]); setError(''); setMessage(''); }}><span aria-hidden="true">＋</span> Add experience</button><span className="fact-count">{facts.length} of 20 notes</span>
          </Section>
          <Section id="answers" number="06" title="Application answers" description="Save answers you want reused. “No answer” leaves a question untouched.">
            <div className="field-grid">{choice('workAuthorization', 'Authorized to work in your country?', YES_NO_OPTIONS)}{choice('sponsorship', 'Require employment visa sponsorship?', YES_NO_OPTIONS)}</div><p className="helper">These answers apply to your saved country. Questions about another country stay unanswered.</p>
            <details className="optional-answers"><summary>Voluntary self-identification<span>Optional</span></summary><p className="helper">Only save answers you want used on matching application questions.</p><div className="field-grid">{choice('gender', 'Gender', GENDER_OPTIONS)}{choice('race', 'Race / ethnicity', RACE_OPTIONS)}{choice('veteran', 'Veteran status', VETERAN_OPTIONS)}{choice('disability', 'Disability status', DISABILITY_OPTIONS)}</div></details>
          </Section>
          <section className="ai-card" aria-labelledby="ai-heading"><span className="ai-icon" aria-hidden="true">✦</span><div><h2 id="ai-heading">Your AI, connected to your experience.</h2><p>Use your connected AI account for supported writing questions. You review drafts in the sidebar before using them.</p><label className="ai-toggle"><input type="checkbox" checked={state.aiEnabled} onChange={e => void setting(e.target.checked)} />Use connected AI to draft answers</label><small>No app credits. Your AI account’s normal limits apply.</small>{aiMessage && <p role="status" className="ai-message">{aiMessage}</p>}</div></section>
        </fieldset>}
        <footer className="page-footer">Saved details are reused in the sidebar. Blank fields stay unanswered. You review and submit each application.</footer>
      </main>
    </div>
    <div className="save-dock"><div className="save-dock-inner"><div className="save-message">{error ? <p role="alert" className="error-message">{error}</p> : <p role="status"><span aria-hidden="true">{dirty ? '○' : '✓'}</span>{message || (dirty ? 'You have unsaved changes' : 'Your saved details are ready to reuse')}</p>}{dirty && <small>Autofill uses your last saved profile.</small>}{error && <button type="button" className="text-button" disabled={busy} onClick={() => void reloadSaved()}>Reload saved profile</button>}</div><button className="primary" type="button" disabled={!loaded || loading || busy || !dirty} onClick={() => void save()}>{busy ? 'Saving…' : 'Save profile'}<span aria-hidden="true">↗</span></button></div></div>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
