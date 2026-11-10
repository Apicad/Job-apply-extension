import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { normalizeProfile } from './profile';
import { isStoredResume } from './resume';
import type { PagePlan, Profile, StoredResume } from './types';

/**
 * The only module that touches extension storage. Import it from the
 * background worker and the extension's own pages, never from page-side code.
 *
 * Two builds share this file:
 * - The fill engine reads through `loadProfile` and `loadResumeToAttach` and
 *   keeps its per-tab plans here. It calls nothing else.
 * - The landing / résumé build owns the saved profile and files: it adds its
 *   stored items and writers below and may change the two keys or the body of
 *   `loadResumeToAttach`, as long as those two functions keep their meaning.
 */

/** Where the saved `Profile` lives (chrome.storage.local, key "profile"). */
const PROFILE_KEY = 'local:profile';
/** Where the uploaded résumé lives (chrome.storage.local, key "resume"). */
const RESUME_KEY = 'local:resume';

/** The saved profile. Whatever is in storage is checked field by field, so a damaged value can never become a wrong answer. */
export async function loadProfile(): Promise<Profile> {
  return normalizeProfile(await storage.getItem<unknown>(PROFILE_KEY));
}

/** The file to attach when an application asks for a résumé, or null when there is none. */
export async function loadResumeToAttach(): Promise<StoredResume | null> {
  const stored = await storage.getItem<unknown>(RESUME_KEY);
  return isStoredResume(stored) ? stored : null;
}

// ---------------------------------------------------------------------------
// Plans: what the last scan of a tab decided to write. The popup shows it, and
// "Fill" carries out exactly that. Kept in session storage: in memory only,
// gone when the browser closes, and out of reach of page-side scripts.
// ---------------------------------------------------------------------------

const planKey = (tabId: number) => `session:plan:${tabId}` as const;

export async function savePlan(tabId: number, plan: PagePlan): Promise<void> {
  await storage.setItem(planKey(tabId), plan);
}

export async function loadPlan(tabId: number): Promise<PagePlan | null> {
  return (await storage.getItem<PagePlan>(planKey(tabId))) ?? null;
}

export async function forgetPlan(tabId: number): Promise<void> {
  await storage.removeItem(planKey(tabId));
}

/**
 * Stops scripts injected into web pages from reading saved data, so a
 * compromised page process cannot fetch the profile. The extension's own
 * pages and the background worker are unaffected.
 */
export async function keepStorageAwayFromPages(): Promise<void> {
  await browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
