// Drives a real Chromium over the DevTools pipe. No npm dependencies.
//
// Uses the Chromium that Playwright keeps in its cache, or CHROME_PATH if set. Regular Google
// Chrome will not do: it refuses to load unpacked extensions on behalf of automation.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const PLAYWRIGHT_CACHES = [
  path.join(homedir(), 'Library/Caches/ms-playwright'),
  path.join(homedir(), '.cache/ms-playwright'),
];
const BINARIES = [
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  // Playwright 1.49 and later unpack Linux Chrome for Testing here. Older builds used chrome-linux.
  'chrome-linux64/chrome',
  'chrome-linux/chrome',
];

async function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const cache of PLAYWRIGHT_CACHES) {
    const builds = (await readdir(cache).catch(() => []))
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      for (const binary of BINARIES) {
        const candidate = path.join(cache, build, binary);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error(
    'No Chromium found. Run `npx playwright install chromium`, or set CHROME_PATH to a Chromium or Chrome for Testing binary.',
  );
}

export async function launchBrowser() {
  const profileDir = await mkdtemp(path.join(tmpdir(), 'page-blueprint-test-'));
  const chromium = spawn(
    await findChromium(),
    [
      '--headless=new',
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging', // lets the tests load the extension and click its toolbar button
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const [toChromium, fromChromium] = [chromium.stdio[3], chromium.stdio[4]];

  const pending = new Map(); // command id -> { resolve, reject, method }
  const listeners = new Set(); // (event) => void
  let lastId = 0;

  function dispatch(message) {
    if (message.id === undefined) {
      for (const listener of [...listeners]) listener(message);
      return;
    }
    const command = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) command.reject(new Error(`${command.method}: ${message.error.message}`));
    else command.resolve(message.result);
  }

  // Messages are JSON separated by NUL bytes, and can arrive split across chunks.
  let partial = '';
  fromChromium.setEncoding('utf8');
  fromChromium.on('data', (chunk) => {
    let start = 0;
    for (let end; (end = chunk.indexOf('\0', start)) !== -1; start = end + 1) {
      dispatch(JSON.parse(partial + chunk.slice(start, end)));
      partial = '';
    }
    partial += chunk.slice(start);
  });

  const exited = new Promise((resolve) => chromium.once('exit', resolve));
  exited.then(() => {
    for (const command of pending.values()) command.reject(new Error(`${command.method}: Chromium exited`));
    pending.clear();
  });

  function send(method, params = {}, sessionId) {
    const id = ++lastId;
    toChromium.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
  }

  /** Resolves with the first event that `matches`. Call `.cancel()` to stop waiting. */
  function nextEvent(matches, what, timeout = 10_000) {
    let cancel;
    const promise = new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        listeners.delete(listener);
      };
      const listener = (event) => {
        if (!matches(event)) return;
        stop();
        resolve(event);
      };
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`Timed out waiting for ${what}`));
      }, timeout);
      cancel = stop;
      listeners.add(listener);
    });
    return Object.assign(promise, { cancel });
  }

  async function attach(targetId) {
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    return pageOn(sessionId, { targetId });
  }

  /** A handle on the page behind a DevTools session. `ids` are kept on the handle for later commands. */
  async function pageOn(sessionId, ids) {
    const call = (method, params) => send(method, params, sessionId);
    await call('Page.enable');

    const page = {
      ...ids,
      send: call,

      async goto(url) {
        const loaded = nextEvent(
          (event) => event.sessionId === sessionId && event.method === 'Page.loadEventFired',
          `${url} to load`,
        );
        const { errorText } = await call('Page.navigate', { url });
        if (errorText) {
          loaded.cancel();
          throw new Error(`Could not open ${url}: ${errorText}`);
        }
        await loaded;
      },

      /** Runs `fn(...args)` inside the page and returns its (JSON-serialisable) result. */
      async evaluate(fn, ...args) {
        const expression = typeof fn === 'function' ? `(${fn})(...${JSON.stringify(args)})` : fn;
        const { result, exceptionDetails } = await call('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (exceptionDetails) {
          throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        }
        return result.value;
      },

      /** Polls `fn(...args)` inside the page until it returns something truthy, and returns that. */
      async waitFor(fn, ...args) {
        const deadline = Date.now() + 5_000;
        for (;;) {
          const value = await page.evaluate(fn, ...args);
          if (value) return value;
          if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${fn}`);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      },

      close: () => send('Target.closeTarget', { targetId: ids.targetId }),
    };
    return page;
  }

  return {
    send,
    nextEvent,
    attach,

    /**
     * Opens a new tab. The handle carries two ids: `targetId` for the page in the tab, and
     * `tabTargetId` for the tab itself, which is what toolbar-button clicks are aimed at.
     */
    async openPage(url) {
      const { targetId: tabTargetId } = await send('Target.createTarget', { url: 'about:blank', forTab: true });
      const { sessionId: tabSession } = await send('Target.attachToTarget', { targetId: tabTargetId, flatten: true });
      const pageAttached = nextEvent(
        (event) => event.method === 'Target.attachedToTarget' && event.sessionId === tabSession,
        'the page inside the new tab',
      );
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, tabSession);
      const { params } = await pageAttached;
      const page = await pageOn(params.sessionId, { targetId: params.targetInfo.targetId, tabTargetId });
      if (url) await page.goto(url);
      return page;
    },

    /** Waits for a page whose address starts with `urlPrefix` (an extension popup, say) and attaches to it. */
    async attachToPageAt(urlPrefix) {
      const deadline = Date.now() + 5_000;
      for (;;) {
        const { targetInfos } = await send('Target.getTargets');
        const target = targetInfos.find((info) => info.url.startsWith(urlPrefix));
        if (target) return attach(target.targetId);
        if (Date.now() > deadline) throw new Error(`No page opened at ${urlPrefix}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },

    /** Waits until no open page has an address starting with `urlPrefix`. */
    async waitUntilNoPageAt(urlPrefix) {
      const deadline = Date.now() + 5_000;
      for (;;) {
        const { targetInfos } = await send('Target.getTargets');
        if (!targetInfos.some((info) => info.url.startsWith(urlPrefix))) return;
        if (Date.now() > deadline) throw new Error(`A page is still open at ${urlPrefix}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },

    async close() {
      chromium.kill();
      await exited;
      await rm(profileDir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
