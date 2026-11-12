import { writingIntent } from './question-analysis';
/** Bounded completeness gates for supported question types, not a semantic truth guarantee. */
export function answerRelevance(question: string, answer: string, evidence: string, checkAnswer = true): string[] {
 const intent=writingIntent(question), gaps:string[]=[];
 const positive=(text:string,pattern:RegExp)=>text.split(/[\n.!?]+/).some(sentence=>pattern.test(sentence)&&! /\b(?:not|never|no|unknown|missing|unconfirmed)\b|\b(?:don't|haven't|cannot)\b/i.test(sentence));
 if(intent==='work-style') {
  const preference=/(?=.*(?:\bI\s+(?:(?:generally|usually|typically)\s+)?(?:prefer|lean|prioritize|favo[u]?r|tend)|\bmy\s+(?:baseline|preference|tendency)\b))(?=.*\b(?:ship(?:ping)?|quickly|speed|perfection(?:ist)?|perfecting|quality|best solution)\b)/i;
  if(!positive(evidence,preference)||(checkAnswer&&!positive(answer,preference))) gaps.push('State your baseline preference: shipping quickly or perfecting the solution. Save it in Profile home; an experience list does not answer this question.');
 }
 if(intent==='skills') {
  const duration=/\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|less than one)\s*\+?\s*(?:years?|months?)\b/i;
  if(!duration.test(evidence)||(checkAnswer&&(!answer.trim()||answer.split(/[;\n]+/).filter(s=>s.trim()).some(s=>!/^\s*[\w .+#/-]+\s*:\s*(?:approximately |about )?(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|less than one)\s*\+?\s*(?:years?|months?)\s*\.?\s*$/i.test(s))))) gaps.push('Provide approximate time using each listed technology, for example Python: 2 years; React: 1 year. Employment dates alone do not establish these durations.');
 }
 if(intent==='project'&&/most proud/i.test(question)) {
  for(const [pattern,message] of [[/\b(?:most proud|proudest)\b/i,'Confirm which project you are most proud of.'],[/\b(?:built|created|developed)\b[^.!?\n]{0,100}\bfrom scratch\b/i,'Confirm that you built that project from scratch.']] as const) {
   if(!positive(evidence,pattern)||(checkAnswer&&!positive(answer,pattern))) gaps.push(message);
  }
 }
 if(checkAnswer&&intent==='motivation'&&!/\b(?:excited|interested|motivated|drawn|appeals|want to|would welcome|would love)\b/i.test(answer)) gaps.push('Explain why this specific opportunity interests you, connecting it to supported experience or interests.');
 return gaps;
}
