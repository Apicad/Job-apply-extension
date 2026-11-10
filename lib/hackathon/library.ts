import { allowedQuestion, currentApproval, isAnswer, record } from './contracts';
import type { Answer, Fact } from './contracts';
/** Storage is an external boundary; caller serializes mutations in the worker. */
export interface LibraryStore { read(): Promise<unknown>; write(value: unknown): Promise<void> }
export async function readLibrary(store: LibraryStore): Promise<Answer[]> {
 const v = await store.read(); if (v === null) return [];
 if (!record(v) || v.schema !== 1 || !Array.isArray(v.answers) || v.answers.length > 100 || !v.answers.every(isAnswer) || new Set(v.answers.map(a => a.id)).size !== v.answers.length) throw Error('Answer library is malformed or from an unsupported version. Existing data was preserved.');
 return v.answers;
}
export async function saveAnswer(store: LibraryStore, a: Answer, facts: Fact[], scope: unknown, replaceId?: string, expectedRevision?: number): Promise<Answer> {
 if (!isAnswer(a) || !currentApproval(a, a.context, facts) || (scope !== 'application' && scope !== 'factual') || (scope === 'factual' && !allowedQuestion(a.context.question))) throw Error('Only a current, reviewed, approved answer can be saved with this scope.');
 const answers = await readLibrary(store); const existing = replaceId ? answers.find(item => item.id === replaceId) : answers.find(item => item.id === a.id);
 if (existing && existing.context.application !== a.context.application) throw Error('Save cross-application reuse as a new record.');
 if (replaceId && existing && existing.revision !== expectedRevision) throw Error('Saved answer changed in another editor. Reopen and review the latest revision.');
 if (replaceId && !existing) throw Error('Saved answer was deleted. Generate a new draft.');
 const revision = existing ? Math.max(existing.revision + 1, a.revision) : a.revision;
 const saved: Answer = { ...structuredClone(a), id: existing?.id ?? a.id, revision, scope, approval: { ...a.approval!, revision }, createdAt: existing?.createdAt ?? a.createdAt, updatedAt: Date.now() };
 const next = [...answers.filter(item => item.id !== saved.id), saved];
 if (next.length > 100) throw Error('Library is full. Delete an answer explicitly before saving another.');
 const raw = await store.read();
 await store.write({ ...(record(raw) ? raw : {}), schema: 1, answers: next }); return saved;
}
export async function deleteAnswer(store: LibraryStore, id: string): Promise<void> {
 const answers = await readLibrary(store);
 if (!answers.some(a => a.id === id)) throw Error('Saved answer no longer exists.');
 const raw = await store.read();
 await store.write({ ...(record(raw) ? raw : {}), schema: 1, answers: answers.filter(a => a.id !== id) });
}

const corruption = 'Answer library is malformed or from an unsupported version. Existing data was preserved.';
async function recoveryToken(raw: unknown): Promise<string> {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
 return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function libraryState(store: LibraryStore): Promise<{ library: Answer[]; libraryError?: string; recoveryToken?: string }> {
 const raw = await store.read();
 try { return { library: await readLibrary({ ...store, read: async () => raw }) }; }
 catch {
  // Never interpret a future schema. In schema 1 keep only valid, unique IDs.
  const candidates: unknown[] = record(raw) && raw.schema === 1 && Array.isArray(raw.answers) && raw.answers.length <= 100 ? raw.answers : [];
  const library = candidates.filter(isAnswer).filter(a => candidates.filter(item => record(item) && item.id === a.id).length === 1);
  return { library, libraryError: corruption, recoveryToken: await recoveryToken(raw) };
 }
}
export async function recoverLibrary(store: LibraryStore, expected: unknown, confirmed: boolean): Promise<void> {
 const raw = await store.read(); const state = await libraryState({ ...store, read: async () => raw });
 if (!confirmed || !state.libraryError || expected !== state.recoveryToken) throw Error('Inspect the current raw library and confirm recovery. It may have changed in another editor.');
 // One atomic library write includes the complete original envelope. No data is discarded.
 await store.write({ schema: 1, answers: state.library, quarantine: { at: Date.now(), raw } });
}
