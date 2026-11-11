import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile } from '../../lib/types';
import type { Fact } from '../../lib/hackathon/contracts';
import { buildResumeDocument, createResumeDocx, inferFactSection, MAX_RESUME_SKILLS } from '../../lib/resume-preview';
import type { ResumeLayout, ResumeSectionKey } from '../../lib/resume-preview';
import './resume-preview.css';

const labels: [ResumeSectionKey, string][] = [['contact', 'Email & phone'], ['location', 'Location'], ['links', 'Links'], ['experience', 'Experience'], ['projects', 'Projects'], ['education', 'Education'], ['skills', 'Skills']];

export function ResumePreview({ profile, facts, layout, onChange, dirty, disabled }: {
  profile: Profile; facts: Fact[]; layout: ResumeLayout; onChange: (value: ResumeLayout) => void; dirty: boolean; disabled: boolean;
}) {
  const document = useMemo(() => buildResumeDocument(profile, facts, layout), [profile, facts, layout]);
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
      const bytes = createResumeDocx(document);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = window.document.createElement('a'); link.href = url;
      link.download = `${document.name.replace(/[^a-z0-9 -]/gi, '').trim().replace(/\s+/g, '-') || 'My'}-resume.docx`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { setDownloadError('The Word file could not be created. Your saved résumé has not changed.'); }
  }
  const hasContent = !!document.name || document.sections.length > 0;
  return <aside className="resume-preview" aria-label="Résumé preview">
    <div className="preview-heading"><div><p className="eyebrow">YOUR RÉSUMÉ</p><h2>See it come together.</h2></div><span className="preview-live"><i aria-hidden="true" /> Live preview</span></div>
    <p className="preview-description">Your profile, in your usual template. Edits appear here as you type.</p>
    <fieldset className="preview-controls" disabled={disabled}>
      <details className="preview-options"><summary>Choose what to include<span aria-hidden="true">＋</span></summary>
        <div className="preview-section-choices">{labels.map(([key, label]) => <label key={key}><input type="checkbox" checked={layout.sections[key]} onChange={e => onChange({ ...layout, sections: { ...layout.sections, [key]: e.target.checked } })} /><span>{label}</span></label>)}</div>
        <p className="preview-help">These switches affect the résumé only. Application autofill has its own switches in your profile.</p>
        {facts.length > 0 && <div className="preview-note-choices">{facts.map((fact, index) => {
          const selected = layout.facts[fact.id] ?? { included: true, section: inferFactSection(fact) };
          return <div key={fact.id}><label><input type="checkbox" aria-label={`Include note ${index + 1} in résumé`} checked={selected.included} onChange={e => setFact(fact.id, { included: e.target.checked })} /><span>{fact.location || `Experience ${index + 1}`}</span></label><select aria-label={`Résumé section for note ${index + 1}`} value={selected.section} onChange={e => setFact(fact.id, { section: e.target.value as 'experience' | 'projects' })}><option value="experience">Experience</option><option value="projects">Projects</option></select></div>;
        })}</div>}
        <label className="field preview-skills"><span>Skills to include</span><textarea aria-label="Résumé skills" value={layout.skills} maxLength={MAX_RESUME_SKILLS} onChange={e => onChange({ ...layout, skills: e.target.value })} placeholder="Add the skills you want listed, in your own words." /></label>
      </details>
      <div className="preview-actions"><button type="button" className="secondary" disabled={!hasContent} onClick={download}>Download Word</button><button type="button" className="secondary" disabled={!hasContent} onClick={() => window.print()}>Print / save PDF</button></div>
    </fieldset>
    <div className="preview-meta"><span>Classic · US Letter</span><span>{dirty ? 'Unsaved preview' : 'Saved profile'}</span></div>
    {downloadError && <p className="preview-warning" role="alert">{downloadError}</p>}
    {document.warnings.map((warning, index) => <p key={index} className="preview-warning">{warning}</p>)}
    {size.height > 1058 && <p className="preview-warning">This draft is longer than one page. Shorten notes or switch off entries to keep it to one page. Nothing is hidden from the export.</p>}
    <div className="paper-viewport" ref={viewport}><div className="paper-stage" style={{ height: size.height * size.scale }}>
      <article className="resume-paper" ref={paper} style={{ transform: `scale(${size.scale})` }} aria-label="Résumé document">
        <header className="resume-document-header"><h1>{document.name || 'Your name'}</h1><div>{document.contact.map((item, index) => <span key={index}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.text}</a> : item.text}</span>)}</div></header>
        {!hasContent && <p className="paper-empty">Add your information or import a résumé to start your preview.</p>}
        {document.sections.map(section => <section className="resume-document-section" key={section.key}><h2>{section.title}</h2>{section.entries.map(entry => <div className="resume-document-entry" key={entry.id}><div className="resume-entry-heading"><div><strong>{entry.heading}{entry.detail && <span> | {entry.detail}</span>}</strong>{entry.link && <span className="resume-entry-link">{entry.heading || entry.detail ? ' | ' : ''}{entry.link.href ? <a href={entry.link.href} target="_blank" rel="noreferrer">{entry.link.text}</a> : entry.link.text}</span>}</div>{entry.date && <span className="resume-entry-date">{entry.date}</span>}</div>{entry.lines.some(line => line.trim()) && <ul>{entry.lines.filter(line => line.trim()).map((line, index) => <li className={/^\s*[•*\-–—]\s/.test(line) ? 'source-bullet' : undefined} key={index}>{line}</li>)}</ul>}</div>)}</section>)}
      </article>
    </div></div>
    <p className="preview-footnote">Exports use this preview. Your uploaded application résumé stays unchanged until you replace it.</p>
  </aside>;
}
