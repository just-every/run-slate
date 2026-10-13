import type { GeneratedZipEntry } from "./types";
import { parseCsvRows } from "./csv";

type NotionSourceFieldType = "title" | "date" | "checkbox" | "number" | "email" | "url" | "relation" | "multi-select" | "select" | "text";

type SourceColumn = {
  name: string;
  sourceInferredType: NotionSourceFieldType;
  nativePersistedType: string;
  recordRows: number;
  populatedValues: number;
  nullValues: number;
  distinctNonEmptyValues: number;
  options?: string[];
  warning?: "empty-value-type-unknown" | "sparse-select-versus-text";
};

const monthDay = /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?$/i;
const isoDay = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const relationValue = /\((https:\/\/(?:www\.)?(?:notion\.so|app\.notion\.com)\/[^)]*)\)/i;
const emailValue = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const urlValue = /^https?:\/\/\S+$/i;
const numberValue = /^-?(?:\d+|\d*\.\d+)$/;
const maximumSelectOptions = 12;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isDate(value: string): boolean {
  return value.split("→").every((part) => monthDay.test(part.trim()) || isoDay.test(part.trim()));
}

function inferSourceFieldType(values: string[], first: boolean): NotionSourceFieldType {
  if (first) return "title";
  const present = values.map((value) => value.trim()).filter(Boolean);
  if (!present.length) return "text";
  if (present.some((value) => relationValue.test(value))) return "relation";
  if (present.every((value) => /^(?:yes|no)$/i.test(value))) return "checkbox";
  if (present.every(isDate)) return "date";
  if (present.every((value) => numberValue.test(value) && !/^-?0\d/.test(value) && Number.isFinite(Number(value)) && (!/^-?\d+$/.test(value) || Number.isSafeInteger(Number(value))))) return "number";
  if (present.every((value) => emailValue.test(value))) return "email";
  if (present.every((value) => urlValue.test(value))) return "url";

  const options = new Set(present.flatMap((value) => value.split(",").map((option) => option.trim())).filter(Boolean));
  if (options.size > maximumSelectOptions) return "text";
  if (present.some((value) => value.includes(","))) return "multi-select";
  return options.size < present.length ? "select" : "text";
}

function nativeType(sourceType: NotionSourceFieldType): string {
  return sourceType === "title" ? "text" : sourceType;
}

/**
 * Censuses the committed Notion `_all.csv` members directly. The inference is
 * kept here as a source-data calculation so expected fields never come from an
 * importer run or receipt.
 */
export function notionSourceFieldCensus(entries: GeneratedZipEntry[]) {
  const csvEntries = entries.filter((entry) => /_all\.csv$/i.test(entry.path) && entry.source instanceof Uint8Array);
  const sourceTypes: Record<string, number> = {};
  const nativeTypes: Record<string, number> = {};
  const cellsBySourceType: Record<string, { total: number; populated: number; null: number }> = {};
  const emptyColumns: string[] = [];
  const sparseColumns: string[] = [];
  const tables: Array<{ path: string; recordRows: number; fields: SourceColumn[]; recordCells: { total: number; populated: number; null: number } }> = [];
  let recordRows = 0;
  let totalFields = 0;
  let totalCells = 0;
  let populatedCells = 0;

  for (const entry of csvEntries) {
    const bytes = entry.source as Uint8Array;
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error(`${entry.path} is not UTF-8 and cannot be censused as a Notion CSV database.`); }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const [header, ...records] = parseCsvRows(text, entry.path);
    if (!header?.length || header.some((name) => !name.trim()) || new Set(header).size !== header.length) {
      throw new Error(`${entry.path} has a missing, blank, or duplicate CSV header.`);
    }
    for (const [index, row] of records.entries()) {
      if (row.length !== header.length) throw new Error(`${entry.path} record row ${index + 2} has ${row.length} cells for ${header.length} headers.`);
    }

    const fields = header.map((name, index): SourceColumn => {
      const values = records.map((row) => row[index] ?? "");
      const sourceInferredType = inferSourceFieldType(values, index === 0);
      const populatedValues = values.filter((value) => value.trim().length > 0).length;
      const nullValues = values.length - populatedValues;
      const distinct = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(compareText);
      const warning = index !== 0 && sourceInferredType === "text"
        ? populatedValues === 0 ? "empty-value-type-unknown" as const : "sparse-select-versus-text" as const
        : undefined;
      if (warning === "empty-value-type-unknown") emptyColumns.push(`${entry.path} :: ${name}`);
      if (warning === "sparse-select-versus-text") sparseColumns.push(`${entry.path} :: ${name}`);
      sourceTypes[sourceInferredType] = (sourceTypes[sourceInferredType] ?? 0) + 1;
      const persisted = nativeType(sourceInferredType);
      nativeTypes[persisted] = (nativeTypes[persisted] ?? 0) + 1;
      const typedCells = cellsBySourceType[sourceInferredType] ??= { total: 0, populated: 0, null: 0 };
      typedCells.total += values.length;
      typedCells.populated += populatedValues;
      typedCells.null += nullValues;
      const column: SourceColumn = {
        name,
        sourceInferredType,
        nativePersistedType: persisted,
        recordRows: values.length,
        populatedValues,
        nullValues,
        distinctNonEmptyValues: distinct.length,
      };
      if (sourceInferredType === "select" || sourceInferredType === "multi-select") column.options = distinct.flatMap((value) => value.split(",").map((option) => option.trim())).filter(Boolean).filter((option, at, all) => all.indexOf(option) === at).sort(compareText);
      if (warning) column.warning = warning;
      return column;
    });
    const tableCells = records.length * header.length;
    const tablePopulated = fields.reduce((sum, field) => sum + field.populatedValues, 0);
    tables.push({
      path: entry.path,
      recordRows: records.length,
      fields,
      recordCells: { total: tableCells, populated: tablePopulated, null: tableCells - tablePopulated },
    });
    recordRows += records.length;
    totalFields += header.length;
    totalCells += tableCells;
    populatedCells += tablePopulated;
  }

  return {
    basis: "Independent census of the committed anonymized Notion _all.csv bytes; no importer execution or parsed import result contributes to these values.",
    sourceSchema: "The source CSVs contain headers and values but no declared property-type schema; sourceInferredFieldTypes are value-derived classifications, not exporter declarations.",
    databaseTables: tables.length,
    records: recordRows,
    databaseFields: totalFields,
    recordCells: { total: totalCells, populated: populatedCells, null: totalCells - populatedCells },
    sourceInferredFieldTypeCounts: Object.fromEntries(Object.entries(sourceTypes).sort(([a], [b]) => compareText(a, b))),
    nativePersistedFieldTypeCounts: Object.fromEntries(Object.entries(nativeTypes).sort(([a], [b]) => compareText(a, b))),
    recordCellCountsBySourceInferredFieldType: Object.fromEntries(Object.entries(cellsBySourceType).sort(([a], [b]) => compareText(a, b))),
    inferenceWarnings: {
      emptyColumns: emptyColumns.length,
      sparseTextColumns: sparseColumns.length,
      emptyColumnPaths: emptyColumns,
      sparseTextColumnPaths: sparseColumns,
    },
    tables,
  };
}
