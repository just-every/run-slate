import { parseCsv } from "../csv";
import { ImportError } from "../errors";
import { createExpansionBudget, gunzipBounded, isGzip, reserveExpansion, type ExpansionBudget } from "../inflate";
import type { ImportSafetyLimits } from "../types";

/**
 * A Confluence Cloud space export is a set of per-table CSV files at the archive
 * root. They carry a `.csv.gz` extension but Cloud writes them uncompressed, so
 * the gzip magic decides how each one is read rather than its name. A member
 * that really is gzipped is inflated against a budget shared across the whole
 * export: the zip's own limits saw only the compressed member.
 */

export interface ConfluenceTable {
  name: string;
  header: string[];
  rows: Record<string, string>[];
}

export type ConfluenceTables = Map<string, ConfluenceTable>;

export interface ConfluenceExport {
  tables: ConfluenceTables;
  descriptor: Record<string, string>;
}

function decode(name: string, bytes: Uint8Array, budget: ExpansionBudget): string {
  let payload = bytes;
  if (isGzip(bytes)) {
    payload = gunzipBounded(bytes, budget);
  } else {
    reserveExpansion(budget, bytes.byteLength);
    budget.expandedBytes += bytes.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    throw new ImportError("IMPORT_FORMAT_INVALID", `${name} is not valid UTF-8 text.`);
  }
}

function tableName(path: string): string {
  return (path.split("/").at(-1) ?? path).replace(/\.csv(?:\.gz)?$/i, "");
}

function readTables(files: Map<string, Uint8Array>, budget: ExpansionBudget): ConfluenceTables {
  const tables: ConfluenceTables = new Map();
  for (const [path, bytes] of files) {
    // Only the archive root holds database tables. `whiteboards/data/*.csv`
    // carries opaque canvas payloads and is named in the report instead.
    if (path.includes("/") || !/\.csv(?:\.gz)?$/i.test(path)) continue;
    const name = tableName(path);
    const rows = parseCsv(decode(path, bytes, budget));
    const header = rows[0];
    if (!header?.length) continue;
    tables.set(name, {
      name,
      header,
      rows: rows.slice(1).map((row) => {
        if (row.length !== header.length) {
          throw new ImportError("IMPORT_FORMAT_INVALID", `${path} has a row with ${row.length} fields where its header declares ${header.length}.`);
        }
        return Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""]));
      }),
    });
  }
  return tables;
}

/** `exportDescriptor.properties` is a Java properties file, gzipped or not. */
function readDescriptor(files: Map<string, Uint8Array>, budget: ExpansionBudget): Record<string, string> {
  const path = [...files.keys()].find((candidate) => /(?:^|\/)exportDescriptor\.properties(?:\.gz)?$/i.test(candidate));
  if (!path) return {};
  return Object.fromEntries(decode(path, files.get(path)!, budget).split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const split = line.indexOf("=");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }));
}

export function readConfluenceExport(files: Map<string, Uint8Array>, limits: ImportSafetyLimits): ConfluenceExport {
  const budget = createExpansionBudget(limits, "A Confluence export member");
  return { tables: readTables(files, budget), descriptor: readDescriptor(files, budget) };
}

export function requireTable(tables: ConfluenceTables, name: string): ConfluenceTable {
  const table = tables.get(name);
  if (!table) throw new ImportError("IMPORT_FORMAT_INVALID", `The Confluence space export is missing ${name}.csv.`);
  return table;
}

export function tableRows(tables: ConfluenceTables, name: string): Record<string, string>[] {
  return tables.get(name)?.rows ?? [];
}
