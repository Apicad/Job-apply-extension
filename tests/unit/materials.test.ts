import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { emptyProfile, normalizeProfile } from '../../lib/profile';
import { buildResumeDocument, defaultResumeLayout } from '../../lib/resume-preview';
import type { Fact } from '../../lib/hackathon/contracts';
import {
  buildMaterialsRequest, createCoverLetterDocx, emptyMaterialsBrief, isMaterialsReply, isMaterialsRequest,
  materialResumeDocument, materialsReviewNotices, materialsSourceKey, normalizeMaterialsBrief, parseMaterialsReply,
  promptForMaterials, reviewMaterialsReply, type MaterialsRequest, type MaterialsReplyWire,
} from '../../lib/materials';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());
const savedProfile = () => normalizeProfile({ firstName: 'Ada', lastName: 'Lovelace', email: 'private-contact@example.com', phone: '(415) 555-9876', addressLine1: '123 Private Street', city: 'Private City', country: 'United States', linkedin: 'https://linkedin.com/in/private-profile', currentCompany: 'Not evidence', workAuthorization: 'yes', sponsorship: 'no', nationality: 'Private nationality', citizenshipCountry: 'Private citizenship', usCitizenship: 'no', gender: 'female', race: 'twoOrMore', disability: 'no', veteran: 'notVeteran', school: 'Example College', major: 'Computer Science coursework' });
const facts = (): Fact[] => [
  { id: 'role-a', revision: 2, location: 'Saved résumé.pdf — Example Studio', text: 'Example Studio | Engineering intern | Remote | June 2025 – August 2025\nBuilt a Python prototype for 3 internal examples.' },
  { id: 'project-b', revision: 4, location: 'Project: Trace viewer', text: 'Built a React visualizer with step-by-step traces.\nhttps://example.com/trace' },
];
const brief = () => ({ ...emptyMaterialsBrief(), role: 'Software engineer', company: 'Example Employer', jobDescription: 'Build systems using Rust and improve performance by 40%.', careerDirection: 'Early-career software development.' });
const source = (id = 'role-a', revision = 2) => ({ id, revision });
const request = () => buildMaterialsRequest(savedProfile(), facts(), defaultResumeLayout(), brief(), 1000);
const reply = (request: MaterialsRequest): MaterialsReplyWire => ({ schema: 1, kind: 'materials', requestId: request.id, sourceKey: request.sourceKey, expiresAt: request.expiresAt, summary: [{ text: 'Built a Python prototype for 3 internal examples.', sources: [source()] }], entries: [{ entryId: 'role-a', bullets: [{ text: 'Built a Python prototype supporting 3 internal examples.', sources: [source()] }] }], coverLetter: [{ text: 'My Python prototype work involved 3 internal examples.', sources: [source()] }], missing: [] });

