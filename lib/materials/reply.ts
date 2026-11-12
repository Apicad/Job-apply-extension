import { key, record } from '../hackathon/contracts';
import type { ResumeDocument } from '../resume-preview';
import { boundedText, containsSensitiveMaterial, exactKeys, isMaterialsRequest, MAX_MATERIALS_REPLY, positive } from './request';
import type { MaterialsReply, MaterialsReplyWire, MaterialsRequest, MaterialsSegment as Segment, MaterialsSource as Source } from './types';

const numbers = (text: string): string[] => text.replace(/\bone(?=\s+(?:of\b|part\s+of\b))/gi, '').match(/\d+(?:[.,]\d+)*%?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/gi) ?? [];
const technologies = /\b(?:Rust|Python|JavaScript|TypeScript|Java|SQL|Oracle|AWS|Azure|GCP|Kubernetes|Docker|React|Angular|Vue|Django|Flask|Node\.js|Next\.js|PhD|MBA|bachelor|master|certified)\b|C\+\+/gi;
const prototype = /\bprototypes?\b/i;
const statementKey = (text: string): string => text.trim().replace(/\s+/g, ' ');
const linesOf = (text: string): string[] => text.replace(/\r\n?/g, '\n').split('\n');
function citedSupport(ref: Source, request: MaterialsRequest, legacy: boolean): string {
  const fact = request.evidence.find(item => item.id === ref.id && item.revision === ref.revision)!;
  if (legacy || ref.statement === undefined) return fact.text;
  const lines = linesOf(fact.text);
  const entry = request.entries.find(item => item.id === ref.id && item.revision === ref.revision);
  // Headers and standalone qualification labels still scope the complete note.
  // Sentence citations narrow only the body evidence, never those limitations.
  const context = [fact.location, entry?.heading ?? '', entry?.detail ?? '', lines[0] ?? '', ...lines.filter(line => !/[.!?]\s*$/.test(line))];
  return [lines[ref.statement]!, ...context.filter(line => /\b(?:prototypes?|coursework)\b/i.test(line))].join('\n');
}
/** Only an unchanged, complete source line can narrow a note-level caution.
 * Paraphrases, merged claims and qualification headings remain ambiguous. */
