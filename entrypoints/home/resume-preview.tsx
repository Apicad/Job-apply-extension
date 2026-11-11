import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile } from '../../lib/types';
import type { Fact } from '../../lib/hackathon/contracts';
import { buildResumeDocument, createResumeDocx, inferFactSection, MAX_RESUME_SKILLS } from '../../lib/resume-preview';
import type { ResumeLayout, ResumeSectionKey } from '../../lib/resume-preview';
import { createCoverLetterDocx, materialResumeDocument } from '../../lib/materials';
import type { MaterialsController } from './materials';
import './resume-preview.css';

const labels: [ResumeSectionKey, string][] = [['summary', 'Professional summary'], ['contact', 'Email & phone'], ['location', 'Location'], ['links', 'Links'], ['experience', 'Experience'], ['projects', 'Projects'], ['education', 'Education'], ['skills', 'Skills']];

export function ResumePreview({ profile, facts, layout, onChange, dirty, disabled, materials }: {
  profile: Profile; facts: Fact[]; layout: ResumeLayout; onChange: (value: ResumeLayout) => void; dirty: boolean; disabled: boolean; materials?: MaterialsController;
}) {
  const baseDocument = useMemo(() => buildResumeDocument(profile, facts, layout), [profile, facts, layout]);
  const tailored = !!materials?.draft && materials.view !== 'base';
  const letter = tailored && materials?.view === 'letter';
  const document = useMemo(() => {
    const value = tailored && materials?.draft && !letter ? materialResumeDocument(baseDocument, materials.draft.response) : baseDocument;
    return layout.sections.summary ? value : { ...value, sections: value.sections.filter(section => section.key !== 'summary') };
  }, [baseDocument, tailored, letter, materials?.draft, layout.sections.summary]);
  const viewport = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ scale: .6, height: 1056 });
  const [downloadError, setDownloadError] = useState('');
  useEffect(() => {
    const measure = () => {
      if (viewport.current && paper.current) setSize({ scale: Math.min(1, viewport.current.clientWidth / 816), height: paper.current.offsetHeight });
    };
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (paper.current) observer.observe(paper.current);
    measure();
    return () => observer.disconnect();
  }, []);
  const setFact = (id: string, value: Partial<ResumeLayout['facts'][string]>) => {
    const fact = facts.find(item => item.id === id);
    if (!fact) return;
    onChange({ ...layout, facts: { ...layout.facts, [id]: { section: inferFactSection(fact), included: true, ...layout.facts[id], ...value } } });
  };
  function download() {
    setDownloadError('');
    try {
      if (tailored && !materials?.canExport) return;
      const bytes = letter && materials?.draft ? createCoverLetterDocx(baseDocument, materials.draft.request.brief, materials.draft.response.coverLetter) : createResumeDocx(document);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = window.document.createElement('a'); link.href = url;
      link.download = `${document.name.replace(/[^a-z0-9 -]/gi, '').trim().replace(/\s+/g, '-') || 'My'}-${letter ? 'cover-letter' : tailored ? 'tailored-resume' : 'resume'}.docx`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { setDownloadError('The Word file could not be created. Your saved résumé has not changed.'); }
  }
  const hasContent = !!document.name || document.sections.length > 0;
  return <aside className="resume-preview" aria-label="Résumé preview">
    <div className="preview-heading"><div><p className="eyebrow">YOUR RÉSUMÉ</p><h2>See it come together.</h2></div><span className="preview-live"><i aria-hidden="true" /> Live preview</span></div>
    <p className="preview-description">{tailored ? 'Created from your experience for this opportunity. Review the writing before downloading.' : 'Your general résumé. Edit your profile and choose the sections, style and length you want.'}</p>
    {materials && <div className="document-tabs" aria-label="Document preview"><button type="button" aria-pressed={materials.view === 'base'} onClick={() => materials.setView('base')}>General résumé</button><button type="button" disabled={!materials.draft} aria-pressed={materials.view === 'resume'} onClick={() => materials.setView('resume')}>Tailored résumé</button><button type="button" disabled={!materials.draft} aria-pressed={materials.view === 'letter'} onClick={() => materials.setView('letter')}>Cover letter</button></div>}
    <fieldset className="preview-controls" disabled={disabled}>
      {!tailored && <details className="preview-options"><summary>Choose what to include<span aria-hidden="true">＋</span></summary>
        <label className="field"><span>Résumé style</span><select aria-label="Résumé style" value={layout.template} onChange={e => onChange({ ...layout, template: e.target.value as ResumeLayout['template'] })}><option value="professional">Professional · clearer spacing</option><option value="classic">Classic · compact</option></select></label>
        <label className="field"><span>Length preference</span><select aria-label="Length preference" value={layout.pagePreference} onChange={e => onChange({ ...layout, pagePreference: e.target.value as ResumeLayout['pagePreference'] })}><option value="one">Aim for one page</option><option value="multiple">Allow multiple pages</option></select></label>
        <label className="field"><span>Professional summary</span><textarea aria-label="Professional summary" value={layout.summary} maxLength={3000} onChange={e => onChange({ ...layout, summary: e.target.value })} placeholder="Introduce the work you do, the strengths you can support, and the roles you are pursuing." /></label>
        <div className="preview-section-choices">{labels.map(([key, label]) => <label key={key}><input type="checkbox" checked={layout.sections[key]} onChange={e => onChange({ ...layout, sections: { ...layout.sections, [key]: e.target.checked } })} /><span>{label}</span></label>)}</div>
        <p className="preview-help">These switches affect the résumé only. Application autofill has its own switches in your profile.</p>
        {facts.length > 0 && <div className="preview-note-choices">{facts.map((fact, index) => {
          const selected = layout.facts[fact.id] ?? { included: true, section: inferFactSection(fact) };
          return <div key={fact.id}><label><input type="checkbox" aria-label={`Include note ${index + 1} in résumé`} checked={selected.included} onChange={e => setFact(fact.id, { included: e.target.checked })} /><span>{fact.location || `Experience ${index + 1}`}</span></label><select aria-label={`Résumé section for note ${index + 1}`} value={selected.section} onChange={e => setFact(fact.id, { section: e.target.value as 'experience' | 'projects' })}><option value="experience">Experience</option><option value="projects">Projects</option></select></div>;
        })}</div>}
        <label className="field preview-skills"><span>Skills to include</span><textarea aria-label="Résumé skills" value={layout.skills} maxLength={MAX_RESUME_SKILLS} onChange={e => onChange({ ...layout, skills: e.target.value })} placeholder="Add the skills you want listed, in your own words." /></label>
      </details>}
      <div className="preview-actions"><button type="button" className="secondary" disabled={!hasContent || tailored && !materials?.canExport} onClick={download}>Download Word</button><button type="button" className="secondary" disabled={!hasContent || tailored && !materials?.canExport} onClick={() => window.print()}>Print / save PDF</button></div>
    </fieldset>
    <div className="preview-meta"><span>{layout.template === 'professional' ? 'Professional' : 'Classic'} · US Letter · {layout.pagePreference === 'one' ? 'One-page preference' : 'Multiple pages allowed'}</span><span>{tailored ? materials?.canExport ? 'Reviewed draft' : 'Needs your review' : dirty ? 'Unsaved preview' : 'Saved profile'}</span></div>
    {tailored && !materials?.canExport && <p className="materials-preview-hint">{materials?.stale ? 'Your source information changed. Create new drafts to use this version.' : 'Review both documents in the editor, then mark them reviewed to enable downloads.'}</p>}
    {downloadError && <p className="preview-warning" role="alert">{downloadError}</p>}
    {baseDocument.warnings.map((warning, index) => <p key={index} className="preview-warning">{warning}</p>)}
    {tailored && materials && materials.reviewNotices.warnings.length + materials.reviewNotices.missing.length > 0 && <p className="materials-preview-hint"><a href="#materials-review">Review {materials.reviewNotices.warnings.length + materials.reviewNotices.missing.length} document {materials.reviewNotices.warnings.length + materials.reviewNotices.missing.length === 1 ? 'note' : 'notes'}</a></p>}
    {size.height > 1058 && layout.pagePreference === 'one' && <p className="preview-warning">This draft is longer than one page. Choose multiple pages, shorten notes, or switch off entries. Nothing is hidden from the export.</p>}
    <div className="paper-viewport" ref={viewport}><div className="paper-stage" style={{ height: size.height * size.scale }}>
      <article className={`resume-paper template-${layout.template}`} ref={paper} style={{ transform: `scale(${size.scale})` }} aria-label="Résumé document">
        <header className="resume-document-header"><h1>{document.name || 'Your name'}</h1><div>{document.contact.map((item, index) => <span key={index}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.text}</a> : item.text}</span>)}</div></header>
        {!hasContent && <p className="paper-empty">Add your information or import a résumé to start your preview.</p>}
        {letter && materials?.draft ? <div className="cover-letter-body"><p className="cover-letter-subject">{[materials.draft.request.brief.role, materials.draft.request.brief.company].filter(Boolean).join(' · ') || 'Application'}</p><p>Dear hiring team,</p>{materials.draft.response.coverLetter.map((paragraph, index) => <p key={index}>{paragraph.text}</p>)}<p>Sincerely,<br />{document.name}</p></div> : document.sections.map(section => <section className="resume-document-section" key={section.key}><h2>{section.title}</h2>{section.entries.map(entry => <div className="resume-document-entry" key={entry.id}><div className="resume-entry-heading"><div><strong>{entry.heading}{entry.detail && <span> | {entry.detail}</span>}</strong>{entry.link && <span className="resume-entry-link">{entry.heading || entry.detail ? ' | ' : ''}{entry.link.href ? <a href={entry.link.href} target="_blank" rel="noreferrer">{entry.link.text}</a> : entry.link.text}</span>}</div>{entry.date && <span className="resume-entry-date">{entry.date}</span>}</div>{section.key === 'summary' ? entry.lines.map((line, index) => <p className="resume-summary" key={index}>{line}</p>) : entry.lines.some(line => line.trim()) && <ul>{entry.lines.filter(line => line.trim()).map((line, index) => <li className={/^\s*[•*\-–—]\s/.test(line) ? 'source-bullet' : undefined} key={index}>{line}</li>)}</ul>}</div>)}</section>)}
      </article>
    </div></div>
    <p className="preview-footnote">Exports use this preview. Your uploaded application résumé stays unchanged until you replace it.</p>
  </aside>;
}