describe('materials request evidence and identity', () => {
  it('sends selected facts and ordinary education, never profile contact or eligibility values', async () => {
    const r = await request(); const serialized = JSON.stringify(r);
    expect(isMaterialsRequest(r)).toBe(true);
    expect(r.sourceKey).toMatch(/^[a-f0-9]{64}$/);
    for (const value of ['Ada', 'Lovelace', 'private-contact@example.com', '555-9876', '123 Private Street', 'Private City', 'private-profile', 'Not evidence', 'Private nationality', 'Private citizenship', 'workAuthorization', 'disability', 'gender']) expect(serialized).not.toContain(value);
    expect(r.evidence.map(fact => fact.id)).toEqual(['role-a', 'project-b', 'profile:education']);
    expect(r.evidence[0]?.location).toBe('Example Studio');
    expect(r.entries[0]).toEqual({ id: 'role-a', revision: 2, heading: 'Example Studio', detail: 'Engineering intern | Remote', date: 'June 2025 – August 2025', lines: ['Built a Python prototype for 3 internal examples.'], section: 'experience' });
    expect(promptForMaterials(r)).toContain('Job description and career direction describe a target, NOT applicant experience.');
  });

  it('only includes enabled sections and selected notes without modifying their saved values', async () => {
    const layout = defaultResumeLayout(); layout.sections.education = false; layout.facts['role-a'] = { section: 'experience', included: false }; layout.skills = 'React, TypeScript';
    const notes = facts(); const before = structuredClone(notes);
    const r = await buildMaterialsRequest(savedProfile(), notes, layout, brief());
    expect(r.entries.map(entry => entry.id)).toEqual(['project-b']);
    expect(r.evidence.map(fact => fact.id)).toEqual(['project-b', 'profile:skills']);
    expect(notes).toEqual(before);
    expect(savedProfile().school).toBe('Example College');
  });

  it('uses a real stable digest and invalidates it for source, preference or target changes', async () => {
    const p = savedProfile(); const f = facts(); const l = defaultResumeLayout(); const b = brief();
    const initial = await materialsSourceKey(p, f, l, b);
    expect(await materialsSourceKey(Object.fromEntries(Object.entries(p).reverse()) as typeof p, f, l, b)).toBe(initial);
    expect(await materialsSourceKey({ ...p, email: 'changed@example.com' }, f, l, b)).not.toBe(initial);
    expect(await materialsSourceKey(p, f.map((item, i) => i ? item : { ...item, text: `${item.text}\nAdded detail.` }), l, b)).not.toBe(initial);
    expect(await materialsSourceKey(p, f, { ...l, sections: { ...l.sections, education: false } }, b)).not.toBe(initial);
    expect(await materialsSourceKey(p, f, l, { ...b, careerDirection: 'Implementation work.' })).not.toBe(initial);
  });

  it('requires actual applicant evidence and a target, and blocks contact or sensitive notes from AI requests', async () => {
    await expect(buildMaterialsRequest(emptyProfile(), [], defaultResumeLayout(), brief())).rejects.toThrow('Add saved experience');
    await expect(buildMaterialsRequest(savedProfile(), facts(), defaultResumeLayout(), emptyMaterialsBrief())).rejects.toThrow('job description or career direction');
    for (const text of ['Contact me at private@example.com.', 'Phone: (415) 555-9876', 'Citizenship: Example country', 'Work authorization: yes']) {
      await expect(buildMaterialsRequest(emptyProfile(), [{ id: 'private', revision: 1, location: 'Private', text }], defaultResumeLayout(), brief())).rejects.toThrow('sensitive application information');
    }
  });

  it('normalizes the brief and rejects unknown request properties or source ID collisions', async () => {
    expect(normalizeMaterialsBrief({ role: ' Role ', tone: 'bad', careerDirection: 'First\r\nSecond' })).toEqual({ ...emptyMaterialsBrief(), role: 'Role', careerDirection: 'First\nSecond' });
    expect(() => normalizeMaterialsBrief({ role: 'x'.repeat(201) })).toThrow('too long');
    const r = await request(); expect(isMaterialsRequest({ ...r, profile: savedProfile() })).toBe(false);
    expect(isMaterialsRequest({ ...r, evidence: [...r.evidence, r.evidence[0]] })).toBe(false);
    await expect(buildMaterialsRequest(emptyProfile(), [{ ...facts()[0]!, id: 'profile:education' }], defaultResumeLayout(), brief())).rejects.toThrow('invalid');
  });

  it('allows legitimate technical and civic project wording without treating keywords as personal answers', async () => {
    const notes = [{ id: 'technical', revision: 1, location: 'Project: Citizen science', text: 'Fixed race conditions in a citizen science data collection prototype.\nDesigned a gender-neutral interface.' }];
    const r = await buildMaterialsRequest(emptyProfile(), notes, defaultResumeLayout(), brief());
    expect(isMaterialsRequest(r)).toBe(true);
    expect(r.evidence[0]?.text).toBe(notes[0]!.text);
    for (const text of ['I am a United States citizen.', 'I need visa sponsorship.', 'My nationality is Canadian.', 'I am legally authorized to work in Canada.']) await expect(buildMaterialsRequest(emptyProfile(), [{ ...notes[0]!, text }], defaultResumeLayout(), brief())).rejects.toThrow('sensitive application information');
  });
});

