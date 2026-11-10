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
 if (replaceId && existing && existing.revision !== expectedRevision) throw Error('Saved answer changed in another editor. Reopen and review the latest revision.');
 if (replaceId && !existing) throw Error('Saved answer was deleted. Generate a new draft.');
 const revision = existing ? Math.max(existing.revision + 1, a.revision) : a.revision;
 const saved: Answer = { ...structuredClone(a), id: existing?.id ?? a.id, revision, scope, approval: { ...a.approval!, revision }, createdAt: existing?.createdAt ?? a.createdAt, updatedAt: Date.now() };
 const next = [...answers.filter(item => item.id !== saved.id), saved];
 if (next.length > 100) throw Error('Library is full. Delete an answer explicitly before saving another.');
 await store.write({ schema: 1, answers: next }); return saved;
}
export async function deleteAnswer(store: LibraryStore, id: string): Promise<void> {
 const answers = await readLibrary(store);
 if (!answers.some(a => a.id === id)) throw Error('Saved answer no longer exists.');
 await store.write({ schema: 1, answers: answers.filter(a => a.id !== id) });
}
