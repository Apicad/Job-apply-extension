// The whole extension, used the way a person uses it: open a page, click the toolbar button,
// read the popup. Runs in a real Chromium with the real extension loaded, and the toolbar
// click is a real one, so Chrome grants the same access it would grant a person.

import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './helpers/browser.js';
import { startServer } from './helpers/server.js';

const EXTENSION_DIR = fileURLToPath(new URL('../extension', import.meta.url));

let browser;
let site;
let otherSite; // same machine, different port: a different site as far as the browser is concerned
let extensionId;
let scratchDir;

before(async () => {
  let ready = false;
  try {
    site = await startServer();
    otherSite = await startServer();
    scratchDir = await mkdtemp(path.join(tmpdir(), 'page-blueprint-e2e-'));
    browser = await launchBrowser();
    ({ id: extensionId } = await browser.send('Extensions.loadUnpacked', { path: EXTENSION_DIR }));
    ready = true;
  } finally {
    // Same as the extractor tests: a browser that fails to launch must not leave the servers up.
    if (!ready) {
      await browser?.close();
      await site?.close();
      await otherSite?.close();
      if (scratchDir) await rm(scratchDir, { recursive: true, force: true });
      browser = undefined;
      site = undefined;
      otherSite = undefined;
      scratchDir = undefined;
    }
  }
});

after(async () => {
  await browser?.close();
  await site?.close();
  await otherSite?.close();
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true });
});

const htmlPage = (title, body) => `<!DOCTYPE html><html lang="en"><head><title>${title}</title></head><body>${body}</body></html>`;

/** An address the way the popup shows it: without the "http://". */
const shown = (address) => address.replace('http://', '');

/**
 * Opens `url` in a new tab, clicks the extension's toolbar button there, and returns the
 * popup once it has finished reading the page. Both are closed when the test `t` ends.
 */
async function openPopupOn(url, t, id = extensionId) {
  const popupAddress = `chrome-extension://${id}/popup.html`;
  await browser.waitUntilNoPageAt(popupAddress); // the previous test's popup may still be closing
  const tab = await browser.openPage(url);
  await browser.send('Extensions.triggerAction', { id, targetId: tab.tabTargetId });
  const popup = await browser.attachToPageAt(popupAddress);
  t.after(async () => {
    await popup.close().catch(() => {}); // Chrome may already have closed it
    await tab.close();
  });
  await popup.waitFor(() => ['ready', 'error'].includes(document.body?.dataset.state));
  return Object.assign(popup, { tab });
}

const textOf = (popup, selector) =>
  popup.evaluate((css) => document.querySelector(css)?.textContent.replace(/\s+/g, ' ').trim() ?? null, selector);

const click = (popup, selector) => popup.evaluate((css) => document.querySelector(css).click(), selector);

/** The rows of the Fields section, as a person would read them. */
const fieldRows = (popup) =>
  popup.evaluate(() =>
    [...document.querySelectorAll('[data-section="fields"] li')].map((row) => ({
      label: row.querySelector('.label').textContent,
      type: row.querySelector('.type').textContent.trim(),
      selector: row.querySelector('.selector')?.textContent ?? null,
      flags: [...row.querySelectorAll('.flag')].map((flag) => flag.textContent),
    })),
  );

/** Replaces the clipboard with a recorder, so tests can see what was copied without touching the real one. */
const recordClipboard = (popup) =>
  popup.evaluate(() => {
    navigator.clipboard.writeText = async (text) => {
      window.copied = text;
    };
  });

// ---------------------------------------------------------------------------------------------
// What the popup shows
// ---------------------------------------------------------------------------------------------

test('shows the title and address of the page it was opened on', async (t) => {
  const url = site.serve(htmlPage('Apply: Data Intern', '<h1>Data Intern</h1>'), 'apply.html');
  const popup = await openPopupOn(url, t);

  assert.equal(await textOf(popup, '#page-title'), 'Apply: Data Intern');
  assert.equal(await textOf(popup, '#page-address'), `${shown(site.origin)}/apply.html`);
});

