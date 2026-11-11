import { key, record, type Segment, type Source } from '../hackathon/contracts';
import type { ResumeDocument } from '../resume-preview';
import { boundedText, containsSensitiveMaterial, exactKeys, isMaterialsRequest, MAX_MATERIALS_REPLY, positive } from './request';
import type { MaterialsReply, MaterialsReplyWire, MaterialsRequest } from './types';

const numbers = (text: string): string[] => text.replace(/\bone(?=\s+(?:of\b|part\s+of\b))/gi, '').match(/\d+(?:[.,]\d+)*%?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/gi) ?? [];
const technologies = /\b(?:Rust|Python|JavaScript|TypeScript|Java|SQL|Oracle|AWS|Azure|GCP|Kubernetes|Docker|React|Angular|Vue|Django|Flask|Node\.js|Next\.js|PhD|MBA|bachelor|master|certified)\b|C\+\+/gi;
function warningFor(segment: Segment, request: MaterialsRequest): string[] {
  const support = segment.sources.map(ref => request.evidence.find(f => f.id === ref.id && f.revision === ref.revision)?.text ?? '').join(' ');
  const warnings = segment.sources.length ? [] : [`No saved evidence cited: ${segment.text}`];
  const availableNumbers = new Set(numbers(support).map(n => n.toLowerCase()));
  const missingNumbers = numbers(segment.text).filter(n => !availableNumbers.has(n.toLowerCase()));
  if (missingNumbers.length) warnings.push(`Number or date absent from cited evidence: ${[...new Set(missingNumbers)].join(', ')}`);
  const availableTerms = new Set((support.match(technologies) ?? []).map(term => term.toLowerCase()));
  const missingTerms = (segment.text.match(technologies) ?? []).filter(term => !availableTerms.has(term.toLowerCase()));
  if (missingTerms.length) warnings.push(`Technology or credential absent from cited evidence: ${[...new Set(missingTerms)].join(', ')}`);
  if (/\bprototypes?\b/i.test(support) && !/\bprototypes?\b/i.test(segment.text)) warnings.push(`Check that this wording preserves the source's prototype limitation: ${segment.text}`);
  if (/\bcoursework\b/i.test(support) && !/\bcoursework\b/i.test(segment.text)) warnings.push(`Check that this wording does not present coursework as an earned credential: ${segment.text}`);
  if (containsSensitiveMaterial(segment.text)) warnings.push('Generated wording contains contact or sensitive application details. Remove unsupported personal information.');
  return warnings;
}
function parseWire(value: unknown, request: MaterialsRequest): MaterialsReplyWire {
  if (!isMaterialsRequest(request) || !record(value) || !exactKeys(value, ['schema', 'kind', 'requestId', 'sourceKey', 'expiresAt', 'summary', 'entries', 'coverLetter', 'missing'], ['warnings']) || value.schema !== 1 || value.kind !== 'materials' || value.requestId !== request.id || value.sourceKey !== request.sourceKey || value.expiresAt !== request.expiresAt) throw Error('Materials response identity does not match the current request.');
  const segments = (items: unknown, min: number, max: number, entryId?: string): Segment[] => {
    if (!Array.isArray(items) || items.length < min || items.length > max) throw Error('Invalid materials segment count.');
    return items.map(item => {
      if (!record(item) || !exactKeys(item, ['text', 'sources']) || !boundedText(item.text, 2000) || !Array.isArray(item.sources) || item.sources.length > 22 || !item.sources.every(ref => record(ref) && exactKeys(ref, ['id', 'revision']) && boundedText(ref.id, 100) && positive(ref.revision))) throw Error('Invalid generated wording or source reference.');
      const sources: Source[] = item.sources.map(ref => ({ id: ref.id, revision: ref.revision }));
      if (new Set(sources.map(ref => ref.id)).size !== sources.length || sources.some(ref => !request.evidence.some(f => f.id === ref.id && f.revision === ref.revision) || (entryId !== undefined && ref.id !== entryId))) throw Error('Invented, stale or cross-entry source reference. Job requirements cannot be applicant evidence.');
      return { text: item.text.replace(/\r\n?/g, '\n').trim(), sources };
    });
  };
  if (!Array.isArray(value.entries) || value.entries.length > 20 || !Array.isArray(value.missing) || value.missing.length > 20 || !value.missing.every(item => boundedText(item, 500))) throw Error('Invalid materials entries or missing-information notes.');
  const entries = value.entries.map(item => {
    if (!record(item) || !exactKeys(item, ['entryId', 'bullets']) || typeof item.entryId !== 'string' || !request.entries.some(entry => entry.id === item.entryId)) throw Error('AI cannot add or alter saved résumé entry headers.');
    return { entryId: item.entryId, bullets: segments(item.bullets, 1, 8, item.entryId) };
  });
  if (new Set(entries.map(entry => entry.entryId)).size !== entries.length) throw Error('Duplicate résumé entry output.');
  const reply: MaterialsReplyWire = { schema: 1, kind: 'materials', requestId: request.id, sourceKey: request.sourceKey, expiresAt: request.expiresAt, summary: segments(value.summary, 0, 3), entries, coverLetter: segments(value.coverLetter, 1, 6), missing: value.missing.map(item => item.trim()) };
  if ([...reply.summary, ...reply.entries.flatMap(entry => entry.bullets), ...reply.coverLetter].reduce((sum, segment) => sum + segment.text.length, 0) > 20_000) throw Error('Generated materials are too long.');
  return reply;
}
/** Re-run bounded checks after edits. These checks are not semantic proof. */
export function reviewMaterialsReply(request: MaterialsRequest, value: unknown): MaterialsReply {
  const reply = parseWire(value, request);
  const warnings = [...new Set([...reply.missing, ...[...reply.summary, ...reply.entries.flatMap(entry => entry.bullets), ...reply.coverLetter].flatMap(segment => warningFor(segment, request))])];
  return { ...reply, warnings };
}
export function isMaterialsReply(value: unknown, request: MaterialsRequest): value is MaterialsReply {
  try { return record(value) && Array.isArray(value.warnings) && key(value) === key(reviewMaterialsReply(request, value)); } catch { return false; }
}
export function parseMaterialsReply(raw: string, request: MaterialsRequest, now = Date.now()): MaterialsReply {
  if (typeof raw !== 'string' || raw.length > MAX_MATERIALS_REPLY || now > request.expiresAt) throw Error('Materials request expired or response is too large. Generate a new draft.');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw Error('The AI response must be a JSON object without markdown fences.'); }
  if (record(value) && Object.hasOwn(value, 'warnings')) throw Error('The AI cannot supply its own review warnings.');
  return reviewMaterialsReply(request, value);
}
/** Original headers, dates, links and omitted entries always remain intact. */
export function materialResumeDocument(base: ResumeDocument, reply: MaterialsReply): ResumeDocument {
  const result = structuredClone(base);
  const replacements = new Map(reply.entries.map(entry => [entry.entryId, entry.bullets.map(segment => segment.text)]));
  for (const section of result.sections) {
    if (section.key !== 'experience' && section.key !== 'projects') continue;
    for (const entry of section.entries) if (replacements.has(entry.id)) entry.lines = [...replacements.get(entry.id)!];
  }
  result.sections = result.sections.filter(section => section.key !== 'summary');
  if (reply.summary.length) result.sections.unshift({ key: 'summary', title: 'Summary', entries: [{ id: 'materials:summary', heading: '', lines: reply.summary.map(segment => segment.text) }] });
  result.warnings = [...new Set([...result.warnings, ...reply.warnings])];
  return result;
}
