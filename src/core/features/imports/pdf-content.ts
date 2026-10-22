import { pdfFontDecoder } from './pdf-fonts';
import { PdfDocument, PdfReader, array, binary, isDict, limit, name, number, string, type PdfDict, type PdfValue } from './pdf-objects';

export interface PdfRun { text: string; x: number; y: number; size: number; mcid?: number; tag?: string; image?: PdfDict; stream: PdfDict; artifact: boolean; order: number }
interface Mark { mcid?: number; tag: string; actual?: string; emitted?: boolean }
/** Interpret text/marked-content/image operators without evaluating actions or fetching resources. */
export function pdfPageRuns(document: PdfDocument, page: PdfDict): PdfRun[] {
  const runs: PdfRun[] = []; let order = 0; const activeForms = new Set<PdfDict>();
  const resources = document.dict(document.inherited(page, 'Resources'));
  const visit = (contents: PdfDict, resources: PdfDict | undefined, inheritedMarks: Mark[], depth: number) => {
    if (depth > 32 || activeForms.has(contents)) { document.unsupported.add('recursive form XObject'); return; }
    activeForms.add(contents);
    const reader = new PdfReader(binary(document.decode(contents)), document.work.maximum, document.work);
    let operands: PdfValue[] = [], marks = [...inheritedMarks], fontSize = 12, x = 0, y = 0, lineX = 0, lineY = 0, leading = 0;
    let decode: (value: PdfValue) => string = value => string(value);
    const states: {fontSize:number;x:number;y:number;lineX:number;lineY:number;leading:number;decode:typeof decode}[] = [];
    const emit = (text: string, image?: PdfDict) => {
      const actualMark = [...marks].reverse().find(m => m.actual !== undefined);
      if (actualMark) { if (actualMark.emitted) return; actualMark.emitted = true; text = actualMark.actual!; }
      const mark = [...marks].reverse().find(m => m.mcid !== undefined) ?? marks.at(-1);
      if (!text && !image) return;
      runs.push({ text, x, y, size: fontSize, mcid: mark?.mcid, tag: mark?.tag, image, stream: contents, artifact: marks.some(mark => mark.tag === 'Artifact'), order: order++ });
      if (runs.length > document.limits.maximumEntries * 10) limit('drawing operation count exceeds the import limit');
      x += text.length * fontSize * 0.5;
    };
    while (reader.position < reader.text.length) {
      reader.skip(); if (reader.position >= reader.text.length) break;
      const c = reader.text[reader.position]!;
      if (/[\d+\-.\[(/<]/.test(c)) { operands.push(reader.read()); if (operands.length > document.limits.maximumEntries) limit('content operands exceed the import limit'); continue; }
      if (++document.work.used > document.work.maximum) limit('content operation count exceeds the import limit');
      const operator = reader.word(); if (!operator) { reader.position++; continue; }
      const n = (i: number, fallback = 0) => number(operands[i], fallback);
      if (operator === 'q') { if (states.length >= 64) limit('graphics state nesting exceeds the import limit'); states.push({fontSize,x,y,lineX,lineY,leading,decode}); }
      else if (operator === 'Q') { const state = states.pop(); if (state) ({fontSize,x,y,lineX,lineY,leading,decode} = state); }
      else if (operator === 'BT') { x = y = lineX = lineY = 0; }
      else if (operator === 'Tf') { fontSize = n(1, 12); const fonts = document.dict(resources?.Font); decode = pdfFontDecoder(document, document.dict(fonts?.[name(operands[0])])); }
      else if (operator === 'Tm') { x = lineX = n(4); y = lineY = n(5); }
      else if (operator === 'Td' || operator === 'TD') { x = lineX += n(0); y = lineY += n(1); if (operator === 'TD') leading = -n(1); }
      else if (operator === 'TL') leading = n(0);
      else if (operator === 'T*') { x = lineX; y = lineY -= leading; }
      else if (operator === 'Tj') emit(decode(operands[0] ?? null));
      else if (operator === 'TJ') {
        let text = ''; for (const part of array(operands[0])) text += typeof part === 'number' ? part < -100 && !text.endsWith(' ') ? ' ' : '' : decode(part);
        emit(text);
      } else if (operator === "'" || operator === '"') { x = lineX; y = lineY -= leading; emit(decode(operands.at(-1) ?? null)); }
      else if (operator === 'BDC' || operator === 'BMC') {
        let properties: PdfValue | undefined = operands[1]; if (name(properties)) properties = document.dict(resources?.Properties)?.[name(properties)];
        const dict = document.dict(properties);
        marks.push({ tag: name(operands[0]), mcid: typeof dict?.MCID === 'number' ? dict.MCID : undefined, actual: dict?.ActualText ? string(document.resolve(dict.ActualText)) : undefined });
        if (marks.length > 64) limit('marked content nesting exceeds the import limit');
      } else if (operator === 'EMC') marks.pop();
      else if (operator === 'Do') {
        const objects = document.dict(resources?.XObject), object = document.dict(objects?.[name(operands[0])]);
        if (object && name(object.Subtype) === 'Image') emit('', object);
        else if (object && name(object.Subtype) === 'Form') visit(object, document.dict(object.Resources) ?? resources, marks, depth + 1);
      } else if (operator === 'BI') { document.unsupported.add('inline image'); break; }
      else if (operator === 'Tr' && n(0) !== 0) document.unsupported.add('text rendering mode');
      else if (['S','s','f','F','f*','B','B*','b','b*','sh'].includes(operator)) document.unsupported.add('vector artwork');
      operands = [];
    }
    activeForms.delete(contents);
  };
  for (const value of array(document.resolve(page.Contents))) { const contents = document.dict(value); if (contents) visit(contents, resources, [], 0); }
  return runs;
}

export function pdfLinkAnnotations(document: PdfDocument, page: PdfDict): { href: string; rect: number[]; contents: string; internal: boolean }[] {
  const annotations: { href: string; rect: number[]; contents: string; internal: boolean }[] = [];
  for (const value of array(document.resolve(page.Annots))) {
    const annotation = document.dict(value); if (!annotation) continue;
    if (name(annotation.Subtype) !== 'Link') { document.unsupported.add(`annotation ${name(annotation.Subtype) || 'unknown'}`); continue; }
    const action = document.dict(annotation.A), kind = name(action?.S);
    let href = '', internal = false;
    if (kind === 'URI') href = string(document.resolve(action?.URI));
    else if (kind === 'GoToR') { const file = document.resolve(action?.F); href = isDict(file) ? string(file.UF) || string(file.F) : string(file); }
    else if (kind === 'GoTo' || annotation.Dest) { href = '#'; internal = true; }
    else { document.unsupported.add(`link action ${kind || 'unknown'}`); continue; }
    annotations.push({ href, rect: array(document.resolve(annotation.Rect)).map(v => number(v)), contents: string(document.resolve(annotation.Contents)), internal });
  }
  return annotations;
}
