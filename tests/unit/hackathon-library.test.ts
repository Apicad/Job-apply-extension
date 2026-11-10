import { it, expect } from 'vitest';
import { readLibrary, saveAnswer, deleteAnswer } from '../../lib/hackathon/library';
import { approve, makeRequest, parseReply } from '../../lib/hackathon/contracts';
import { DEMO_FACTS } from '../../lib/hackathon/demo';
function answer() {
 const context = { application: 'synthetic-app', question: 'Describe a relevant project.', job: '', control: 'textarea' as const };
 const r = makeRequest(context, DEMO_FACTS); const draft = parseReply(JSON.stringify({ schema: 1, requestId: r.id, context, facts: r.facts.map(({id, revision})=>({id,revision})), segments: [{ text: DEMO_FACTS[0]!.text, sources: [{id: DEMO_FACTS[0]!.id, revision: 1}] }], missing: [] }), r, DEMO_FACTS);
 return approve(draft, context, DEMO_FACTS, true);
}
it('explicit save persists exact approved revision; deletion removes only named record', async () => {
 let value: unknown = null; const store = { read: async () => value, write: async (v: unknown) => { value = structuredClone(v); } };
 const a = answer(); expect(await readLibrary(store)).toEqual([]);
 const saved = await saveAnswer(store, a, DEMO_FACTS, 'application');
 expect((await readLibrary(store))[0]?.text).toBe(a.text); expect(saved.scope).toBe('application');
 await deleteAnswer(store, saved.id); expect(await readLibrary(store)).toEqual([]);
});
it('propagates quota errors without false success or modifying old data', async () => {
 const a = answer(); const value = { schema: 1, answers: [a] };
 const store = { read: async () => structuredClone(value), write: async () => { throw Error('QUOTA'); } };
 await expect(saveAnswer(store, answer(), DEMO_FACTS, 'factual')).rejects.toThrow('QUOTA');
 expect((await readLibrary(store))).toEqual([a]);
});
it('preserves malformed records and rejects drafts, stale facts and invalid scope', async () => {
 const a = answer(); let writes = 0; const store = { read: async () => null, write: async () => { writes++; } };
 await expect(saveAnswer(store, {...a, approval:null}, DEMO_FACTS, 'application')).rejects.toThrow();
 await expect(saveAnswer(store, a, [], 'application')).rejects.toThrow();
 await expect(saveAnswer(store, a, DEMO_FACTS, 'broad')).rejects.toThrow();
 await expect(readLibrary({...store, read:async()=>({schema:3,answers:[a]})})).rejects.toThrow();
 expect(writes).toBe(0);
});
