interface TextItem { str: string; transform: number[]; width: number; height: number }

/** URLs are returned as inert text only. They are never followed. */
export function httpLinksFromPdf(annotations: unknown[]): string[] {
  const links = new Set<string>();
  for (const value of annotations.slice(0, 100)) {
    if (!value || typeof value !== 'object') continue;
    const item = value as { subtype?: unknown; url?: unknown };
    if (item.subtype !== 'Link' || typeof item.url !== 'string' || item.url.length > 300) continue;
    try {
      const url = new URL(item.url);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) links.add(url.href);
    } catch { /* Ignore malformed URI annotations. */ }
    if (links.size >= 10) break;
  }
  return [...links];
}

/** Read contact hyperlinks embedded in the PDF without navigating or fetching them. */
export function contactLinksFromPdf(annotations: unknown[], items: unknown[]): string[] {
  const links = new Set<string>();
  for (const value of annotations.slice(0, 100)) {
    if (!value || typeof value !== 'object') continue;
    const annotation = value as { subtype?: unknown; url?: unknown; rect?: unknown };
    if (annotation.subtype !== 'Link' || typeof annotation.url !== 'string' || annotation.url.length > 300) continue;
    let url: URL;
    try { url = new URL(annotation.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const profileLink = (host === 'linkedin.com' && /^\/in\/[^/]+\/?$/.test(url.pathname)) || (host === 'github.com' && /^\/[^/]+\/?$/.test(url.pathname));
    let websiteLabel = false;
    if (Array.isArray(annotation.rect) && annotation.rect.length === 4 && annotation.rect.every(Number.isFinite)) {
      const [x1, y1, x2, y2] = annotation.rect as number[];
      const labels = items.filter((item): item is TextItem => !!item && typeof item === 'object' && 'str' in item && typeof item.str === 'string' && 'transform' in item && Array.isArray(item.transform))
        .filter(item => {
          const x = item.transform[4], y = item.transform[5];
          return x !== undefined && y !== undefined && x + (item.width || 0) >= x1! - 3 && x <= x2! + 3 && y >= y1! - Math.max(item.height || 0, 3) && y <= y2! + 3;
        }).map(item => item.str).join(' ').trim();
      websiteLabel = /(?:^|[|•\s])(?:portfolio|personal (?:website|site)|website)(?:$|[|•\s:↗])/i.test(labels);
    }
    if (profileLink || websiteLabel) links.add(url.href);
    if (links.size >= 10) break;
  }
  return [...links];
}