describe('materials reply boundary', () => {
  it('accepts cited supported wording and does not treat job requirements as applicant evidence', async () => {
    const r = await request(); const valid = reply(r);
    expect(parseMaterialsReply(JSON.stringify(valid), r, 2000).warnings).toEqual([]);
    valid.summary[0]!.text = 'Built Python prototypes for 3 internal examples.';
    expect(parseMaterialsReply(JSON.stringify(valid), r, 2000).warnings).toEqual([]);
    valid.entries[0]!.bullets[0]!.text = 'Built a Rust service and improved performance by 40%.';
    const parsed = parseMaterialsReply(JSON.stringify(valid), r, 2000);
    expect(parsed.warnings.join(' ')).toContain('Rust'); expect(parsed.warnings.join(' ')).toContain('40%');
    expect(parsed.warnings.join(' ')).toContain('prototype limitation');
    valid.entries[0]!.bullets[0]!.sources = [];
    expect(parseMaterialsReply(JSON.stringify(valid), r, 2000).warnings.join(' ')).toContain('No saved evidence cited');
  });

  it('rejects stale identity, expired replies, invented citations and cross-employer attribution', async () => {
    const r = await request();
    for (const change of [{ requestId: 'stale' }, { sourceKey: 'a'.repeat(64) }, { expiresAt: r.expiresAt + 1 }]) expect(() => parseMaterialsReply(JSON.stringify({ ...reply(r), ...change }), r, 2000)).toThrow('identity');
    expect(() => parseMaterialsReply(JSON.stringify(reply(r)), r, r.expiresAt + 1)).toThrow('expired');
    for (const reference of [source('invented', 1), source('role-a', 1), source('project-b', 4)]) {
      const output = reply(r); output.entries[0]!.bullets[0]!.sources = [reference];
      expect(() => parseMaterialsReply(JSON.stringify(output), r, 2000)).toThrow('source reference');
    }
    const output = reply(r); output.summary[0]!.sources = [source('job-description', 1)];
    expect(() => parseMaterialsReply(JSON.stringify(output), r, 2000)).toThrow('Job requirements');
  });

  it('rejects extra header edits, duplicate entries, malformed data and AI-supplied warnings', async () => {
    const r = await request(); const output = reply(r);
    expect(() => parseMaterialsReply(JSON.stringify({ ...output, entries: [{ ...output.entries[0], heading: 'Senior engineer' }] }), r, 2000)).toThrow('headers');
    expect(() => parseMaterialsReply(JSON.stringify({ ...output, entries: [output.entries[0], output.entries[0]] }), r, 2000)).toThrow('Duplicate');
    expect(() => parseMaterialsReply('```json\n{}\n```', r, 2000)).toThrow('JSON object');
    expect(() => parseMaterialsReply(JSON.stringify({ ...output, warnings: [] }), r, 2000)).toThrow('own review warnings');
    const duplicated = reply(r); duplicated.summary[0]!.sources = [source(), source()];
    expect(() => parseMaterialsReply(JSON.stringify(duplicated), r, 2000)).toThrow('source reference');
  });

  it('recomputes review warnings on edited wording and supports editing saved drafts after expiry', async () => {
    const r = await request(); const parsed = parseMaterialsReply(JSON.stringify(reply(r)), r, 2000);
    expect(isMaterialsReply(parsed, r)).toBe(true);
    parsed.summary[0]!.text = 'Certified in Rust with 15 years of production experience.';
    expect(isMaterialsReply(parsed, r)).toBe(false);
    const edited = reviewMaterialsReply(r, parsed);
    expect(edited.warnings.join(' ')).toMatch(/Rust/); expect(edited.warnings.join(' ')).toMatch(/15/);
    expect(isMaterialsReply(edited, r)).toBe(true);
    const old = { ...r, expiresAt: 1 }; const oldReply = { ...reply(old), expiresAt: 1 };
    expect(isMaterialsRequest(old)).toBe(true); expect(reviewMaterialsReply(old, oldReply).warnings).toEqual([]);
  });

  it('keeps missing-information warnings and warns when a source qualification disappears', async () => {
    const r = await request(); const output = reply(r); output.missing = ['No saved evidence supports a Rust credential.'];
    output.summary = [{ text: 'Studied Computer Science.', sources: [source('profile:education', 1)] }];
    const result = parseMaterialsReply(JSON.stringify(output), r, 2000);
    expect(result.warnings).toContain('No saved evidence supports a Rust credential.');
    expect(result.warnings.join(' ')).toContain('coursework');
  });

  it('does not attach another statement’s prototype qualifier to unchanged source wording', async () => {
    const production = 'Built a Node.js production dashboard used daily by the team.';
    const mixed = [{ ...facts()[0]!, text: `Example Studio | Engineering intern | Remote | June 2025 – August 2025\n${production}\nBuilt a Python workflow editor prototype.` }];
    const r = await buildMaterialsRequest(emptyProfile(), mixed, defaultResumeLayout(), brief(), 1000);
    const output = reply(r); output.summary = [];
    output.entries[0]!.bullets = [{ text: production, sources: [source()] }];
    output.coverLetter = [{ text: 'Built a Python workflow editor prototype.', sources: [source()] }];
    const current = reviewMaterialsReply(r, output);
    expect(current.warnings).toEqual([]);
    const legacy = { ...current, warnings: [`Check that this wording preserves the source's prototype limitation: ${production}`] };
    expect(isMaterialsReply(legacy, r)).toBe(true);
    expect(materialsReviewNotices(r, legacy)).toEqual({ warnings: [], missing: [] });
    expect(isMaterialsReply({ ...legacy, warnings: ['An arbitrary saved warning'] }, r)).toBe(false);

    for (const wording of ['Built a Python workflow editor.', 'Built a daily Node.js dashboard.', `${production} Built a workflow editor.`]) {
      output.entries[0]!.bullets[0]!.text = wording;
      const result = reviewMaterialsReply(r, output);
      expect(result.warnings.some(item => item.includes('prototype limitation'))).toBe(true);
      expect(isMaterialsReply({ ...result, warnings: [] }, r)).toBe(false);
    }
  });

  it.each([
    'Prototype work\nBuilt a Node.js dashboard.\nBuilt a Python prototype.',
    'Example Studio | Prototype engineering intern | Remote\nBuilt a Node.js dashboard.\nBuilt a Python prototype.',
    'Example Studio | Engineering intern | Remote\nPrototype work:\nBuilt a Node.js dashboard.\nBuilt a Python prototype.',
    'Example Studio | Engineering intern | Remote\nBuilt a Node.js dashboard. It was a prototype.',
  ])('keeps ambiguous note-level qualifications for %s', async text => {
    const r = await buildMaterialsRequest(emptyProfile(), [{ ...facts()[0]!, text }], defaultResumeLayout(), brief(), 1000);
    const output = reply(r); output.summary = []; output.entries[0]!.bullets[0]!.text = 'Built a Node.js dashboard.';
    expect(reviewMaterialsReply(r, output).warnings.some(item => item.includes('prototype limitation'))).toBe(true);
  });

  it('uses statement citations for dashboard and migration paraphrases within a mixed employment note', async () => {
    const lines = ['Example Studio | Engineering intern | Remote',
      'Built a Node.js monitoring dashboard integrating marketing-platform REST APIs with SQLite; the team used it daily to monitor system health.',
      'Built a workflow editor prototype that reads campaign workflows through APIs and presents them as an editable node graph.',
      'Migrated 1,300 images using a Next.js upload tool and Python CLI that deduplicated files and updated image URLs in HTML.'];
    const r = await buildMaterialsRequest(emptyProfile(), [{ ...facts()[0]!, text: lines.join('\n') }], defaultResumeLayout(), brief(), 1000);
    const output = reply(r); output.summary = [];
    output.entries[0]!.bullets = [
      { text: 'Built a Node.js dashboard integrating marketing-platform REST APIs with SQLite, used daily by the team to monitor system health.', sources: [{ ...source(), statement: 1 }] },
      { text: 'Migrated 1,300 images using a Next.js upload tool and Python CLI to deduplicate files and update image URLs in HTML.', sources: [{ ...source(), statement: 3 }] },
    ];
    output.coverLetter = [{ text: 'My Node.js dashboard and Python migration work connect with this role.', sources: [{ ...source(), statement: 1 }, { ...source(), statement: 3 }] }];
    expect(reviewMaterialsReply(r, output).warnings).toEqual([]);
    output.entries[0]!.bullets.push({ text: 'Built a workflow editor.', sources: [{ ...source(), statement: 2 }] });
    expect(reviewMaterialsReply(r, output).warnings).toEqual(["Check that this wording preserves the source's prototype limitation: Built a workflow editor."]);
    output.entries[0]!.bullets = [{ text: lines[1]!, sources: [{ ...source(), statement: 2 }] }];
    expect(reviewMaterialsReply(r, output).warnings.some(item => item.includes('prototype limitation'))).toBe(true);
  });

  it('validates statement indexes, revisions and entry ownership, and keeps narrow evidence checks', async () => {
    const r = await request(); r.evidence[0]!.text += '\n\nBuilt a 99 item fixture.';
    const output = reply(r);
    for (const ref of [{ ...source(), statement: -1 }, { ...source(), statement: 0.5 }, { ...source(), statement: 99 }, { ...source(), statement: 2 }, { ...source('role-a', 1), statement: 1 }, { ...source('project-b', 4), statement: 0 }]) {
      output.entries[0]!.bullets[0]!.sources = [ref];
      expect(() => reviewMaterialsReply(r, output)).toThrow(/source reference/);
    }
    output.entries[0]!.bullets[0] = { text: 'Built 99 Python prototypes.', sources: [{ ...source(), statement: 1 }] };
    const reviewed = reviewMaterialsReply(r, output);
    expect(reviewed.warnings.join(' ')).toContain('99');
    expect(isMaterialsReply({ ...reviewed, warnings: [] }, r)).toBe(false);
  });

  it.each([
    'Example Studio | Prototype engineering intern | Remote\nBuilt a Node.js dashboard.\nBuilt a Python prototype.',
    'Prototype work\nBuilt a Node.js dashboard.\nBuilt a Python prototype.',
    'Example Studio | Engineering intern | Remote\nBuilt a Node.js dashboard.\nPrototype work:',
  ])('cannot use a statement citation to hide a qualification heading: %s', async text => {
    const r = await buildMaterialsRequest(emptyProfile(), [{ ...facts()[0]!, text }], defaultResumeLayout(), brief(), 1000);
    const output = reply(r); output.summary = [];
    output.entries[0]!.bullets[0] = { text: 'Built a Node.js dashboard for the team.', sources: [{ ...source(), statement: 1 }] };
    expect(reviewMaterialsReply(r, output).warnings.some(item => item.includes('prototype limitation'))).toBe(true);
  });

  it('groups repeated missing information separately without changing the stored warning contract', async () => {
    const r = await request(); const output = reply(r);
    output.missing = ['Graduation date is not supplied.', 'Graduation date is not supplied.'];
    output.entries[0]!.bullets[0]!.text = 'Built a Rust prototype.';
    const parsed = reviewMaterialsReply(r, output); const notices = materialsReviewNotices(r, parsed);
    expect(parsed.warnings).toContain('Graduation date is not supplied.');
    expect(notices.missing).toEqual(['Graduation date is not supplied.']);
    expect(notices.warnings).not.toContain('Graduation date is not supplied.');
    expect(notices.warnings.join(' ')).toContain('Rust');
  });
});

