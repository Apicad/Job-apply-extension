// Explicit, opt-in live account test. Not run by npm test/check.
// The browser port is a test bridge; the native framing, host, CLI, inference,
// validation, storage, preview and export code are real. This does not certify
// Chrome's OS-level native-host registration or a second physical device.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { chromium, expect } from '@playwright/test';
import { serve } from '../native-host/host.mjs';
import { encodeMessage, decoder } from '../native-host/protocol.mjs';

const executable = process.env.JAA_CODEX_BIN;
if (!executable || !path.isAbsolute(executable)) throw Error('Set JAA_CODEX_BIN to your signed-in Codex CLI absolute path.');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = git('rev-parse', 'HEAD');
if (git('status', '--porcelain')) throw Error('Use a clean committed candidate for live evidence.');
const out = path.resolve(process.argv[2] ?? `../release-artifacts/live-materials-${sha.slice(0, 12)}`);
await fs.mkdir(out, { recursive: false });
const extension = path.resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(path.join(out, 'test-browser-profile'), { channel: 'chromium', args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
const trace = []; const pending = new Set();
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const origin = `chrome-extension://${id}/`;
  const home = await context.newPage();
  await home.goto(`${origin}home.html`);
  await home.setViewportSize({ width: 1600, height: 1100 });
  await home.exposeFunction('__liveNativeRequest', message => new Promise(async (resolve, reject) => {
    const input = new PassThrough(); const output = new PassThrough();
    const started = Date.now(); const item = { type: message.type, request: message.request, startedAt: new Date().toISOString() }; trace.push(item);
    const cancel = () => { input.emit('end'); output.emit('close'); };
    pending.add(cancel);
    const timer = setTimeout(() => { cancel(); reject(Error('Live native bridge timed out')); }, 75_000);
    const decode = decoder(reply => {
      clearTimeout(timer); pending.delete(cancel); item.elapsedMs = Date.now() - started; item.reply = reply;
      cancel(); resolve(reply);
    });
    output.on('data', bytes => { try { decode(bytes); } catch (error) { clearTimeout(timer); cancel(); reject(error); } });
    await serve({ input, output, origin, config: { origin, executable, provider: 'codex' } });
    input.write(encodeMessage(message));
  }));
  await home.evaluate(() => {
    chrome.runtime.connectNative = () => {
      const listeners = []; let disconnected = false;
      return { onMessage: { addListener: listener => listeners.push(listener) }, onDisconnect: { addListener: () => {} }, disconnect: () => { disconnected = true; }, postMessage: message => {
        window.__liveNativeRequest(message).then(reply => { if (!disconnected) listeners.forEach(listener => listener(reply)); });
      } };
    };
  });
  const send = message => home.evaluate(value => chrome.runtime.sendMessage(value), message);
  const before = (await send({ type: 'sidebar-state' })).data;
  const profile = { ...before.profile, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', school: 'Example College', major: 'Computer Science coursework' };
  const facts = [
    { id: 'demo-role', revision: 1, location: 'Experience: Example Labs', text: 'Example Labs | Intern | Remote | May 2025–August 2025\nBuilt a Python CSV validation prototype.\nDocumented edge cases for the team.' },
    { id: 'demo-project', revision: 1, location: 'Projects: Trace viewer', text: 'Built a React trace viewer prototype for a personal project.' },
  ];
  expect((await send({ type: 'sidebar-save-profile', profile, facts, expectedProfile: before.profile, expectedFacts: before.facts })).ok).toBe(true);
  await expect(home.getByLabel('First name', { exact: true })).toHaveValue('Ada');
  await home.getByLabel('Target role', { exact: true }).fill('Junior software developer');
  await home.getByLabel('Target company', { exact: true }).fill('Example Tools');
  await home.getByLabel('My career direction', { exact: true }).fill('Build practical developer tools and explain edge cases clearly.');
  await home.locator('.materials-job > summary').click();
  await home.getByLabel('Job description', { exact: true }).fill('Fictional demonstration job: maintain Python CSV validation tools, build React interfaces, and document edge cases.');
  const start = Date.now();
  await home.getByRole('button', { name: 'Create résumé & cover letter', exact: true }).click();
  await expect(home.locator('.materials-status')).toContainText('Your drafts are ready', { timeout: 90_000 });
  const elapsedMs = Date.now() - start;
  const state = (await send({ type: 'sidebar-state' })).data;
  expect(state.materials.response.coverLetter.length).toBeGreaterThan(0);
  expect(state.materials.response.entries.length).toBeGreaterThan(0);
  expect(trace.filter(item => item.type === 'materials')).toHaveLength(1);
  const paper = home.getByRole('article', { name: 'Résumé document' });
  await expect(paper).toContainText('Ada Lovelace');
  await expect(paper).toContainText('Python');
  await expect(home.getByRole('button', { name: 'Download Word', exact: true })).toBeDisabled();
  await paper.screenshot({ path: path.join(out, 'resume-preview.png') });
  await home.getByRole('button', { name: 'Cover letter', exact: true }).click();
  await expect(paper).toContainText('Dear hiring team,');
  await expect(paper).toContainText('Example Tools');
  await paper.screenshot({ path: path.join(out, 'cover-letter-preview.png') });
  // Leave synthetic generated drafts unreviewed. The deterministic suite separately
  // checks human review, edits invalidating review, and actual DOCX/PDF export.
  await fs.writeFile(path.join(out, 'native-trace.json'), JSON.stringify(trace, null, 2));
  await fs.writeFile(path.join(out, 'saved-materials.json'), JSON.stringify(state.materials, null, 2));
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ sha, dirty: false, version: JSON.parse(await fs.readFile('package.json', 'utf8')).version, elapsedMs, provider: 'Codex', liveInference: true, transport: 'Test browser port bridged to actual framed native host and signed-in CLI; OS registration not tested here', resumePreview: true, coverLetterPreview: true, exportsBlockedUntilReview: true, submitted: false, syntheticOnly: true }, null, 2));
  console.log(`LIVE_MATERIALS_PREVIEWS_PASSED ${out}`);
} catch (error) {
  await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ sha, error: String(error), trace }, null, 2));
  throw error;
} finally {
  for (const cancel of pending) cancel();
  await context.close();
  // Discard the disposable synthetic profile; retain only explicit evidence files.
  await fs.rm(path.join(out, 'test-browser-profile'), { recursive: true, force: true });
}
