import { normalizeProfile, MONTH_NAMES, yearAndMonth } from '../profile';
import type { Profile } from '../types';
import type { Fact } from '../hackathon/contracts';
import type { ResumeContact, ResumeDocument, ResumeEntry, ResumeFactSection, ResumeLayout, ResumeSectionKey } from './types';

export const MAX_RESUME_SKILLS = 6000;
const SECTION_KEYS: ResumeSectionKey[] = ['contact', 'location', 'links', 'experience', 'projects', 'education', 'skills'];
const own = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try { return Object.getOwnPropertyDescriptor(value, key)?.value; } catch { return undefined; }
};

export function defaultResumeLayout(): ResumeLayout {
  return { sections: { contact: true, location: true, links: true, experience: true, projects: true, education: true, skills: true }, facts: {}, skills: '' };
}
export function normalizeResumeLayout(input: unknown): ResumeLayout {
  const result = defaultResumeLayout();
  const sections = own(input, 'sections');
  for (const key of SECTION_KEYS) { const value = own(sections, key); if (typeof value === 'boolean') result.sections[key] = value; }
  const facts = own(input, 'facts');
  if (facts && typeof facts === 'object' && !Array.isArray(facts)) {
    let keys: string[] = []; try { keys = Object.keys(facts).slice(0, 200); } catch { /* Invalid stored data falls back to defaults. */ }
    for (const id of keys) {
      if (!id || id.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(id)) continue;
      const value = own(facts, id);
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const section = own(value, 'section');
      result.facts[id] = { section: section === 'projects' ? 'projects' : 'experience', included: own(value, 'included') !== false };
    }
  }
  const skills = own(input, 'skills');
  if (typeof skills === 'string' && skills.length <= MAX_RESUME_SKILLS) result.skills = skills.replace(/\r\n?/g, '\n');
  return result;
}

