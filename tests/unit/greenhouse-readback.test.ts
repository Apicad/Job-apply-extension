import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyNative, scanNative, signature, settleNativeVerification, verifyNative, type NativeCommand } from '../../lib/hackathon/page';
import type { PageEnv, StoredResume } from '../../lib/types';

const env: PageEnv = { isRendered: el => !el.hasAttribute('hidden'), assignFiles: (input, files) => Object.defineProperty(input, 'files', { configurable: true, value: files }) };
const resume: StoredResume = { name: 'Ada.txt', type: 'text/plain', size: 3, dataUrl: 'data:text/plain;base64,QWRh', updatedAt: 1 };
beforeEach(() => { document.body.innerHTML = '<form><label>Phone<input id="phone" type="tel"></label><label>Email<input id="email"></label></form>'; });
afterEach(() => vi.useRealTimers());
function textCommand(id: string, value: string): NativeCommand {
 const scan = scanNative(document, env); const field = scan.fields.find(f => f.descriptor.id === id)!;
 return { scanId: scan.scanId, url: scan.url, actions: [{ type: 'text', ref: field.ref, signature: signature(field)!, value }] };
}

it.each([
 ['(415) 555-0100', '4155550100', true],
 ['+1 (415) 555-0100', '+1 415 555 0100', true],
 ['+1 (415) 555-0100', '4155550100', false],
 ['4155550100', '4155550101', false],
 ['4155550100 ext. 12', '(415) 555-0100 x12', true],
 ['4155550100 ext. 12', '415555010012', false],
 ['4155550100 ext. 12', '4155550100', false],
 ['4155550100 ext. 12', '4155550100 ext. 21', false],
 ['4155550100', '4155550100abc', false],
])('phone readback preserves all digits and extension: %s -> %s', (expected, actual, verified) => {
 const input = document.querySelector<HTMLInputElement>('#phone')!;
 input.addEventListener('input', () => { input.value = actual; });
 const command = textCommand('phone', expected);
 expect(applyNative(document, env, command)[0]?.ok).toBe(verified);
 expect(verifyNative(document, env, command)[0]?.ok).toBe(verified);
});
it('does not normalize other field values or bypass input validity', () => {
 const email = document.querySelector<HTMLInputElement>('#email')!;
 email.addEventListener('input', () => { email.value = '4155550100'; });
 expect(applyNative(document, env, textCommand('email', '(415) 555-0100'))[0]?.ok).toBe(false);
 const phone = document.querySelector<HTMLInputElement>('#phone')!;
 phone.addEventListener('input', () => { phone.value = '4155550100'; phone.setCustomValidity('Unsupported number'); });
 expect(applyNative(document, env, textCommand('phone', '(415) 555-0100'))[0]?.ok).toBe(false);
});

function upload() {
 document.querySelector('form')!.insertAdjacentHTML('beforeend', '<div role="group" aria-labelledby="resume-label" class="file-upload"><div id="resume-label">Resume/CV*</div><div id="upload"><label for="resume">Attach</label><input id="resume" type="file" accept=".txt"></div></div><div id="unrelated"></div>');
 const scan = scanNative(document, env); const field = scan.fields.find(f => f.descriptor.id === 'resume')!;
 const command: NativeCommand = { scanId: scan.scanId, url: scan.url, actions: [{ type: 'file', ref: field.ref, signature: signature(field)!, resume }] };
 const input = document.querySelector<HTMLInputElement>('#resume')!;
 const widget = document.querySelector('#upload')!;
 return { command, input, widget };
}
function completed(filename = resume.name) { return `<span>${filename}</span><button type="button" aria-label="Remove file">×</button>`; }

