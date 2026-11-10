/**
 * The résumé file: turning the user's file into something that fits in
 * extension storage (a base64 data URL), and turning that back into a real
 * file when it is attached to an application.
 */
import type { FileToStoredResume, ResumeMeta, ResumeToFile, StoredResume } from './types';

/** The largest résumé we keep: 4 MiB, measured on the file itself, not on its base64 text (which is a third longer). */
export const MAX_RESUME_BYTES = 4 * 1024 * 1024;

interface ResumeFormat {
  /** As job sites write it in an accept list: lower case, with the dot. */
  extension: string;
  /** What browsers call this format. The first one is used when the browser's answer is no help. */
  mimeTypes: readonly [string, ...string[]];
}

/** The five formats job sites take as a résumé (Greenhouse: accept=".pdf,.doc,.docx,.txt,.rtf"). */
const RESUME_FORMATS: readonly ResumeFormat[] = [
  { extension: '.pdf', mimeTypes: ['application/pdf'] },
  { extension: '.doc', mimeTypes: ['application/msword'] },
  { extension: '.docx', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { extension: '.rtf', mimeTypes: ['application/rtf', 'text/rtf'] },
  { extension: '.txt', mimeTypes: ['text/plain'] },
];

const RESUME_EXTENSIONS: readonly string[] = RESUME_FORMATS.map((format) => format.extension);
const RESUME_MIME_TYPES: readonly string[] = RESUME_FORMATS.flatMap((format) => format.mimeTypes);

/**
 * Every extension and MIME type a résumé may have, in the words of a file
 * input's `accept` attribute: `ACCEPTED_RESUME_TYPES.join(',')` is the accept
 * list for the options page's own file picker.
 */
export const ACCEPTED_RESUME_TYPES: readonly string[] = [...RESUME_EXTENSIONS, ...RESUME_MIME_TYPES];

/** File systems stop at 255; a longer "name" did not come from a real file. */
const MAX_NAME_LENGTH = 255;

/** Standard base64: letters, digits, + and /, with at most two "=" at the very end. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function isBase64(text: string): boolean {
  return text.length % 4 === 0 && BASE64.test(text);
}

/** How many bytes a base64 text stands for: three per group of four characters, less one per "=". */
function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

/** A file name with no folder in front of it, in either slash style. */
function isBaseName(name: string): boolean {
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH && !/[\\/]/.test(name);
}

/** "Ada.pdf" for "C:\fakepath\Ada.pdf" or "resumes/Ada.pdf". */
function baseName(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return path.slice(lastSlash + 1).trim();
}

/** ".pdf" for "Ada.Lovelace.PDF"; '' for a name with no dot. */
function extensionOf(name: string): string {
  const lastDot = name.lastIndexOf('.');
  return lastDot === -1 ? '' : name.slice(lastDot).toLowerCase();
}

/**
 * True when a value (from storage, or from anywhere else we do not control) is
 * a résumé that is safe to use: one of the allowed types, within the size
 * limit, and holding its bytes inline and nowhere else.
 */
export function isStoredResume(value: unknown): value is StoredResume {
  if (typeof value !== 'object' || value === null) return false;
  const { name, type, size, dataUrl, updatedAt } = value as Record<string, unknown>;

  if (typeof name !== 'string' || !isBaseName(name)) return false;
  if (typeof type !== 'string' || !RESUME_MIME_TYPES.includes(type)) return false;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 0 || size > MAX_RESUME_BYTES) return false;
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return false;
  if (typeof dataUrl !== 'string') return false;

  // The one shape allowed is "data:<that type>;base64,<data>". Anything else,
  // such as "https://collector.example/r.pdf", is an address, not a file.
  const prefix = `data:${type};base64,`;
  if (!dataUrl.startsWith(prefix)) return false;
  const base64 = dataUrl.slice(prefix.length);
  // `size` is only a label; the limit has to hold for the bytes really stored.
  return base64ByteLength(base64) <= MAX_RESUME_BYTES && isBase64(base64);
}

/**
 * Would a file input with this `accept` attribute take the file? Used before
 * attaching, so that a résumé is never pushed into a photo upload.
 *
 * An accept list is comma-separated, and each entry is an extension (".pdf"),
 * a MIME type ("application/pdf") or a family of types ("application/*").
 */
export function acceptsFile(accept: string, file: ResumeMeta): boolean {
  const entries = accept
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
  // No list at all means any file: Lever's résumé input has no accept attribute.
  if (entries.length === 0) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return entries.some((entry) => {
    if (entry.startsWith('.')) return name.endsWith(entry);
    // "application/*" covers every type that begins "application/".
    if (entry.endsWith('/*')) return entry === '*/*' || type.startsWith(entry.slice(0, -1));
    return type === entry;
  });
}

/** Reads a file's bytes as base64 text. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // The reader answers "data:<type>;base64,<data>"; the data follows the first comma.
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const UNREADABLE = 'That file could not be read. Try choosing it again.';

/**
 * Prepares the file the user chose on the options page for storage. Rejects
 * with an Error whose message can be shown to the user as it is.
 */
export const fileToStoredResume: FileToStoredResume = async (file, now) => {
  const name = baseName(file.name);

  // The extension decides, not the type the browser reports: a browser works
  // the type out from the extension anyway, and job sites check the extension.
  const format = RESUME_FORMATS.find((candidate) => candidate.extension === extensionOf(name));
  if (format === undefined) {
    throw new Error(
      `"${name}" cannot be saved as a résumé. Use a PDF, Word (.doc or .docx), RTF or plain-text (.txt) file.`,
    );
  }
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error('That file is larger than 4 MB, the most a saved résumé can be.');
  }
  if (file.size === 0) {
    throw new Error('That file is empty. Choose the file that holds your résumé.');
  }

  // Keep the browser's name for the type only when it is one we know for this
  // extension (a typeless ".rtf" becomes application/rtf).
  const type = format.mimeTypes.includes(file.type) ? file.type : format.mimeTypes[0];

  let base64: string;
  try {
    base64 = await readAsBase64(file);
  } catch {
    throw new Error(UNREADABLE);
  }
  const stored: StoredResume = { name, type, size: file.size, dataUrl: `data:${type};base64,${base64}`, updatedAt: now };
  // Whatever is saved must also be accepted when it is loaded again.
  if (!isStoredResume(stored)) {
    throw new Error(UNREADABLE);
  }
  return stored;
};

/**
 * Rebuilds the file from storage. Synchronous, and deliberately decoded by
 * hand: `fetch(dataUrl)` would be a network-style request made from the job
 * site's page, and `Buffer` only exists in Node, not in Chrome.
 */
export const resumeToFile: ResumeToFile = (resume) => {
  // Checked again here, at the last step before the bytes reach a job site:
  // a damaged résumé must fail loudly, not be attached as a broken file.
  if (!isStoredResume(resume)) {
    throw new Error('The saved résumé cannot be used. Add it again on the options page.');
  }
  const base64 = resume.dataUrl.slice(resume.dataUrl.indexOf(',') + 1);
  // atob gives one character per byte; copy their codes into real bytes.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], resume.name, { type: resume.type });
};
