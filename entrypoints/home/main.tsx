import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { emptyProfile, YES_NO_OPTIONS, GENDER_OPTIONS, RACE_OPTIONS, VETERAN_OPTIONS, DISABILITY_OPTIONS } from '../../lib/profile';
import { ACCEPTED_RESUME_TYPES, fileToStoredResume } from '../../lib/resume';
import { MAX_IMPORT_TEXT, parseResume, proposeResumeImport } from '../../lib/resume-import';
import type { Profile } from '../../lib/types';
import type { Fact } from '../../lib/hackathon/contracts';
import type { SidebarState } from '../../lib/sidebar/ui-types';
import { defaultResumeLayout, normalizeResumeLayout } from '../../lib/resume-preview';
import type { ResumeLayout } from '../../lib/resume-preview';
import { ResumePreview } from './resume-preview';
import './style.css';

const blank = (): SidebarState => ({ profile: emptyProfile(), facts: [], resume: null, run: null, aiEnabled: false });
const sections = [['contact', 'Contact & links'], ['location', 'Location'], ['resume', 'Résumé'], ['education', 'Education'], ['experience', 'Experience & projects'], ['answers', 'Application answers']] as const;
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
type TextField = [keyof Profile, string, string?];
const contact: TextField[] = [['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel']];
const links: TextField[] = [['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Website']];
const locationFields: TextField[] = [['city', 'City'], ['state', 'State / region'], ['country', 'Country'], ['postalCode', 'Postal code']];
const education: TextField[] = [['school', 'School'], ['degree', 'Degree'], ['major', 'Field of study'], ['graduationDate', 'Graduation month', 'month'], ['gpa', 'GPA']];
const importableFields = new Map<keyof Profile, string>([...contact, ...links, ...locationFields, ...education, ['addressLine1', 'Street address']].map(([key, label]) => [key, label] as [keyof Profile, string]));
type ImportProposal = { fields: Partial<Profile>; facts: { location: string; text: string }[]; warnings: string[]; evidence: Partial<Record<keyof Profile, string>> };
type ImportedField = { key: keyof Profile; label: string; value: string; evidence?: string; status: 'added' | 'kept' | 'same' };
type ImportReview = { name: string; text: string; reviewedText: string; fields: ImportedField[]; addedFacts: number; warnings: string[] };
const sameNote = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

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
function ImportPanel({ review, onText, onUse }: { review: ImportReview; onText: (text: string) => void; onUse: () => void }) {
  return <section className="import-review" aria-labelledby="resume-import-heading"><div className="import-heading"><span aria-hidden="true">✓</span><div><h3 id="resume-import-heading">Résumé details ready to review</h3><p>{review.fields.filter(item => item.status === 'added').length} details added · {review.addedFacts} experience {review.addedFacts === 1 ? 'note' : 'notes'} added · {review.fields.filter(item => item.status === 'kept').length} existing values kept</p></div></div><p className="helper">These are editable profile drafts. Check them before choosing Save profile.</p>
    {review.warnings.length > 0 && <ul className="import-warnings">{review.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    <details className="import-details"><summary>Review what was found<span>{review.fields.length} details</span></summary>{review.fields.length ? <dl>{review.fields.map(item => <div key={item.key}><dt>{item.label}<small>{item.status === 'added' ? 'Added to draft' : item.status === 'same' ? 'Already in your profile' : 'Kept your existing value'}</small></dt><dd>{item.value}{item.evidence && <small>From résumé: {item.evidence}</small>}</dd></div>)}</dl> : <p className="helper">No clear profile fields were found. You can review the text and enter details yourself.</p>}</details>
    <details className="import-details"><summary>Extracted résumé text<span>Review or edit</span></summary><label className="field"><span>Résumé text</span><textarea aria-label="Extracted résumé text" value={review.text} maxLength={MAX_IMPORT_TEXT} onChange={e => onText(e.target.value)} /></label><p className="helper">Use edited text to find more details for blank fields. Correct existing values directly in your profile.</p><button className="secondary" type="button" disabled={review.text === review.reviewedText || !review.text.trim()} onClick={onUse}>Use edited text</button></details>
  </section>;
}

function App() {
  const [state, setState] = useState<SidebarState>(blank);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [resumeLayout, setResumeLayout] = useState<ResumeLayout>(defaultResumeLayout);
  const [base, setBase] = useState({ profile: emptyProfile(), facts: [] as Fact[], resumeLayout: defaultResumeLayout() });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [readingResume, setReadingResume] = useState(false);
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [importError, setImportError] = useState('');
  const [activeSection, setActiveSection] = useState('contact');
  const dirty = JSON.stringify({ profile, facts, resumeLayout }) !== JSON.stringify(base);
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const draftRef = useRef({ profile, facts }); draftRef.current = { profile, facts };
  const mounted = useRef(true);
  const sequence = useRef(0);
  const adopting = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef(false);

  async function readState(discard: boolean) {
    const request = ++sequence.current;
    const next = await send('sidebar-state') as SidebarState;
    if (!mounted.current || request !== sequence.current) return;
    setState(next); setLoading(false); setLoaded(true);
    if (discard || !dirtyRef.current) { const layout = normalizeResumeLayout(next.resumeLayout); draftRef.current = { profile: next.profile, facts: next.facts }; setProfile(next.profile); setFacts(next.facts); setResumeLayout(layout); setBase({ profile: next.profile, facts: next.facts, resumeLayout: layout }); }
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
  const toggle = (key: keyof Profile, label: string) => <label className="section-toggle"><input type="checkbox" checked={profile[key] !== 'no'} onChange={e => change(key, e.target.checked ? 'yes' : 'no')} /><span>{label}</span></label>;
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try { await send('sidebar-save-profile', { profile, facts, resumeLayout, expectedProfile: base.profile, expectedFacts: base.facts, expectedResumeLayout: base.resumeLayout }); await load(true); setMessage('Profile saved. Autofill will use these details.'); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  async function reloadSaved() {
    setBusy(true); setError(''); setMessage('');
    try { await load(true); setImportReview(null); setImportError(''); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  function useImport(proposal: ImportProposal, text: string, name: string) {
    const nextProfile = { ...draftRef.current.profile };
    const nextFacts = [...draftRef.current.facts];
    const imported: ImportedField[] = [];
    for (const [key, label] of importableFields) {
      const value = proposal.fields[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 300) continue;
      const existing = nextProfile[key].trim();
      const status = !existing ? 'added' : existing === value.trim() ? 'same' : 'kept';
      if (!existing) Object.assign(nextProfile, { [key]: value.trim() });
      imported.push({ key, label, value, evidence: proposal.evidence[key], status });
    }
    let addedFacts = 0; let omittedFacts = 0;
    for (const note of proposal.facts) {
      if (!note.location.trim() || !note.text.trim() || note.location.length > 300 || note.text.length > 2000 || nextFacts.some(fact => sameNote(fact.text) === sameNote(note.text))) continue;
      if (nextFacts.length >= 20) { omittedFacts++; continue; }
      nextFacts.push({ id: crypto.randomUUID(), revision: 1, location: note.location, text: note.text }); addedFacts++;
    }
    const hasChanges = imported.some(field => field.status === 'added') || addedFacts > 0;
    // Mark the draft synchronously so an already-pending storage refresh cannot
    // discard imported values before React has rendered the new draft.
    if (hasChanges) dirtyRef.current = true;
    draftRef.current = { profile: nextProfile, facts: nextFacts };
    setProfile(nextProfile); setFacts(nextFacts);
    const review = { name, text, reviewedText: text, fields: imported, addedFacts, warnings: [...proposal.warnings, ...(omittedFacts ? [`${omittedFacts} additional experience notes were left out because your profile already has 20 notes.`] : [])] };
    setImportReview(review); setImportError('');
    setMessage(hasChanges ? 'Résumé saved. Review the imported details, then save your profile.' : 'Résumé saved. Your existing profile details were kept.');
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setImportError(''); setImportReview(null); setMessage('Saving your résumé…');
    try {
      await send('sidebar-save-resume', { resume: await fileToStoredResume(file, Date.now()) }); await load();
      setReadingResume(true); setMessage('Résumé saved. Reading its text…');
      try { const parsed = await parseResume(file); if (mounted.current) useImport(parsed, parsed.text, file.name); }
      catch (e) { setImportError(`The résumé is saved for attachments, but its text could not be imported. ${messageOf(e)}`); setMessage('Résumé saved. Your profile details were left unchanged.'); }
    }
    catch (e) { setError(messageOf(e)); }
    finally { setReadingResume(false); setBusy(false); }
  }
  function useEditedText() {
    if (!importReview) return;
    setError('');
    try { useImport(proposeResumeImport(importReview.text, importReview.name), importReview.text, importReview.name); }
    catch (e) { setImportError(messageOf(e)); }
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
    <div className="page-shell with-preview">
      <aside className="navigation"><p className="eyebrow">YOUR WORKSPACE</p><nav aria-label="Profile sections">{sections.map(([id, label], index) => <a key={id} href={`#${id}`} onClick={() => setActiveSection(id)} aria-current={activeSection === id ? 'location' : undefined}><span className="nav-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{label}</a>)}</nav><div className="nav-note"><span className="note-icon" aria-hidden="true">↗</span><strong>Set up once.<br />Bring it to every application.</strong><p>Open a job application, click Job Apply, then Autofill.</p></div></aside>
      <main id="profile-content">
        <header className="page-heading"><p className="eyebrow">A LITTLE LESS REPETITION</p><h1>Your next application<br />starts here.</h1><p>Keep your information in one place. Autofill uses what you’ve saved, every time.</p><a className="resume-start" href="#resume">Start with your résumé <span aria-hidden="true">↗</span></a></header>
        <div className="profile-overview"><div className="avatar" aria-hidden="true">{initials}</div><div className="profile-identity"><strong>{savedName || 'Make this profile yours'}</strong><span>{state.profile.email || 'Your details, ready when you need them'}</span></div><div className="saved-progress"><div><span>Saved basics</span><strong>{savedBasics}<span> / 5</span></strong></div><progress value={savedBasics} max={5} aria-label="Saved basics" /><small>Four contact details + your résumé</small></div></div>
        {!loaded ? <div className="loading" role="status">{loading ? 'Loading your saved profile…' : 'Your saved profile could not be loaded. Use “Reload saved profile” to try again.'}</div> : <fieldset className="profile-fields" disabled={busy}>
          <Section id="contact" number="01" title="Contact & links" description="The details you shouldn’t have to type again.">
            <div className="field-grid">{contact.map(field)}</div><div className="subheading">FIND YOUR WORK</div><div className="field-grid links-grid">{links.map(field)}</div>
          </Section>
          <Section id="location" number="02" title="Location" description="Your current location, for matching application fields.">
            {toggle('fillLocation', 'Autofill my location')}
            {field(['addressLine1', 'Street address'])}<div className="field-grid">{locationFields.map(field)}</div>
          </Section>
          <Section id="resume" number="03" title="Résumé" description="Upload once. We’ll read the text and start your profile for you.">
            <div className={`resume-card${state.resume ? ' has-file' : ''}`}><span className="document-icon" aria-hidden="true">▤</span><div><strong>{state.resume?.name || 'Add your résumé'}</strong><p>{state.resume ? 'Saved and ready for your next application.' : 'PDF, Word, RTF or text · up to 4 MB'}</p><label className="upload-button" htmlFor="resume-upload">{state.resume ? 'Replace résumé' : 'Choose résumé'}</label><input id="resume-upload" className="visually-hidden" aria-label="Upload résumé" type="file" accept={ACCEPTED_RESUME_TYPES.join(',')} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></div><span className="file-status" aria-hidden="true">{state.resume ? '✓' : '↑'}</span></div>
            <p className="helper">PDF, DOCX and text files can fill blank profile fields and add experience notes. Your existing details stay as they are. Review the result, then save your profile.</p>
            {readingResume && <p className="import-reading">Reading your résumé in this browser…</p>}
            {importError && <p className="import-warning" role="alert">{importError}</p>}
            {importReview && <ImportPanel review={importReview} onText={text => setImportReview(current => current ? { ...current, text } : current)} onUse={useEditedText} />}
          </Section>
          <Section id="education" number="04" title="Education" description="Save the school and program you want to use on applications.">
            {toggle('fillEducation', 'Autofill my education')}
            <div className="field-grid">{education.map(field)}</div><p className="helper">Use your actual degree or program. Leave dates and other details blank if you don’t want them filled.</p>
          </Section>
          <Section id="experience" number="05" title="Experience & projects" description="Give your AI tool the facts behind your work.">
            {toggle('fillEmployment', 'Autofill my current company and title')}
            <div className="field-grid">{field(['currentCompany', 'Current company'])}{field(['currentTitle', 'Current title'])}</div>
            <p className="helper experience-help">Add a role, project, or accomplishment in your own words. These notes support AI drafts; they don’t create employment records on applications.</p>
            <div className="fact-list">{facts.map((fact, index) => <div className="fact-card" key={fact.id}><div className="fact-header"><span>EXPERIENCE {String(index + 1).padStart(2, '0')}</span><button className="text-button remove-button" type="button" aria-label={`Remove experience ${index + 1}`} onClick={() => { setFacts(items => items.filter(item => item.id !== fact.id)); setMessage(''); }}>Remove</button></div><label className="field"><span>Role or project</span><input aria-label={`Role or project ${index + 1}`} value={fact.location} maxLength={300} placeholder="e.g. Customer dashboard project" onChange={e => changeFact(fact.id, 'location', e.target.value)} /></label><label className="field"><span>What you did</span><textarea aria-label={`Experience details ${index + 1}`} value={fact.text} maxLength={2000} placeholder="What did you build, improve, or learn? Include the tools you used and results you can support." onChange={e => changeFact(fact.id, 'text', e.target.value)} /></label></div>)}</div>
            {!facts.length && <div className="empty-experience"><span aria-hidden="true">＋</span><strong>Your work is the starting point.</strong><p>Add a few facts so drafts sound like you and stay grounded in your experience.</p></div>}
            <button className="secondary add-experience" type="button" disabled={facts.length >= 20} onClick={() => { setFacts(items => [...items, { id: crypto.randomUUID(), revision: 1, location: '', text: '' }]); setError(''); setMessage(''); }}><span aria-hidden="true">＋</span> Add experience</button><span className="fact-count">{facts.length} of 20 notes</span>
          </Section>
          <Section id="answers" number="06" title="Application answers" description="Save answers you want reused. “No answer” leaves a question untouched.">
            {toggle('fillEligibility', 'Autofill my saved eligibility answers')}
            <div className="field-grid">{field(['citizenshipCountry', 'Country of citizenship'])}{field(['nationality', 'Nationality'])}{choice('usCitizenship', 'Are you a U.S. citizen?', YES_NO_OPTIONS)}</div><p className="helper">Enter these separately from where you live. Only simple, matching questions use them; declarations that combine several conditions still need your review.</p>
            <div className="field-grid">{choice('workAuthorization', 'Authorized to work in your country?', YES_NO_OPTIONS)}{choice('sponsorship', 'Require employment visa sponsorship?', YES_NO_OPTIONS)}</div><p className="helper">These answers apply to your saved country. Questions about another country stay unanswered.</p>
            <details className="optional-answers"><summary>Voluntary self-identification<span>Optional</span></summary><p className="helper">Only save answers you want used on matching application questions.</p><div className="field-grid">{choice('gender', 'Gender', GENDER_OPTIONS)}{choice('race', 'Race / ethnicity', RACE_OPTIONS)}{choice('veteran', 'Veteran status', VETERAN_OPTIONS)}{choice('disability', 'Disability status', DISABILITY_OPTIONS)}</div></details>
          </Section>
          <section className="ai-card" aria-labelledby="ai-heading"><span className="ai-icon" aria-hidden="true">✦</span><div><h2 id="ai-heading">Your AI, connected to your experience.</h2><p>Use your connected AI account for supported writing questions. You review drafts in the sidebar before using them.</p><label className="ai-toggle"><input type="checkbox" checked={state.aiEnabled} onChange={e => void setting(e.target.checked)} />Use connected AI to draft answers</label><small>No app credits. Your AI account’s normal limits apply.</small>{aiMessage && <p role="status" className="ai-message">{aiMessage}</p>}</div></section>
        </fieldset>}
        <footer className="page-footer">Saved details are reused in the sidebar. Blank fields stay unanswered. You review and submit each application.</footer>
      </main>
      {loaded && <ResumePreview profile={profile} facts={facts} layout={resumeLayout} onChange={layout => { setResumeLayout(layout); setMessage(''); setError(''); }} dirty={dirty} disabled={busy} />}
    </div>
    <div className="save-dock"><div className="save-dock-inner"><div className="save-message">{error ? <p role="alert" className="error-message">{error}</p> : <p role="status"><span aria-hidden="true">{dirty ? '○' : '✓'}</span>{message || (dirty ? 'You have unsaved changes' : 'Your saved details are ready to reuse')}</p>}{dirty && <small>Autofill uses your last saved profile.</small>}{error && <button type="button" className="text-button" disabled={busy} onClick={() => void reloadSaved()}>Reload saved profile</button>}</div><button className="primary" type="button" disabled={!loaded || loading || busy || !dirty} onClick={() => void save()}>{readingResume ? 'Reading résumé…' : busy ? 'Saving…' : 'Save profile'}<span aria-hidden="true">↗</span></button></div></div>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