test('lists each field with its label, type, selector and warnings', async (t) => {
  const popup = await openPopupOn(
    site.serve(
      htmlPage(
        'Form',
        `<label for="first">First name *</label><input id="first" name="first_name">
         <label>Résumé <input type="file" name="resume"></label>
         <input name="website" aria-label="Leave this empty" style="display:none">
         <input name="reference" aria-label="Reference number" readonly>`,
      ),
    ),
    t,
  );

  assert.deepEqual(await fieldRows(popup), [
    { label: 'First name', type: 'text', selector: '#first', flags: ['required'] },
    { label: 'Résumé', type: 'file', selector: 'input[name="resume"]', flags: [] },
    { label: 'Leave this empty', type: 'text', selector: 'input[name="website"]', flags: ['hidden'] },
    { label: 'Reference number', type: 'text', selector: 'input[name="reference"]', flags: ['read-only'] },
  ]);
});

test('shows the text beside a field nothing names, and says it is a guess', async (t) => {
  const popup = await openPopupOn(
    site.serve(
      htmlPage(
        'Form',
        '<div>Which university did you last attend?</div><div><select name="q1"><option>Mars University</option></select></div>',
      ),
    ),
    t,
  );

  assert.deepEqual(await fieldRows(popup), [
    {
      label: 'Which university did you last attend?',
      type: 'select',
      selector: 'select[name="q1"]',
      flags: ['label guessed'],
    },
  ]);
});

test('heads a field with what the page calls it, and shows the text beside it underneath', async (t) => {
  // A placeholder is the page's own word for the field; the text beside it is only a guess.
  const popup = await openPopupOn(
    site.serve(htmlPage('Form', '<div>Preferred name</div><div><input name="q2" placeholder="Type your response"></div>')),
    t,
  );

  assert.equal(await textOf(popup, '[data-section="fields"] li .label'), 'Type your response');
  assert.ok((await textOf(popup, '[data-section="fields"] li .hint')).includes('Preferred name'));
  assert.deepEqual((await fieldRows(popup))[0].flags, []);
});

test('shows the choices a radio group offers', async (t) => {
  const popup = await openPopupOn(
    site.serve(
      htmlPage(
        'Form',
        `<fieldset><legend>Will you need sponsorship?</legend>
           <label><input type="radio" name="sponsorship" value="y"> Yes</label>
           <label><input type="radio" name="sponsorship" value="n"> No</label>
         </fieldset>`,
      ),
    ),
    t,
  );

  assert.equal(await textOf(popup, '[data-section="fields"] li .label'), 'Will you need sponsorship?');
  assert.equal(await textOf(popup, '[data-section="fields"] li .options'), 'Yes, No');
});

test('falls back to the field name when a field has no label', async (t) => {
  const popup = await openPopupOn(site.serve(htmlPage('Form', '<input name="middle_initial">')), t);

  assert.equal(await textOf(popup, '[data-section="fields"] li .label'), 'middle_initial');
});

test('counts what it found in each section', async (t) => {
  const popup = await openPopupOn(
    site.serve(
      htmlPage(
        'Posting',
        `<h1>Data Intern</h1><h2>About the role</h2>
         <a href="/a">One</a><a href="/b">Two</a><a href="/c">Three</a>
         <input name="email"><input name="phone"><button>Apply</button>`,
      ),
    ),
    t,
  );

  const counts = await popup.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('details[data-section]')].map((section) => [
        section.dataset.section,
        section.querySelector('summary .count').textContent,
      ]),
    ),
  );
  assert.deepEqual(counts, { fields: '2', buttons: '1', headings: '2', links: '3' });
});

test('says so when the page has no form fields', async (t) => {
  const popup = await openPopupOn(site.serve(htmlPage('Posting', '<h1>Data Intern</h1>')), t);

  assert.match(await textOf(popup, '[data-section="fields"] .empty'), /No form fields/);
});

test('shows the first 200 rows of a long section and says how many more the JSON holds', async (t) => {
  const links = Array.from({ length: 203 }, (_, i) => `<a href="/jobs/${i}">Job ${i}</a>`).join('');
  const popup = await openPopupOn(site.serve(htmlPage('Listings', links)), t);

  assert.equal(await popup.evaluate(() => document.querySelectorAll('[data-section="links"] li').length), 200);
  assert.match(await textOf(popup, '[data-section="links"] .more'), /^3 more/);
});

test('explains itself when Chrome will not let it read the page', async (t) => {
  const popup = await openPopupOn('chrome://version', t);

  assert.equal(await popup.evaluate(() => document.body.dataset.state), 'error');
  assert.match(await textOf(popup, '#message'), /does not let extensions read this page/);
  assert.equal(await popup.evaluate(() => document.querySelector('#copy-json').disabled), true);
});

