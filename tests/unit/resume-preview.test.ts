import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { emptyProfile, normalizeProfile } from '../../lib/profile';
import type { Fact } from '../../lib/hackathon/contracts';
import {
  MAX_RESUME_SKILLS, buildResumeDocument, createResumeDocx, defaultResumeLayout,
  inferFactSection, normalizeResumeLayout, safeResumeLink,
  type ResumeDocument,
} from '../../lib/resume-preview';

const note = (id: string, location: string, text: string): Fact => ({ id, revision: 1, location, text });
const profile = () => normalizeProfile({
  firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '(415) 555-0100',
  city: 'San Francisco', state: 'California', country: 'United States',
  linkedin: 'https://linkedin.com/in/ada-example', github: 'github.com/ada-example',
  school: 'Example College', major: 'Computer Science coursework',
  currentCompany: 'Unrelated current-company field', currentTitle: 'Unrelated title',
  workAuthorization: 'yes', sponsorship: 'no', citizenshipCountry: 'Canada', nationality: 'Canadian', usCitizenship: 'no',
});

describe('resume preview preserves saved claims', () => {
  it('includes all notes by default, separates explicit employment and project headers, and keeps prototype qualifications', () => {
    const facts = [
      note('role', 'Ada.pdf — Example Studio', 'Example Studio | Engineering intern | Remote | Jun 2025 – Aug 2025\nBuilt a prototype; not deployed in production.\n• Investigated reported defects.'),
      note('project', 'Ada.pdf — Trace viewer', 'Trace viewer | React | https://example.com/trace\nBuilt a local-only algorithm visualizer.\n'),
      note('unclear', 'Additional experience', 'Assisted with a volunteer workshop.'),
    ];
    const before = structuredClone(facts);
    const doc = buildResumeDocument(profile(), facts, defaultResumeLayout());
    expect(doc.name).toBe('Ada Lovelace');
    expect(doc.sections.map(section => section.title)).toEqual(['Experience', 'Projects', 'Education']);
    expect(doc.sections[0]?.entries).toEqual([
      { id: 'role', heading: 'Example Studio', detail: 'Engineering intern | Remote', date: 'Jun 2025 – Aug 2025', lines: ['Built a prototype; not deployed in production.', '• Investigated reported defects.'] },
      { id: 'unclear', heading: 'Additional experience', lines: ['Assisted with a volunteer workshop.'] },
    ]);
    expect(doc.sections[1]?.entries[0]).toEqual({ id: 'project', heading: 'Trace viewer', detail: 'React', link: { text: 'https://example.com/trace', href: 'https://example.com/trace' }, lines: ['Built a local-only algorithm visualizer.', ''] });
    expect(facts).toEqual(before);
    expect(JSON.stringify(doc)).not.toMatch(/Unrelated|Canadian|citizenship|authorization|sponsorship/i);
  });

  it('keeps a project source title when the first source line is prose', () => {
    const fact = note('project', 'Project: Trace viewer', 'Built a React viewer.\nhttps://example.com/trace\nNot yet deployed.');
    expect(inferFactSection(fact)).toBe('projects');
    const entry = buildResumeDocument(emptyProfile(), [fact], defaultResumeLayout()).sections[0]?.entries[0];
    expect(entry).toEqual({ id: 'project', heading: 'Project: Trace viewer', lines: ['Built a React viewer.', 'Not yet deployed.'], link: { text: 'https://example.com/trace', href: 'https://example.com/trace' } });
  });

  it('leaves ambiguous notes as experience and never invents a role or dates', () => {
    const facts = [note('a', 'Career notes', 'Built a project for practice.'), note('b', 'Example Org', 'Example Org | Volunteer | Remote\nHelped host a workshop.')];
    expect(facts.map(inferFactSection)).toEqual(['experience', 'experience']);
    const doc = buildResumeDocument(emptyProfile(), facts, defaultResumeLayout());
    expect(doc.sections[0]?.entries.every(entry => entry.date === undefined && entry.detail === undefined)).toBe(true);
    expect(doc.sections[0]?.entries[1]?.lines).toEqual(['Example Org | Volunteer | Remote', 'Helped host a workshop.']);
  });

  it('allows explicit section assignment and exclusion without changing stored notes or profile autofill preferences', () => {
    const savedProfile = { ...profile(), fillEducation: 'no', fillEmployment: 'no' } as ReturnType<typeof profile>;
    const facts = [note('a', 'Side work', 'Built a local tool.'), note('b', 'Other experience', 'Supported a team.')];
    const layout = defaultResumeLayout();
    layout.facts.a = { section: 'projects', included: true };
    layout.facts.b = { section: 'experience', included: false };
    layout.sections.education = false;
    layout.sections.contact = false;
    layout.sections.location = false;
    layout.sections.links = false;
    const before = JSON.stringify({ savedProfile, facts, layout });
    const doc = buildResumeDocument(savedProfile, facts, layout);
    expect(doc.contact).toEqual([]);
    expect(doc.sections).toEqual([{ key: 'projects', title: 'Projects', entries: [{ id: 'a', heading: 'Side work', lines: ['Built a local tool.'] }] }]);
    expect(JSON.stringify({ savedProfile, facts, layout })).toBe(before);
    layout.sections.projects = false;
    expect(buildResumeDocument(savedProfile, facts, layout).sections).toEqual([]);
  });

  it('keeps education optional and does not turn coursework into an earned or expected degree', () => {
    const doc = buildResumeDocument(profile(), [], defaultResumeLayout());
    expect(doc.sections).toEqual([{ key: 'education', title: 'Education', entries: [{ id: 'education', heading: 'Example College', detail: 'Computer Science coursework', lines: [] }] }]);
    const explicit = buildResumeDocument(normalizeProfile({ school: 'Example College', degree: 'Bachelor of Science', major: 'Mathematics', graduationDate: '2027-05', gpa: '3.8' }), [], defaultResumeLayout());
    expect(explicit.sections[0]?.entries[0]).toEqual({ id: 'education', heading: 'Example College', detail: 'Bachelor of Science | Mathematics', date: 'May 2027', lines: ['GPA: 3.8'] });
    expect(JSON.stringify(explicit)).not.toMatch(/earned|expected|completed/i);
    expect(buildResumeDocument(emptyProfile(), [], defaultResumeLayout()).sections).toEqual([]);
  });

  it('only includes skills entered by the user and retains their wording', () => {
    const facts = [note('a', 'Experience', 'Built a Python prototype.')];
    expect(buildResumeDocument(emptyProfile(), facts, defaultResumeLayout()).sections.map(section => section.key)).toEqual(['experience']);
    const layout = defaultResumeLayout(); layout.skills = 'JavaScript, TypeScript\nSQL (coursework)';
    expect(buildResumeDocument(emptyProfile(), facts, layout).sections.at(-1)?.entries[0]?.lines).toEqual(['JavaScript, TypeScript', 'SQL (coursework)']);
    layout.sections.skills = false;
    expect(buildResumeDocument(emptyProfile(), facts, layout).sections.map(section => section.key)).toEqual(['experience']);
  });
});