it('waits read-only for completed upload after React removes the input, with exactly one write', async () => {
 vi.useFakeTimers(); const { command, input, widget } = upload(); let changes = 0;
 input.addEventListener('change', () => { changes++; widget.innerHTML = '<progress></progress>'; setTimeout(() => { widget.innerHTML = completed(); }, 600); });
 const written = applyNative(document, env, command);
 expect(input.isConnected).toBe(false);
 expect(verifyNative(document, env, command)[0]?.ok).toBe(false);
 const result = settleNativeVerification(document, env, command, written);
 await vi.advanceTimersByTimeAsync(700);
 expect((await result)[0]?.status).toBe('verified'); expect(changes).toBe(1);
});
it.each(['wrong filename', 'missing remove', 'busy', 'error', 'error class', 'hidden filename', 'label changed', 'detached group', 'other widget', 'new scan'])('refuses incomplete or changed upload state: %s', change => {
 const { command, input, widget } = upload(); input.addEventListener('change', () => { widget.innerHTML = completed(); });
 applyNative(document, env, command);
 if (change === 'wrong filename') widget.innerHTML = completed('Other.txt');
 if (change === 'missing remove') widget.querySelector('button')!.remove();
 if (change === 'busy') widget.setAttribute('aria-busy', 'true');
 if (change === 'error') widget.insertAdjacentHTML('beforeend', '<p role="alert">Upload failed</p>');
 if (change === 'error class') widget.insertAdjacentHTML('beforeend', '<p class="file-upload__error">Upload failed</p>');
 if (change === 'hidden filename') widget.querySelector('span')!.setAttribute('hidden', '');
 if (change === 'label changed') document.querySelector('#resume-label')!.textContent = 'Transcript';
 if (change === 'detached group') widget.parentElement!.remove();
 if (change === 'other widget') { widget.innerHTML = ''; document.querySelector('#unrelated')!.innerHTML = completed(); }
 if (change === 'new scan') scanNative(document, env);
 expect(verifyNative(document, env, command)[0]?.ok).toBe(false);
});
it('does not accept a populated FileList while the visible upload is failing', () => {
 const { command, input, widget } = upload();
 input.addEventListener('change', () => { widget.insertAdjacentHTML('beforeend', '<p role="alert">Upload failed</p>'); });
 applyNative(document, env, command);
 expect(input.files?.[0]?.name).toBe(resume.name);
 expect(verifyNative(document, env, command)[0]?.ok).toBe(false);
});
it('verifies an ordinary accessible native upload group without a custom Remove control or upload wait', async () => {
 vi.useFakeTimers(); const { command, input, widget } = upload(); widget.parentElement!.classList.remove('file-upload');
 const result = settleNativeVerification(document, env, command, applyNative(document, env, command));
 await vi.advanceTimersByTimeAsync(100);
 expect((await result)[0]?.status).toBe('verified');
 expect(input.isConnected).toBe(true); expect(input.files?.[0]?.name).toBe(resume.name);
 expect(vi.getTimerCount()).toBe(0);
});
it.each(['busy', 'error'])('does not use native FileList fallback for an ordinary upload group with %s state', state => {
 const { command, widget } = upload(); widget.parentElement!.classList.remove('file-upload');
 applyNative(document, env, command);
 if (state === 'busy') widget.setAttribute('aria-busy', 'true');
 else widget.insertAdjacentHTML('beforeend', '<p role="alert">Upload failed</p>');
 expect(verifyNative(document, env, command)[0]?.ok).toBe(false);
});
it('bounds failed upload observation and does not retry the write', async () => {
 vi.useFakeTimers(); const { command, input, widget } = upload(); let changes = 0;
 input.addEventListener('change', () => { changes++; widget.innerHTML = '<p>Upload failed</p>'; });
 const result = settleNativeVerification(document, env, command, applyNative(document, env, command));
 await vi.advanceTimersByTimeAsync(5100);
 expect((await result)[0]?.status).toBe('written-unverified'); expect(changes).toBe(1);
});
it('stops waiting after scan invalidation even if an upload later completes', async () => {
 vi.useFakeTimers(); const { command, input, widget } = upload();
 input.addEventListener('change', () => { widget.innerHTML = '<progress></progress>'; });
 const result = settleNativeVerification(document, env, command, applyNative(document, env, command));
 scanNative(document, env);
 await vi.advanceTimersByTimeAsync(100);
 expect((await result)[0]?.status).toBe('written-unverified');
 widget.innerHTML = completed();
 expect(verifyNative(document, env, command)[0]?.ok).toBe(false);
});
