// The popup: captures the tab it was opened on, shows what it found, and hands it over.

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
} from './capture.js';
import { extractPageInfo } from './extract.js';

const MOST_ROWS = 200; // per section; the JSON always has everything

const GLYPHS = {
  textarea: 'lines',
  contenteditable: 'lines',
  select: 'select',
  combobox: 'select',
  listbox: 'select',
  radio: 'radio',
  checkbox: 'check',
  switch: 'check',
  file: 'file',
  range: 'slider',
  slider: 'slider',
};

const $ = (selector) => document.querySelector(selector);
const withoutScheme = (address) => address.replace(/^https?:\/\//, '');

/**
 * Builds an element. Children are appended as text unless they are elements, so nothing that
 * came from the captured page is ever parsed as HTML here.
 */
function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children.filter((child) => child !== null));
  return node;
}

/** A little schematic drawing for the left column of a row: `symbol('radio')`, `symbol('button')`. */
function symbol(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'symbol');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#glyph-${name}`);
  svg.append(use);
  return svg;
}

/** Keeps the left column in place on rows that have nothing to draw there. */
const noSymbol = () => el('span', { class: 'symbol' });

// ---------------------------------------------------------------------------------------------
// Copying and saving
// ---------------------------------------------------------------------------------------------

/** Swaps a button's text for a moment to confirm what just happened. */
function flash(button, text) {
  button.dataset.label ??= button.textContent;
  button.textContent = text;
  clearTimeout(button.flashTimer);
  button.flashTimer = setTimeout(() => {
    button.textContent = button.dataset.label;
  }, 1400);
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    flash(button, 'Copied');
  } catch {
    flash(button, 'Could not copy');
  }
}

