import { beforeEach, expect, it } from 'vitest';
import { eligibleApplicationRows, planNative } from '../../lib/hackathon/engine';
import { applyNative, scanNative, signature, verifyNative } from '../../lib/hackathon/page';
import { normalizeProfile } from '../../lib/profile';
import type { PageEnv, StoredResume } from '../../lib/types';

const resume: StoredResume = { name: 'Ada.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 };
const profile = normalizeProfile({ firstName: 'Ada', email: 'ada@example.com', phone: '555-0100' });
const env: PageEnv = {
  isRendered: el => !el.hasAttribute('hidden'),
  assignFiles: (el, files) => Object.defineProperty(el, 'files', { configurable: true, value: files }),
};
beforeEach(() => { document.body.innerHTML = '<form><label>First name<input id="first"></label><label>Email<input id="email" type="email"></label><label>Phone<input id="phone"></label></form>'; });
function add(markup: string) { document.querySelector('form')!.insertAdjacentHTML('beforeend', markup); }
function planned() { const scan = scanNative(document, env); return { scan, rows: planNative([{ frameId: 0, documentId: 'd', scan }], profile, resume) }; }

it('plans a saved resume only for a compatible named resume upload', () => {
  add('<label>Resume<input type="file" id="resume" accept=".txt"></label><label>Cover letter<input type="file"></label><label>Profile photo<input type="file"></label>');
  const { rows, scan } = planned();
  expect(rows.filter(r => r.action?.type === 'file').map(r => r.field.descriptor.label)).toEqual(['Resume']);
  const action = rows.find(r => r.action?.type === 'file')!.action!;
  const command = { scanId: scan.scanId, url: scan.url, actions: [action] };
  expect(applyNative(document, env, command)).toEqual([{ ref: action.ref, ok: true, status: 'verified' }]);
  expect(verifyNative(document, env, command)).toEqual([{ ref: action.ref, ok: true }]);
  expect((document.querySelector('#resume') as HTMLInputElement).files?.[0]?.name).toBe('Ada.txt');
});

it('leaves mismatched or already attached files alone', () => {
  add('<label>Resume<input type="file" id="resume" accept=".pdf"></label>');
  expect(planned().rows.find(r => r.field.descriptor.control === 'file')?.action).toBeNull();
  const input = document.querySelector('#resume') as HTMLInputElement;
  input.accept = '.txt';
  const { rows, scan } = planned();
  const action = rows.find(r => r.action?.type === 'file')!.action!;
  env.assignFiles(input, [new File(['mine'], 'Existing.txt', { type: 'text/plain' })]);
  expect(applyNative(document, env, { scanId: scan.scanId, url: scan.url, actions: [action] })[0]?.status).toBe('refused');
  expect(input.files?.[0]?.name).toBe('Existing.txt');
});

it('rejects corrupted resume bytes and does not prevent later basic fields from filling', () => {
  add('<label>Resume<input type="file" id="resume"></label>');
  const { rows, scan } = planned();
  const file = rows.find(r => r.action?.type === 'file')!.action!;
  const first = rows.find(r => r.field.descriptor.label === 'First name')!.action!;
  const broken = { ...file, type: 'file' as const, resume: { ...resume, size: 4 } };
  const results = applyNative(document, env, { scanId: scan.scanId, url: scan.url, actions: [broken, first] });
  expect(results.map(r => r.status)).toEqual(['refused', 'verified']);
  expect((document.querySelector('#first') as HTMLInputElement).value).toBe('Ada');
});

it('fills email and one explicitly labeled confirmation, never duplicate email controls', () => {
  add('<label>Confirm email<input id="confirm" type="email"></label><label>Confirm email<input id="repeat" type="email"></label><label>Email<input id="duplicate" type="email"></label>');
  expect(planned().rows.filter(r => r.action && r.field.descriptor.inputType === 'email').map(r => r.field.descriptor.id)).toEqual(['email', 'confirm']);
});

it('counts invalid values as unverified without firing invalid events', () => {
  const input = document.querySelector('#email') as HTMLInputElement;
  input.pattern = '.+@company\\.example';
  const { rows, scan } = planned();
  const email = rows.find(r => r.field.descriptor.id === 'email')!.action!;
  let invalidEvents = 0; input.addEventListener('invalid', () => invalidEvents++);
  const command = { scanId: scan.scanId, url: scan.url, actions: [email] };
  expect(applyNative(document, env, command)[0]?.status).toBe('written-unverified');
  expect(verifyNative(document, env, command)[0]?.ok).toBe(false);
  expect(invalidEvents).toBe(0);
});

it('does not fill hidden resumes or an unrelated photo even with a forged file action', () => {
  add('<label hidden>Resume<input type="file" hidden></label><label>Profile photo<input id="photo" type="file"></label>');
  const { rows, scan } = planned();
  expect(rows.some(r => r.field.descriptor.label === 'Resume')).toBe(false);
  const photo = rows.find(r => r.field.descriptor.id === 'photo')!;
  const action = { ref: photo.field.ref, type: 'file' as const, resume, signature: signature(photo.field)! };
  expect(applyNative(document, env, { scanId: scan.scanId, url: scan.url, actions: [action] })[0]?.status).toBe('refused');
});

it('keeps drafting inside the application group even after basic fields are already filled', () => {
  add('<label>Describe a relevant project.<textarea id="project"></textarea></label>');
  document.body.insertAdjacentHTML('beforeend', '<form><label>Describe a relevant project.<textarea id="unrelated"></textarea></label></form>');
  (document.querySelector('#first') as HTMLInputElement).value = 'Ada';
  (document.querySelector('#email') as HTMLInputElement).value = 'ada@example.com';
  (document.querySelector('#phone') as HTMLInputElement).value = '555-0100';
  const { rows } = planned();
  expect(rows.filter(row => row.action)).toHaveLength(0);
  expect(eligibleApplicationRows(rows).filter(row => row.field.descriptor.control === 'textarea').map(row => row.field.descriptor.id)).toEqual(['project']);
});
