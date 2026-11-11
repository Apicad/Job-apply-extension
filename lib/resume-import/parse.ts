import type { Profile } from '../types';

export const MAX_IMPORT_TEXT = 100_000;
export interface ResumeProposal {
  fields: Partial<Profile>;
  facts: Array<{ location: string; text: string }>;
  warnings: string[];
  evidence: Partial<Record<keyof Profile, string>>;
}

const SECTION = /^(?:professional\s+|relevant\s+|selected\s+|technical\s+|work\s+)?(?:experience|employment|projects|education|skills|summary|profile|certifications|awards|publications|volunteering|volunteer experience|languages|interests|contact|links)(?:\s*&\s*projects)?\s*: ?$/i;
const sectionName = (line: string): string | null => {
  const value = line.trim().replace(/:$/, '');
  return SECTION.test(`${value}: `) ? value.toLowerCase() : null;
};
const ROLE_WORDS = /\b(?:engineer|developer|designer|analyst|manager|consultant|specialist|intern|resume|curriculum|vitae|summary|contact|portfolio|education|experience|project|skills|university|college|school|student)\b/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const clean = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

/** All proposals are editable, unsaved source data. No eligibility or current employment is inferred. */
export function proposeResumeImport(text: string, sourceName = 'Résumé'): ResumeProposal {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_TEXT) throw Error('The extracted text is too long to import. Use a shorter résumé.');
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const result: ResumeProposal = { fields: {}, facts: [], warnings: [], evidence: {} };
  const add = (key: keyof Profile, value: string, evidence: string): void => {
    value = clean(value);
    if (value && value.length <= 300 && !result.fields[key]) {
      // Only the explicitly selected ordinary text fields below reach this helper.
      Object.assign(result.fields, { [key]: value });
      result.evidence[key] = evidence;
    }
  };
  if (!lines.length) return { ...result, warnings: ['No readable text was found. Use a text-based PDF, DOCX, or TXT résumé.'] };
  const firstSection = lines.findIndex(line => sectionName(line) !== null && !/^contact$/i.test(line));
  const header = lines.slice(0, firstSection >= 0 ? firstSection : 20);
  const headerText = header.join('\n');
  const linkedinExport = /^contact$/i.test(lines[0] ?? '') && /linkedin\.com\/in\//i.test(text);
  const namePart = (line: string): string => line.replace(/^name\s*:\s*/i, '').split(/[|•]|[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@/i)[0]!.trim();
  const nameLine = (linkedinExport ? header.filter(line => /^name\s*:/i.test(line)) : header.slice(0, 3)).find(line => {
    const candidate = namePart(line);
    return !ROLE_WORDS.test(candidate) && candidate.length <= 100 && /^[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*){1,5}$/u.test(candidate);
  });
  if (nameLine) {
    const words = namePart(nameLine).split(/\s+/);
    add('firstName', words[0] ?? '', nameLine);
    add('lastName', words.slice(1).join(' '), nameLine);
  }
  else if (linkedinExport) result.warnings.push('The profile export uses columns. Check your name in the extracted text and enter it if needed.');
  const emails = [...new Set(headerText.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi) ?? [])];
  if (emails.length === 1) add('email', emails[0]!, emails[0]!);
  else if (emails.length > 1) result.warnings.push('More than one email address was found; choose the one to use.');
  const phones = [...headerText.matchAll(/(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}(?:\s*(?:ext\.?|x)\s*\d{1,6})?/gi)]
    .map(match => match[0].trim()).filter(value => { const digits = value.replace(/\D/g, ''); return digits.length >= 10 && digits.length <= 17; });
  const uniquePhones = [...new Set(phones)];
  if (uniquePhones.length === 1) add('phone', uniquePhones[0]!, uniquePhones[0]!);
  else if (uniquePhones.length > 1) result.warnings.push('More than one phone number was found; choose the one to use.');
  const links = headerText.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?:\/[^\s|<>]*)?/gi) ?? [];
  for (let raw of links) {
    raw = raw.replace(/[),;.!]+$/, '');
    if (emails.some(email => email.includes(raw))) continue;
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) continue;
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (host === 'linkedin.com' && /^\/in\/[^/]+\/?$/.test(url.pathname)) add('linkedin', url.href, raw);
      else if (host === 'github.com' && /^\/[^/]+\/?$/.test(url.pathname)) add('github', url.href, raw);
      else if (!['linkedin.com', 'github.com'].includes(host) && !/\.(?:pdf|docx?)$/i.test(url.pathname)) add('portfolio', url.href, raw);
    } catch { /* A broken link stays available in the extracted text. */ }
  }
  // Only an explicit short City, Region [Postal], Country line is proposed.
  for (const line of header) {
    const pieces = line.replace(/^(?:location|address)\s*:\s*/i, '').split(/[|•]/).map(part => part.trim());
    for (const piece of pieces) {
      const match = /^([\p{L}][\p{L}\p{M} .'-]{1,60}),\s*([\p{L}][\p{L}\p{M} .'-]{1,40})(?:\s+(\d{5}(?:-\d{4})?))?(?:,\s*(United States|USA|U\.S\.A\.|United Kingdom|Canada|Australia))?$/iu.exec(piece);
      if (!match || ROLE_WORDS.test(match[1]!)) continue;
      add('city', match[1]!, piece); add('state', match[2]!, piece);
      if (match[3]) add('postalCode', match[3], piece);
      if (match[4]) add('country', /^(USA|U\.S\.A\.)$/.test(match[4]) ? 'United States' : match[4], piece);
    }
  }
  const sections: Array<{ name: string; lines: string[] }> = [];
  let active: { name: string; lines: string[] } | undefined;
  for (const line of lines) {
    const name = sectionName(line);
    if (name) { active = { name, lines: [] }; sections.push(active); }
    else active?.lines.push(line);
  }
  const education = sections.find(section => section.name === 'education')?.lines ?? [];
  // Even a planned school is a boundary: its following program/date cannot be
  // silently attached to the preceding institution merely because it is not selected.
  const institutionRows = education.map((line, index) => ({ line, index, institution: line.split(/\s*[|•]\s*/)[0]! }))
    .filter(({ institution }) => /\b(university|college|institute|school)\b/i.test(institution));
  const schools = institutionRows.filter(({ institution }) => !/\b(coursework|courses|transfer|planning|planned|intend|intended|target)\b/i.test(institution));
  const school = schools[0];
  if (school) {
    // A single profile education record: only the first institution's adjoining lines.
    const begin = school.index, next = institutionRows.find(row => row.index > begin)?.index ?? education.length;
    const block = education.slice(begin, next).flatMap(line => line.split(/\s*[|•]\s*/));
    const noDegree = block.some(line => /\b(?:no|without|not|never)\b.{0,45}\b(?:degree|bachelor|master|associate|doctor|diploma|graduat\w*)\b|\b(?:degree|bachelor|master|associate|doctor|diploma)\b.{0,45}\b(?:not|never)\s+(?:awarded|earned|completed|conferred)|\b(?:coursework|courses|study|studies)\s+only\b|\bonly\s+(?:coursework|courses)\b|\bnon[- ]degree\b|\b(?:not|never)\s+(?:awarded|earned|completed|conferred)\b|\bdid not (?:complete|graduate)\b/i.test(line));
    add('school', school.institution.replace(/,\s*(?:[A-Z]{2}|[A-Z][a-z]+)(?:\s+\d{5})?$/, ''), school.line);
    if (schools.length > 1) result.warnings.push('Several schools were found. Review the first school selected for this profile.');
    for (const line of block) {
      if (/\b(?:plan|planned|planning|transfer|intend|intended|target)\b/i.test(line)) continue;
      const degree = /\b((?:Bachelor|Master|Associate)(?:['’]s)?(?:\s+of\s+(?:Science|Arts|Engineering|Business Administration|Applied Science))?|Doctor of Philosophy|Ph\.?D\.?|B\.?Sc\.?|M\.?Sc\.?|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|A\.?S\.?|A\.?A\.?)\b/i.exec(line);
      if (degree && !noDegree && !/\b(?:coursework|courses|plan|planned|planning|transfer|intend|intended|target)\b/i.test(line)) add('degree', degree[1]!, line);
      const major = /(?:\b(?:major|field of study|program)\s*:\s*|\b(?:Science|Arts|Engineering)\s+in\s+)([^|;,(]+)/i.exec(line)
        ?? /^([^|;,(]+?)\s+(?:coursework|courses)\b/i.exec(line);
      if (major) add('major', major[1]!.replace(/\s*[–—-]\s*$/, ''), line);
      const gpa = /\bGPA\s*:?\s*([0-4](?:\.\d{1,3})?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\b/i.exec(line);
      if (gpa && Number(gpa[1]) <= 4 && (!gpa[2] || Number(gpa[2]) === 4)) add('gpa', gpa[1]!, line);
      else if (gpa?.[2]) result.warnings.push('The résumé uses a different GPA scale. Enter the value required by each application.');
      const grad = /\b(?:expected(?:\s+graduation)?|graduat(?:ion|ed|ing))\s*:?\s*([A-Za-z]+)\s+(20\d{2}|19\d{2})\b/i.exec(line);
      if (grad) {
        const month = MONTHS.indexOf(grad[1]!.slice(0, 3).toLowerCase());
        if (month >= 0) add('graduationDate', `${grad[2]}-${String(month + 1).padStart(2, '0')}`, line);
      }
    }
  }
  const factSections = sections.filter(section => /(?:experience|employment|projects|volunteering)/.test(section.name));
  for (const section of factSections) {
    let chunk = '';
    let label = section.name;
    let part = 1;
    const append = (): void => {
      if (!chunk || result.facts.length >= 20) return;
      result.facts.push({ location: `${sourceName.slice(0, 150)} — ${label.slice(0, 120)}${part > 1 ? ` (${part})` : ''}`, text: chunk });
      chunk = '';
      part += 1;
    };
    for (let index = 0; index < section.lines.length; index += 1) {
      const line = section.lines[index]!;
      const next = section.lines[index + 1] ?? '';
      const sentence = /^[•*\-–—]|[.!?]$/.test(line) || /^(?:built|implemented|developed|created|designed|maintained|extended|deployed|tested|worked|led|managed|collaborated|improved|supported|wrote|used)\b/i.test(line);
      const technologyLine = /(?:github\.com\/|https?:\/\/|\b(?:React|TypeScript|JavaScript|Python|Node\.js|Java|C\+\+|WebSocket|SQL)\b.*[,|])/i.test(next);
      const roleHeader = /[|]/.test(line) && /\b(?:19|20)\d{2}\b|\bPresent\b/.test(line);
      const projectHeader = /projects/.test(section.name) && !sentence && line.length <= 160 && !/https?:|github\.com/.test(line) && (index === 0 || technologyLine);
      if (roleHeader || projectHeader) {
        append(); label = line.split(/\s*[|]\s*/)[0]!; part = 1;
      }
      if (line.length > 2000) { append(); result.warnings.push('An unusually long experience paragraph was left in the extracted text for manual review.'); continue; }
      if (chunk.length + line.length + 1 > 2000) append();
      chunk += `${chunk ? '\n' : ''}${line}`;
    }
    append();
  }
  if (result.facts.length === 20) result.warnings.push('Up to 20 experience notes were proposed. Review the extracted text for any remaining details.');
  result.warnings.push('Review imported names, links and education before saving. Missing information stays blank; employment and project notes are copied as written.');
  return result;
}
