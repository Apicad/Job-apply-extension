import { collectOutcomes } from './outcomes';
import { libraryState, recoverLibrary, deleteAnswer } from './library';
import { answerCommand, loadFacts, libraryStore, validateAnswerBinding, invalidatePlan } from './answers';
import { browser } from 'wxt/browser';
import { loadProfile, readHackathon, writeHackathon, saveSyntheticProfile } from '../storage';
import { sanitizeFrameScan } from '../report';
import { planNative } from './engine';
import type { Frame, NativePlan } from './engine';
import type { NativeScan, NativeCommand } from './page';
import { DEMO_PROFILE, DEMO_FACTS } from './demo';
import { key, record } from './contracts';
const planKey = (tabId: number) => `plan:${tabId}`;
export async function scanTab(tabId: number): Promise<NativePlan> {
 const tab = await browser.tabs.get(tabId);
 if (!tab.url || !/^https?:/.test(tab.url)) throw Error('Open a sample application in a web tab.');
 const raw = await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['/scan.js'] });
 const frames: Frame[] = [];
 for (const r of raw) {
  const value = r.result as NativeScan | undefined;
  const clean = value && sanitizeFrameScan({ ...value, top: r.frameId === 0, childOrigins: [], error: '' });
  if (!clean || !value || typeof value.scanId !== 'string' || value.scanId.length > 100 || !r.documentId || new Set(clean.fields.map(f => f.ref)).size !== clean.fields.length || clean.fields.some(f => f.ref < 0 || f.form < -1)) continue;
  frames.push({ documentId: r.documentId, frameId: r.frameId, scan: { ...value, job: clean.job, fields: clean.fields.map(f => ({ ...f, maxLength: value.fields.find(v => v.ref === f.ref)?.maxLength ?? -1 })) } });
 }
 const profile = await loadProfile();
 const plan: NativePlan = { id: crypto.randomUUID(), tabId, url: tab.url, profileKey: key(profile), rows: planNative(frames, profile), state: 'preview' };
 await writeHackathon(planKey(tabId), plan, true); return plan;
}
export async function getPlan(tabId: number): Promise<NativePlan> {
 const plan = await readHackathon<NativePlan>(planKey(tabId), true);
 if (!plan) throw Error('Scan this application first.'); return plan;
}
export async function fillTab(tabId: number, id: string): Promise<NativePlan> {
 const plan = await getPlan(tabId);
 if (plan.id !== id || plan.state !== 'preview') throw Error('This preview was replaced or already used. Scan again; an interrupted fill is partial/unknown and will never replay automatically.');
 if ((await browser.tabs.get(tabId)).url !== plan.url || key(await loadProfile()) !== plan.profileKey) throw Error('Page or profile changed. Scan and review again.');
 await validateAnswerBinding(plan);
 plan.state = 'executing'; await writeHackathon(planKey(tabId), plan, true);
 const outcomes: NonNullable<NativePlan['outcomes']> = [];
 for (const documentId of new Set(plan.rows.map(r => r.documentId))) {
  const rows = plan.rows.filter(r => r.documentId === documentId && r.action); const first = rows[0]; if (!first) continue;
  const command: NativeCommand = { job: first.job, scanId: first.scanId, url: first.url, actions: rows.map(r => r.action!) };
  try {
   await browser.scripting.executeScript({ target: { tabId, documentIds: [documentId] }, func: (value: NativeCommand) => { (globalThis as typeof globalThis & { __jaaCommand?: NativeCommand }).__jaaCommand = value; }, args: [command] });
   const results = await browser.scripting.executeScript({ target: { tabId, documentIds: [documentId] }, files: ['/fill.js'] });
   const raw = results.filter(r => r.documentId === documentId).flatMap(r => Array.isArray(r.result) ? r.result : []);
   outcomes.push(...collectOutcomes(rows.map(r => r.field.ref), raw).map(o => ({ ...o, documentId })));
  } catch (error) { outcomes.push(...rows.map(r => ({ ref: r.field.ref, documentId, ok: false, status: 'unreachable' as const }))); (plan.errors ??= []).push(String(error)); /* Never retry writes. */ }
 }
 plan.outcomes = outcomes; plan.state = 'finished'; await writeHackathon(planKey(tabId), plan, true); return plan;
}
/** Called only by the extension-origin runtime listener, serialized across tabs. */
export async function handle(message: unknown): Promise<unknown> {
 if (!record(message) || typeof message.type !== 'string') throw Error('Invalid command.');
 if (message.type === 'demo') { if (await readHackathon('facts') !== null) throw Error('Saved facts already exist. Use a fresh browser profile for the demo.'); await saveSyntheticProfile(DEMO_PROFILE); await writeHackathon('facts', DEMO_FACTS); return { loaded: true }; }
 if (message.type === 'library-inspect') return { raw: JSON.stringify(await libraryStore.read(), null, 2), ...await libraryState(libraryStore) };
 if (message.type === 'library-recover') { await recoverLibrary(libraryStore, message.recoveryToken, message.confirmed === true); return { recovered: true }; }
 if (!Number.isSafeInteger(message.tabId) || Number(message.tabId) < 0) throw Error('Invalid tab.');
 if (message.type === 'delete') { if (typeof message.id !== 'string') throw Error('Invalid answer ID.'); await deleteAnswer(libraryStore, message.id); await invalidatePlan(Number(message.tabId)); return { deleted: true }; }
 if (message.type === 'state') { const plan = await readHackathon<NativePlan>(planKey(Number(message.tabId)), true); return plan ? answerCommand(message, plan) : { facts: await loadFacts(), session: null, plan: null, ...await libraryState(libraryStore) }; }
 if (message.type === 'scan') return scanTab(Number(message.tabId));
 if (message.type === 'fill' && typeof message.planId === 'string') return fillTab(Number(message.tabId), message.planId);
 return answerCommand(message, await getPlan(Number(message.tabId)));
}