/** Safe, clickable links. An unsafe saved value may still be shown as plain text. */
export function safeResumeLink(value: string): string | undefined {
  const text = value.trim();
  if (!text || text.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(text)) return undefined;
  const candidate = /^https?:\/\//i.test(text) ? text : /^(?:www\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?:\/|$)/i.test(text) ? `https://${text}` : '';
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

const linesOf = (text: string): string[] => text.replace(/\r\n?/g, '\n').split('\n');
const firstLine = (fact: Fact): string => linesOf(fact.text).find(line => line.trim())?.trim() ?? '';
function sourceHeading(fact: Fact): string {
  // The file prefix is provenance, not a role or project title. The remainder
  // remains exactly as saved; no employer/title/date is synthesized.
  return fact.location.replace(/^.{1,150}\.(?:pdf|docx?|txt|rtf)\s+[—–]\s+/i, '').trim();
}
function employmentHeader(line: string): { heading: string; detail: string; date: string } | undefined {
  const parts = line.split('|').map(part => part.trim());
  const date = parts.at(-1) ?? '';
  if (parts.length < 4 || parts.some(part => !part) || !/\b(?:19|20)\d{2}\b/.test(date) || !/(?:[-–—]|\bto\b|\bpresent\b)/i.test(date)) return undefined;
  return { heading: parts[0]!, detail: parts.slice(1, -1).join(' | '), date };
}
function projectTextHeader(fact: Fact): boolean {
  const first = firstLine(fact);
  const source = sourceHeading(fact);
  if (employmentHeader(first)) return false;
  if (/^project\s*[:|—–-]/i.test(first)) return true;
  // Imported project notes carry the exact project heading as their source.
  // A prose sentence or a single ambiguous note does not establish a project.
  return linesOf(fact.text).filter(line => line.trim()).length > 1 && first.length <= 180 && !/^(?:I|we|built|implemented|developed|created|worked|supported|led)\b/i.test(first)
    && !/[.!?]$/.test(first) && first.split('|')[0]?.trim() === source;
}
export function inferFactSection(fact: Fact): ResumeFactSection {
  const first = firstLine(fact);
  if (employmentHeader(first)) return 'experience';
  if (/\bprojects?\b/i.test(sourceHeading(fact)) || /^project\s*[:|—–-]/i.test(first)) return 'projects';
  // A matching title alone could be an employer. Only a labelled project or
  // a title with an explicit project link/technology header is auto-grouped.
  // The user can assign any ambiguous note to Projects in the preview.
  const detail = first.split('|').slice(1);
  const projectDetail = detail.some(part => !!safeResumeLink(part))
    || detail.some(part => /\b(?:React|TypeScript|JavaScript|Python|Next\.js|Node\.js|D3\.js|Vue|Angular|Svelte|Django|Flask|SwiftUI)\b/i.test(part));
  return projectTextHeader(fact) && projectDetail ? 'projects' : 'experience';
}

function buildEntry(fact: Fact, section: ResumeFactSection): ResumeEntry {
  const allLines = linesOf(fact.text);
  const start = allLines.findIndex(line => line.trim());
  const first = firstLine(fact);
  const employment = section === 'experience' ? employmentHeader(first) : undefined;
  let entry: ResumeEntry;
  if (employment) entry = { id: fact.id, ...employment, lines: allLines.slice(start + 1) };
  else if (section === 'projects' && (projectTextHeader(fact) || first === sourceHeading(fact))) {
    const parts = first.split('|').map(part => part.trim());
    const heading = parts.shift() || sourceHeading(fact);
    const linkIndex = parts.findIndex(part => safeResumeLink(part) !== undefined);
    const linkText = linkIndex >= 0 ? parts.splice(linkIndex, 1)[0] : undefined;
    entry = { id: fact.id, heading, ...(parts.length ? { detail: parts.join(' | ') } : {}), lines: allLines.slice(start + 1), ...(linkText ? { link: { text: linkText, href: safeResumeLink(linkText) } } : {}) };
  } else {
    entry = { id: fact.id, heading: sourceHeading(fact), lines: allLines };
    // Some saved projects use the source as their title and start the note
    // with "Technologies | project URL". Move only that explicit final URL
    // into the link slot; retain every preceding word as the entry detail.
    const parts = first.split('|').map(part => part.trim());
    const linkText = parts.at(-1) ?? '';
    const href = section === 'projects' && parts.length > 1 && parts.every(Boolean) && !employmentHeader(first) ? safeResumeLink(linkText) : undefined;
    if (href) {
      entry.detail = parts.slice(0, -1).join(' | ');
      entry.link = { text: linkText, href };
      entry.lines = allLines.slice(start + 1);
    }
  }
  if (section === 'projects' && !entry.link) {
    const linkIndex = entry.lines.findIndex(line => !!safeResumeLink(line));
    if (linkIndex >= 0) {
      const text = entry.lines[linkIndex]!;
      entry.link = { text, href: safeResumeLink(text) };
      entry.lines = entry.lines.filter((_, index) => index !== linkIndex);
    }
  }
  return entry;
}

export function buildResumeDocument(profileInput: Profile, facts: readonly Fact[], layoutInput: ResumeLayout): ResumeDocument {
  const profile = normalizeProfile(profileInput);
  const layout = normalizeResumeLayout(layoutInput);
  const document: ResumeDocument = { name: [profile.preferredFirstName.trim() || profile.firstName, profile.lastName].filter(Boolean).join(' '), contact: [], sections: [], warnings: [] };
  const contact = (text: string, link = false): void => {
    if (!text.trim()) return;
    const item: ResumeContact = { text };
    if (link) { const href = safeResumeLink(text); if (href) item.href = href; else document.warnings.push('A saved link is not a valid HTTP or HTTPS URL and will be shown as plain text.'); }
    document.contact.push(item);
  };
  if (layout.sections.contact) { contact(profile.email); contact(profile.phone); }
  if (layout.sections.location) contact([profile.city, profile.state, profile.country].filter(Boolean).join(', '));
  if (layout.sections.links) { contact(profile.linkedin, true); contact(profile.github, true); contact(profile.portfolio, true); }
  for (const section of ['experience', 'projects'] as const) {
    if (!layout.sections[section]) continue;
    const entries = facts.filter(fact => typeof fact.text === 'string' && fact.text.trim() && typeof fact.location === 'string' && layout.facts[fact.id]?.included !== false && (layout.facts[fact.id]?.section ?? inferFactSection(fact)) === section).map(fact => buildEntry(fact, section));
    if (entries.length) document.sections.push({ key: section, title: section === 'experience' ? 'Experience' : 'Projects', entries });
  }
  if (layout.sections.education && [profile.school, profile.degree, profile.major, profile.graduationDate, profile.gpa].some(Boolean)) {
    const date = yearAndMonth(profile.graduationDate);
    const detail = [profile.degree, profile.major].filter(Boolean).join(' | ');
    document.sections.push({ key: 'education', title: 'Education', entries: [{ id: 'education', heading: profile.school, ...(detail ? { detail } : {}), ...(date ? { date: `${MONTH_NAMES[date.month - 1]} ${date.year}` } : {}), lines: profile.gpa ? [`GPA: ${profile.gpa}`] : [] }] });
  }
  if (layout.sections.skills && layout.skills.trim()) document.sections.push({ key: 'skills', title: 'Skills', entries: [{ id: 'skills', heading: '', lines: linesOf(layout.skills) }] });
  document.warnings = [...new Set(document.warnings)];
  return document;
}
