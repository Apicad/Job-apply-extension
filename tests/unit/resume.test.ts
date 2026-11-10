import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredResume } from '../../lib/types';
import {
  ACCEPTED_RESUME_TYPES,
  acceptsFile,
  fileToStoredResume,
  isStoredResume,
  resumeToFile,
} from '../../lib/resume';

// A 15-byte stand-in for a PDF: the "%PDF-1.7" header line, then the usual
// comment line of four bytes above 127 that marks the file as binary.
const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a];
// The same 15 bytes in base64, worked out with `printf … | base64`.
const PDF_BASE64 = 'JVBERi0xLjcKJeLjz9MK';

const storedPdf = (): StoredResume => ({
  name: 'Ada-Lovelace-Resume.pdf',
  type: 'application/pdf',
  size: 15,
  dataUrl: `data:application/pdf;base64,${PDF_BASE64}`,
  updatedAt: 1_800_000_000_000,
});

/** Reads a file's bytes back out, the way a job site's uploader would. */
function bytesOf(file: File): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Array.from(new Uint8Array(reader.result as ArrayBuffer)));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resumeToFile', () => {
  it('turns a stored PDF back into the original bytes, not into base64 text', async () => {
    const file = resumeToFile(storedPdf());

    expect(file.name).toBe('Ada-Lovelace-Resume.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(15);
    const bytes = await bytesOf(file);
    expect(bytes).toEqual(PDF_BYTES);
    // Ashby's uploader rejects a résumé whose first bytes read "JVBERi" (a PDF still in base64).
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF');
  });

  it('decodes in place, without asking the network layer for the data URL', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => undefined);

    resumeToFile(storedPdf());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it.each<[string, StoredResume]>([
    ['a web address where the data should be', { ...storedPdf(), dataUrl: 'https://collector.example/r.pdf' }],
    ['a file of a type that is not a résumé', { ...storedPdf(), type: 'text/html', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }],
    ['data of another type than it claims', { ...storedPdf(), dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }],
    ['base64 that is damaged', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JVBERi0xLjcKJeLjz9M' }],
  ])('refuses %s instead of building a file from it', (_name, resume) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));

    expect(() => resumeToFile(resume)).toThrow('The saved résumé cannot be used');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('isStoredResume', () => {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  it.each<[string, unknown]>([
    ['a stored PDF', storedPdf()],
    ['a Word .doc', { ...storedPdf(), name: 'Ada.doc', type: 'application/msword', dataUrl: 'data:application/msword;base64,JVBERg==' }],
    ['a Word .docx', { ...storedPdf(), name: 'Ada.docx', type: DOCX, dataUrl: `data:${DOCX};base64,JVBERg==` }],
    ['an RTF file', { ...storedPdf(), name: 'Ada.rtf', type: 'application/rtf', dataUrl: 'data:application/rtf;base64,e1xydGYxIEFkYX0=' }],
    ['an RTF file typed text/rtf', { ...storedPdf(), name: 'Ada.rtf', type: 'text/rtf', dataUrl: 'data:text/rtf;base64,e1xydGYxIEFkYX0=' }],
    ['a plain-text file', { ...storedPdf(), name: 'Ada.txt', type: 'text/plain', dataUrl: 'data:text/plain;base64,QWRhIExvdmVsYWNlCg==' }],
    ['base64 that ends in one "="', { ...storedPdf(), size: 5, dataUrl: 'data:application/pdf;base64,JVBERi0=' }],
    ['base64 that ends in "=="', { ...storedPdf(), size: 4, dataUrl: 'data:application/pdf;base64,JVBERg==' }],
    ['a size of exactly 4 MiB', { ...storedPdf(), size: 4_194_304 }],
    // 5,592,406 characters and "==" decode to 4,194,304 bytes: exactly 4 MiB.
    ['data that decodes to exactly 4 MiB', { ...storedPdf(), size: 4_194_304, dataUrl: `data:application/pdf;base64,${'A'.repeat(5_592_406)}==` }],
    ['a file name of 255 characters', { ...storedPdf(), name: `${'a'.repeat(251)}.pdf` }],
  ])('accepts %s', (_name, value) => {
    expect(isStoredResume(value)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a bare data URL string', 'data:application/pdf;base64,JVBERg=='],
    ['a number', 42],
    ['an array', [storedPdf()]],
    ['an empty object', {}],
    ['a résumé with no name', { type: 'application/pdf', size: 15, dataUrl: storedPdf().dataUrl, updatedAt: 1 }],
    ['a résumé with no type', { name: 'Ada.pdf', size: 15, dataUrl: storedPdf().dataUrl, updatedAt: 1 }],
    ['a résumé with no size', { name: 'Ada.pdf', type: 'application/pdf', dataUrl: storedPdf().dataUrl, updatedAt: 1 }],
    ['a résumé with no data', { name: 'Ada.pdf', type: 'application/pdf', size: 15, updatedAt: 1 }],
    ['a résumé with no date', { name: 'Ada.pdf', type: 'application/pdf', size: 15, dataUrl: storedPdf().dataUrl }],

    // Only the five résumé formats; never something a page could run or render.
    ['an HTML page', { ...storedPdf(), type: 'text/html', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }],
    ['an SVG image', { ...storedPdf(), type: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }],
    ['a PNG image', { ...storedPdf(), type: 'image/png', dataUrl: 'data:image/png;base64,JVBERg==' }],
    ['a zip archive', { ...storedPdf(), type: 'application/zip', dataUrl: 'data:application/zip;base64,JVBERg==' }],
    ['an unnamed type', { ...storedPdf(), type: '', dataUrl: 'data:;base64,JVBERg==' }],
    ['a type that is not a string', { ...storedPdf(), type: null }],

    // The data must be a base64 data: URL of that same type and nothing else.
    ['a web address instead of data', { ...storedPdf(), dataUrl: 'https://collector.example/r.pdf' }],
    ['a script address', { ...storedPdf(), dataUrl: 'javascript:alert(1)' }],
    ['a local file address', { ...storedPdf(), dataUrl: 'file:///Users/ada/Ada-Lovelace-Resume.pdf' }],
    ['a blob address', { ...storedPdf(), dataUrl: 'blob:https://example.com/0b4e7c1e' }],
    ['data of another type than it claims', { ...storedPdf(), dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }],
    ['a data URL that is not base64', { ...storedPdf(), dataUrl: 'data:application/pdf,%25PDF-1.7' }],
    ['a data URL with an extra parameter', { ...storedPdf(), dataUrl: 'data:application/pdf;charset=utf-8;base64,JVBERg==' }],
    ['a data URL with no data', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,' }],
    ['a data URL in capitals', { ...storedPdf(), dataUrl: 'DATA:APPLICATION/PDF;BASE64,JVBERg==' }],
    ['a data URL after a space', { ...storedPdf(), dataUrl: ' data:application/pdf;base64,JVBERg==' }],
    ['base64 with a space in it', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JVBE Rg==' }],
    ['base64 with a line break in it', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JVBE\nRg==' }],
    ['base64 in the URL-safe alphabet', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JVBE-_==' }],
    ['base64 cut short', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JVBERg=' }],
    ['base64 with "=" in the middle', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JV==ERg=' }],
    ['base64 with three "="', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JVBERi0xL===' }],
    ['base64 followed by a fragment', { ...storedPdf(), dataUrl: 'data:application/pdf;base64,JVBERg==#x' }],
    ['data that is not a string', { ...storedPdf(), dataUrl: null }],

    // 4 MiB is the limit, both for the size on record and for the bytes really stored.
    ['a size one byte over 4 MiB', { ...storedPdf(), size: 4_194_305 }],
    ['a negative size', { ...storedPdf(), size: -15 }],
    ['a fractional size', { ...storedPdf(), size: 14.5 }],
    ['a size that is not a number', { ...storedPdf(), size: '15' }],
    ['a size of NaN', { ...storedPdf(), size: Number.NaN }],
    // 5,592,407 characters and "=" decode to 4,194,305 bytes: one over, whatever `size` says.
    ['data one byte over 4 MiB behind a small size', { ...storedPdf(), dataUrl: `data:application/pdf;base64,${'A'.repeat(5_592_407)}=` }],

    // A name, not a path.
    ['an empty name', { ...storedPdf(), name: '' }],
    ['a name with a folder', { ...storedPdf(), name: 'resumes/Ada-Lovelace-Resume.pdf' }],
    ['a name that climbs out of a folder', { ...storedPdf(), name: '..\\Ada-Lovelace-Resume.pdf' }],
    ['a Windows path', { ...storedPdf(), name: 'C:\\fakepath\\Ada-Lovelace-Resume.pdf' }],
    ['a name of 256 characters', { ...storedPdf(), name: `${'a'.repeat(252)}.pdf` }],
    ['a name that is not a string', { ...storedPdf(), name: 7 }],

    ['a date that is not a number', { ...storedPdf(), updatedAt: '2026-11-09' }],
    ['a date of NaN', { ...storedPdf(), updatedAt: Number.NaN }],
    ['an infinite date', { ...storedPdf(), updatedAt: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_name, value) => {
    expect(isStoredResume(value)).toBe(false);
  });
});

describe('acceptsFile', () => {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const GREENHOUSE = '.pdf,.doc,.docx,.txt,.rtf'; // accept of input#resume on job-boards.greenhouse.io

  // [accept list of the file input, résumé name, résumé type]
  it.each<[string, string, string]>([
    // No list (Lever's résumé input has no accept attribute) means any file.
    ['', 'Ada.pdf', 'application/pdf'],
    ['   ', 'Ada.docx', DOCX],
    [' , ', 'Ada.txt', 'text/plain'],
    // By extension.
    [GREENHOUSE, 'Ada.pdf', 'application/pdf'],
    [GREENHOUSE, 'Ada.doc', 'application/msword'],
    [GREENHOUSE, 'Ada.docx', DOCX],
    [GREENHOUSE, 'Ada.txt', 'text/plain'],
    [GREENHOUSE, 'Ada.rtf', 'application/rtf'],
    ['.pdf, .doc, .docx', 'Ada.docx', DOCX],
    ['.PDF', 'Ada.pdf', 'application/pdf'],
    ['.pdf', 'ADA LOVELACE CV.PDF', 'application/pdf'],
    // By MIME type.
    ['application/pdf', 'Ada.pdf', 'application/pdf'],
    ['Application/PDF', 'Ada.pdf', 'application/pdf'],
    [`application/pdf,application/msword,${DOCX}`, 'Ada.docx', DOCX],
    ['image/*,application/pdf', 'Ada.pdf', 'application/pdf'],
    // By wildcard.
    ['application/*', 'Ada.docx', DOCX],
    ['text/*', 'Ada.txt', 'text/plain'],
    ['text/*', 'Ada.rtf', 'text/rtf'],
    ['*/*', 'Ada.pdf', 'application/pdf'],
    // One matching entry is enough.
    ['image/*,.pdf', 'Ada.pdf', 'application/pdf'],
  ])('accept="%s" takes %s (%s)', (accept, name, type) => {
    expect(acceptsFile(accept, { name, type, size: 15 })).toBe(true);
  });

  it.each<[string, string, string]>([
    // Another extension, however similar.
    ['.pdf', 'Ada.docx', DOCX],
    ['.doc', 'Ada.docx', DOCX],
    ['.docx', 'Ada.doc', 'application/msword'],
    ['.pd', 'Ada.pdf', 'application/pdf'],
    ['.png,.jpg,.jpeg', 'Ada.pdf', 'application/pdf'],
    // Another MIME type.
    ['application/pdf', 'Ada.docx', DOCX],
    ['application/msword', 'Ada.docx', DOCX],
    ['image/png, image/jpeg', 'Ada.pdf', 'application/pdf'],
    // A wildcard for another family: a profile-photo input must not get the résumé.
    ['image/*', 'Ada.pdf', 'application/pdf'],
    ['audio/*,video/*', 'Ada.pdf', 'application/pdf'],
    ['text/*', 'Ada.pdf', 'application/pdf'],
    ['application/*', 'Ada.txt', 'text/plain'],
    ['app/*', 'Ada.pdf', 'application/pdf'],
    // Entries that are not valid accept syntax match nothing.
    ['pdf', 'Ada.pdf', 'application/pdf'],
    ['*.pdf', 'Ada.pdf', 'application/pdf'],
    ['*', 'Ada.pdf', 'application/pdf'],
  ])('accept="%s" refuses %s (%s)', (accept, name, type) => {
    expect(acceptsFile(accept, { name, type, size: 15 })).toBe(false);
  });
});

describe('ACCEPTED_RESUME_TYPES', () => {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const acceptList = (): string => ACCEPTED_RESUME_TYPES.join(',');

  // Used as the accept list of the options page's own file picker.
  it.each<[string, string]>([
    // Each format by its extension alone…
    ['Ada.pdf', ''],
    ['Ada.doc', ''],
    ['Ada.docx', ''],
    ['Ada.rtf', ''],
    ['Ada.txt', ''],
    // …and by its MIME type alone.
    ['Ada', 'application/pdf'],
    ['Ada', 'application/msword'],
    ['Ada', DOCX],
    ['Ada', 'application/rtf'],
    ['Ada', 'text/rtf'],
    ['Ada', 'text/plain'],
  ])('lets %s (%s) through', (name, type) => {
    expect(acceptsFile(acceptList(), { name, type, size: 15 })).toBe(true);
  });

  it.each<[string, string]>([
    ['headshot.png', 'image/png'],
    ['resume.html', 'text/html'],
    ['resume.zip', 'application/zip'],
    ['Ada-Lovelace.pages', 'application/vnd.apple.pages'],
    ['Ada', ''],
  ])('keeps %s (%s) out', (name, type) => {
    expect(acceptsFile(acceptList(), { name, type, size: 15 })).toBe(false);
  });
});

describe('fileToStoredResume', () => {
  const NOW = 1_800_000_000_000;
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const fileNamed = (name: string, type: string, bytes: number[] = PDF_BYTES): File =>
    new File([new Uint8Array(bytes)], name, { type });

  it('keeps the name, type, size and bytes of a PDF, and the time it was saved', async () => {
    const stored = await fileToStoredResume(fileNamed('Ada-Lovelace-Resume.pdf', 'application/pdf'), NOW);

    expect(stored).toEqual({
      name: 'Ada-Lovelace-Resume.pdf',
      type: 'application/pdf',
      size: 15,
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjcKJeLjz9MK',
      updatedAt: 1_800_000_000_000,
    });
  });

  // [file name, type the browser reports, type that is stored]
  it.each<[string, string, string]>([
    ['Ada.pdf', 'application/pdf', 'application/pdf'],
    ['Ada.doc', 'application/msword', 'application/msword'],
    ['Ada.docx', DOCX, DOCX],
    ['Ada.rtf', 'application/rtf', 'application/rtf'],
    ['Ada.rtf', 'text/rtf', 'text/rtf'],
    ['Ada.txt', 'text/plain', 'text/plain'],
    ['ADA LOVELACE CV.PDF', 'application/pdf', 'application/pdf'],
    ['Ada.Lovelace.2026.docx', DOCX, DOCX],
    // The browser did not recognise the file: the extension decides.
    ['Ada.pdf', '', 'application/pdf'],
    ['Ada.doc', '', 'application/msword'],
    ['Ada.docx', '', DOCX],
    ['Ada.rtf', '', 'application/rtf'],
    ['Ada.txt', '', 'text/plain'],
    // The browser reported the type of a different format: the extension still decides.
    ['Ada.rtf', 'application/msword', 'application/rtf'],
    ['Ada.pdf', 'application/octet-stream', 'application/pdf'],
  ])('accepts %s reported as "%s" and stores it as %s', async (name, reportedType, storedType) => {
    const stored = await fileToStoredResume(fileNamed(name, reportedType), NOW);

    expect(stored).toEqual({
      name,
      type: storedType,
      size: 15,
      dataUrl: `data:${storedType};base64,JVBERi0xLjcKJeLjz9MK`,
      updatedAt: 1_800_000_000_000,
    });
    expect(isStoredResume(stored)).toBe(true);
  });

  // [file name, type the browser reports]
  it.each<[string, string]>([
    ['headshot.png', 'image/png'],
    ['Ada-Lovelace.pages', 'application/vnd.apple.pages'],
    ['Ada-Lovelace.odt', 'application/vnd.oasis.opendocument.text'],
    ['resume.html', 'text/html'],
    ['resume.md', 'text/markdown'],
    ['resume.zip', 'application/zip'],
    ['resume.pdf.exe', 'application/x-msdownload'],
    // A résumé type is not enough: job sites check the extension.
    ['resume', 'application/pdf'],
    ['resume.', 'application/pdf'],
    ['notes.text', 'text/plain'],
    ['resume.dot', 'application/msword'],
    ['pdf', ''],
    ['resume', ''],
  ])('turns down %s reported as "%s"', async (name, reportedType) => {
    const saving = fileToStoredResume(fileNamed(name, reportedType), NOW);

    await expect(saving).rejects.toBeInstanceOf(Error);
    await expect(saving).rejects.toThrow('Use a PDF, Word (.doc or .docx), RTF or plain-text (.txt) file');
  });

  it('accepts a file of exactly 4 MiB', async () => {
    const file = new File([new Uint8Array(4_194_304)], 'Ada-Lovelace-Resume.pdf', { type: 'application/pdf' });

    const stored = await fileToStoredResume(file, NOW);

    expect(stored.size).toBe(4_194_304);
    expect(isStoredResume(stored)).toBe(true);
  });

  it('turns down a file one byte over 4 MiB', async () => {
    const file = new File([new Uint8Array(4_194_305)], 'Ada-Lovelace-Resume.pdf', { type: 'application/pdf' });

    const saving = fileToStoredResume(file, NOW);

    await expect(saving).rejects.toBeInstanceOf(Error);
    await expect(saving).rejects.toThrow('larger than 4 MB');
  });

  it('turns down an empty file', async () => {
    const saving = fileToStoredResume(fileNamed('Ada-Lovelace-Resume.pdf', 'application/pdf', []), NOW);

    await expect(saving).rejects.toBeInstanceOf(Error);
    await expect(saving).rejects.toThrow('is empty');
  });

  it.each<[string, string]>([
    ['C:\\fakepath\\Ada-Lovelace-Resume.pdf', 'Ada-Lovelace-Resume.pdf'],
    ['resumes/2026/Ada-Lovelace-Resume.pdf', 'Ada-Lovelace-Resume.pdf'],
    ['../../Ada-Lovelace-Resume.pdf', 'Ada-Lovelace-Resume.pdf'],
    ['  Ada-Lovelace-Resume.pdf ', 'Ada-Lovelace-Resume.pdf'],
  ])('reduces the name "%s" to "%s"', async (given, wanted) => {
    const stored = await fileToStoredResume(fileNamed(given, 'application/pdf'), NOW);

    expect(stored.name).toBe(wanted);
  });

  it('explains in plain words when the file cannot be read', async () => {
    // Stands in for a file that vanished or lost its permissions after it was chosen.
    const unreadable = { name: 'Ada-Lovelace-Resume.pdf', type: 'application/pdf', size: 15 } as File;

    const saving = fileToStoredResume(unreadable, NOW);

    await expect(saving).rejects.toBeInstanceOf(Error);
    await expect(saving).rejects.toThrow('could not be read');
  });

  it('never saves something that would be refused when it is loaded again', async () => {
    // No real file has a name this long; it stands for anything the loader's check would catch.
    const file = fileNamed(`${'a'.repeat(300)}.pdf`, 'application/pdf');

    const saving = fileToStoredResume(file, NOW);

    await expect(saving).rejects.toBeInstanceOf(Error);
    await expect(saving).rejects.toThrow('could not be read');
  });

  it('gives back the same file when the stored résumé is attached later', async () => {
    const stored = await fileToStoredResume(fileNamed('Ada-Lovelace-Resume.pdf', 'application/pdf'), NOW);

    const file = resumeToFile(stored);

    expect(file.name).toBe('Ada-Lovelace-Resume.pdf');
    expect(file.type).toBe('application/pdf');
    expect(await bytesOf(file)).toEqual(PDF_BYTES);
  });
});
