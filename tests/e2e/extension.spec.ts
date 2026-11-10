import type { browser } from 'wxt/browser';
import { EMBED_HOST_PERMISSIONS } from '../../lib/ats';
import { expect, test } from './extension';

// Inside the background worker `chrome` is the extension API. Out here it only needs a type.
declare const chrome: typeof browser;

test('the built extension loads and starts its background worker', async ({ serviceWorker, extensionId }) => {
  // Chromium makes an extension id out of 32 letters from a to p.
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  expect(serviceWorker.url()).toBe(`chrome-extension://${extensionId}/background.js`);
});

test('the manifest asks for exactly what the design allows', async ({ serviceWorker }) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.name).toBe('Job Apply Assistant');
  expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting']);
  // The hosts that show application forms inside other sites' pages, and nothing wider. The two
  // local origins exist in this test build alone: they are where the fixture pages are served.
  expect(manifest.host_permissions).toEqual([...EMBED_HOST_PERMISSIONS, 'http://localhost/*', 'http://127.0.0.1/*']);
  expect(manifest.optional_permissions).toBeUndefined();
  expect(manifest.optional_host_permissions).toBeUndefined();
  // Nothing of the extension can be loaded or messaged by a web page.
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.externally_connectable).toBeUndefined();
});

test('nothing runs on a page until the user asks (product rule 7)', async ({ serviceWorker }) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  const registered = await serviceWorker.evaluate(() => chrome.scripting.getRegisteredContentScripts());

  // No content script is declared, and none has been registered behind the manifest's back.
  expect(manifest.content_scripts).toBeUndefined();
  expect(registered).toEqual([]);
});
