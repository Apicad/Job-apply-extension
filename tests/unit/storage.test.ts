import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyProfile } from '../../lib/profile';
import { forgetPlan, loadPlan, loadProfile, loadResumeToAttach, savePlan } from '../../lib/storage';
import type { PagePlan, StoredResume } from '../../lib/types';

// A tiny but real PDF header, so the stored value passes the résumé checks.
const PDF_BYTES = '%PDF-1.4 made-up';
const resume: StoredResume = {
  name: 'Ada-Lovelace-Resume.pdf',
  type: 'application/pdf',
  size: PDF_BYTES.length,
  dataUrl: `data:application/pdf;base64,${btoa(PDF_BYTES)}`,
  updatedAt: 1_800_000_000_000,
};

const plan: PagePlan = {
  report: {
    tabId: 7,
    url: 'https://jobs.example/apply',
    ats: null,
    job: { title: 'Engineer', company: 'Analytical Engines Ltd' },
    origins: ['https://jobs.example'],
    results: [],
    unreachable: [],
    hiddenFrames: 0,
  },
  documents: [{ documentId: 'DOC1', frameId: 0, actions: [{ ref: 1, type: 'text', value: 'Ada' }] }],
};

beforeEach(() => {
  fakeBrowser.reset();
});

describe('loadProfile', () => {
  test('gives an empty profile when nothing has been saved', async () => {
    expect(await loadProfile()).toEqual(emptyProfile());
  });

  test('returns what was saved', async () => {
    await fakeBrowser.storage.local.set({ profile: { ...emptyProfile(), firstName: 'Ada', workAuthorization: 'yes' } });
    const profile = await loadProfile();
    expect(profile.firstName).toBe('Ada');
    expect(profile.workAuthorization).toBe('yes');
  });

  test('never passes on an answer that is not one of the allowed values', async () => {
    // A hand-edited or damaged value must not turn into a wrong answer on a legal question.
    await fakeBrowser.storage.local.set({ profile: { firstName: 'Ada', workAuthorization: 'Yes!', gender: 42 } });
    const profile = await loadProfile();
    expect(profile.firstName).toBe('Ada');
    expect(profile.workAuthorization).toBe('');
    expect(profile.gender).toBe('');
    expect(profile.lastName).toBe('');
  });
});

describe('loadResumeToAttach', () => {
  test('gives null when no file has been saved', async () => {
    expect(await loadResumeToAttach()).toBeNull();
  });

  test('returns the saved file', async () => {
    await fakeBrowser.storage.local.set({ resume });
    expect(await loadResumeToAttach()).toEqual(resume);
  });

  test('gives null for a stored value that is not a résumé file', async () => {
    // A web address in place of the file data must never be handed to the page.
    await fakeBrowser.storage.local.set({ resume: { ...resume, dataUrl: 'https://collector.example/r.pdf' } });
    expect(await loadResumeToAttach()).toBeNull();
  });
});

describe('plans', () => {
  test('a saved plan comes back for its own tab only', async () => {
    await savePlan(7, plan);
    expect(await loadPlan(7)).toEqual(plan);
    expect(await loadPlan(8)).toBeNull();
  });

  test('a forgotten plan is gone', async () => {
    await savePlan(7, plan);
    await forgetPlan(7);
    expect(await loadPlan(7)).toBeNull();
  });

  test('plans are kept in session storage, never on disk', async () => {
    await savePlan(7, plan);
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });
});
