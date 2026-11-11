import { strToU8, zipSync } from 'fflate';
import { safeResumeLink } from './model';
import type { ResumeContact, ResumeDocument, ResumeEntry } from './types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml = (text: string): string => String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Editable OOXML only: no macros, remote resources, network or AI calls. */
export function createResumeDocx(document: ResumeDocument): Uint8Array {
  const professional = document.template === 'professional';
  const bodySize = professional ? 21 : 18;
  const lineSpacing = professional ? 293 : 216;
  const relationships: { id: string; href: string }[] = [];
  const run = (text: string, properties = ''): string => `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}${String(text).split('\t').map((part, index) => `${index ? '<w:tab/>' : ''}<w:t xml:space="preserve">${xml(part)}</w:t>`).join('')}</w:r>`;
  const hyperlink = (item: ResumeContact, properties = ''): string => {
    const href = item.href && safeResumeLink(item.href);
    if (!href) return run(item.text, properties);
    const id = `rIdLink${relationships.length + 1}`; relationships.push({ id, href });
    return `<w:hyperlink r:id="${id}" w:history="1">${run(item.text, `${properties}<w:color w:val="000000"/><w:u w:val="single"/>`)}</w:hyperlink>`;
  };
  const inline = (text: string): string => {
    let result = ''; let last = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const index = match.index!; const value = match[0].replace(/[),;.!]+$/, ''); const href = safeResumeLink(value);
      if (!href) continue;
      result += run(text.slice(last, index)) + hyperlink({ text: value, href }); last = index + value.length;
    }
    return result + run(text.slice(last));
  };
  const paragraph = (content: string, properties = ''): string => `<w:p><w:pPr>${properties}<w:spacing w:after="${professional ? 60 : 0}" w:line="${lineSpacing}" w:lineRule="auto"/></w:pPr>${content}</w:p>`;
  const entry = (item: ResumeEntry, bullets = true): string => {
    let result = '';
    if (item.heading || item.detail || item.date || item.link) {
      let heading = run(item.heading, '<w:b/>');
      if (item.detail) heading += run(`${item.heading ? ' | ' : ''}${item.detail}`, '<w:b/>');
      if (item.link) heading += run(item.heading || item.detail ? ' | ' : '') + hyperlink(item.link);
      if (item.date) heading += run(`\t${item.date}`, '<w:b/>');
      result += paragraph(heading, '<w:keepNext/><w:tabs><w:tab w:val="right" w:pos="10656"/></w:tabs>');
    }
    for (const line of item.lines) {
      if (!line.trim()) continue;
      const text = !bullets || /^\s*[•*\-–—]\s/.test(line) ? line : `• ${line}`;
      result += paragraph(inline(text), bullets ? '<w:ind w:left="317" w:hanging="230"/>' : '');
    }
    return result;
  };
  const contactProperties = professional ? '<w:sz w:val="18"/><w:szCs w:val="18"/>' : '<w:i/><w:sz w:val="19"/><w:szCs w:val="19"/>';
  const contactContent = document.contact.map((item, index) => `${index ? run(' | ', contactProperties) : ''}${hyperlink(item, contactProperties)}`).join('');
  const header = `<w:tbl><w:tblPr><w:tblW w:w="10656" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="${professional ? 'single' : 'nil'}" w:sz="12" w:color="304C60"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4176"/><w:gridCol w:w="6480"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="4176" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${paragraph(run(document.name, professional ? '<w:b/><w:color w:val="20394C"/><w:sz w:val="52"/><w:szCs w:val="52"/>' : '<w:b/><w:sz w:val="48"/><w:szCs w:val="48"/>'), '<w:keepNext/>')}</w:tc><w:tc><w:tcPr><w:tcW w:w="6480" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${paragraph(contactContent, '<w:jc w:val="right"/><w:keepNext/>')}</w:tc></w:tr></w:tbl>`;
  const body = document.sections.map(section => `<w:p><w:pPr><w:keepNext/><w:spacing w:before="${professional ? 160 : 80}" w:after="${professional ? 80 : 20}"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr></w:pPr>${run(professional ? section.title.toUpperCase() : section.title, `<w:b/><w:sz w:val="22"/><w:szCs w:val="22"/>${professional ? '<w:color w:val="304C60"/>' : ''}`)}</w:p>${section.entries.map(item => entry(item, section.key !== 'summary')).join('')}`).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${header}${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="504" w:right="792" w:bottom="432" w:left="792" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:space="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="000000"/><w:sz w:val="${bodySize}"/><w:szCs w:val="${bodySize}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${professional ? 60 : 0}" w:line="${lineSpacing}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="${R}/settings" Target="settings.xml"/>${relationships.map(link => `<Relationship Id="${link.id}" Type="${R}/hyperlink" Target="${xml(link.href)}" TargetMode="External"/>`).join('')}</Relationships>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>'),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(styles),
    'word/settings.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`),
    'word/_rels/document.xml.rels': strToU8(docRels),
  };
  return zipSync(files, { level: 6 });
}
