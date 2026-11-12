import { key } from './hackathon/contracts';
import { loadFacts } from './hackathon/answers';
import { loadProfile, readHackathon, writeHackathon } from './storage';
import { normalizeResumeLayout } from './resume-preview';
import { buildMaterialsRequest, isMaterialsRequest, isMaterialsReply } from './materials';
import type { MaterialsRequest, MaterialsReply } from './materials';

/** Separate draft storage never replaces the saved profile, facts or attachment. */
export interface SavedMaterials {
  schema: 1;
  revision: number;
  request: MaterialsRequest;
  response: MaterialsReply;
  /** Explicit review of this exact request and editable response, not a factual certification. */
  reviewedFingerprint: string | null;
}

const STORAGE_KEY = 'materials';
const HASH = /^[a-f0-9]{64}$/;
const RECORD_KEYS = ['request', 'response', 'reviewedFingerprint', 'revision', 'schema'];

/** Message/storage values must be bounded plain JSON, without invoking accessors. */
function plainData(value: unknown): boolean {
  let remaining = 20_000;
  const seen = new WeakSet<object>();
  const visit = (item: unknown, depth: number): boolean => {
    if (--remaining < 0 || depth > 20) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'string') return item.length <= 200_000;
    if (typeof item === 'number') return Number.isFinite(item);
    if (!item || typeof item !== 'object' || seen.has(item)) return false;
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== null && prototype !== (Array.isArray(item) ? Array.prototype : Object.prototype)) return false;
    seen.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length) return false;
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (['__proto__', 'constructor', 'prototype'].includes(name) || !Object.hasOwn(descriptor, 'value')) return false;
      if (Array.isArray(item) && name === 'length') continue;
      if (!visit(descriptor.value, depth + 1)) return false;
    }
    seen.delete(item);
    return true;
  };
  try { return visit(value, 0) && JSON.stringify(value).length <= 500_000; }
  catch { return false; }
}

/** Structural validation is deliberately independent of the AI request's expiry. */
export function isSavedMaterials(value: unknown): value is SavedMaterials {
  try {
    if (!plainData(value) || !value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as SavedMaterials;
    return key(Object.keys(item).sort()) === key(RECORD_KEYS) && item.schema === 1 && Number.isSafeInteger(item.revision) && item.revision > 0
      && (item.reviewedFingerprint === null || typeof item.reviewedFingerprint === 'string' && HASH.test(item.reviewedFingerprint))
      && isMaterialsRequest(item.request) && isMaterialsReply(item.response, item.request);
  } catch { return false; }
}

export async function materialsReviewFingerprint(value: Pick<SavedMaterials, 'request' | 'response'>): Promise<string> {
  if (!plainData(value) || !isMaterialsRequest(value.request) || !isMaterialsReply(value.response, value.request)) throw Error('Review the current valid résumé and cover-letter draft.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key({ request: value.request, response: value.response })));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function checkedReview(value: SavedMaterials): Promise<SavedMaterials> {
  if (value.reviewedFingerprint !== null && value.reviewedFingerprint !== await materialsReviewFingerprint(value)) return { ...value, reviewedFingerprint: null };
  return value;
}

export async function loadSavedMaterials(): Promise<SavedMaterials | null> {
  const value = await readHackathon<unknown>(STORAGE_KEY);
  return isSavedMaterials(value) ? checkedReview(value) : null;
}

// The background listener serializes this with profile/fact/layout mutations.
// Also serialize draft saves here so no caller can race two optimistic writes.
let saves: Promise<unknown> = Promise.resolve();
export async function saveMaterials(input: unknown, expected: unknown): Promise<SavedMaterials> {
  if (!isSavedMaterials(input) || expected !== null && !isSavedMaterials(expected)) throw Error('The résumé or cover-letter draft is invalid. Review it before saving.');
  // Snapshot immediately: queued work must not observe a caller's later edits.
  const materials = structuredClone(input);
  const expectedMaterials = structuredClone(expected);
  const operation = saves.then(async () => {
    const raw = await readHackathon<unknown>(STORAGE_KEY);
    if (raw !== null && !isSavedMaterials(raw)) throw Error('The saved drafts are unreadable. Existing data was preserved.');
    const before = raw === null ? null : await checkedReview(raw as SavedMaterials);
    if (key(before) !== key(expectedMaterials)) throw Error('Your saved drafts changed in another window. Reload them before saving.');
    const current = await buildMaterialsRequest(await loadProfile(), await loadFacts(), normalizeResumeLayout(await readHackathon('resume-layout')), materials.request.brief);
    if (materials.request.sourceKey !== current.sourceKey) throw Error('Your profile, experience or résumé choices changed. Generate a new draft from the saved details.');
    // A matching opaque hash alone does not establish that caller-supplied
    // evidence or fixed headers actually came from the saved source.
    for (const field of ['brief', 'entries', 'evidence'] as const) {
      if (key(materials.request[field]) !== key(current[field])) throw Error('The draft evidence no longer matches your saved details. Generate a new draft.');
    }
    if (materials.reviewedFingerprint !== null && materials.reviewedFingerprint !== await materialsReviewFingerprint(materials)) throw Error('This draft changed after review. Review the current text before saving.');
    const revision = (before?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw Error('The saved draft revision is invalid. Existing data was preserved.');
    const saved: SavedMaterials = { ...materials, revision };
    await writeHackathon(STORAGE_KEY, saved);
    return saved;
  });
  saves = operation.catch(() => undefined);
  return operation;
}
