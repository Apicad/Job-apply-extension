import { it, expect } from 'vitest';
import { readLibrary, saveAnswer, deleteAnswer } from '../../lib/hackathon/library';
import { approve, makeRequest, parseReply } from '../../lib/hackathon/contracts';
import { DEMO_FACTS } from '../../lib/hackathon/demo';
function answer() {
 const context = { questionKey: 'synthetic-question-1', application: 'synthetic-app', question: 'Describe a relevant project.', job: '', control: 'textarea' as const };
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

it('rejects a stale editor replacing a newer saved revision', async () => {
 const a=answer();let value:unknown={schema:1,answers:[{...a,revision:3,approval:{...a.approval!,revision:3}}]};
 const store={read:async()=>value,write:async(v:unknown)=>{value=v;}};
 await expect(saveAnswer(store,a,DEMO_FACTS,'application',a.id,1)).rejects.toThrow(/changed/);
 expect((await readLibrary(store))[0]?.revision).toBe(3);
});

it('AB-6: recovery is explicit, rejects stale inspection and keeps unknown envelopes intact', async () => {
 const { libraryState, recoverLibrary } = await import('../../lib/hackathon/library');
 const a = answer(); let value: unknown = { schema: 999, answers: [a] };
 const store = { read: async () => value, write: async (v: unknown) => { value = v; } };
 const state = await libraryState(store); expect(state.library).toEqual([]); expect(state.libraryError).toMatch(/preserved/);
 await expect(recoverLibrary(store, state.recoveryToken, false)).rejects.toThrow();
 value = { schema: 999, answers: [], changed: true };
 await expect(recoverLibrary(store, state.recoveryToken, true)).rejects.toThrow(/changed/);
 const latest = await libraryState(store); const original = value; await recoverLibrary(store, latest.recoveryToken, true);
 expect(value).toMatchObject({ schema: 1, answers: [], quarantine: { raw: original } });
 await expect(recoverLibrary(store, state.recoveryToken, true)).rejects.toThrow();
 await saveAnswer(store, a, DEMO_FACTS, 'application'); expect((value as any).quarantine.raw).toEqual(original);
});
