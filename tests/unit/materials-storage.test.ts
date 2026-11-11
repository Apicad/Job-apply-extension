import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { normalizeProfile } from '../../lib/profile';
import { defaultResumeLayout } from '../../lib/resume-preview';
import { buildMaterialsRequest, emptyMaterialsBrief, MATERIALS_LIFETIME_MS, reviewMaterialsReply } from '../../lib/materials';
import type { MaterialsBrief } from '../../lib/materials';
import { isSavedMaterials, loadSavedMaterials, materialsReviewFingerprint, saveMaterials, type SavedMaterials } from '../../lib/materials-storage';
import { loadProfile, loadResumeToAttach, readHackathon, saveProfile, saveResume, writeHackathon } from '../../lib/storage';
import { handleSidebar, sidebarState } from '../../lib/sidebar/workflow';
import type { Fact } from '../../lib/hackathon/contracts';

const profile = normalizeProfile({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', school: 'Example College', major: 'Computer Science coursework', citizenshipCountry: 'Canada' });
const facts: Fact[] = [{ id: 'role-1', revision: 1, location: 'Example Labs', text: 'Example Labs | Software intern | Remote | Jun 2025 – Aug 2025\nBuilt a TypeScript prototype.' }];
const layout = defaultResumeLayout();
const brief: MaterialsBrief = { ...emptyMaterialsBrief(), role: 'Software engineer', company: 'Example Company', jobDescription: 'Build helpful TypeScript applications.' };
const resume = { name: 'Ada.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 };

async function draft(now = Date.now()): Promise<SavedMaterials> {
  const request = await buildMaterialsRequest(profile, facts, layout, brief, now);
  const sources = [{ id: facts[0]!.id, revision: facts[0]!.revision }];
  const response = reviewMaterialsReply(request, {
    schema: 1, kind: 'materials', requestId: request.id, sourceKey: request.sourceKey, expiresAt: request.expiresAt,
    summary: [{ text: 'Built a TypeScript prototype.', sources }], entries: [],
    coverLetter: [{ text: 'I built a TypeScript prototype.', sources }], missing: [],
  });
  return { schema: 1, revision: 1, request, response, reviewedFingerprint: null };
}
function edit(value: SavedMaterials, text: string): SavedMaterials {
  const result = structuredClone(value);
  result.response.coverLetter[0]!.text = text;
  result.response = reviewMaterialsReply(result.request, result.response);
  result.reviewedFingerprint = null;
  return result;
}

beforeEach(async () => {
  fakeBrowser.reset();
  await saveProfile(profile); await writeHackathon('facts', facts); await writeHackathon('resume-layout', layout); await saveResume(resume);
});
afterEach(() => vi.restoreAllMocks());

it('saves a separate draft through the trusted sidebar without changing profile, facts, layout or uploaded résumé', async () => {
  expect((await sidebarState()).materials).toBeNull();
  const materials = await draft();
  const result = await handleSidebar({ type: 'sidebar-save-materials', materials, expectedMaterials: null }) as { saved: boolean; materials: SavedMaterials };
  expect(result).toEqual({ saved: true, materials: { ...materials, revision: 1 } });
  expect((await sidebarState()).materials).toEqual(result.materials);
  expect(await loadProfile()).toEqual(profile); expect(await readHackathon('facts')).toEqual(facts);
  expect(await readHackathon('resume-layout')).toEqual(layout); expect(await loadResumeToAttach()).toEqual(resume);
});

it('keeps a reviewed persisted draft readable and editable after its AI request expires', async () => {
  const materials = await draft(Date.now() - 2 * MATERIALS_LIFETIME_MS);
  materials.reviewedFingerprint = await materialsReviewFingerprint(materials);
  expect(isSavedMaterials(materials)).toBe(true);
  const saved = await saveMaterials(materials, null);
  expect(await loadSavedMaterials()).toEqual(saved);
  const edited = edit(saved, 'My experience includes a TypeScript prototype.');
  const updated = await saveMaterials(edited, saved);
  expect(updated.revision).toBe(2); expect(updated.reviewedFingerprint).toBeNull();
});

it('rejects two editors racing the same saved revision instead of letting the last write win', async () => {
  const saved = await saveMaterials(await draft(), null);
  const first = edit(saved, 'I built a TypeScript prototype at Example Labs.');
  const second = edit(saved, 'My work includes a TypeScript prototype.');
  const results = await Promise.allSettled([saveMaterials(first, saved), saveMaterials(second, saved)]);
  expect(results[0].status).toBe('fulfilled'); expect(results[1].status).toBe('rejected');
  expect(String((results[1] as PromiseRejectedResult).reason)).toContain('changed in another window');
  expect((await loadSavedMaterials())?.response.coverLetter[0]?.text).toBe(first.response.coverLetter[0]!.text);
  expect((await loadSavedMaterials())?.revision).toBe(2);
});

it('rejects a late AI result after another generated result was saved', async () => {
  const earlier = await draft(); const later = await draft();
  const current = await saveMaterials(later, null);
  await expect(saveMaterials(earlier, null)).rejects.toThrow('changed in another window');
  expect(await loadSavedMaterials()).toEqual(current);
});

it.each(['profile', 'facts', 'layout'] as const)('rejects a late AI result after saved %s changes', async kind => {
  const materials = await draft();
  if (kind === 'profile') await saveProfile({ ...profile, firstName: 'Grace' });
  if (kind === 'facts') await writeHackathon('facts', [{ ...facts[0]!, revision: 2, text: `${facts[0]!.text}\nReviewed the prototype.` }]);
  if (kind === 'layout') await writeHackathon('resume-layout', { ...layout, skills: 'SQL' });
  await expect(saveMaterials(materials, null)).rejects.toThrow('changed');
  expect(await loadSavedMaterials()).toBeNull();
});

it.each(['evidence', 'headers'] as const)('rejects fabricated request %s even with a genuine current source hash and valid citations', async kind => {
  const materials = await draft();
  if (kind === 'evidence') materials.request.evidence[0]!.text = 'Built a TypeScript prototype for a different employer.';
  else materials.request.entries[0]!.heading = 'An employer absent from the saved notes';
  materials.response = reviewMaterialsReply(materials.request, materials.response);
  expect(isSavedMaterials(materials)).toBe(true);
  await expect(saveMaterials(materials, null)).rejects.toThrow('evidence no longer matches');
  expect(await readHackathon('materials')).toBeNull();
});

it('rejects changed target context retaining an earlier request hash', async () => {
  const materials = await draft(); materials.request.brief.jobDescription = 'A completely different role.';
  await expect(saveMaterials(materials, null)).rejects.toThrow('changed');
});

it('binds review to exact edited text and recomputed warnings, then requires explicit renewed review', async () => {
  const materials = await draft(); materials.reviewedFingerprint = await materialsReviewFingerprint(materials);
  const saved = await saveMaterials(materials, null);
  const changed = edit(saved, 'I built 100 TypeScript prototypes.');
  expect(changed.response.warnings.some(warning => warning.includes('100'))).toBe(true);
  changed.reviewedFingerprint = saved.reviewedFingerprint;
  await expect(saveMaterials(changed, saved)).rejects.toThrow('changed after review');
  changed.reviewedFingerprint = null;
  const unreviewed = await saveMaterials(changed, saved);
  expect(unreviewed.reviewedFingerprint).toBeNull();
  unreviewed.reviewedFingerprint = await materialsReviewFingerprint(unreviewed);
  const reviewed = await saveMaterials(unreviewed, { ...unreviewed, reviewedFingerprint: null });
  expect(reviewed.reviewedFingerprint).not.toBe(saved.reviewedFingerprint);
});

it('leaves saved materials intact when the base profile is saved and exposes the old source key for stale UI detection', async () => {
  const saved = await saveMaterials(await draft(), null);
  await handleSidebar({ type: 'sidebar-save-profile', profile: { ...profile, firstName: 'Grace' }, facts, resumeLayout: layout, expectedProfile: profile, expectedFacts: facts, expectedResumeLayout: layout });
  expect((await sidebarState()).materials).toEqual(saved);
  await expect(saveMaterials(edit(saved, 'I built a TypeScript prototype.'), saved)).rejects.toThrow('changed');
  expect(await loadResumeToAttach()).toEqual(resume);
});

it('rejects accessors and prototype payloads without running their code', async () => {
  const materials = await draft(); const getter = vi.fn(() => materials.request);
  const accessor = { ...materials }; Object.defineProperty(accessor, 'request', { get: getter, enumerable: true });
  expect(isSavedMaterials(accessor)).toBe(false); expect(getter).not.toHaveBeenCalled();
  expect(isSavedMaterials(Object.assign(Object.create({ injected: true }), materials))).toBe(false);
  const pollution = JSON.parse(JSON.stringify(materials)); Object.defineProperty(pollution.response, '__proto__', { value: { polluted: true }, enumerable: true });
  expect(isSavedMaterials(pollution)).toBe(false);
  await expect(saveMaterials(accessor, null)).rejects.toThrow('invalid'); expect(getter).not.toHaveBeenCalled();
});

it('preserves malformed stored data and never presents it as a valid saved draft', async () => {
  const broken = { schema: 1, revision: 1, response: 'unreadable' };
  await writeHackathon('materials', broken);
  expect((await sidebarState()).materials).toBeNull();
  await expect(saveMaterials(await draft(), null)).rejects.toThrow('unreadable');
  expect(await readHackathon('materials')).toEqual(broken);
});

it('clears a mismatched stored review stamp while retaining the editable draft', async () => {
  const materials = await draft(); materials.reviewedFingerprint = 'a'.repeat(64);
  await writeHackathon('materials', materials);
  const loaded = await loadSavedMaterials();
  expect(loaded).toEqual({ ...materials, reviewedFingerprint: null });
  expect((await saveMaterials(loaded, loaded)).reviewedFingerprint).toBeNull();
});

it('propagates storage failure without success and permits a later retry', async () => {
  const materials = await draft();
  const write = vi.spyOn(browser.storage.local, 'set').mockRejectedValueOnce(Error('storage quota exceeded'));
  await expect(saveMaterials(materials, null)).rejects.toThrow('quota');
  expect(await loadSavedMaterials()).toBeNull(); write.mockRestore();
  expect((await saveMaterials(materials, null)).revision).toBe(1);
});
