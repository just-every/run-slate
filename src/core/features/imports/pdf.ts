import { ImportError } from "./errors";
import { createExpansionBudget, inflateBounded, reserveExpansion, type ExpansionBudget } from "./inflate";
import { createImportReport, reportCreated, reportUnmapped, reportWarning } from "./report";
import { assertImportSourceSize, importSafetyLimits } from "./safety";
import type { ImportParseOptions, ImportSourceFile, NormalizedImport } from "./types";

function streamContents(pdf: Uint8Array, safety: ReturnType<typeof importSafetyLimits>): string[] {
  const ascii = new TextDecoder("latin1").decode(pdf);
  const streams: string[] = [];
  const budget: ExpansionBudget = createExpansionBudget(safety, "A PDF stream");
  let cursor = 0;
  while (cursor < ascii.length) {
    const start = ascii.indexOf("stream", cursor);
    if (start < 0) break;
    const after = start + 6;
    if (!/[\r\n]/.test(ascii[after] ?? "")) { cursor = after; continue; }
    const dataStart = ascii[after] === "\r" && ascii[after + 1] === "\n" ? after + 2 : after + 1;
    const end = ascii.indexOf("endstream", dataStart);
    if (end < 0) throw new ImportError("IMPORT_FORMAT_INVALID", "A PDF stream has no end marker.");
    const dictionaryStart = ascii.lastIndexOf("<<", start);
    const dictionaryEnd = ascii.lastIndexOf(">>", start);
    const dictionary = dictionaryStart >= 0 && dictionaryEnd > dictionaryStart ? ascii.slice(dictionaryStart, dictionaryEnd + 2) : "";
    let dataEnd = end;
    while (dataEnd > dataStart && /[\r\n]/.test(ascii[dataEnd - 1]!)) dataEnd -= 1;
    let bytes = pdf.subarray(dataStart, dataEnd);
    if (/\/FlateDecode\b/.test(dictionary)) bytes = inflateBounded(bytes, budget);
    else { reserveExpansion(budget, bytes.byteLength); budget.expandedBytes += bytes.byteLength; }
    streams.push(new TextDecoder("latin1").decode(bytes));
    cursor = end + 9;
  }
  return streams;
}

function literalStrings(value: string): string[] {
  const strings: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "(") continue;
    let depth = 1;
    let literal = "";
    for (index += 1; index < value.length && depth; index += 1) {
      const char = value[index]!;
      if (char === "\\") {
        const next = value[++index] ?? "";
        const escape: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
        literal += escape[next] ?? next;
      } else if (char === "(") { depth += 1; literal += char; }
      else if (char === ")") { depth -= 1; if (depth) literal += char; }
      else literal += char;
    }
    if (depth) throw new ImportError("IMPORT_FORMAT_INVALID", "A PDF text string is not terminated.");
    if (literal.trim()) strings.push(literal);
  }
  return strings;
}

function textOperations(stream: string): string[] {
  const paragraphs: string[] = [];
  for (const section of stream.matchAll(/BT([\s\S]*?)ET/g)) {
    const contents = section[1]!;
    if (!/(?:Tj|TJ|'|\")\b/.test(contents)) continue;
    const value = literalStrings(contents).join(" ").replace(/\s+/g, " ").trim();
    if (value) paragraphs.push(value);
  }
  return paragraphs;
}

export function parsePdf(source: ImportSourceFile, options?: ImportParseOptions): NormalizedImport {
  const safety = importSafetyLimits(options);
  assertImportSourceSize(source, options);
  if (new TextDecoder("latin1").decode(source.bytes.subarray(0, 5)) !== "%PDF-") throw new ImportError("IMPORT_FORMAT_INVALID", "The document is not a PDF file.");
  const id = `pdf:${source.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "document"}`;
  const report = createImportReport();
  const text = streamContents(source.bytes, safety).flatMap(textOperations);
  const title = source.name.replace(/\.pdf$/i, "") || "Imported PDF";
  if (!text.length) reportUnmapped(report, "PDF has no supported text drawing operations", id);
  else reportWarning(report, "PDF import preserves text drawing operations; layout constructs are reported when unsupported", id);
  reportCreated(report, "container", title, id);
  reportCreated(report, "page", title, id);
  return {
    format: "pdf", sourceName: source.name,
    containers: [{ sourceId: id, sourceIdentityKind: "path-derived", name: title, personal: false, labels: [], grants: [] }],
    members: [],
    pages: [{ sourceId: id, sourceIdentityKind: "path-derived", containerSourceId: id, title, blocks: text.map((value, index) => ({ sourceId: `${id}#paragraph-${index}`, sourceIdentityKind: "path-derived", kind: "paragraph", text: value, links: [], children: [] })), lifecycle: "live", labels: [], properties: {}, grants: [], revisions: [] }],
    databases: [], records: [], media: [], report,
  };
}
