import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { MAX_IMPORT_TEXT } from './parse';
import { contactLinksFromPdf, httpLinksFromPdf } from './pdf-links';

// The worker is packaged with the extension; no CDN or remote code is involved.
GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_PAGES = 20;

export async function textFromPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const task = getDocument({ data: bytes, useWorkerFetch: false, useWasm: false, disableFontFace: true, useSystemFonts: true, disableAutoFetch: true, disableStream: true, disableRange: true, enableXfa: false, stopAtErrors: true, verbosity: 0 });
  const timeout = setTimeout(() => { void task.destroy(); }, 15_000);
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) throw Error('Text import supports résumés of up to 20 pages. Choose a shorter file.');
    const pages: string[] = [];
    const embeddedLinks = new Set<string>();
    let length = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const annotations = await page.getAnnotations();
      for (const link of httpLinksFromPdf(annotations)) if (embeddedLinks.size < 20) embeddedLinks.add(link);
      let text = '', previousY: number | undefined;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5] as number | undefined;
        if (previousY !== undefined && y !== undefined && Math.abs(previousY - y) > 2 && !text.endsWith('\n')) text += '\n';
        text += item.str;
        text += item.hasEOL ? '\n' : ' ';
        previousY = y;
        if (length + text.length > MAX_IMPORT_TEXT) throw Error('That PDF contains too much text to import. Choose a shorter résumé.');
      }
      if (pageNumber === 1) {
        const links = contactLinksFromPdf(annotations, content.items).filter(link => !text.includes(link));
        if (links.length) {
          const firstBreak = text.indexOf('\n');
          text = firstBreak < 0 ? `${text}\n${links.join('\n')}` : `${text.slice(0, firstBreak)}\n${links.join('\n')}\n${text.slice(firstBreak + 1)}`;
        }
      }
      pages.push(text.trim()); length += text.length;
      page.cleanup();
    }
    let text = pages.join('\n\n').trim();
    if (!text) throw Error('No readable text was found. Use a text-based PDF, DOCX, or TXT résumé. Scanned images need text recognition first.');
    const remainingLinks = [...embeddedLinks].filter(link => !text.includes(link));
    if (remainingLinks.length) text += `\n\nLinks\n${remainingLinks.join('\n')}`;
    if (text.length > MAX_IMPORT_TEXT) throw Error('That PDF contains too much text to import. Choose a shorter résumé.');
    return { text, pages: pdf.numPages };
  } catch (error) {
    if (error instanceof Error && /^(Text import|That PDF|No readable)/.test(error.message)) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw Error('That PDF needs a password. Save an unlocked copy before importing it.');
    throw Error('That PDF could not be read in time. Use a text-based PDF, DOCX, or TXT résumé.');
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