function save(text, type, name, button) {
  const address = URL.createObjectURL(new Blob([text], { type }));
  el('a', { href: address, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(address), 60_000);
  flash(button, 'Saved');
}

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

function selectorButton(selector) {
  const button = el('button', { class: 'selector', type: 'button', title: 'Copy this selector' }, selector);
  button.addEventListener('click', () => copy(selector, button));
  return button;
}

const frameNote = (item) => (item.frame ? el('span', { class: 'frame' }, `In frame ${withoutScheme(item.frame)}`) : null);

const flagNotes = (flags) =>
  flags.filter(Boolean).map((flag) => el('span', { class: `flag flag-${flag.replace(/\W+/g, '-')}` }, flag));

function fieldRow(field) {
  // What the page itself calls the field comes first. Text found beside an unnamed field is
  // only a guess: it heads the row when there is nothing better, marked as a guess, and
  // otherwise sits underneath.
  const guessed = !field.label && Boolean(field.nearbyText);
  return el(
    'li',
    {},
    symbol(GLYPHS[field.type] ?? 'line'),
    el(
      'div',
      { class: 'what' },
      el('span', { class: 'label' }, field.label || field.nearbyText || field.name || field.id || 'Unlabelled field'),
      field.label && field.nearbyText ? el('span', { class: 'hint' }, `Beside it: ${field.nearbyText}`) : null,
      field.options
        ? el('span', { class: 'options' }, listSome(field.options.map((option) => option.label || option.value)))
        : null,
      field.selector ? selectorButton(field.selector) : null,
      frameNote(field),
    ),
    el(
      'div',
      { class: 'kind' },
      el('span', { class: 'type' }, field.type),
      ...flagNotes([
        field.required && 'required',
        !field.visible && 'hidden',
        field.disabled && 'disabled',
        field.readonly && 'read-only',
        guessed && 'label guessed',
      ]),
    ),
  );
}

function buttonRow(button) {
  return el(
    'li',
    {},
    symbol('button'),
    el(
      'div',
      { class: 'what' },
      el('span', { class: 'label' }, button.text || 'Unlabelled button'),
      selectorButton(button.selector),
      frameNote(button),
    ),
    el('div', { class: 'kind' }, el('span', { class: 'type' }, button.type), ...flagNotes([button.disabled && 'disabled'])),
  );
}

function headingRow(heading) {
  return el(
    'li',
    { style: `--level: ${heading.level}` },
    noSymbol(),
    el('div', { class: 'what outline' }, el('span', { class: 'label' }, heading.text), frameNote(heading)),
    el('div', { class: 'kind' }, el('span', { class: 'type' }, `h${heading.level}`)),
  );
}

function linkRow(link) {
  return el(
    'li',
    {},
    noSymbol(),
    el(
      'div',
      { class: 'what' },
      el('span', { class: 'label' }, link.text || 'Unlabelled link'),
      el('span', { class: 'address' }, withoutScheme(link.href)),
      frameNote(link),
    ),
  );
}

function section(key, title, items, row, emptyText) {
  return el(
    'details',
    { 'data-section': key },
    el('summary', {}, title, ' ', el('span', { class: 'count' }, String(items.length))),
    items.length ? el('ul', {}, ...items.slice(0, MOST_ROWS).map(row)) : el('p', { class: 'empty' }, emptyText),
    items.length > MOST_ROWS ? el('p', { class: 'more' }, `${items.length - MOST_ROWS} more in the JSON.`) : null,
  );
}

// ---------------------------------------------------------------------------------------------
// The capture
// ---------------------------------------------------------------------------------------------

let capture = null;

function allowButton(site) {
  const button = el('button', { class: 'allow', type: 'button' }, 'Allow');
  button.addEventListener('click', async () => {
    try {
      // Chrome shows its own prompt. It may close this popup; if it does, the next capture
      // simply includes the newly allowed frames.
      if (await chrome.permissions.request({ origins: [accessPattern(site)] })) run();
    } catch {
      flash(button, 'Could not ask');
    }
  });
  return button;
}

/** Says which embedded frames were not read, and offers access only where access can help. */
async function showUnread(captured) {
  const rows = [];
  let canAllow = false;
  for (const site of unreadSites(captured)) {
    const name = withoutScheme(site);
    if (await chrome.permissions.contains({ origins: [accessPattern(site)] })) {
      // Allowed already, yet nothing came back: asking again cannot help.
      rows.push(el('li', {}, `${name} is allowed, but its frame still could not be read. It may have moved to another site.`));
    } else {
      rows.push(el('li', {}, el('span', { class: 'site' }, name), allowButton(site)));
      canAllow = true;
    }
  }
  const unnamed = unnamedUnreadFrames(captured);
  $('#unread').hidden = rows.length === 0 && unnamed === 0;
  $('#unread-intro').hidden = !canAllow;
  $('#unread-sites').replaceChildren(...rows);
  $('#unread-note').textContent = unnamed
    ? `${unnamed} ${unnamed === 1 ? 'frame' : 'frames'} could not be read: sandboxed, or moved to a site the page does not name.`
    : '';
}

async function show(captured) {
  const frames = captured.frames.length;
  $('#page-title').textContent = captured.title || 'Untitled page';
  $('#page-address').textContent = withoutScheme(captured.url);
  $('#page-size').textContent =
    `${formatBytes(htmlBytes(captured))} of HTML` + (frames ? `, ${frames} ${frames === 1 ? 'frame' : 'frames'}` : '');

  const problems = [captured, ...captured.frames].flatMap((document) => document.problems ?? []);
  $('#message').textContent = problems.length ? `Some of this page could not be read (${problems.join('; ')}).` : '';

  await showUnread(captured);

  const sections = [
    section('fields', 'Fields', acrossFrames(captured, 'fields'), fieldRow, 'No form fields on this page.'),
    section('buttons', 'Buttons', acrossFrames(captured, 'buttons'), buttonRow, 'No buttons on this page.'),
    section('headings', 'Headings', acrossFrames(captured, 'headings'), headingRow, 'No headings on this page.'),
    section('links', 'Links', acrossFrames(captured, 'links'), linkRow, 'No links on this page.'),
  ];
  // Open whichever section has something to show first; an empty page still opens Fields.
  (sections.find((details) => details.querySelector('li')) ?? sections[0]).open = true;
  $('#sections').replaceChildren(...sections);

  for (const button of document.querySelectorAll('.actions button')) button.disabled = false;
}

function showFailure(heading, explanation) {
  $('#page-title').textContent = heading;
  $('#page-address').textContent = '';
  $('#page-size').textContent = '';
  $('#message').textContent = explanation;
  $('#unread').hidden = true;
  $('#sections').replaceChildren();
  for (const button of document.querySelectorAll('.actions button')) button.disabled = true;
}

async function run() {
  document.body.dataset.state = 'loading';

  let results;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Frames the extension may not read are skipped; only an unreadable page itself rejects.
    results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: extractPageInfo });
  } catch (error) {
    capture = null;
    showFailure(
      'Cannot read this page',
      `Chrome does not let extensions read this page. Try it on an ordinary web page. (${error.message})`,
    );
    document.body.dataset.state = 'error';
    return;
  }

  try {
    capture = buildCapture(results, new Date());
    await show(capture);
    document.body.dataset.state = 'ready';
  } catch (error) {
    capture = null;
    showFailure('Nothing captured', error.message);
    document.body.dataset.state = 'error';
  }
}

$('#copy-json').addEventListener('click', (event) => copy(toJson(capture), event.currentTarget));
$('#copy-html').addEventListener('click', (event) => copy(toHtml(capture), event.currentTarget));
$('#save-json').addEventListener('click', (event) =>
  save(toJson(capture), 'application/json', fileName(capture, 'json'), event.currentTarget),
);
$('#save-html').addEventListener('click', (event) =>
  save(toHtml(capture), 'text/html', fileName(capture, 'html'), event.currentTarget),
);

run();
