import {parseReadable} from "./readable";
import { parseConfluenceSpace } from "./confluence/index";
import { parseDocx } from "./docx";
import { parseEpub } from "./epub";
import { parseCsvDocument, parseGoogleHtmlZip, parseHtmlDocument, parseMarkdownDocument, parsePlainTextDocument } from "./generic";
import { parseNotionWorkspace } from "./notion/workspace";
import { parsePdf } from "./pdf";
import { assertImportSourceSize } from "./safety";
import type { ImportFormat, ImportParseOptions, ImportSourceFile, NormalizedImport } from "./types";

export interface ImportStagingPort<TStagingId = string> {
  stage(parsed: NormalizedImport): Promise<TStagingId>;
}

export function parseImport(format: ImportFormat, source: ImportSourceFile, options?: ImportParseOptions): NormalizedImport {
  assertImportSourceSize(source, options);
  switch (format) {
    case "slate-readable": return parseReadable(source,options);
    case "notion-workspace": return parseNotionWorkspace(source, options);
    case "confluence-space": return parseConfluenceSpace(source, options);
    case "docx": return parseDocx(source, "docx", options);
    case "google-docx": return parseDocx(source, "google-docx", options);
    case "google-html-zip": return parseGoogleHtmlZip(source, options);
    case "markdown": return parseMarkdownDocument(source, options);
    case "html": return parseHtmlDocument(source, options);
    case "text": return parsePlainTextDocument(source, options);
    case "csv": return parseCsvDocument(source, options);
    case "pdf": return parsePdf(source, options);
    case "epub": return parseEpub(source, options);
  }
}

export async function stageParsedImport<TStagingId>(port: ImportStagingPort<TStagingId>, format: ImportFormat, source: ImportSourceFile, options?: ImportParseOptions): Promise<TStagingId> {
  return port.stage(parseImport(format, source, options));
}
