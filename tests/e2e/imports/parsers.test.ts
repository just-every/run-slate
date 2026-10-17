import { expect, test } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
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

test("synthetic Confluence archive keeps unmapped restrictions closed and reports unsupported constructs", () => {
  const parsed = parseImport("confluence-space", { name: "synthetic-confluence.zip", bytes: syntheticConfluenceArchive() });
  const overview = parsed.pages.find((page) => page.title === "Overview")!;
  const child = parsed.pages.find((page) => page.title === "Child")!;
  expect(overview.labels).toEqual(["team"]);
  expect(overview.restricted).toBe(true);
  expect(overview.grants).toEqual([]);
  expect(overview.blocks.find((block) => block.kind === "paragraph")?.links[0]?.targetSourceId).toBe(child.sourceId);
  expect(overview.revisions[0]?.ordinal).toBe(3);
  expect(parsed.media).toHaveLength(1);
  expect(parsed.media[0]?.ownerPageSourceId).toBe(overview.sourceId);
  expect([...parsed.media[0]!.bytes]).toEqual([137, 80, 78, 71]);
  expect(parsed.pages.find((page) => page.title === "Legacy folder")?.blocks.length).toBe(0);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("BlogPost"))).toBe(true);
  // These added macros are synthetic parser evidence, separate from genuine IMP-010 acceptance.
  const files = unzipSync(syntheticConfluenceArchive());
  const macros = '<ac:structured-macro ac:name="toc"><ac:parameter ac:name="maxLevel">2</ac:parameter></ac:structured-macro><p>Before <ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Ready</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro> after.</p>';
  files['entities.xml'] = strToU8(new TextDecoder().decode(files['entities.xml']).replace('<h1>Overview</h1>', `<h1>Overview</h1>${macros}`));
  const mapped = parseImport('confluence-space', {name: 'synthetic-macros.zip', bytes: zipSync(files)}).pages.find(page => page.title === 'Overview')!;
  expect(mapped.blocks.find(block => block.kind === 'table-of-contents')?.tableOfContents).toEqual({minLevel: 1, maxLevel: 2, style: 'nested'});
  const labelled = mapped.blocks.find(block => block.text === 'Before Ready after.')!;
  expect(labelled.statuses?.map(status => [labelled.text!.slice(status.textStart, status.textEnd), status.colour])).toEqual([['Ready', 'blue']]);
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
  for (const format of ['markdown', 'html'] as const) {
    const body = format === 'markdown'
      ? '# Portable\n\n<!-- slate:table-of-contents {"minLevel":1,"maxLevel":2,"style":"nested"} -->\n- [Section](#block-section)\n<!-- /slate:table-of-contents -->\n\n<a id="block-section"></a>\n## Section\n\nBefore [Done]{status:green} and [Blocked]{status:red} after.'
      : '<h1>Portable</h1><nav data-slate-table-of-contents=\'{"minLevel":1,"maxLevel":2,"style":"nested"}\'><ul><li><a href="#block-section">Section</a></li></ul></nav><h2 id="block-section">Section</h2><p>Before <span data-slate-status="green">Done</span> and <span data-slate-status="red">Blocked</span> after.</p>';
    const parsed = parseImport(format, {name: `extracted.${format === 'markdown' ? 'md' : 'html'}`, bytes: new TextEncoder().encode(body)});
    const blocks = parsed.pages[0]!.blocks;
    expect(blocks.find(block => block.kind === 'table-of-contents')?.tableOfContents).toEqual({minLevel: 1, maxLevel: 2, style: 'nested'});
    expect(blocks.filter(block => block.kind === 'heading').map(block => block.text)).toEqual(['Portable', 'Section']);
    const paragraph = blocks.find(block => block.kind === 'paragraph')!;
    expect(paragraph.text).toBe('Before Done and Blocked after.');
    expect(paragraph.statuses?.map(status => [paragraph.text!.slice(status.textStart, status.textEnd), status.colour])).toEqual([['Done', 'green'], ['Blocked', 'red']]);
  }
  const reportImport = parseImport('slate-readable', {name: 'reports.zip', bytes: zipSync({'slate-readable.json': strToU8(JSON.stringify({version: 1, pages: [{id: 'page-source', parentId: null, title: 'Reports', labels: [], blocks: [{id: 'report', blockType: 'task-report', content: {definition: {ancestorPageId: 'page-source', containerId: 'absent-container', assignee: {kind: 'member', memberId: 'absent-person'}, groupBy: 'page', orderBy: 'due', direction: 'asc', limit: 20}}, parentBlockId: null, treePosition: '0'}]}], media: [], report: []}))})});
  const report = reportImport.pages[0]!.blocks[0]!;
  expect(report.canonicalReferences?.ancestorPageSourceId).toBe('page-source');
  const definition = (report.canonicalBlock!.content as {definition: {containerId: string; assignee: {memberId: string}}}).definition;
  expect(definition.containerId.startsWith('unavailable:')).toBe(true);
  expect(definition.assignee.memberId.startsWith('unavailable:')).toBe(true);
  expect(reportImport.report.warnings.filter(warning => warning.sourceId === report.sourceId)).toHaveLength(2);
});
