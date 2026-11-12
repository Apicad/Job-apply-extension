import { canFillPartialAnswer } from './answer-relevance';
import { parseReply, type Answer, type Fact, type Segment } from '../hackathon/contracts';
/** Keep missing evidence in the sidebar; never paste model process notes into a form.
 * Token/citation checks are conservative checks, not a semantic truth guarantee. */
export function automaticAnswer(original: Answer, facts: Fact[]): Answer | null {
 if (original.origin !== 'ai') return null;
 const request = original.trace.request;
 const parse = (segments: Segment[]) => parseReply(JSON.stringify({schema:1,requestId:request.id,context:request.context,
  facts:request.facts.map(({id,revision})=>({id,revision})),segments,missing:[]}),request,facts);
 const commentary = /(?:saved|supplied|provided|applicant) (?:facts|experience|information|evidence)|not (?:established|specified|provided|supplied)|missing information|cannot (?:determine|confirm)|\[(?:insert|add|your)\b/i;
 const supported = original.trace.segments.filter(segment => !commentary.test(segment.text) && parse([segment]).gaps.length === 0);
 const selected = supported.length ? parse(supported) : null;
 return selected && canFillPartialAnswer(original.context.question, selected.text, facts.map(f=>f.text).join('\n')) ? selected : null;
}
