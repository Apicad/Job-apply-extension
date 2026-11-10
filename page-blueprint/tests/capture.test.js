// Plain-data logic: how per-frame results become one capture, and how a capture is exported.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessPattern,
  acrossFrames,
  buildCapture,
  fileName,
  formatBytes,
  htmlBytes,
  listSome,
  toHtml,
  toJson,
  unnamedUnreadFrames,
  unreadSites,
} from '../extension/capture.js';

/** What the extractor reports for one document, in full; `overrides` replaces parts of it. */
const doc = (overrides = {}) => ({
  url: 'https://careers.example.com/jobs/42',
  title: 'Data Intern',
  lang: 'en',
  canonical: '',
  framePath: [],
  meta: {},
  jsonLd: [],
  headings: [],
  links: [],
  forms: [],
  fields: [],
  buttons: [],
  iframes: [],
  html: '<!DOCTYPE html>\n<html><body>Page</body></html>',
  ...overrides,
});

/** An <iframe> as the extractor reports it: the document's first, big and visible, unless `overrides` says otherwise. */
const iframe = (overrides = {}) => ({
  src: 'https://boards.example.net/embed/job',
  title: '',
  index: 0,
  width: 800,
  height: 1200,
  visible: true,
  ...overrides,
});

const pageResult = (result = doc()) => ({ frameId: 0, result });
const when = new Date(2026, 10, 9, 17, 5, 30); // 9 November 2026, 17:05:30 local time

// ---------------------------------------------------------------------------------------------
// Building a capture
// ---------------------------------------------------------------------------------------------

test('puts the page at the root and every other frame under frames', () => {
  const capture = buildCapture(
    [{ frameId: 12, result: doc({ url: 'https://boards.example.net/embed/job', title: 'Form' }) }, pageResult()],
    when,
  );

  assert.equal(capture.url, 'https://careers.example.com/jobs/42');
  assert.equal(capture.title, 'Data Intern');
  assert.deepEqual(
    capture.frames.map((frame) => [frame.url, frame.title]),
    [['https://boards.example.net/embed/job', 'Form']],
  );
});

test('stamps the capture with the moment it was taken', () => {
  const capture = buildCapture([pageResult()], new Date(Date.UTC(2026, 10, 9, 17, 5, 30)));

  assert.equal(capture.capturedAt, '2026-11-09T17:05:30.000Z');
});

test('leaves out frames that returned nothing', () => {
  const capture = buildCapture([pageResult(), { frameId: 5, result: null }], when);

  assert.deepEqual(capture.frames, []);
});

test('refuses to build a capture when the page itself returned nothing', () => {
  assert.throws(() => buildCapture([{ frameId: 0, result: null }], when), Error);
});

// ---------------------------------------------------------------------------------------------
// Frames that could not be read
// ---------------------------------------------------------------------------------------------

/** What the extractor reports from inside a frame: `framePath` says which frame of which. */
const frameResult = (framePath, overrides = {}) => ({
  frameId: 7,
  result: doc({ url: 'https://boards.example.net/embed/job', framePath, ...overrides }),
});

test('reports a large visible frame nothing came back from, with the site it points at', () => {
  const capture = buildCapture([pageResult(doc({ iframes: [iframe()] }))], when);

  assert.deepEqual(capture.unreadFrames, [
    { src: 'https://boards.example.net/embed/job', site: 'https://boards.example.net' },
  ]);
});

test('does not report a frame that was read', () => {
  const capture = buildCapture([pageResult(doc({ iframes: [iframe()] })), frameResult([0])], when);

  assert.deepEqual(capture.unreadFrames, []);
});

test('tells a frame that was read from its unread neighbour by position, not by address', () => {
  // Both frames point at the same site; only the second one answered.
  const capture = buildCapture(
    [
      pageResult(doc({ iframes: [iframe({ index: 0, src: 'https://boards.example.net/embed/a' }), iframe({ index: 1, src: 'https://boards.example.net/embed/b' })] })),
      frameResult([1]),
    ],
    when,
  );

  assert.deepEqual(
    capture.unreadFrames.map((frame) => frame.src),
    ['https://boards.example.net/embed/a'],
  );
});

const noSiteCases = [
  ['points at the page own site, so it was redirected away or is sandboxed', 'https://careers.example.com/go'],
  ['has no web address', 'about:blank'],
  ['has no address at all', ''],
];
for (const [why, src] of noSiteCases) {
  test(`reports an unread frame without a site to ask for when it ${why}`, () => {
    const capture = buildCapture([pageResult(doc({ iframes: [iframe({ src })] }))], when);

    assert.deepEqual(capture.unreadFrames, [{ src, site: null }]);
  });
}

const ignoredCases = [
  ['a hidden frame', iframe({ visible: false })],
  ['a frame too short to hold a form', iframe({ width: 304, height: 78 })],
  ['a frame too narrow to hold a form', iframe({ width: 60, height: 600 })],
];
for (const [what, frame] of ignoredCases) {
  test(`does not report ${what}`, () => {
    const capture = buildCapture([pageResult(doc({ iframes: [frame] }))], when);

    assert.deepEqual(capture.unreadFrames, []);
  });
}

