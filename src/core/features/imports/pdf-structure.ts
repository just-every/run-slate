import { pdfLinkAnnotations, type PdfRun } from './pdf-content';
import { pdfImage } from './pdf-images';
import { PdfDocument, array, isDict, limit, name, number, string, type PdfDict, type PdfValue } from './pdf-objects';
import { reportCreated, reportUnmapped } from './report';
import { importedMergedTableContent, type ImportedTableMerge } from './table-content';
import type { ImportedBlock, ImportedMedia, ImportReport } from './types';
import { safeImportLink } from './url';

export function pdfStructure(document: PdfDocument, pages: PdfDict[], pageRuns: Map<PdfDict, PdfRun[]>, id: string, report: ImportReport): { blocks: ImportedBlock[]; media: ImportedMedia[]; title?: string } {
  const blocks: ImportedBlock[] = [], media: ImportedMedia[] = [], consumed = new Set<PdfRun>();
  const markedRuns = new Map<PdfDict, Map<number, PdfRun[]>>();
  for (const [page, runs] of pageRuns) {
    const marked = new Map<number, PdfRun[]>();
    for (const run of runs) if (run.mcid !== undefined) { const group = marked.get(run.mcid) ?? []; group.push(run); marked.set(run.mcid, group); }
    markedRuns.set(page, marked);
  }
  const mediaIds = new Map<PdfDict, string>(); let index = 0, title: string | undefined;
  const make = (kind: ImportedBlock['kind'], text?: string): ImportedBlock => ({ sourceId: `${id}#block-${index++}`, sourceIdentityKind: 'path-derived', kind, text, links: [], children: [] });
  const structureWork = () => { if (++document.work.used > document.work.maximum) limit('structure complexity exceeds the import limit'); };
  const text = (runs: PdfRun[]) => {
    let result = '', prior: PdfRun | undefined;
    for (const run of runs) { structureWork(); if (run.image) continue; if (result && prior && (run.y !== prior.y || run.x - (prior.x + prior.text.length * prior.size * .5) > prior.size * .2) && !/\s$/.test(result) && !/^\s/.test(run.text)) result += ' '; result += run.text; prior = run; }
    return result.trim();
  };
  const addImage = (run: PdfRun, alt = ''): ImportedBlock | undefined => {
    if (!run.image) return;
    let mediaSourceId = mediaIds.get(run.image);
    if (!mediaSourceId) {
      const image = pdfImage(document, run.image); if (!image) return;
      mediaSourceId = `${id}:image:${media.length}`; mediaIds.set(run.image, mediaSourceId);
      const fileName = `image-${media.length + 1}.${image.extension}`;
      media.push({ sourceId: mediaSourceId, sourceIdentityKind: 'path-derived', ownerPageSourceId: id, name: fileName, mediaType: image.mediaType, bytes: image.bytes, altText: alt });
      reportCreated(report, 'file', fileName, mediaSourceId);
    }
    const block = make('media', alt); block.mediaSourceId = mediaSourceId;
    const file = media.find(file => file.sourceId === mediaSourceId)!;
    block.canonicalBlock = { id: block.sourceId, blockType: 'media', parentBlockId: null, treePosition: String(index).padStart(8, '0'), content: { kind: 'image', source: {url:`/api/media/${mediaSourceId}`,fileId:mediaSourceId,name:file.name,contentType:file.mediaType},caption:'',alt } };
    return block;
  };
  const root = document.dict(document.catalog?.StructTreeRoot), roles = document.dict(root?.RoleMap);
  const visited = new Set<PdfDict>();
  const runsFor = (value: PdfValue | undefined, inheritedPage?: PdfDict, depth = 0): PdfRun[] => {
    structureWork();
    if (depth > 64) { document.unsupported.add('deep structure tree'); return []; }
    const resolved = document.resolve(value);
    if (typeof resolved === 'number') return inheritedPage ? markedRuns.get(inheritedPage)?.get(resolved) ?? [] : [];
    if (Array.isArray(resolved)) return resolved.flatMap(child => runsFor(child, inheritedPage, depth + 1));
    if (!isDict(resolved)) return [];
    const page = document.dict(resolved.Pg) ?? inheritedPage;
    if (name(resolved.Type) === 'MCR' || typeof resolved.MCID === 'number') return (page ? markedRuns.get(page)?.get(number(resolved.MCID)) ?? [] : []).filter(run => !resolved.Stm || run.stream === document.dict(resolved.Stm));
    return runsFor(resolved.K, page, depth + 1);
  };
  const role = (dict: PdfDict) => name(document.resolve(roles?.[name(dict.S)])) || name(dict.S);
  const children = (dict: PdfDict) => array(document.resolve(dict.K)).map(value => document.dict(value)).filter((v): v is PdfDict => !!v);
  const visit = (value: PdfValue | undefined, inheritedPage?: PdfDict, depth = 0) => {
    structureWork();
    const resolved = document.resolve(value);
    if (Array.isArray(resolved)) { for (const item of resolved) visit(item, inheritedPage, depth + 1); return; }
    if (!isDict(resolved)) return;
    if (depth > 64 || visited.has(resolved)) { document.unsupported.add('cyclic or deep structure tree'); return; } visited.add(resolved);
    const page = document.dict(resolved.Pg) ?? inheritedPage, kind = role(resolved), runs = runsFor(resolved.K, page), body = string(document.resolve(resolved.ActualText)) || text(runs);
    if (kind === 'Table') {
      const rows: PdfDict[][] = [];
      const collect = (node: PdfDict, nesting: number) => { structureWork(); if (nesting > 64) return; if (role(node) === 'TR') rows.push(children(node).filter(c => ['TH','TD'].includes(role(c)))); else for (const child of children(node)) collect(child, nesting + 1); };
      collect(resolved, 0);
      if (rows.length) {
        const values: string[][] = [], merges: ImportedTableMerge[] = []; const occupied = new Set<string>();
        rows.forEach((cells, r) => {
          values[r] ??= []; let c = 0;
          for (const cell of cells) {
            while (occupied.has(`${r}:${c}`)) c++;
            const attributes = array(document.resolve(cell.A)).map(v => document.dict(v)).find(v => name(v?.O) === 'Table');
            const rowSpan = number(document.resolve(attributes?.RowSpan), 1), colSpan = number(document.resolve(attributes?.ColSpan), 1);
            if (!Number.isInteger(rowSpan) || !Number.isInteger(colSpan) || rowSpan < 1 || colSpan < 1 || rowSpan > rows.length - r || colSpan > document.limits.maximumEntries) { document.unsupported.add('invalid tagged table cell span'); continue; }
            if (occupied.size + rowSpan * colSpan > document.limits.maximumEntries) limit('table grid exceeds the import limit');
            values[r]![c] = string(document.resolve(cell.ActualText)) || text(runsFor(cell.K, document.dict(cell.Pg) ?? page));
            if (rowSpan > 1 || colSpan > 1) merges.push({row:r,column:c,rowSpan,colSpan});
            for (let y=r; y<r+rowSpan; y++) for (let x=c; x<c+colSpan; x++) occupied.add(`${y}:${x}`);
            c += colSpan;
          }
        });
        const width = Math.max(1, ...values.map(row => row.length)); if (width * values.length > document.limits.maximumEntries) limit('table grid exceeds the import limit'); const rectangular = values.map(row => Array.from({length:width}, (_, c) => row[c] ?? ''));
        const block = make('table'); block.rows = rectangular;
        const header = rows[0]!.every(cell => role(cell) === 'TH') && !merges.some(m => m.row === 0) ? 1 : 0;
        block.canonicalBlock = {id:block.sourceId,blockType:'table',content:importedMergedTableContent(rectangular,block.sourceId,merges,header),parentBlockId:null,treePosition:String(index).padStart(8,'0')};
        blocks.push(block); for (const run of runs) { consumed.add(run); const image = addImage(run); if (image) blocks.push(image); } return;
      }
    }
    if (/^H[1-6]$/.test(kind) || kind === 'H' || kind === 'Title' || ['P','BlockQuote','LI','LBody','Caption'].includes(kind)) {
      // Container list items defer to their body children to avoid duplicate text.
      if (kind === 'LI' && children(resolved).some(c => role(c) === 'LBody')) { visit(resolved.K, page, depth + 1); return; }
      const block = make(/^H[1-6]$/.test(kind) || kind === 'H' || kind === 'Title' ? 'heading' : kind === 'BlockQuote' ? 'quote' : kind === 'LBody' || kind === 'LI' ? 'bulleted-list' : 'paragraph', body);
      if (block.kind === 'heading') block.level = /^H[1-6]$/.test(kind) ? Number(kind[1]) : 1;
      if (kind === 'Title' && body) title = body;
      if (body) blocks.push(block);
      for (const run of runs) { consumed.add(run); const image = addImage(run, string(document.resolve(resolved.Alt))); if (image) blocks.push(image); }
      return;
    }
    if (kind === 'Figure') {
      const alt = string(document.resolve(resolved.Alt)); let added = false;
      for (const run of runs) { const image = addImage(run, alt); if (image) { blocks.push(image); consumed.add(run); added = true; } }
      if (added) return;
      document.unsupported.add('tagged figure without an extractable image');
    }
    if (kind && !['Document','Part','Art','Sect','Div','NonStruct','Span','Link','Lbl','L','THead','TBody','TFoot','TR','TH','TD','MCR','OBJR'].includes(kind)) document.unsupported.add(`structure role ${kind}`);
    visit(resolved.K, page, depth + 1);
  };
  if (root) visit(root.K);
  else reportUnmapped(report, 'PDF has no tagged structure; heading and table semantics are unavailable', id);
  // Content outside the structure tree still survives, in drawing order.
  for (const page of pages) {
    let pending: PdfRun[] = [];
    const flush = () => { const body = text(pending); if (body) blocks.push(make('paragraph', body)); pending = []; };
    for (const run of pageRuns.get(page) ?? []) {
      if (consumed.has(run) || run.artifact) continue;
      if (run.image) { flush(); const image = addImage(run); if (image) blocks.push(image); }
      else { if (pending.length && (run.y !== pending.at(-1)!.y || run.x < pending.at(-1)!.x)) flush(); pending.push(run); }
    }
    flush();
    for (const annotation of pdfLinkAnnotations(document, page)) {
      const link = safeImportLink(annotation.href); if (!link) { reportUnmapped(report,'PDF link has an unsafe or empty destination',id); continue; }
      if (annotation.internal) { link.kind = 'page'; link.targetSourceId = id; }
      const [x1,y1,x2,y2] = annotation.rect;
      const labelledRuns = (pageRuns.get(page) ?? []).filter(run => !run.image && run.x >= Math.min(x1!,x2!) - 1 && run.x <= Math.max(x1!,x2!) + 1 && run.y >= Math.min(y1!,y2!) - run.size && run.y <= Math.max(y1!,y2!) + 1);
      const label = annotation.contents || text(labelledRuns) || annotation.href;
      const target = blocks.find(block => block.text && label && block.text.includes(label));
      if (target) { const start = target.text!.indexOf(label); target.links.push({...link,textStart:start,textEnd:start+label.length}); }
      else { const block = make('link',label); block.links.push({...link,textStart:0,textEnd:label.length}); blocks.push(block); }
    }
  }
  return {blocks,media,title};
}
