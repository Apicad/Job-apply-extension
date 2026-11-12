import { browser } from 'wxt/browser';
import type { Row } from '../hackathon/engine';

/** Public job text only. Never read input values or applicant/profile DOM. */
export async function collectJobDescription(expectedUrl: string): Promise<string> {
 if (location.href !== expectedUrl) return '';
 const extract = (doc: Document): string => {
  const clean = (node: Element) => {
   const copy = node.cloneNode(true) as Element;
   copy.querySelectorAll('form,input,textarea,select,button,[contenteditable],script,style,nav,footer').forEach(el => el.remove());
   return (copy.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 3400);
  };
  const postings: Record<string, unknown>[] = [];
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0, 10)) {
   if ((script.textContent?.length ?? 0) > 100_000) continue;
   try {
    const parsed = JSON.parse(script.textContent ?? '');
    const top = Array.isArray(parsed) ? parsed : [parsed];
    const items = top.flatMap(item => item && typeof item === 'object' && item['@graph'] ? item['@graph'] : [item]);
    for (const item of items) if (item && (item['@type'] === 'JobPosting' || Array.isArray(item['@type']) && item['@type'].includes('JobPosting'))) postings.push(item);
   } catch { /* Invalid page metadata is not a reason to stop Autofill. */ }
  }
  if (postings.length > 1) return '';
  if (postings.length === 1 && typeof postings[0]!.description === 'string') {
   const fragment = new DOMParser().parseFromString(postings[0]!.description.slice(0, 20_000), 'text/html');
   return clean(fragment.body);
  }
  const sections = Array.from(doc.querySelectorAll('[data-testid="job-description"],#job-description,.job-description,.posting-page .section-wrapper'));
  return sections.filter(el => !el.closest('form') && !el.querySelector('form')).map(clean).filter(Boolean).join('\n').slice(0, 3400);
 };
 const current = extract(document);
 if (current) return current;
 // Lever separates the public description from its application page. Fetch only
 // that exact same-origin job, without query tokens, credentials or redirects.
 const url = new URL(expectedUrl);
 if (url.protocol !== 'https:' || !['jobs.lever.co', 'jobs.eu.lever.co'].includes(url.hostname) || !/^\/[^/]+\/[a-f\d-]{36}\/apply\/?$/i.test(url.pathname)) return '';
 url.pathname = url.pathname.replace(/\/apply\/?$/, ''); url.search = ''; url.hash = '';
 try {
  const response = await fetch(url.href, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(3000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return '';
  const reader = response.body?.getReader(); if (!reader) return '';
  const decoder = new TextDecoder(); let html = ''; let bytes = 0;
  while (true) {
   const part = await reader.read(); if (part.done) break;
   bytes += part.value.byteLength;
   if (bytes > 250_000) { await reader.cancel(); return ''; }
   html += decoder.decode(part.value, { stream: true });
  }
  html += decoder.decode();
  return location.href === expectedUrl ? extract(new DOMParser().parseFromString(html, 'text/html')) : '';
 } catch { return ''; }
}

export async function readJobDescription(tabId: number, row: Row): Promise<string> {
 try {
  const results = await browser.scripting.executeScript({target:{tabId,documentIds:[row.documentId]},func:collectJobDescription,args:[row.url]});
  const text = results.length === 1 ? results[0]?.result : '';
  return typeof text === 'string' && text.length <= 3400 ? text : '';
 } catch { return ''; }
}
