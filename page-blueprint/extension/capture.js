// Turns what the extractor returned for each frame into one capture, and exports a capture
// as JSON or HTML. Plain data in, plain data out: nothing here touches the page or chrome.*.

// Frames smaller than this on either side are trackers, captcha badges and chat bubbles,
// not somewhere a form would live.
const SMALLEST_CONTENT_FRAME = 150; // px

/** The site part of a web address ("https://example.com"), or null for anything else. */
function siteOf(address) {
  try {
    const { protocol, origin } = new URL(address);
    return protocol === 'http:' || protocol === 'https:' ? origin : null;
  } catch {
    return null;
  }
}

/**
 * Embedded frames that look like real content but that nothing came back from. Each document
 * says where it sits among the page's frames (`framePath`) and where each of its own frames
 * sits (`index`), so a frame was read exactly when some document reports its position.
 *
 * Chrome only lets the extension into a frame from another site once the user has allowed
 * that site, so each entry names the site its address points at. When the address gives no
 * other site to ask for (the frame was redirected away from the page's own site, or is
 * sandboxed, or has no address), `site` is null.
 */
function findUnreadFrames(documents) {
  const read = new Set(documents.map((document) => document.framePath.join('.')));
  const unread = [];
  for (const document of documents) {
    for (const frame of document.iframes) {
      const holdsContent =
        frame.visible && frame.width >= SMALLEST_CONTENT_FRAME && frame.height >= SMALLEST_CONTENT_FRAME;
      if (!holdsContent || read.has([...document.framePath, frame.index].join('.'))) continue;
      const site = siteOf(frame.src);
      unread.push({ src: frame.src, site: site === siteOf(document.url) ? null : site });
    }
  }
  return unread;
}

/**
 * @param results what chrome.scripting.executeScript resolved with: one `{ frameId, result }`
 *   per frame, where frame 0 is the page itself
 * @param {Date} date when the capture was taken
 */
export function buildCapture(results, date) {
  const read = results.filter((entry) => entry.result);
  const page = read.find((entry) => entry.frameId === 0)?.result;
  if (!page) throw new Error('The page returned nothing to capture.');
  const frames = read.filter((entry) => entry.frameId !== 0).map((entry) => entry.result);
  return {
    capturedAt: date.toISOString(),
    ...page,
    frames,
    unreadFrames: findUnreadFrames([page, ...frames]),
  };
}

/** Every item under `key` ("fields", "links", ...): the page's first, then each frame's, tagged with its frame. */
export function acrossFrames(capture, key) {
  return [
    ...capture[key],
    ...capture.frames.flatMap((frame) => frame[key].map((item) => ({ ...item, frame: frame.url }))),
  ];
}

/** Everything but the raw HTML, which would bury the rest. */
export function toJson(capture) {
  const withoutHtml = ({ html, ...rest }) => rest;
  return JSON.stringify({ ...withoutHtml(capture), frames: capture.frames.map(withoutHtml) }, null, 2);
}

/** The page's HTML, followed by each frame's under a comment giving its address. */
export function toHtml(capture) {
  const frames = capture.frames.map((frame) => `<!-- Embedded frame: ${frame.url} -->\n${frame.html}`);
  return [capture.html, ...frames].join('\n\n');
}

export function htmlBytes(capture) {
  return new TextEncoder().encode(toHtml(capture)).length;
}

/** For example "careers.example.com-20261109-170530.json", using the local time of capture. */
export function fileName(capture, extension) {
  const date = new Date(capture.capturedAt);
  const two = (number) => String(number).padStart(2, '0');
  const day = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`;
  const time = `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  return `${new URL(capture.url).hostname || 'page'}-${day}-${time}.${extension}`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The sites that unread frames point at, each once, in page order. */
export function unreadSites(capture) {
  return [...new Set(capture.unreadFrames.map((frame) => frame.site).filter(Boolean))];
}

/** How many unread frames there is no site to ask for. */
export function unnamedUnreadFrames(capture) {
  return capture.unreadFrames.filter((frame) => !frame.site).length;
}

/** What to ask Chrome for so frames from `site` can be read: the whole site, on any port. */
export function accessPattern(site) {
  const { protocol, hostname } = new URL(site);
  return `${protocol}//${hostname}/*`;
}

/** "A, B, C", or for a long list the first few and a count of the rest. */
export function listSome(items, most = 6) {
  if (items.length <= most) return items.join(', ');
  return `${items.slice(0, most).join(', ')} and ${items.length - most} more`;
}
