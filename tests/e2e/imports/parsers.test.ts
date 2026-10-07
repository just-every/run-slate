import { expect, test } from "vitest";
import { parseImport } from "../../../src/core/features/imports/index";
import { syntheticConfluenceArchive, syntheticDocx, syntheticEpub, syntheticNotionArchive, syntheticPdf } from "./fixtures/synthetic";

test("synthetic Notion archive preserves the page tree, page links, CSV fields, and archive media", () => {
  const parsed = parseImport("notion-workspace", { name: "synthetic-notion.zip", bytes: syntheticNotionArchive() });
  expect(parsed.pages.length).toBe(2);
  expect(parsed.pages[1]!.parentSourceId).toBe(parsed.pages[0]!.sourceId);
  expect(parsed.pages[0]!.blocks.find((block) => block.links.length)?.links[0]?.targetSourceId).toBe(parsed.pages[1]!.sourceId);
  expect(parsed.pages[0]!.blocks.some((block) => block.kind === "media")).toBe(true);
  expect(parsed.databases[0]?.fields.map((field) => field.type)).toEqual(["title", "checkbox", "date"]);
  expect(parsed.records.length).toBe(1);
  expect(parsed.media.length).toBe(1);
});

test("synthetic Confluence archive keeps source container restrictions scoped and reports unsupported constructs", () => {
  const parsed = parseImport("confluence-space", { name: "synthetic-confluence.zip", bytes: syntheticConfluenceArchive() });
  const overview = parsed.pages.find((page) => page.title === "Overview")!;
  const child = parsed.pages.find((page) => page.title === "Child")!;
  expect(overview.labels).toEqual(["team"]);
  expect(overview.grants[0]?.principalKind).toBe("container");
  expect(overview.grants[0]?.principalSourceId).toBe(parsed.containers[0]!.sourceId);
  expect(overview.blocks.find((block) => block.kind === "paragraph")?.links[0]?.targetSourceId).toBe(child.sourceId);
  expect(overview.revisions[0]?.ordinal).toBe(3);
  expect(parsed.pages.find((page) => page.title === "Legacy folder")?.blocks.length).toBe(0);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("BlogPost"))).toBe(true);
});

test("synthetic DOCX and Google DOCX imports preserve ordered headings, tables, and embedded archive media", () => {
  const word = parseImport("docx", { name: "synthetic-word.docx", bytes: syntheticDocx() });
  const google = parseImport("google-docx", { name: "synthetic-google.docx", bytes: syntheticDocx() });
  expect(word.pages[0]!.blocks[0]?.kind).toBe("heading");
  expect(word.pages[0]!.blocks.some((block) => block.kind === "table" && block.rows?.[0]?.[0] === "Cell")).toBe(true);
  expect(word.pages[0]!.blocks.some((block) => block.kind === "media")).toBe(true);
  expect(word.media.length).toBe(1);
  expect(google.format).toBe("google-docx");
});

test("generic EPUB, PDF, Markdown, HTML, text, and CSV import through their explicit format paths", () => {
  expect(parseImport("epub", { name: "synthetic.epub", bytes: syntheticEpub() }).pages[0]?.title).toBe("Chapter one");
  expect(parseImport("pdf", { name: "synthetic.pdf", bytes: syntheticPdf() }).pages[0]?.blocks[0]?.text).toBe("A PDF paragraph");
  expect(parseImport("markdown", { name: "note.md", bytes: new TextEncoder().encode("# Title\n\nText") }).pages[0]?.blocks.length).toBe(2);
  expect(parseImport("html", { name: "note.html", bytes: new TextEncoder().encode("<script>x</script><p>Safe</p>") }).report.unmapped.length).toBe(1);
  expect(parseImport("text", { name: "note.txt", bytes: new TextEncoder().encode("One\n\nTwo") }).pages[0]?.blocks.length).toBe(2);
  expect(parseImport("csv", { name: "rows.csv", bytes: new TextEncoder().encode("Name,Count\nWidget,2\n") }).records.length).toBe(1);
});
