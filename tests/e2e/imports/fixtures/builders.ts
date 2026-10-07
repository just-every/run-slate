import { strToU8, zipSync } from "fflate";

// Synthetic archive builders for the cases the real exports do not contain —
// historical page versions, group and space-wide restrictions, unusual media
// extensions, gzipped table members, OOXML numbering variants. They are parser
// fixtures, not evidence for IMP-002 or IMP-003.

const utf8 = (value: string) => strToU8(value);

function csv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",")).join("\n") + "\n";
}

export interface ConfluenceCsvExport {
  /** Table name (no extension) to rows, the first row being the header. */
  tables: Record<string, string[][]>;
  /** Extra archive members, e.g. an already-gzipped table or a whiteboard payload. */
  files?: Record<string, Uint8Array>;
  descriptor?: Record<string, string>;
}

const defaultSpaces = [
  ["spaceid", "spacename", "spacekey", "spacetype", "spacestatus"],
  ["1", "Engineering", "ENG", "global", "CURRENT"],
];

const contentHeader = [
  "contentid", "contenttype", "title", "version", "versioncomment", "prevver",
  "content_status", "spaceid", "child_position", "parentid",
];

export function confluenceContentRow(values: Partial<Record<(typeof contentHeader)[number], string>>): string[] {
  return contentHeader.map((column) => values[column] ?? "");
}

export function confluenceContentHeader(): string[] {
  return [...contentHeader];
}

export function syntheticConfluenceCsvExport({ tables, files = {}, descriptor = {} }: ConfluenceCsvExport): Uint8Array {
  const members: Record<string, Uint8Array> = { ...files };
  const all = { spaces: defaultSpaces, ...tables };
  for (const [name, rows] of Object.entries(all)) {
    if (`${name}.csv.gz` in members) continue;
    members[`${name}.csv.gz`] = utf8(csv(rows));
  }
  members["exportDescriptor.properties.gz"] = utf8(
    Object.entries({ exportFormat: "csv", exportType: "space", source: "cloud", ...descriptor })
      .map(([key, value]) => `${key}=${value}`).join("\n"),
  );
  return zipSync(members);
}

export function syntheticNotionArchiveFrom(files: Record<string, Uint8Array | string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [path, typeof value === "string" ? utf8(value) : value])));
}

export interface DocxParts {
  body: string;
  numbering?: string;
  styles?: string;
}

export function syntheticDocxWith({ body, numbering }: DocxParts): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "word/document.xml": utf8(`<?xml version="1.0"?><w:document xmlns:w="w" xmlns:r="r"><w:body>${body}</w:body></w:document>`),
  };
  if (numbering !== undefined) files["word/numbering.xml"] = utf8(`<?xml version="1.0"?><w:numbering xmlns:w="w">${numbering}</w:numbering>`);
  return zipSync(files);
}

export function docxParagraph(text: string, numId?: string, level = "0"): string {
  const properties = numId === undefined ? "" : `<w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
  return `<w:p>${properties}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

export function docxHeading(text: string, level: number): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
}