function repeatsUnqualifiedStatement(segment: Segment, request: MaterialsRequest): boolean {
  const wording = statementKey(segment.text);
  if (segment.sources.some(ref => ref.statement !== undefined) || !/[.!?]$/.test(wording) || /[\r\n]/.test(segment.text)) return false;
  return segment.sources.every(ref => {
    const fact = request.evidence.find(item => item.id === ref.id && item.revision === ref.revision)!;
    if (!prototype.test(fact.text)) return true;
    const entry = request.entries.find(item => item.id === ref.id && item.revision === ref.revision);
    if (!entry || prototype.test([fact.location, entry.heading, entry.detail ?? ''].join('\n'))) return false;
    const lines = linesOf(fact.text).map(statementKey).filter(Boolean);
    // A leading qualification or a standalone heading may scope the whole note.
    if (prototype.test(lines[0] ?? '') || lines.some(line => prototype.test(line) && !/[.!?]$/.test(line))) return false;
    return lines.includes(wording) && entry.lines.some(line => statementKey(line) === wording);
  });
}
function warningFor(segment: Segment, request: MaterialsRequest, legacy = false): string[] {
  const support = segment.sources.map(ref => citedSupport(ref, request, legacy)).join(' ');
  const warnings = segment.sources.length ? [] : [`No saved evidence cited: ${segment.text}`];
  const availableNumbers = new Set(numbers(support).map(n => n.toLowerCase()));
  const missingNumbers = numbers(segment.text).filter(n => !availableNumbers.has(n.toLowerCase()));
  if (missingNumbers.length) warnings.push(`Number or date absent from cited evidence: ${[...new Set(missingNumbers)].join(', ')}`);
  const availableTerms = new Set((support.match(technologies) ?? []).map(term => term.toLowerCase()));
  const missingTerms = (segment.text.match(technologies) ?? []).filter(term => !availableTerms.has(term.toLowerCase()));
  if (missingTerms.length) warnings.push(`Technology or credential absent from cited evidence: ${[...new Set(missingTerms)].join(', ')}`);
  if (prototype.test(support) && !prototype.test(segment.text) && (legacy || !repeatsUnqualifiedStatement(segment, request))) warnings.push(`Check that this wording preserves the source's prototype limitation: ${segment.text}`);
  if (/\bcoursework\b/i.test(support) && !/\bcoursework\b/i.test(segment.text)) warnings.push(`Check that this wording does not present coursework as an earned credential: ${segment.text}`);
  if (containsSensitiveMaterial(segment.text)) warnings.push('Generated wording contains contact or sensitive application details. Remove unsupported personal information.');
  return warnings;
}
function parseWire(value: unknown, request: MaterialsRequest): MaterialsReplyWire {
  if (!isMaterialsRequest(request) || !record(value) || !exactKeys(value, ['schema', 'kind', 'requestId', 'sourceKey', 'expiresAt', 'summary', 'entries', 'coverLetter', 'missing'], ['warnings']) || value.schema !== 1 || value.kind !== 'materials' || value.requestId !== request.id || value.sourceKey !== request.sourceKey || value.expiresAt !== request.expiresAt) throw Error('Materials response identity does not match the current request.');
  const segments = (items: unknown, min: number, max: number, entryId?: string): Segment[] => {
    if (!Array.isArray(items) || items.length < min || items.length > max) throw Error('Invalid materials segment count.');
    return items.map(item => {
      if (!record(item) || !exactKeys(item, ['text', 'sources']) || !boundedText(item.text, 2000) || !Array.isArray(item.sources) || item.sources.length > 22 || !item.sources.every(ref => record(ref) && exactKeys(ref, ['id', 'revision'], ['statement']) && boundedText(ref.id, 100) && positive(ref.revision) && (!Object.hasOwn(ref, 'statement') || Number.isSafeInteger(ref.statement) && Number(ref.statement) >= 0))) throw Error('Invalid generated wording or source reference.');
      const sources: Source[] = item.sources.map(ref => ({ id: ref.id, revision: ref.revision, ...(Object.hasOwn(ref, 'statement') ? { statement: ref.statement } : {}) }));
      if (new Set(sources.map(ref => key(ref))).size !== sources.length || sources.some(ref => {
        const fact = request.evidence.find(f => f.id === ref.id && f.revision === ref.revision);
        return !fact || (entryId !== undefined && ref.id !== entryId) || (ref.statement !== undefined && !linesOf(fact.text)[ref.statement]?.trim());
      })) throw Error('Invented, stale or cross-entry source reference. Job requirements cannot be applicant evidence.');
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
  return reviewedReply(request, value);
}
function reviewedReply(request: MaterialsRequest, value: unknown, legacy = false): MaterialsReply {
  const reply = parseWire(value, request);
  const warnings = [...new Set([...reply.missing, ...[...reply.summary, ...reply.entries.flatMap(entry => entry.bullets), ...reply.coverLetter].flatMap(segment => warningFor(segment, request, legacy))])];
  return { ...reply, warnings };
}
export function materialsReviewNotices(request: MaterialsRequest, value: unknown): { warnings: string[]; missing: string[] } {
  const reply = reviewMaterialsReply(request, value);
  const missing = [...new Set(reply.missing)];
  return { missing, warnings: reply.warnings.filter(warning => !missing.includes(warning)) };
}
export function isMaterialsReply(value: unknown, request: MaterialsRequest): value is MaterialsReply {
  try {
    if (!record(value) || !Array.isArray(value.warnings)) return false;
    // Keep 0.5.0 drafts and their exact review fingerprints readable. Accept only
    // a fully recomputed current or legacy warning set, never arbitrary extras.
    const current = reviewedReply(request, value);
    if (key(value) === key(current)) return true;
    const legacySources = [...current.summary, ...current.entries.flatMap(entry => entry.bullets), ...current.coverLetter].every(segment => segment.sources.every(ref => ref.statement === undefined));
    return legacySources && key(value) === key(reviewedReply(request, value, true));
  } catch { return false; }
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