describe('resume layout boundaries', () => {
  it('normalizes invalid storage without invoking accessors or sharing defaults', () => {
    const getter = vi.fn(() => false);
    const sections = Object.create({ education: false });
    Object.defineProperty(sections, 'contact', { get: getter });
    sections.projects = false;
    const facts = JSON.parse('{"__proto__":{"section":"projects","included":false},"a":{"section":"projects","included":false}}');
    const layout = normalizeResumeLayout({ sections, facts, skills: 'SQL\r\nPython' });
    expect(getter).not.toHaveBeenCalled();
    expect(layout.sections.contact).toBe(true); expect(layout.sections.education).toBe(true); expect(layout.sections.projects).toBe(false);
    expect(Object.keys(layout.facts)).toEqual(['a']);
    expect(layout.facts.a).toEqual({ section: 'projects', included: false });
    expect(layout.skills).toBe('SQL\nPython');
    expect(normalizeResumeLayout({ skills: 'x'.repeat(MAX_RESUME_SKILLS + 1) }).skills).toBe('');
    layout.sections.contact = false;
    expect(defaultResumeLayout().sections.contact).toBe(true);
    expect(normalizeResumeLayout(null)).toEqual(defaultResumeLayout());
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>unsafe</b>', 'file:///private/test', 'https://user:password@example.com', '//example.com', 'https://example.com/has space'])('does not activate unsafe link %s', value => {
    expect(safeResumeLink(value)).toBeUndefined();
  });

  it('keeps unsafe saved URLs readable as plain text and safe project URLs clickable', () => {
    const doc = buildResumeDocument(normalizeProfile({ portfolio: 'javascript:alert(1)', github: 'github.com/ada-example' }), [], defaultResumeLayout());
    expect(doc.contact).toEqual([{ text: 'github.com/ada-example', href: 'https://github.com/ada-example' }, { text: 'javascript:alert(1)' }]);
    expect(doc.warnings).toHaveLength(1);
    expect(safeResumeLink('https://example.com/path?a=1&b=2')).toBe('https://example.com/path?a=1&b=2');
  });
});

