import { Unzip, UnzipInflate, unzipSync } from 'fflate';
import { MAX_RESUME_BYTES } from '../resume';
import { MAX_IMPORT_TEXT, proposeResumeImport } from './parse';
import type { ResumeProposal } from './parse';
export { MAX_IMPORT_TEXT, proposeResumeImport } from './parse';
export type { ResumeProposal } from './parse';

export interface ExtractedResume { text: string; format: 'pdf' | 'docx' | 'txt'; pages?: number }
export type ParsedResume = ExtractedResume & ResumeProposal;
const MAX_DOCX_XML = 2 * 1024 * 1024;

/** FileReader works in both extension pages and jsdom without fetching a data URL. */
function bytesOf(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error('That résumé could not be read. Choose it again.'));
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(new Uint8Array(reader.result)) : reject(Error('That résumé could not be read.'));
    reader.readAsArrayBuffer(file);
  });
}

function boundedText(value: string): string {
  const text = value.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (text.length > MAX_IMPORT_TEXT) throw Error('That résumé contains too much text to import. Use a shorter résumé.');
  if (!text) throw Error('No readable text was found. Use a text-based PDF, DOCX, or TXT résumé. Scanned images need text recognition first.');
  return text;
}

/** Extract only document text and headers, never HTML, macros, relationships or external links. */
export function textFromDocx(bytes: Uint8Array): string {
  if (bytes.length > MAX_RESUME_BYTES) throw Error('That Word file is too large. Use a file no larger than 4 MB.');
  const metadata = new Map<string, { size: number; originalSize: number; compression: number }>();
  let advertisedBytes = 0;
  let entries = 0;
  // Metadata-only preflight: returning false for every item means unzipSync
  // never allocates a decompression output from attacker-controlled size values.
  unzipSync(bytes, { filter: item => {
    entries += 1;
    if (entries > 1000) throw Error('That Word file has too many parts to import. Save it as a PDF or TXT file.');
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(item.name)) return false;
    if (!Number.isSafeInteger(item.originalSize) || item.originalSize < 0 || item.originalSize > MAX_DOCX_XML || (advertisedBytes += item.originalSize) > MAX_DOCX_XML) {
      throw Error('That Word file expands to too much text. Save a shorter résumé as PDF or TXT.');
    }
    if (metadata.has(item.name) || ![0, 8].includes(item.compression) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > bytes.length) throw Error('That Word file contains inconsistent ZIP entries. Save it as PDF or TXT.');
    metadata.set(item.name, { size: item.size, originalSize: item.originalSize, compression: item.compression });
    return false;
  } });
  const files: Record<string, Uint8Array> = {};
  const started = new Set<string>();
  let actualBytes = 0;
  let localEntries = 0;
  let failure: Error | undefined;
  const startedAt = performance.now();
  const unzip = new Unzip(file => {
    localEntries += 1;
    if (localEntries > 1000) { failure = Error('That Word file has too many parts to import.'); return; }
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(file.name)) return;
    const expected = metadata.get(file.name);
    if (!expected || started.has(file.name) || file.compression !== expected.compression || (file.size !== undefined && file.size !== expected.size) || (file.originalSize !== undefined && file.originalSize !== expected.originalSize)) {
      failure = Error('That Word file contains inconsistent ZIP entries. Save it as PDF or TXT.'); return;
    }
    started.add(file.name);
    const chunks: Uint8Array[] = [];
    let actualSize = 0;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) { failure = Error('That Word file could not be decompressed. Save it as PDF or TXT.'); return; }
      actualSize += chunk.length; actualBytes += chunk.length;
      if (actualSize > expected.originalSize || actualSize > MAX_DOCX_XML || actualBytes > MAX_DOCX_XML) {
        failure = Error('That Word file expands beyond its declared text size. Save it as PDF or TXT.'); return;
      }
      chunks.push(chunk);
      if (final) {
        if (actualSize !== expected.originalSize) { failure = Error('That Word file contains a truncated text part. Save it as PDF or TXT.'); return; }
        const combined = new Uint8Array(actualSize); let offset = 0;
        for (const data of chunks) { combined.set(data, offset); offset += data.length; }
        files[file.name] = combined;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // A DEFLATE stream must be measured by actual output. Small compressed chunks
  // bound the temporary expansion before each ondata limit check can run.
  for (let offset = 0; offset < bytes.length; offset += 256) {
    if (failure) throw failure;
    if (performance.now() - startedAt > 1500) throw Error('That Word file took too long to read. Save it as PDF or TXT.');
    unzip.push(bytes.subarray(offset, Math.min(offset + 256, bytes.length)), offset + 256 >= bytes.length);
  }
  if (failure) throw failure;
  if (metadata.size !== Object.keys(files).length) throw Error('That Word file contains an incomplete text part. Save it as PDF or TXT.');
  if (!files['word/document.xml']) throw Error('That file is not a readable DOCX document.');
  const names = Object.keys(files).sort((a, b) => {
    const rank = (name: string): number => name.includes('header') ? 0 : name.includes('document') ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const parts: string[] = [];
  for (const name of names) {
    const value = files[name]!;
    if (value.length > MAX_DOCX_XML) throw Error('That Word file contains too much text.');
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(value);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('That Word file contains unsupported XML declarations. Save it as PDF or TXT.');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) throw Error('That Word file could not be read. Save it as PDF or TXT.');
    for (const paragraph of Array.from(document.getElementsByTagNameNS('*', 'p'))) {
      const text: string[] = [];
      for (const node of Array.from(paragraph.getElementsByTagNameNS('*', '*'))) {
        let deleted = false;
        for (let parent: Element | null = node; parent && parent !== paragraph; parent = parent.parentElement) {
          if (parent.localName === 'del') { deleted = true; break; }
        }
        if (deleted) continue;
        if (node.localName === 't') text.push(node.textContent ?? '');
        else if (node.localName === 'tab') text.push('\t');
        else if (node.localName === 'br') text.push('\n');
      }
      parts.push(text.join(''));
    }
  }
  return boundedText(parts.join('\n'));
}

export async function extractResumeText(file: File): Promise<ExtractedResume> {
  if (file.size === 0) throw Error('That résumé is empty. Choose a file with text.');
  if (file.size > MAX_RESUME_BYTES) throw Error('Use a résumé no larger than 4 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'docx' && extension !== 'txt') throw Error('Text import supports PDF, DOCX and TXT. Your attachment can still be used; enter its details manually or choose a supported file.');
  const bytes = await bytesOf(file);
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_RESUME_BYTES) throw Error('That résumé could not be read completely.');
  if (extension === 'txt') {
    let decoded: string;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw Error('Save that text file as UTF-8, then import it again.'); }
    if (/\u0000/.test(decoded)) throw Error('That file looks like binary data. Choose a text-based PDF, DOCX or TXT file.');
    return { text: boundedText(decoded), format: 'txt' };
  }
  if (extension === 'docx') {
    try { return { text: textFromDocx(bytes), format: 'docx' }; }
    catch (error) {
      if (error instanceof Error && /^That |^No readable/.test(error.message)) throw error;
      throw Error('That DOCX file could not be read. Save it as a PDF or TXT file.');
    }
  }
  const { textFromPdf } = await import('./pdf');
  return { ...await textFromPdf(bytes), format: 'pdf' };
}

export async function parseResume(file: File): Promise<ParsedResume> {
  const extracted = await extractResumeText(file);
  return { ...extracted, ...proposeResumeImport(extracted.text, file.name) };
}