// ---------------------------------------------------------------------------------------------
// Copying and saving
// ---------------------------------------------------------------------------------------------

test('Copy JSON copies the capture without the raw html, and says it did', async (t) => {
  const popup = await openPopupOn(site.serve(htmlPage('Apply: Data Intern', '<input name="email">')), t);
  await recordClipboard(popup);

  await click(popup, '#copy-json');
  const copied = JSON.parse(await popup.waitFor(() => window.copied));

  assert.equal(copied.title, 'Apply: Data Intern');
  assert.deepEqual(
    copied.fields.map((field) => field.name),
    ['email'],
  );
  assert.equal('html' in copied, false);
  assert.equal(await textOf(popup, '#copy-json'), 'Copied');
});

test('says so when the clipboard refuses the copy', async (t) => {
  const popup = await openPopupOn(site.serve(htmlPage('Apply', '<input name="email">')), t);
  await popup.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Clipboard write denied');
    };
  });

  await click(popup, '#copy-json');

  assert.ok(await popup.waitFor(() => document.querySelector('#copy-json').textContent === 'Could not copy'));
});

test('Copy HTML copies the html of the page', async (t) => {
  const popup = await openPopupOn(site.serve(htmlPage('Apply', '<input name="email">')), t);
  await recordClipboard(popup);

  await click(popup, '#copy-html');

  assert.equal(
    await popup.waitFor(() => window.copied),
    '<!DOCTYPE html>\n<html lang="en"><head><title>Apply</title></head><body><input name="email"></body></html>',
  );
});

test('clicking a selector copies it', async (t) => {
  const popup = await openPopupOn(site.serve(htmlPage('Form', '<input id="first">')), t);
  await recordClipboard(popup);

  await click(popup, '[data-section="fields"] .selector');

  assert.equal(await popup.waitFor(() => window.copied), '#first');
});

for (const [button, extension, check] of [
  ['#save-json', 'json', (saved) => assert.equal(JSON.parse(saved).title, 'Apply: Data Intern')],
  ['#save-html', 'html', (saved) => assert.match(saved, /^<!DOCTYPE html>\n<html lang="en"><head><title>Apply: Data Intern/)],
]) {
  test(`${button} downloads a .${extension} file named after the site`, async (t) => {
    const downloads = await mkdtemp(path.join(scratchDir, 'downloads-'));
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
    const popup = await openPopupOn(site.serve(htmlPage('Apply: Data Intern', '<input name="email">')), t);

    const finished = browser.nextEvent(
      (event) => event.method === 'Browser.downloadProgress' && event.params.state === 'completed',
      'the download to finish',
    );
    await click(popup, button);
    await finished;

    const files = await readdir(downloads);
    assert.equal(files.length, 1);
    assert.match(files[0], new RegExp(`^127\\.0\\.0\\.1-\\d{8}-\\d{6}\\.${extension}$`));
    check(await readFile(path.join(downloads, files[0]), 'utf8'));
  });
}

// ---------------------------------------------------------------------------------------------
// Frames and shadow roots
// ---------------------------------------------------------------------------------------------

test('includes fields from a frame on the same site, saying which frame', async (t) => {
  const frame = site.serve(htmlPage('Inner', '<input name="inner" aria-label="Inner field">'), 'inner-form.html');
  const popup = await openPopupOn(
    site.serve(htmlPage('Host', `<input name="outer" aria-label="Outer field"><iframe src="${frame}"></iframe>`)),
    t,
  );

  const rows = await popup.evaluate(() =>
    [...document.querySelectorAll('[data-section="fields"] li')].map((row) => [
      row.querySelector('.label').textContent,
      row.querySelector('.frame')?.textContent ?? null,
    ]),
  );
  assert.deepEqual(rows, [
    ['Outer field', null],
    ['Inner field', `In frame ${shown(site.origin)}/inner-form.html`],
  ]);
});

/** A page that embeds each of `addresses` in a frame big enough to hold a form. */
const hostPage = (...addresses) =>
  htmlPage('Host', addresses.map((address) => `<iframe src="${address}" width="600" height="400"></iframe>`).join(''));

const embeddedForm = () => htmlPage('Embedded form', '<input name="inner" aria-label="Inner field">');

