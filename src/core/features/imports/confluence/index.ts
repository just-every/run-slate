import { readZipArchive } from "../archive";
import { ImportError } from "../errors";
import type { ImportParseOptions, ImportSourceFile, NormalizedImport } from "../types";
import { parseConfluenceCsvSpace } from "./space";
import { parseConfluenceXmlSpace } from "./xml-space";

/**
 * Confluence has shipped two space-export shapes. Cloud writes one CSV file per
 * database table with storage-format bodies in `bodycontent.csv`; Server and
 * Data Center write a single `entities.xml`. The archive says which it is.
 */
export function parseConfluenceSpace(source: ImportSourceFile, options?: ImportParseOptions): NormalizedImport {
  const files = readZipArchive(source.bytes, options?.limits);
  const paths = [...files.keys()];
  if (paths.some((path) => (path.split("/").at(-1) ?? "").toLowerCase().startsWith("content.csv"))) {
    return parseConfluenceCsvSpace(files, source, options);
  }
  if (paths.some((path) => path.split("/").at(-1)?.toLowerCase() === "entities.xml")) {
    return parseConfluenceXmlSpace(files, source);
  }
  throw new ImportError("IMPORT_FORMAT_INVALID", "The Confluence archive has neither a content.csv table export nor an entities.xml export.");
}
