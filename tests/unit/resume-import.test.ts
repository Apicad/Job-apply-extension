import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractResumeText, MAX_IMPORT_TEXT, parseResume, proposeResumeImport, textFromDocx } from '../../lib/resume-import';
import { contactLinksFromPdf, httpLinksFromPdf } from '../../lib/resume-import/pdf-links';

const resume = `Ada Lovelace
ada@example.com | (415) 555-0100
San Francisco, California, United States
https://linkedin.com/in/ada-lovelace
https://github.com/ada
https://ada.example.com
Education
Example College
Bachelor of Science in Computer Science
Expected graduation: May 2027
GPA: 3.8
Projects
Algorithm visualizer
Built a React visualizer with step-by-step traces.
Experience
Example Company — Software Intern — May 2025 to August 2025
Tested API responses and documented fixes.`;

describe('resume proposals are local, editable source data', () => {
  it('extracts literal contact and education and keeps experience as verbatim notes', () => {
    const result = proposeResumeImport(resume, 'Ada.txt');
    expect(result.fields).toEqual({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '(415) 555-0100', city: 'San Francisco', state: 'California', country: 'United States', linkedin: 'https://linkedin.com/in/ada-lovelace', github: 'https://github.com/ada', portfolio: 'https://ada.example.com/', school: 'Example College', degree: 'Bachelor of Science', major: 'Computer Science', graduationDate: '2027-05', gpa: '3.8' });
    expect(result.evidence.graduationDate).toBe('Expected graduation: May 2027');
    expect(result.facts).toEqual([
      { location: 'Ada.txt — Algorithm visualizer', text: 'Algorithm visualizer\nBuilt a React visualizer with step-by-step traces.' },
      { location: 'Ada.txt — experience', text: 'Example Company — Software Intern — May 2025 to August 2025\nTested API responses and documented fixes.' },
    ]);
  });
  it('recognizes a combined contact header and coursework institution without inventing a degree', () => {
    const result = proposeResumeImport('ADA LOVELACE ada@example.com | (415) 555-0100 | San Francisco, CA\nEducation\nExample College | Computer Science coursework September 2021 – Present');
    expect(result.fields).toMatchObject({ firstName: 'ADA', lastName: 'LOVELACE', email: 'ada@example.com', school: 'Example College', major: 'Computer Science' });
    expect(result.fields.degree).toBeUndefined(); expect(result.fields.graduationDate).toBeUndefined();
  });
  it('keeps separate clear projects and employer roles in separate verbatim notes', () => {
    const result = proposeResumeImport('Ada Lovelace\nProjects\nAlgorithm Visualizer\nReact, TypeScript | github.com/ada/visualizer\nBuilt step-by-step traces.\nAgent Dashboard\nTypeScript, Node.js, WebSocket | github.com/ada/agents\nExtended an open-source dashboard.\nExperience\nExample Corp | Software Intern | May 2025 – August 2025\nTested API responses.\nExample Lab | Tutor | January 2024 – May 2024\nTaught a coding course.', 'Ada.pdf');
    expect(result.facts.map(fact => fact.location)).toEqual(['Ada.pdf — Algorithm Visualizer', 'Ada.pdf — Agent Dashboard', 'Ada.pdf — Example Corp', 'Ada.pdf — Example Lab']);
    expect(result.facts[1]?.text).toBe('Agent Dashboard\nTypeScript, Node.js, WebSocket | github.com/ada/agents\nExtended an open-source dashboard.');
  });
  it('does not infer a current job, eligibility, demographic answer or a planned degree', () => {
    const result = proposeResumeImport(`Ada Lovelace\nada@example.com\nEducation\nExample College\nComputer Science coursework\nPlanned transfer: Bachelor of Science in Mathematics\n2026–2027\nExperience\nExample Corp — Engineer — Present\nUS citizen, female, no visa needed.`);
    expect(result.fields).toEqual({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', school: 'Example College', major: 'Computer Science' });
    expect(result.fields).not.toHaveProperty('degree');
    expect(result.fields).not.toHaveProperty('graduationDate');
    expect(result.fields).not.toHaveProperty('currentCompany');
    expect(result.fields).not.toHaveProperty('workAuthorization');
    expect(result.fields).not.toHaveProperty('gender');
  });
  it('does not merge another school degree or dates into the first education record', () => {
    const result = proposeResumeImport('Ada Lovelace\nEducation\nExample College\nComputer Science coursework\nExample University\nMaster of Science in Mathematics\nGraduated: June 2022\nGPA: 3.7');
    expect(result.fields.school).toBe('Example College');
    expect(result.fields.major).toBe('Computer Science');
    expect(result.fields.degree).toBeUndefined();
    expect(result.fields.graduationDate).toBeUndefined();
    expect(result.fields.gpa).toBeUndefined();
    expect(result.warnings.some(w => w.includes('Several schools'))).toBe(true);
  });
  it('treats a planned transfer institution as an education boundary even when it is not selected', () => {
    const result = proposeResumeImport('Ada Lovelace\nEducation\nExample College\nComputer Science coursework\nPlanned transfer: Future University\nBachelor of Science in Mathematics\nExpected graduation: June 2029');
    expect(result.fields.school).toBe('Example College');
    expect(result.fields.major).toBe('Computer Science');
    expect(result.fields.degree).toBeUndefined();
    expect(result.fields.graduationDate).toBeUndefined();
  });
  it.each([
    'No Bachelor of Science degree awarded',
    'Bachelor of Science degree not awarded',
    'Bachelor of Science\nNo degree awarded',
    'Bachelor of Science\nNot awarded',
    'Bachelor of Science\nCoursework only',
    'Bachelor of Science coursework',
    'Bachelor of Science\nDid not graduate',
    'Bachelor of Science\nNon-degree studies',
  ])('does not turn a degree disclaimer into a credential: %s', (degree) => {
    const result = proposeResumeImport(`Ada Lovelace\nEducation\nExample College\n${degree}`);
    expect(result.fields.school).toBe('Example College');
    expect(result.fields.degree).toBeUndefined();
  });
  it('leaves ambiguous contact details, repositories and company LinkedIn links unselected', () => {
    const result = proposeResumeImport('Ada Lovelace\nada@example.com | other@example.com\n(415) 555-0100 | (415) 555-0101\nhttps://github.com/ada/project\nhttps://linkedin.com/company/example');
    expect(result.fields.email).toBeUndefined();
    expect(result.fields.phone).toBeUndefined();
    expect(result.fields.linkedin).toBeUndefined();
    expect(result.fields.github).toBeUndefined();
    expect(result.fields.portfolio).toBeUndefined();
  });
  it('keeps Unicode names and does not turn a job title or empty text into a name', () => {
    expect(proposeResumeImport('Zoë García López\nzoe@example.com').fields).toMatchObject({ firstName: 'Zoë', lastName: 'García López' });
    expect(proposeResumeImport('Software Engineer\nada@example.com').fields.firstName).toBeUndefined();
    expect(proposeResumeImport('Ada').fields).toEqual({});
    expect(proposeResumeImport('').fields).toEqual({});
  });
  it('does not mistake a LinkedIn sidebar skill for a name or use a future transfer major', () => {
    const result = proposeResumeImport('Contact\nhttps://linkedin.com/in/ada-lovelace\nProject Management\nEducation\nExample College\nPlanned transfer: Bachelor of Science in Mathematics');
    expect(result.fields.firstName).toBeUndefined();
    expect(result.fields.degree).toBeUndefined();
    expect(result.fields.major).toBeUndefined();
    expect(result.fields.linkedin).toBe('https://linkedin.com/in/ada-lovelace');
  });
  it('does not strip a non-four-point GPA scale into a misleading saved number', () => {
    const result = proposeResumeImport('Ada Lovelace\nEducation\nExample College\nGPA: 3.8 / 5.0');
    expect(result.fields.gpa).toBeUndefined();
    expect(result.warnings.some(warning => warning.includes('GPA scale'))).toBe(true);
  });
  it('bounds text and facts without truncating individual statements', () => {
    expect(() => proposeResumeImport('a'.repeat(MAX_IMPORT_TEXT + 1))).toThrow(/too long/);
    const result = proposeResumeImport(`Ada Lovelace\nProjects\n${'Sentence with evidence.\n'.repeat(1500)}`);
    expect(result.facts.length).toBeLessThanOrEqual(20);
    expect(result.facts.every(fact => fact.text.length <= 2000 && fact.text.endsWith('Sentence with evidence.'))).toBe(true);
  });
});

describe('bounded résumé text extraction', () => {
  it('reads contact PDF hyperlink annotations without including employer links or executable URLs', () => {
    const items = [{ str: 'Portfolio', transform: [1, 0, 0, 1, 10, 30], width: 50, height: 10 }];
    const urls = contactLinksFromPdf([
      { subtype: 'Link', url: 'https://linkedin.com/in/ada' },
      { subtype: 'Link', url: 'https://github.com/ada' },
      { subtype: 'Link', url: 'https://ada.example.com', rect: [9, 29, 70, 41] },
      { subtype: 'Link', url: 'https://employer.example.com' },
      { subtype: 'Link', url: 'javascript:alert(1)', rect: [9, 29, 70, 41] },
      { subtype: 'Link', url: 'https://user:secret@example.com', rect: [9, 29, 70, 41] },
      { subtype: 'Link', url: 'https://github.com/ada/project' },
      { subtype: 'Link', url: 'https://linkedin.com/in/ada' },
    ], items);
    expect(urls).toEqual(['https://linkedin.com/in/ada', 'https://github.com/ada', 'https://ada.example.com/']);
    expect(httpLinksFromPdf([{ subtype: 'Link', url: 'https://employer.example.com' }, { subtype: 'Link', url: 'javascript:alert(1)' }, { subtype: 'Link', url: 'file:///secret' }])).toEqual(['https://employer.example.com/']);
    expect(proposeResumeImport('Ada Lovelace\nProjects\nA project\nBuilt an app.\nLinks\nhttps://employer.example.com/').fields.portfolio).toBeUndefined();
  });
  it('extracts plain UTF-8 and returns the same proposal contract', async () => {
    const parsed = await parseResume(new File([resume], 'Ada.TXT', { type: 'text/plain' }));
    expect(parsed.text).toBe(resume);
    expect(parsed.format).toBe('txt');
    expect(parsed.fields.email).toBe('ada@example.com');
    expect((await parseResume(new File(['Ada'], 'Ada.txt'))).text).toBe('Ada');
  });
  it('refuses empty, oversized, unsupported and disguised binary text files', async () => {
    await expect(extractResumeText(new File([], 'empty.txt'))).rejects.toThrow(/empty/);
    await expect(extractResumeText(new File(['x'.repeat(4 * 1024 * 1024 + 1)], 'large.txt'))).rejects.toThrow(/4 MB/);
    await expect(extractResumeText(new File(['text'], 'legacy.doc'))).rejects.toThrow(/PDF, DOCX and TXT/);
    await expect(extractResumeText(new File([new Uint8Array([0xff, 0xfe])], 'binary.txt'))).rejects.toThrow(/UTF-8/);
    await expect(extractResumeText(new File(['a\u0000b'], 'binary.txt'))).rejects.toThrow(/binary/);
    await expect(extractResumeText(new File(['x'.repeat(MAX_IMPORT_TEXT + 1)], 'long.txt'))).rejects.toThrow(/too much/);
  });
  const doc = (body: string): string => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  it('extracts DOCX paragraphs and headers, decoding XML as text and ignoring deleted runs/links', async () => {
    const bytes = zipSync({
      'word/document.xml': strToU8(doc('<w:p><w:r><w:t>Ada &amp; Bea</w:t></w:r><w:r><w:tab/><w:t>Profile</w:t></w:r><w:del><w:r><w:delText>Old name</w:delText><w:t>Deleted</w:t></w:r></w:del></w:p><w:p><w:hyperlink r:id="x" xmlns:r="urn:rels"><w:r><w:t>Visible link text</w:t></w:r></w:hyperlink></w:p>')),
      'word/header1.xml': strToU8(doc('<w:p><w:r><w:t>Header contact</w:t></w:r></w:p>')),
      'word/_rels/document.xml.rels': strToU8('<Relationships><Relationship Target="https://example.com/private" /></Relationships>'),
      'word/vbaProject.bin': strToU8('not executed'),
    });
    expect(textFromDocx(bytes)).toBe('Header contact\nAda & Bea\tProfile\nVisible link text');
    const parsed = await extractResumeText(new File([bytes], 'Ada.docx'));
    expect(parsed.format).toBe('docx'); expect(parsed.text).not.toContain('https://');
  });
  it('refuses XML declarations, malformed documents and large expanded document parts', () => {
    expect(() => textFromDocx(zipSync({ 'word/document.xml': strToU8('<!DOCTYPE x [<!ENTITY ext SYSTEM "https://example.com">]><x>&ext;</x>') }))).toThrow(/declarations/);
    expect(() => textFromDocx(zipSync({ 'word/document.xml': strToU8('<broken') }))).toThrow(/could not be read/);
    expect(() => textFromDocx(zipSync({ 'word/document.xml': strToU8('a'.repeat(2 * 1024 * 1024 + 1)) }))).toThrow(/expands/);
    expect(() => textFromDocx(zipSync({ 'unrelated.xml': strToU8('<x/>') }))).toThrow(/not a readable DOCX/);
  });
  it('rejects forged DOCX uncompressed sizes instead of silently returning a valid XML prefix', () => {
    const prefix = doc('<w:p><w:r><w:t>Ada</w:t></w:r></w:p>');
    const actual = strToU8(prefix + ' '.repeat(3 * 1024 * 1024));
    const bytes = zipSync({ 'word/document.xml': actual });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Forge both local and central sizes; the true DEFLATE output is far larger.
    view.setUint32(22, strToU8(prefix).length, true);
    for (let offset = 0; offset < bytes.length - 28; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) view.setUint32(offset + 24, strToU8(prefix).length, true);
    }
    expect(() => textFromDocx(bytes)).toThrow(/expands beyond/);
  });
});