/** What the popup says about frames it could not read. */
const unreadNotice = (popup) =>
  popup.evaluate(() => ({
    shown: !document.querySelector('#unread').hidden,
    text: document.querySelector('#unread').textContent.replace(/\s+/g, ' ').trim(),
    buttons: [...document.querySelectorAll('#unread button')].map((button) => button.textContent),
  }));

/** Chrome's own permission prompt cannot be clicked from a test, so this answers in its place and records what was asked. */
const answerPermissionPrompt = (popup, answer) =>
  popup.evaluate((granted) => {
    chrome.permissions.request = async (wanted) => {
      window.requested = wanted;
      return granted;
    };
  }, answer);

test('points out a frame from another site that it was not allowed to read', async (t) => {
  const popup = await openPopupOn(site.serve(hostPage(otherSite.serve(embeddedForm()))), t);

  assert.equal(await popup.evaluate(() => document.body.dataset.state), 'ready');
  assert.deepEqual(await fieldRows(popup), []);
  const notice = await unreadNotice(popup);
  assert.equal(notice.shown, true);
  assert.ok(notice.text.includes(shown(otherSite.origin)), notice.text);
  assert.equal(notice.buttons.length, 1);
});

test('keeps quiet about unread frames when there are none', async (t) => {
  const popup = await openPopupOn(site.serve(htmlPage('Plain', '<input name="email">')), t);

  assert.equal((await unreadNotice(popup)).shown, false);
});

test('gives each unread site its own button, and asks Chrome only for the one clicked', async (t) => {
  // The same server under two names is two sites to the browser.
  const viaLocalhost = otherSite.serve(embeddedForm()).replace('127.0.0.1', 'localhost');
  const viaAddress = otherSite.serve(embeddedForm());
  const popup = await openPopupOn(site.serve(hostPage(viaLocalhost, viaAddress)), t);
  await answerPermissionPrompt(popup, false);

  assert.equal((await unreadNotice(popup)).buttons.length, 2);
  await popup.evaluate(() => document.querySelectorAll('#unread button')[0].click());

  assert.deepEqual(await popup.waitFor(() => window.requested), { origins: ['http://localhost/*'] });
});

test('reads the page again once access is granted', async (t) => {
  const popup = await openPopupOn(site.serve(hostPage(otherSite.serve(embeddedForm()))), t);
  await answerPermissionPrompt(popup, true);
  await popup.tab.evaluate(() => {
    document.title = 'Changed since the first capture';
  });

  await click(popup, '#unread button');

  assert.ok(await popup.waitFor(() => document.querySelector('#page-title').textContent === 'Changed since the first capture'));
});

test('says so when Chrome refuses to ask for access', async (t) => {
  const popup = await openPopupOn(site.serve(hostPage(otherSite.serve(embeddedForm()))), t);
  await popup.evaluate(() => {
    chrome.permissions.request = async () => {
      throw new Error('This function must be called during a user gesture');
    };
  });

  await click(popup, '#unread button');

  assert.ok(await popup.waitFor(() => document.querySelector('#unread button').textContent === 'Could not ask'));
});

for (const [what, frameMarkup] of [
  [
    'was redirected to another site',
    () => `<iframe src="${site.redirect(`go-${Date.now()}`, otherSite.serve(embeddedForm()))}" width="600" height="400"></iframe>`,
  ],
  [
    'is sandboxed',
    () => `<iframe sandbox src="${site.serve(embeddedForm())}" width="600" height="400"></iframe>`,
  ],
]) {
  test(`reports a frame it could not read because it ${what}, without offering access that cannot help`, async (t) => {
    const popup = await openPopupOn(site.serve(htmlPage('Host', frameMarkup())), t);

    assert.deepEqual(await fieldRows(popup), []);
    const notice = await unreadNotice(popup);
    assert.equal(notice.shown, true);
    assert.deepEqual(notice.buttons, []);
  });
}

test('says where each frame sits, so a consumer can tell them apart', async (t) => {
  const frame = site.serve(embeddedForm());
  const popup = await openPopupOn(site.serve(hostPage(frame)), t);
  await recordClipboard(popup);

  await click(popup, '#copy-json');
  const copied = JSON.parse(await popup.waitFor(() => window.copied));

  assert.deepEqual(copied.framePath, []);
  assert.deepEqual(
    copied.frames.map((embedded) => [embedded.url, embedded.framePath]),
    [[frame, [0]]],
  );
});

