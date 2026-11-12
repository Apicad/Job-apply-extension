import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Segment } from '../hackathon/contracts';
import { createResumeDocx, type ResumeDocument } from '../resume-preview';
import { boundedText, normalizeMaterialsBrief } from './request';
import type { MaterialsBrief } from './types';

const xml = (text: string): string => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** Same local black/white header and Letter geometry; ordinary 11 pt paragraphs. */
export function createCoverLetterDocx(base: ResumeDocument, briefInput: MaterialsBrief, paragraphs: readonly Segment[]): Uint8Array {
  const brief = normalizeMaterialsBrief(briefInput);
  if (paragraphs.length < 1 || paragraphs.length > 6 || !paragraphs.every(paragraph => boundedText(paragraph.text, 2000))) throw Error('The cover letter needs 1–6 bounded paragraphs.');
  const paragraph = (text: string, bold = false, before = 0): string => `<w:p><w:pPr><w:spacing w:before="${before}" w:after="120" w:line="264" w:lineRule="auto"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>${text.replace(/\r\n?/g, '\n').split('\n').map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t>`).join('')}</w:r></w:p>`;
  const target = [brief.role, brief.company].filter(Boolean).join(' — ');
  const body = (target ? paragraph(target, true, 200) : '') + paragraph('Dear hiring team,', false, target ? 0 : 200) + paragraphs.map(item => paragraph(item.text)).join('') + paragraph(`Sincerely,\n${base.name}`);
  const files = unzipSync(createResumeDocx({ ...base, sections: [] }));
  const document = strFromU8(files['word/document.xml']!);
  files['word/document.xml'] = strToU8(document.replace('</w:tbl><w:sectPr>', `</w:tbl>${body}<w:sectPr>`));
  return zipSync(files, { level: 6 });
}
