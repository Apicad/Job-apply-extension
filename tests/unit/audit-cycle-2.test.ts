import { it, expect } from 'vitest';
import { approve, currentApproval, editAnswer, isAnswer, makeRequest, parseReply, reusableDraft } from '../../lib/hackathon/contracts';
import { saveAnswer } from '../../lib/hackathon/library';
import { DEMO_FACTS } from '../../lib/hackathon/demo';
const context = { application: 'synthetic-application', questionKey: 'project-question', question: 'Describe a relevant project.', job: 'Synthetic role.', control: 'textarea' as const };
function draft(text: string, fact = 0) {
 const r = makeRequest(context, DEMO_FACTS);
 return parseReply(JSON.stringify({schema:1,requestId:r.id,context:r.context,facts:r.facts.map(({id,revision})=>({id,revision})),segments:[{text,sources:[{id:r.facts[fact]!.id,revision:1}]}],missing:[]}),r,DEMO_FACTS);
}
it.each([
 'I wrote two test suites in Python for missing readings.',
 'I wrote  two test suites in Python for missing readings.\nI documented the dashboard.',
 'I WROTE TWO TEST SUITES IN PYTHON FOR MISSING READINGS!',
])('N1: unchanged claim keeps cited-fact constraints through editing: %s', (text) => {
 const a = draft('I wrote two test suites in Python for missing readings.',1);
 expect(a.gaps.join(' ')).toMatch(/two/);expect(a.gaps.join(' ')).toMatch(/Python/);
 const edited = editAnswer(a,text);expect(edited.gaps.join(' ')).toMatch(/two/);expect(edited.gaps.join(' ')).toMatch(/Python/);
 expect(()=>approve(edited,context,DEMO_FACTS,true)).toThrow();expect(edited.trace).toEqual(a.trace);
 const corrected=editAnswer(edited,'I wrote tests for missing readings.');expect(corrected.gaps).toEqual([]);expect(approve(corrected,context,DEMO_FACTS,true).approval).not.toBeNull();
});
it.each(['One part of my project was a Python script.', 'One of my contributions was a Python script.'])('N3: discourse phrase is not treated as a claimed metric: %s', text => {
 const a=draft(text);expect(a.gaps).toEqual([]);expect(approve(a,context,DEMO_FACTS,true).approval).not.toBeNull();
});
it.each(['I supported one hundred users.', 'I finished in one week.', 'I wrote two test suites.'])('N3: quantity remains flagged: %s',text=>{expect(draft(text,1).gaps.length).toBeGreaterThan(0);});
it('N2: library refuses same-application different-question replacement while allowing a fork',async()=>{
 const a={...approve(draft(DEMO_FACTS[0]!.text),context,DEMO_FACTS,true),scope:'application' as const};let value:unknown={schema:1,answers:[a]};
 const store={read:async()=>value,write:async(v:unknown)=>{value=v;}};
 const other={...context,questionKey:'second-project-question',question:'Tell us about a project you built.'};
 const b=approve(reusableDraft(a,other,DEMO_FACTS),other,DEMO_FACTS,true);
 await expect(saveAnswer(store,b,DEMO_FACTS,'application',a.id,a.revision)).rejects.toThrow();
 const saved=await saveAnswer(store,b,DEMO_FACTS,'application');expect(saved.id).not.toBe(a.id);expect((value as any).answers[0]).toEqual(a);
 expect(()=>reusableDraft(saved,{...other,application:'different-app'},DEMO_FACTS)).toThrow();
});
it.each(['ai','edited'] as const)('N6: legacy %s CRLF reuse normalizes before approval without changing original trace', origin=>{
 const original=draft('I built a Python script. I displayed synthetic readings.');
 const text='I built a Python script.\r\nI displayed synthetic readings.\rI made a dashboard.';
 const segments=[{...original.segments[0]!,text}];
 const legacy={...original,origin,text,segments:origin==='ai'?segments:[],trace:{...original.trace,segments},approval:{text,revision:1,contextKey:original.contextFingerprint,at:Date.now()}};
 expect(isAnswer(legacy)).toBe(true);
 const reused=reusableDraft(legacy,context,DEMO_FACTS);expect(reused.text).toBe(text.replace(/\r\n?/g,'\n'));expect(reused.approval).toBeNull();expect(reused.trace).toEqual(legacy.trace);expect(isAnswer(reused)).toBe(true);
 const approved=approve(reused,context,DEMO_FACTS,true);expect(approved.approval?.text).toBe(reused.text);expect(currentApproval(approved,context,DEMO_FACTS)).toBe(true);
 if(origin==='ai'){const changed=[{...reused.segments[0]!,text:'I deployed Rust.'}];expect(isAnswer({...reused,text:changed[0]!.text,segments:changed})).toBe(false);const changedSources=reused.segments.map(s=>({...s,sources:[{id:DEMO_FACTS[1]!.id,revision:1}]}));expect(isAnswer({...reused,segments:changedSources})).toBe(false);}
 expect(currentApproval(legacy,context,DEMO_FACTS)).toBe(false);
});