/** Makes the popup capture again, with `results` standing in for what the page would return. */
async function recaptureWith(popup, results) {
  await answerPermissionPrompt(popup, true);
  await popup.evaluate((canned) => {
    chrome.scripting.executeScript = async () => canned;
  }, results);
  await click(popup, '#unread button');
}

test('says so when the page comes back with nothing', async (t) => {
  const popup = await openPopupOn(site.serve(hostPage(otherSite.serve(embeddedForm()))), t);

  await recaptureWith(popup, [{ frameId: 0, result: null }]);

  await popup.waitFor(() => document.body.dataset.state === 'error');
  assert.ok((await textOf(popup, '#message')).length > 0);
  assert.equal(await popup.evaluate(() => document.querySelector('#copy-json').disabled), true);
});

test('says which parts of the page could not be read, and still shows the rest', async (t) => {
  const popup = await openPopupOn(site.serve(hostPage(otherSite.serve(embeddedForm()))), t);
  await recordClipboard(popup);
  await click(popup, '#copy-json');
  const page = JSON.parse(await popup.waitFor(() => window.copied));

  await recaptureWith(popup, [
    { frameId: 0, result: { ...page, title: 'Partly read', html: '<html></html>', iframes: [], problems: ['links: This link is a trap'] } },
  ]);

  await popup.waitFor(() => document.querySelector('#page-title').textContent === 'Partly read');
  assert.equal(await popup.evaluate(() => document.body.dataset.state), 'ready');
  assert.match(await textOf(popup, '#message'), /links/);
});

test('reads a frame from another site once that site is allowed', async (t) => {
  // Stands in for the user having clicked Allow: the same extension, with the site already granted.
  const allowedCopy = path.join(scratchDir, 'extension-with-access');
  await cp(EXTENSION_DIR, allowedCopy, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(allowedCopy, 'manifest.json'), 'utf8'));
  await writeFile(
    path.join(allowedCopy, 'manifest.json'),
    JSON.stringify({ ...manifest, host_permissions: ['http://127.0.0.1/*'] }),
  );
  const { id } = await browser.send('Extensions.loadUnpacked', { path: allowedCopy });
  t.after(() => browser.send('Extensions.uninstall', { id }));

  const frame = otherSite.serve(htmlPage('Embedded form', '<input name="inner" aria-label="Inner field">'));
  const popup = await openPopupOn(
    site.serve(htmlPage('Host', `<iframe src="${frame}" width="600" height="400"></iframe>`)),
    t,
    id,
  );

  assert.deepEqual(
    (await fieldRows(popup)).map((row) => row.label),
    ['Inner field'],
  );
  assert.equal((await unreadNotice(popup)).shown, false);
});

test('says so when a site is already allowed but its frame still could not be read', async (t) => {
  // The frame points at an allowed site, which sends it on to one that is not allowed.
  const allowedCopy = path.join(scratchDir, 'extension-with-access-2');
  await cp(EXTENSION_DIR, allowedCopy, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(allowedCopy, 'manifest.json'), 'utf8'));
  await writeFile(
    path.join(allowedCopy, 'manifest.json'),
    JSON.stringify({ ...manifest, host_permissions: ['http://127.0.0.1/*'] }),
  );
  const { id } = await browser.send('Extensions.loadUnpacked', { path: allowedCopy });
  t.after(() => browser.send('Extensions.uninstall', { id }));

  const elsewhere = otherSite.serve(embeddedForm()).replace('127.0.0.1', 'localhost');
  const popup = await openPopupOn(site.serve(hostPage(otherSite.redirect('moved', elsewhere))), t, id);

  assert.deepEqual(await fieldRows(popup), []);
  const notice = await unreadNotice(popup);
  assert.equal(notice.shown, true);
  assert.ok(notice.text.includes(shown(otherSite.origin)), notice.text);
  assert.deepEqual(notice.buttons, []);
});

test('reads fields inside closed shadow roots', async (t) => {
  const popup = await openPopupOn(
    site.serve(
      htmlPage(
        'Sealed',
        `<sealed-box id="box"></sealed-box>
         <script>
           document.querySelector('#box').attachShadow({ mode: 'closed' }).innerHTML =
             '<input name="sealed" aria-label="Sealed field">';
         </script>`,
      ),
    ),
    t,
  );

  assert.deepEqual(
    (await fieldRows(popup)).map((row) => row.label),
    ['Sealed field'],
  );
});
