import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { FIXTURE_PORT } from '../fixtures/vite.config';

/**
 * Playwright fixtures that start Chromium with the built extension loaded.
 *
 *   import { test, expect } from './extension';
 *   test('…', async ({ context, extensionId, openExtensionPage }) => { … });
 *
 * Things worth knowing (all checked against Chromium 158):
 * - Extensions only load in a *persistent* context, and only in Playwright's
 *   bundled Chromium (`channel: 'chromium'`). Branded Google Chrome ignores
 *   the --load-extension flag.
 * - A toolbar click cannot be automated, so `activeTab` is never granted in
 *   these tests. The `e2e` build therefore adds host permissions for the
 *   fixture origins (see wxt.config.ts).
 */

const EXTENSION_DIR = path.resolve(import.meta.dirname, '../../.output/chrome-mv3-e2e');

/** Origins the fixture server is reachable under. */
export const ORIGIN = {
  /** Main origin; the e2e build has host permission for it. */
  main: `http://localhost:${FIXTURE_PORT}`,
  /** A different origin the e2e build also has host permission for. */
  other: `http://127.0.0.1:${FIXTURE_PORT}`,
  /** An origin the extension has no permission for. */
  blocked: `http://blocked.localhost:${FIXTURE_PORT}`,
} as const;

declare global {
  interface Window {
    /** The page-side code, once `openFixture` has put it into the page (see page-side.ts). */
    __pageSide: typeof import('./page-side');
  }
}

interface ExtensionFixtures {
  context: BrowserContext;
  /** The extension's background service worker. */
  serviceWorker: Worker;
  extensionId: string;
  /** Opens one of the extension's own pages, e.g. `openExtensionPage('options.html')`. */
  openExtensionPage: (file: string) => Promise<Page>;
  /**
   * Opens a page of tests/fixtures, e.g. `openFixture('lever.html')`, waits until its form is
   * there and adds the page-side code to it as `window.__pageSide`.
   */
  openFixture: (file: string) => Promise<Page>;
}

interface WorkerFixtures {
  /** tests/e2e/page-side.ts and everything it imports, as one script that defines `__pageSide`. */
  pageSideScript: string;
}

export const test = base.extend<ExtensionFixtures, WorkerFixtures>({
  pageSideScript: [
    async ({}, use) => {
      const built = await build({
        configFile: false,
        logLevel: 'silent',
        build: {
          write: false,
          minify: false,
          lib: { entry: path.resolve(import.meta.dirname, 'page-side.ts'), formats: ['iife'], name: '__pageSide' },
        },
      });
      // `write: false` gives the output back instead of a watcher; a single entry gives one chunk.
      const output = Array.isArray(built) ? built[0] : built;
      const chunk = output !== undefined && 'output' in output ? output.output[0] : undefined;
      if (chunk === undefined) throw new Error('Bundling tests/e2e/page-side.ts gave no output.');
      await use(chunk.code);
    },
    { scope: 'worker' },
  ],

  context: async ({}, use, testInfo) => {
    if (!fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
      throw new Error(`No extension build at ${EXTENSION_DIR}. Run "npm run build:e2e" first.`);
    }
    const context = await chromium.launchPersistentContext(testInfo.outputPath('chrome-profile'), {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  openExtensionPage: async ({ context, extensionId }, use) => {
    await use(async (file) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${file}`);
      return page;
    });
  },

  openFixture: async ({ context, pageSideScript }, use) => {
    await use(async (file) => {
      const page = await context.newPage();
      await page.goto(`${ORIGIN.main}/${file}`);
      // Fixture pages mark themselves ready once their form is in place (some build it with a script).
      await page.waitForSelector('html[data-ready]');
      await page.addScriptTag({ content: pageSideScript });
      return page;
    });
  },
});

export const expect = test.expect;
