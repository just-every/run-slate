export interface CsvTable {
  path: string;
  header: string[];
  rows: Record<string, string>[];
}

export function parseCsvRows(text: string, path: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { value += '"'; index += 1; }
        else { quoted = false; afterQuote = true; }
      } else value += char;
      continue;
    }
    if (afterQuote) {
      if (char === ",") { row.push(value); value = ""; afterQuote = false; continue; }
      if (char === "\n" || char === "\r") {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(value); rows.push(row); row = []; value = ""; afterQuote = false; continue;
      }
      throw new Error(`${path} contains unexpected content after a quoted CSV value.`);
    }
    if (char === '"') {
      if (value) throw new Error(`${path} has a quote in the middle of an unquoted CSV value.`);
      quoted = true;
    } else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += char;
  }
  if (quoted) throw new Error(`${path} ends inside a quoted CSV value.`);
  if (value || row.length || afterQuote) { row.push(value); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.length > 0));
}

export function parseCsvTable(path: string, bytes: Uint8Array): CsvTable {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = parseCsvRows(text, path);
  const header = parsed[0];
  if (!header?.length) throw new Error(`${path} has no CSV header.`);
  const rows = parsed.slice(1).map((values, index) => {
    if (values.length !== header.length) throw new Error(`${path} row ${index + 2} does not match its header.`);
    return Object.fromEntries(header.map((name, column) => [name, values[column] ?? ""]));
  });
  return { path, header, rows };
}

function encodeCell(value: string): string {
  const normalized = String(value);
  if (/[",\r\n]/.test(normalized) || /^\s|\s$/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

export function serializeCsv(table: CsvTable): Uint8Array {
  const rows = [table.header, ...table.rows.map((row) => table.header.map((column) => row[column] ?? ""))];
  return Buffer.from(`${rows.map((row) => row.map(encodeCell).join(",")).join("\r\n")}\r\n`, "utf8");
}

export function requireCsvTable(tables: Map<string, CsvTable>, name: string): CsvTable {
  const table = tables.get(name);
  if (!table) throw new Error(`Committed Confluence export is missing ${name}.csv(.gz).`);
  return table;
}
