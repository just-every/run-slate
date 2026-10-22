import { ImportError } from './errors';
import { pdfPageRuns } from './pdf-content';
import { PdfDocument, name, string, type PdfDict } from './pdf-objects';
import { pdfStructure } from './pdf-structure';
import { createImportReport, reportCreated, reportUnmapped } from './report';
import { assertImportSourceSize, importSafetyLimits } from './safety';
import type { ImportParseOptions, ImportSourceFile, NormalizedImport } from './types';

export function parsePdf(source: ImportSourceFile, options?: ImportParseOptions): NormalizedImport {
  try { return parsePdfDocument(source, options); }
  catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('IMPORT_FORMAT_INVALID', 'The PDF document contains malformed objects or drawing operations.');
  }
}

function parsePdfDocument(source: ImportSourceFile, options?: ImportParseOptions): NormalizedImport {
  assertImportSourceSize(source, options);
  if (new TextDecoder().decode(source.bytes.subarray(0, 5)) !== '%PDF-') throw new ImportError('IMPORT_FORMAT_INVALID', 'The document is not a PDF file.');
  const document = new PdfDocument(source.bytes, importSafetyLimits(options));
  const id = `pdf:${source.name.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'document'}`;
  const report = createImportReport();
  let pages = document.pages();
  if (!pages.length) {
    // Incomplete exports may contain content objects without a page tree. Keep
    // their text, while explicitly recording that document structure was lost.
    const contents = [...document.streams.keys()].filter(dict => !['ObjStm','XRef'].includes(name(dict.Type)) && !dict.Subtype);
    const syntheticPage: PdfDict = { Type: {name:'Page'}, Contents: contents };
    pages = [syntheticPage];
    reportUnmapped(report, 'PDF page tree is absent; content stream text was recovered without page structure', id);
  }
  const runs = new Map(pages.map(page => [page, pdfPageRuns(document, page)]));
  const extracted = pdfStructure(document, pages, runs, id, report);
  if (document.catalog?.Metadata && !document.info?.Title && !extracted.title) document.unsupported.add('XMP-only document metadata');
  const title = string(document.resolve(document.info?.Title)).trim() || extracted.title || source.name.replace(/\.pdf$/i, '') || 'Imported PDF';
  if (!extracted.blocks.length) reportUnmapped(report, 'PDF has no supported text or image drawing operations', id);
  for (const construct of document.unsupported) reportUnmapped(report, `PDF ${construct} could not be preserved`, id);
  reportCreated(report, 'container', title, id);
  reportCreated(report, 'page', title, id);
  return {
    format: 'pdf', sourceName: source.name,
    containers: [{sourceId:id,sourceIdentityKind:'path-derived',name:title,personal:false,labels:[],grants:[]}],
    members: [],
    pages: [{sourceId:id,sourceIdentityKind:'path-derived',containerSourceId:id,title,blocks:extracted.blocks,lifecycle:'live',labels:[],properties:{},grants:[],revisions:[]}],
    databases: [], records: [], media: extracted.media, report,
  };
}