describe('editable Word export', () => {
  const parse = (value: string) => new DOMParser().parseFromString(value, 'application/xml');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const attr = (node: Element | null | undefined, key: string) => node?.getAttributeNS(ns, key);
  const textOf = (doc: Document) => [...doc.getElementsByTagNameNS(ns, 't')].map(node => node.textContent).join('');

  it('creates a valid editable package with approved geometry, no remote resource relationships, and literal content safely escaped', () => {
    const source: ResumeDocument = {
      name: 'Ada & <Lovelace>', contact: [{ text: 'ada@example.com' }, { text: 'Profile', href: 'https://example.com/profile?x=1&y=2' }], warnings: [],
      sections: [{ key: 'projects', title: 'Projects', entries: [{ id: 'p', heading: 'A < B', detail: 'R&D', date: '2025 – 2026', link: { text: 'View project', href: 'https://example.com/project' }, lines: ['Built a prototype; not production-ready.', '• Kept original bullet.', '- Kept dash bullet.', '', '   ', 'Code: https://example.com/code.'] }] }],
    };
    const files = unzipSync(createResumeDocx(source));
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/settings.xml', 'word/styles.xml'].sort());
    for (const bytes of Object.values(files)) expect(parse(strFromU8(bytes)).getElementsByTagName('parsererror')).toHaveLength(0);
    const doc = parse(strFromU8(files['word/document.xml']!));
    const content = textOf(doc);
    expect(content).toContain('Ada & <Lovelace>'); expect(content).toContain('A < B | R&D');
    expect(content).toContain('• Built a prototype; not production-ready.');
    expect(content).toContain('• Kept original bullet.'); expect(content).not.toContain('• •'); expect(content).not.toContain('• -');
    expect(content).toContain('Code: https://example.com/code.');
    const size = doc.getElementsByTagNameNS(ns, 'pgSz')[0]; const margins = doc.getElementsByTagNameNS(ns, 'pgMar')[0];
    expect([attr(size, 'w'), attr(size, 'h')]).toEqual(['12240', '15840']);
    expect(['left', 'right', 'top', 'bottom'].map(key => attr(margins, key))).toEqual(['792', '792', '504', '432']);
    const styles = parse(strFromU8(files['word/styles.xml']!));
    expect(attr(styles.getElementsByTagNameNS(ns, 'rFonts')[0], 'ascii')).toBe('Calibri');
    expect(attr(styles.getElementsByTagNameNS(ns, 'sz')[0], 'val')).toBe('18');
    expect([...doc.getElementsByTagNameNS(ns, 'sz')].map(node => attr(node, 'val'))).toEqual(expect.arrayContaining(['48', '22']));
    const relationships = parse(strFromU8(files['word/_rels/document.xml.rels']!));
    const external = [...relationships.getElementsByTagName('Relationship')].filter(node => node.getAttribute('TargetMode') === 'External');
    expect(external.map(node => node.getAttribute('Target'))).toEqual(['https://example.com/profile?x=1&y=2', 'https://example.com/project', 'https://example.com/code']);
    expect(external.every(node => node.getAttribute('Type')?.endsWith('/hyperlink'))).toBe(true);
    expect(doc.getElementsByTagNameNS(ns, 'altChunk')).toHaveLength(0);
  });

  it('revalidates provided document links and cannot insert XML or active non-HTTP relationships', () => {
    const source: ResumeDocument = { name: '</w:t><script>alert(1)</script>', contact: [{ text: 'Unsafe link', href: 'javascript:alert(1)' }], warnings: [], sections: [{ key: 'experience', title: 'Experience', entries: [{ id: 'x', heading: 'Example', link: { text: 'Local', href: 'file:///etc/passwd' }, lines: ['A & B < C', '\u0000control'] }] }] };
    const files = unzipSync(createResumeDocx(source));
    const doc = parse(strFromU8(files['word/document.xml']!));
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0); expect(doc.getElementsByTagName('script')).toHaveLength(0);
    expect(textOf(doc)).toContain('</w:t><script>alert(1)</script>'); expect(textOf(doc)).toContain('A & B < C');
    expect(strFromU8(files['word/_rels/document.xml.rels']!)).not.toMatch(/javascript|file:|TargetMode="External"/);
  });
});
