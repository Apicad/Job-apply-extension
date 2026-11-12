import { it, expect } from 'vitest';
import { makeRequest, parseReply } from '../../lib/hackathon/contracts';
import { automaticAnswer } from '../../lib/sidebar/automatic-answer';
const facts = [{id:'one',revision:1,text:'I built a React dashboard.',location:'Project'}];
const context = { application:'app',questionKey:'q',question:'Describe a relevant project.',job:'Developer',control:'textarea' as const };
function answer(segments: any[], missing: string[] = []) {
 const request = makeRequest(context, facts);
 return parseReply(JSON.stringify({schema:1,requestId:request.id,context,facts:[{id:'one',revision:1}],segments,missing}),request,facts);
}
const supported = {text:'I built a React dashboard.', sources:[{id:'one',revision:1}]};
it('fills supported portions while leaving original missing facts intact', () => {
 const original = answer([supported,{text:'My saved facts do not establish years of experience.',sources:[]}],['Years of experience are missing.']);
 const selected = automaticAnswer(original,facts);
 expect(selected?.text).toBe('I built a React dashboard.');
 expect(original.gaps).toContain('Years of experience are missing.');
 expect(selected?.approval).toBeNull();
});
it('rejects unsupported claims and internal commentary even with citations', () => {
 expect(automaticAnswer(answer([{...supported,text:'I built 90 React dashboards.'}]),facts)).toBeNull();
 expect(automaticAnswer(answer([{...supported,text:'The supplied facts do not establish my preference.'}]),facts)).toBeNull();
});
it('does not reuse edited answers or stale facts automatically', () => {
 const original=answer([supported]);
 expect(() => automaticAnswer(original,[{...facts[0]!,revision:2}])).toThrow();
 expect(automaticAnswer({...original,origin:'edited'},facts)).toBeNull();
});
it.each(['One project I built is a React dashboard.', 'One example is a React dashboard.'])('keeps a non-metric introduction: %s', text => {
 const original=answer([{...supported,text},supported]);
 expect(original.gaps).toEqual([]);
 expect(automaticAnswer(original,facts)?.text).toBe(`${text} ${supported.text}`);
});
it.each(['I have one year of React experience.', 'I improved performance by one percent.', 'I led one team.'])('still flags a real unsupported quantity: %s', text=>{
 expect(answer([{...supported,text}]).gaps.join(' ')).toContain('Unsupported number/date');
});
