/** XML 1.0 permits tabs/newlines and Unicode scalar values, never controls or lone surrogates. */
export const xml = (value: unknown): string => String(value ?? '').replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const run = (text: unknown, properties = '') => `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}${String(text ?? '').split(/\r\n|\r|\n/).map(part => `<w:t xml:space="preserve">${xml(part)}</w:t>`).join('<w:br/>')}</w:r>`;
export const paragraph = (content: string, properties = '', attributes = '') => `<w:p${attributes}>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${content}</w:p>`;
export const relation = (id: string, type: string, target: string, external = false) => `<Relationship Id="${xml(id)}" Type="${relationshipNamespace}/${xml(type)}" Target="${xml(target)}"${external ? ' TargetMode="External"' : ''}/>`;
export const relationshipsXml = (entries: string[]) => `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.join('')}</Relationships>`;