describe('material document composition', () => {
  it('changes only generated bullets and summary, preserving headers, links, dates and omitted entries', async () => {
    const r = await request(); const parsed = parseMaterialsReply(JSON.stringify(reply(r)), r, 2000);
    const base = buildResumeDocument(savedProfile(), facts(), defaultResumeLayout()); const snapshot = structuredClone(base);
    const next = materialResumeDocument(base, parsed);
    expect(next.sections[0]?.key).toBe('summary');
    const originalRole = base.sections.find(section => section.key === 'experience')!.entries[0]!;
    const revisedRole = next.sections.find(section => section.key === 'experience')!.entries[0]!;
    expect({ ...revisedRole, lines: originalRole.lines }).toEqual(originalRole);
    expect(revisedRole.lines).toEqual(parsed.entries[0]!.bullets.map(segment => segment.text));
    expect(next.sections.find(section => section.key === 'projects')).toEqual(base.sections.find(section => section.key === 'projects'));
    expect(next.contact).toEqual(base.contact); expect(base).toEqual(snapshot);
  });

  it('exports editable cover-letter paragraphs with the local contact header, not résumé bullets', async () => {
    const r = await request(); const parsed = parseMaterialsReply(JSON.stringify(reply(r)), r, 2000);
    const base = buildResumeDocument(savedProfile(), facts(), defaultResumeLayout());
    const files = unzipSync(createCoverLetterDocx(base, { ...brief(), company: 'Example <Employer> & Co' }, parsed.coverLetter));
    const xml = strFromU8(files['word/document.xml']!); const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const text = [...doc.getElementsByTagNameNS(ns, 't')].map(node => node.textContent).join('');
    expect(text).toContain('private-contact@example.com'); expect(text).toContain('Example <Employer> & Co');
    expect(text).toContain('Dear hiring team,'); expect(text).toContain(parsed.coverLetter[0]!.text); expect(text).toContain('Sincerely,');
    expect(text).not.toContain('•'); expect(doc.getElementsByTagNameNS(ns, 'numPr')).toHaveLength(0);
    expect(xml).toContain('<w:sz w:val="22"/>');
    expect(Object.keys(files)).not.toContain('word/vbaProject.bin');
  });
});