test('reports an unread frame nested inside a frame that was read', () => {
  const capture = buildCapture(
    [
      pageResult(doc({ iframes: [iframe({ index: 0, src: 'https://careers.example.com/shell' }), iframe({ index: 1 })] })),
      frameResult([1], { iframes: [iframe({ index: 0, src: 'https://uploads.example.org/widget' })] }),
      { frameId: 9, result: doc({ url: 'https://careers.example.com/shell', framePath: [0] }) },
    ],
    when,
  );

  assert.deepEqual(capture.unreadFrames, [
    { src: 'https://uploads.example.org/widget', site: 'https://uploads.example.org' },
  ]);
});

test('lists each site with unread frames once, in page order', () => {
  const capture = buildCapture(
    [
      pageResult(
        doc({
          iframes: [
            iframe({ index: 0 }),
            iframe({ index: 1, src: 'https://careers.example.com/go' }),
            iframe({ index: 2, src: 'https://video.example.org/player' }),
            iframe({ index: 3, src: 'https://boards.example.net/embed/other' }),
          ],
        }),
      ),
    ],
    when,
  );

  assert.deepEqual(unreadSites(capture), ['https://boards.example.net', 'https://video.example.org']);
  assert.equal(unnamedUnreadFrames(capture), 1);
});

const patternCases = [
  ['https://boards.example.net', 'https://boards.example.net/*'],
  ['http://localhost:8080', 'http://localhost/*'],
];
for (const [site, want] of patternCases) {
  test(`asks for access to ${site} as "${want}"`, () => {
    assert.equal(accessPattern(site), want);
  });
}

// ---------------------------------------------------------------------------------------------
// Reading across frames
// ---------------------------------------------------------------------------------------------

test('lists items from the page first, then from each frame, saying which frame', () => {
  const capture = buildCapture(
    [
      pageResult(doc({ fields: [{ label: 'Search jobs' }] })),
      { frameId: 3, result: doc({ url: 'https://boards.example.net/embed/job', fields: [{ label: 'First name' }] }) },
    ],
    when,
  );

  assert.deepEqual(acrossFrames(capture, 'fields'), [
    { label: 'Search jobs' },
    { label: 'First name', frame: 'https://boards.example.net/embed/job' },
  ]);
});

// ---------------------------------------------------------------------------------------------
// Exporting
// ---------------------------------------------------------------------------------------------

test('exports JSON without the raw html of the page or its frames', () => {
  const capture = buildCapture(
    [pageResult(), { frameId: 3, result: doc({ url: 'https://boards.example.net/embed/job', title: 'Form' }) }],
    when,
  );

  const exported = JSON.parse(toJson(capture));

  assert.equal('html' in exported, false);
  assert.equal('html' in exported.frames[0], false);
  assert.equal(exported.title, 'Data Intern');
  assert.equal(exported.frames[0].title, 'Form');
});

test('exports html with each frame after the page, under a comment giving its address', () => {
  const capture = buildCapture(
    [
      pageResult(doc({ html: '<html><body>Page</body></html>' })),
      { frameId: 3, result: doc({ url: 'https://boards.example.net/embed/job', html: '<html><body>Frame</body></html>' }) },
    ],
    when,
  );

  assert.equal(
    toHtml(capture),
    '<html><body>Page</body></html>\n\n' +
      '<!-- Embedded frame: https://boards.example.net/embed/job -->\n<html><body>Frame</body></html>',
  );
});

test('measures the exported html in bytes, not characters', () => {
  const capture = buildCapture([pageResult(doc({ html: 'résumé' }))], when);

  assert.equal(htmlBytes(capture), 8); // é takes two bytes
});

test('names a saved file after the site and the local time of capture', () => {
  const capture = buildCapture([pageResult()], when);

  assert.equal(fileName(capture, 'json'), 'careers.example.com-20261109-170530.json');
});

test('names a saved file "page" when the address has no site', () => {
  const capture = buildCapture([pageResult(doc({ url: 'file:///Users/ada/form.html' }))], when);

  assert.equal(fileName(capture, 'html'), 'page-20261109-170530.html');
});

const sizeCases = [
  [0, '0 bytes'],
  [1023, '1023 bytes'],
  [1024, '1 KB'],
  [188_416, '184 KB'],
  [1_048_576, '1.0 MB'],
  [2_621_440, '2.5 MB'],
];
for (const [bytes, want] of sizeCases) {
  test(`writes ${bytes} bytes as "${want}"`, () => {
    assert.equal(formatBytes(bytes), want);
  });
}

const listCases = [
  [[], ''],
  [['Yes', 'No'], 'Yes, No'],
  [['A', 'B', 'C', 'D', 'E', 'F'], 'A, B, C, D, E, F'],
  [['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 'A, B, C, D, E, F and 2 more'],
];
for (const [items, want] of listCases) {
  test(`writes a list of ${items.length} choices as "${want}"`, () => {
    assert.equal(listSome(items), want);
  });
}
