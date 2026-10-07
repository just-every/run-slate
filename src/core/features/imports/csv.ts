import { ImportError } from "./errors";
import type { ImportedBlock, ImportedField } from "./types";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { value += '"'; index += 1; } else { quoted = false; afterQuote = true; }
      } else value += char;
      continue;
    }
    if (afterQuote) {
      if (char === ",") { row.push(value); value = ""; afterQuote = false; continue; }
      if (char === "\n" || char === "\r") {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(value); rows.push(row); row = []; value = ""; afterQuote = false; continue;
      }
      throw new ImportError("IMPORT_FORMAT_INVALID", "A CSV quoted field has unexpected trailing content.");
    }
    if (char === '"') {
      if (value) throw new ImportError("IMPORT_FORMAT_INVALID", "A CSV quote must begin a field.");
      quoted = true;
    } else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += char;
  }
  if (quoted) throw new ImportError("IMPORT_FORMAT_INVALID", "A CSV field is not terminated.");
  if (value || row.length || afterQuote) { row.push(value); rows.push(row); }
  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

export function validateCsvTable(rows: string[][]): { header: string[]; records: string[][] } {
  const [header, ...records] = rows;
  if (!header?.length || header.some((column) => !column.trim())) throw new ImportError("IMPORT_FORMAT_INVALID", "A CSV table needs non-empty column names.");
  if (new Set(header).size !== header.length) throw new ImportError("IMPORT_FORMAT_INVALID", "A CSV table has duplicate column names.");
  if (records.some((record) => record.length !== header.length)) throw new ImportError("IMPORT_FORMAT_INVALID", "A CSV row has a different number of fields than its header.");
  return { header, records };
}

function inferFieldType(values: string[]): string {
  const present = values.filter(Boolean);
  if (!present.length) return "text";
  if (present.every((value) => /^(true|false)$/i.test(value))) return "checkbox";
  if (present.every((value) => /^-?(?:\d+|\d*\.\d+)$/.test(value))) return "number";
  if (present.every((value) => /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(value))) return "date";
  return "text";
}

export function inferCsvFields(header: string[], records: string[][], sourceId: string): ImportedField[] {
  return header.map((name, index) => ({
    sourceId: `${sourceId}:field:${index}`,
    sourceIdentityKind: "path-derived",
    name,
    type: inferFieldType(records.map((record) => record[index] ?? "")),
  }));
}

export function csvTableBlock(rows: string[][], sourceId: string): ImportedBlock {
  return {
    sourceId: `${sourceId}#table`,
    sourceIdentityKind: "path-derived",
    kind: "table",
    rows,
    links: [],
    children: [],
  };
}
