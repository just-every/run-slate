import type { ImportedField } from "../types";

/**
 * A Notion `_all.csv` carries no schema, so a field's type is inferred from the
 * values Notion writes for each of its property types: dates as
 * `September 11, 2026` (optionally a `→` range), checkboxes as `Yes`/`No`,
 * multi-select as a comma-separated list, relations as `Title (notion url)`, and
 * the first column always as the record title. A column whose sample is too thin
 * to distinguish a select from free text is typed `text`, and the caller reports
 * it — inventing a richer type from one row would be a guess.
 */

export type NotionFieldType =
  | "title" | "date" | "checkbox" | "number" | "email" | "url" | "relation" | "multi-select" | "select" | "text";

const monthDay = /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?$/i;
const isoDay = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const relationValue = /\((https:\/\/(?:www\.)?(?:notion\.so|app\.notion\.com)\/[^)]*)\)/i;
const emailValue = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const urlValue = /^https?:\/\/\S+$/i;
const numberValue = /^-?(?:\d+|\d*\.\d+)$/;

function isDate(value: string): boolean {
  return value.split("→").every((part) => monthDay.test(part.trim()) || isoDay.test(part.trim()));
}

export const maximumSelectOptions = 12;

export function inferNotionFieldType(values: string[], first: boolean): NotionFieldType {
  if (first) return "title";
  const present = values.map((value) => value.trim()).filter(Boolean);
  if (!present.length) return "text";
  if (present.some((value) => relationValue.test(value))) return "relation";
  if (present.every((value) => /^(?:yes|no)$/i.test(value))) return "checkbox";
  if (present.every(isDate)) return "date";
  if (present.every((value) => numberValue.test(value))) return "number";
  if (present.every((value) => emailValue.test(value))) return "email";
  if (present.every((value) => urlValue.test(value))) return "url";

  const options = new Set(present.flatMap((value) => value.split(",").map((option) => option.trim())).filter(Boolean));
  if (options.size > maximumSelectOptions) return "text";
  if (present.some((value) => value.includes(","))) return "multi-select";
  // A repeated value is the only evidence in the file that a column is a closed
  // vocabulary rather than free text.
  return options.size < present.length ? "select" : "text";
}

export function notionFields(header: string[], rows: string[][], sourceId: string): ImportedField[] {
  return header.map((name, index) => {
    const values = rows.map((row) => row[index] ?? "");
    const type = inferNotionFieldType(values, index === 0);
    const options = type === "select" || type === "multi-select"
      ? [...new Set(values.flatMap((value) => value.split(",").map((option) => option.trim())).filter(Boolean))].sort()
      : undefined;
    return { sourceId: `${sourceId}:field:${index}`, sourceIdentityKind: "path-derived" as const, name, type, options };
  });
}

export function notionFieldValue(type: NotionFieldType, raw: string): string | string[] | number | boolean | null {
  const value = raw.trim();
  if (!value) return null;
  if (type === "checkbox") return /^yes$/i.test(value);
  if (type === "number") return Number(value);
  if (type === "multi-select" || type === "relation") return value.split(",").map((part) => part.trim()).filter(Boolean);
  return value;
}
