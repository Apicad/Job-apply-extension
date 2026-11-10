import { readLibrary } from './library';
import { answerCommand, loadFacts, libraryStore, validateAnswerBinding } from './answers';
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
  if (!clean || !value || typeof value.scanId !== 'string' || !r.documentId) continue;
  frames.push({ documentId: r.documentId, frameId: r.frameId, scan: { ...value, fields: clean.fields.map(f => ({ ...f, maxLength: value.fields.find(v => v.ref === f.ref)?.maxLength ?? -1 })) } });
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
  const command: NativeCommand = { scanId: first.scanId, url: first.url, actions: rows.map(r => r.action!) };
  try {
   await browser.scripting.executeScript({ target: { tabId, documentIds: [documentId] }, func: (value: NativeCommand) => { (globalThis as typeof globalThis & { __jaaCommand?: NativeCommand }).__jaaCommand = value; }, args: [command] });
   const results = await browser.scripting.executeScript({ target: { tabId, documentIds: [documentId] }, files: ['/fill.js'] });
   for (const result of results) if (Array.isArray(result.result)) for (const item of result.result) if (record(item) && Number.isSafeInteger(item.ref) && typeof item.ok === 'boolean') outcomes.push({ ref: Number(item.ref), documentId, ok: item.ok });
  } catch (error) { (plan.errors ??= []).push(String(error)); /* Never retry writes. */ }
 }
 plan.outcomes = outcomes; plan.state = 'finished'; await writeHackathon(planKey(tabId), plan, true); return plan;
}
/** Called only by the extension-origin runtime listener, serialized across tabs. */
export async function handle(message: unknown): Promise<unknown> {
 if (!record(message) || typeof message.type !== 'string') throw Error('Invalid command.');
 if (message.type === 'demo') { await saveSyntheticProfile(DEMO_PROFILE); await writeHackathon('facts', DEMO_FACTS); return { loaded: true }; }
 if (!Number.isSafeInteger(message.tabId) || Number(message.tabId) < 0) throw Error('Invalid tab.');
 if (message.type === 'state') { const plan = await readHackathon<NativePlan>(planKey(Number(message.tabId)), true); return plan ? answerCommand(message, plan) : { facts: await loadFacts(), session: null, plan: null, library: await readLibrary(libraryStore) }; }
 if (message.type === 'scan') return scanTab(Number(message.tabId));
 if (message.type === 'fill' && typeof message.planId === 'string') return fillTab(Number(message.tabId), message.planId);
 return answerCommand(message, await getPlan(Number(message.tabId)));
}
