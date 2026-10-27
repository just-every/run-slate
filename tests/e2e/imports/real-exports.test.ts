import { beforeAll, expect, test } from "vitest";
import { env } from "cloudflare:test";
import { readZipArchive } from "../../../src/core/features/imports/archive";
import { parseImport } from "../../../src/core/features/imports/index";
import type { ImportedBlock, NormalizedImport } from "../../../src/core/features/imports/types";

/**
 * Parser regression coverage from exports the incumbents produced; this does
 * not satisfy the full import contract journeys. Every number below was read
 * out of the committed archives in
 * `fixtures/real/` (see `PROVENANCE.md`), so a parser that stops mapping a
 * construct fails here rather than quietly reporting fewer pages.
 */

const archives = new Map<string, Uint8Array>();

beforeAll(async () => {
  const fixtureService = (env as unknown as { TEST_IMPORT_FIXTURES: Fetcher }).TEST_IMPORT_FIXTURES;
  for (const name of ["notion-workspace-export.zip", "confluence-space-export.zip", "google-docs-download.docx"]) {
    const response = await fixtureService.fetch(`https://fixtures.test/${name}`);
    if (!response.ok) throw new Error(`Could not load committed import fixture: ${name}`);
    archives.set(name, new Uint8Array(await response.arrayBuffer()));
  }
});

function fixture(name: string): Uint8Array {
  const bytes = archives.get(name);
  if (!bytes) throw new Error(`Missing import fixture: ${name}`);
  return bytes;
}

function allBlocks(blocks: ImportedBlock[]): ImportedBlock[] {
  return blocks.flatMap((block) => [block, ...allBlocks(block.children)]);
}

function pageBlocks(parsed: NormalizedImport): ImportedBlock[] {
  return parsed.pages.flatMap((page) => allBlocks(page.blocks));
}

function kindCounts(blocks: ImportedBlock[]): Record<string, number> {
  return blocks.reduce<Record<string, number>>((counts, block) => ({ ...counts, [block.kind]: (counts[block.kind] ?? 0) + 1 }), {});
}

function labels(entries: { label: string }[]): string[] {
  return [...new Set(entries.map((entry) => entry.label))].sort();
}

function depthOf(parsed: NormalizedImport, page: NormalizedImport["pages"][number]): number {
  const byId = new Map(parsed.pages.map((candidate) => [candidate.sourceId, candidate]));
  let depth = 0;
  let cursor = page;
  while (cursor.parentSourceId) {
    cursor = byId.get(cursor.parentSourceId)!;
    depth += 1;
  }
  return depth;
}

const notion = () => parseImport("notion-workspace", { name: "notion-workspace-export.zip", bytes: fixture("notion-workspace-export.zip") });
const confluence = () => parseImport("confluence-space", { name: "confluence-space-export.zip", bytes: fixture("confluence-space-export.zip") });
const googleDocx = () => parseImport("google-docx", { name: "google-docs-download.docx", bytes: fixture("google-docs-download.docx") });

test("incumbent-produced archives preserve pages, relationships, media and explicit losses", async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: "the real Notion workspace export becomes pages, a tree, databases, records and archive media", run: () => {
  const parsed = notion();

  // 57 archive entries: 35 Markdown pages, 7 CSV databases, 15 media files.
  expect(readZipArchive(fixture("notion-workspace-export.zip")).size).toBe(57);
  expect(parsed.pages.length).toBe(35);
  expect(parsed.databases.length).toBe(7);
  expect(parsed.records.length).toBe(22);
  expect(parsed.media.length).toBe(15);

  // Notion keeps the emoji in the exported filename; nothing arrives as "?".
  const titles = parsed.pages.map((page) => page.title);
  expect(titles.includes("Goals HQ 🎯")).toBe(true);
  expect(titles.includes("See finished items in the “Done” view")).toBe(true);
  expect(titles.filter((title) => title.includes("?"))).toEqual([]);

  // The tree comes from directories that drop the identifier from the name.
  const hq = parsed.pages.find((page) => page.title === "Goals HQ 🎯")!;
  const eatPizzaPage = parsed.pages.find((page) => page.title === "Eat pizza")!;
  const subPage = parsed.pages.find((page) => page.title === "Example sub-page")!;
  expect(eatPizzaPage.parentSourceId).toBe(hq.sourceId);
  expect(depthOf(parsed, subPage)).toBe(2);
  expect(Math.max(...parsed.pages.map((page) => depthOf(parsed, page)))).toBe(2);
  expect(parsed.pages.every((page) => page.sourceIdentityKind === "native")).toBe(true);
  // Three sibling pages share the title "Untitled" in one directory. They are
  // keyed by archive path, so each keeps its own identity and properties.
  const untitled = parsed.pages.filter((page) => page.title === "Untitled" && page.properties.type);
  expect(untitled.map((page) => page.properties.type).sort()).toEqual(["assignment", "exam", "lecture"]);
  expect(new Set(untitled.map((page) => page.sourceId)).size).toBe(3);

  // Databases and their inferred field types.
  // Notion abbreviates the identifier on a loose filtered view
  // (`Untitled 97c1-d418_all.csv`); it is an identifier, not part of the title.
  expect(parsed.databases.map((database) => database.title).sort()).toEqual([
    "Domains", "Goals", "People", "Todo List", "Topics", "Untitled", "Untitled",
  ]);
  const goals = parsed.databases.find((database) => database.title === "Goals")!;
  expect(goals.fields.map((field) => [field.name, field.type])).toEqual([
    ["Goal", "title"], ["Notes", "text"], ["Status", "select"], ["Target Date", "text"],
  ]);
  expect(goals.fields.find((field) => field.name === "Status")!.options).toEqual(["Done", "In progress", "Not started"]);
  expect(parsed.databases.find((database) => database.title === "Todo List")!.fields.map((field) => [field.name, field.type])).toEqual([
    ["Task name", "title"], ["Assignee", "text"], ["Due date", "date"], ["Status", "select"],
  ]);
  expect(parsed.databases.find((database) => database.title === "Domains")!.fields.map((field) => [field.name, field.type])).toEqual([
    ["Name", "title"], ["Status", "select"], ["course code", "text"], ["email", "email"], ["professor", "text"], ["website", "url"],
  ]);
  expect(parsed.databases.map((database) => [database.title, parsed.records.filter((record) => record.databaseSourceId === database.sourceId).length])).toEqual([
    ["Goals", 5], ["People", 1], ["Domains", 3], ["Topics", 1], ["Todo List", 8], ["Untitled", 1], ["Untitled", 3],
  ]);
  expect(parsed.databases.find((database) => database.title === "Todo List")!.parentSourceId).toBe(parsed.pages.find((page) => page.title === "To Do List")!.sourceId);

  // `record.page-parity.v1` default `record-is-page`: a CSV row and the page of
  // the same title in the database's directory are one record.
  const eatPizza = parsed.records.find((record) => record.fields.Goal === "Eat pizza")!;
  expect(eatPizza.pageSourceId).toBe(eatPizzaPage.sourceId);
  expect(eatPizza.fields.Status).toBe("Done");
  expect(parsed.records.filter((record) => record.pageSourceId).length).toBe(18);
  // The record page's own property lines merge into the record's fields.
  expect(parsed.pages.find((page) => page.title === "Alex")!.properties.Email).toBe("alex\x40example.com");

  // Markdown bodies become blocks of the equivalent types.
  const counts = kindCounts(pageBlocks(parsed));
  // This export contains no table, quote or fenced-code block, so those
  // Markdown constructs are mapped but not exercised by this fixture.
  expect(["table", "quote", "code"].filter((kind) => kind in counts)).toEqual([]);
  expect(counts).toEqual({
    paragraph: 32, link: 38, callout: 10, media: 17, toggle: 5, divider: 9,
    "bulleted-list": 8, heading: 3, "numbered-list": 18, task: 3,
  });

  // Links between exported pages, and to exported CSV databases, resolve.
  const home = parsed.pages.find((page) => page.title === "Home")!;
  const resolved = home.blocks.flatMap((block) => block.links).filter((link) => link.kind === "page");
  expect(resolved.map((link) => link.targetSourceId).sort()).toEqual([
    parsed.pages.find((page) => page.title === "Home views")!.sourceId,
    parsed.pages.find((page) => page.title === "My Tasks")!.sourceId,
  ].sort());
  expect(hq.blocks.flatMap((block) => block.links).find((link) => link.kind === "database")!.targetSourceId).toBe(goals.sourceId);
  const linkKinds = pageBlocks(parsed).flatMap((block) => block.links).reduce<Record<string, number>>((counts, link) => ({ ...counts, [link.kind]: (counts[link.kind] ?? 0) + 1 }), {});
  expect(linkKinds).toEqual({ database: 12, external: 26, page: 8, attachment: 17 });

  // `IMP-004`: media comes from the archive, never the network.
  const mediaBlocks = pageBlocks(parsed).filter((block) => block.kind === "media");
  expect(mediaBlocks.length).toBe(17);
  expect(mediaBlocks.every((block) => parsed.media.some((media) => media.sourceId === block.mediaSourceId))).toBe(true);
  expect(parsed.media.every((media) => Boolean(media.archivePath) && media.bytes.byteLength > 0)).toBe(true);
  // Nothing the archive contains is ever reported absent.
  const present = new Set(readZipArchive(fixture("notion-workspace-export.zip")).keys());
  expect(parsed.report.unmapped.filter((entry) => entry.label === "Archive file was not present" && present.has(entry.detail ?? ""))).toEqual([]);

  // The report names every construct that did not map.
  expect(labels(parsed.report.unmapped)).toEqual([
    "Archive file was not present",
    "Notion database view configuration",
    "Notion exported a filtered database view as a loose CSV with no host page",
    "Notion exported two databases with the same name in one directory",
    "Notion image is not in the archive, so it was imported as a link",
    "Notion record page is absent from the exported database view",
  ]);
  expect(parsed.report.unmapped.filter((entry) => entry.label === "Archive file was not present").length).toBe(6);
  expect(parsed.report.unmapped.filter((entry) => entry.label.startsWith("Notion image is not in the archive")).length).toBe(4);
  expect(parsed.report.unmapped.filter((entry) => entry.label === "Notion database view configuration").length).toBe(11);
  expect(labels(parsed.report.warnings)).toEqual([
    "Notion CSV column arrived with no values, so its property type could not be inferred",
    "Notion CSV column has too few distinct values to tell a select from free text, so it arrived as text",
  ]);
  expect([...new Set(parsed.report.created.map((entry) => entry.kind))].sort()).toEqual(["container", "database", "file", "page", "record"]);
} },
    { name: "the real Confluence Cloud space export becomes pages, versions, restrictions and a named residue", run: () => {
  const parsed = confluence();

  expect(parsed.containers.length).toBe(1);
  expect(parsed.containers[0]!.name).toBe("alex");
  expect(parsed.containers[0]!.key).toBe("~100001d9d995557c2d5fc99d5f444042ec9317");
  // `spaces.csv` declares `spacetype=personal` (`CONT-005`).
  expect(parsed.containers[0]!.personal).toBe(true);
  // `PORT-005`: every principal the export names is an inactive historical actor.
  expect(parsed.members.length).toBe(35);
  expect(parsed.members.every((member) => member.status === "inactive-historical")).toBe(true);
  expect(parsed.members.some((member) => member.sourceId === "confluence-member:100001:d9d99555-7c2d-5fc9-9d5f-444042ec9317")).toBe(true);

  // `content.csv` is the tree: one root page with two children, in
  // `child_position` order.
  expect(parsed.pages.map((page) => page.title)).toEqual([
    "Overview", "Getting started in Confluence", "Pizza Restaurant Launch Plan",
  ]);
  const overview = parsed.pages[0]!;
  const started = parsed.pages[1]!;
  const pizza = parsed.pages[2]!;
  expect(overview.parentSourceId).toBe(undefined);
  expect(started.parentSourceId).toBe(overview.sourceId);
  expect(pizza.parentSourceId).toBe(overview.sourceId);
  expect(parsed.pages.every((page) => page.sourceIdentityKind === "native")).toBe(true);

  // A `titleEmoji` content property is the page icon.
  expect(started.icon).toBe("👋");
  expect(overview.icon).toBe(undefined);

  // `PAGE-001` labels: the only label in this export is a member's personal
  // favourite, so no page arrives with one and the report says why.
  expect(parsed.pages.flatMap((page) => page.labels)).toEqual([]);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes('personal label "favourite"'))).toBe(true);

  // `REV-007` labelled profile: ordinals from `content.csv`, a draft recorded as
  // an unpublished revision, and no version comment anywhere in this export.
  expect(pizza.revisions.map((revision) => [revision.ordinal ?? null, revision.origin, revision.status])).toEqual([
    [1, "publish", "current"], [null, "autosave", "draft"],
  ]);
  expect(pizza.lifecycle).toBe("live-with-unpublished-changes");
  expect(overview.lifecycle).toBe("live");
  expect(parsed.pages.flatMap((page) => page.revisions).every((revision) => revision.comment === undefined)).toBe(true);
  expect(parsed.report.warnings.some((entry) => entry.label.startsWith("No content row in this export carries a version comment"))).toBe(true);
  expect(parsed.report.created.filter((entry) => entry.kind === "version").length).toBe(4);

  // Restrictions. Every `content_permissions` row in this export names a single
  // USER, so each becomes a named member grant. `SHARE-004` allows at most one
  // general grant per page and none at all in a personal container, and
  // `SHARE-005` forbids widening an imported grant to the workspace — so no page
  // here carries a general grant of any kind.
  const grants = parsed.pages.flatMap((page) => page.grants);
  expect(grants.length).toBe(3);
  expect(grants).toEqual(parsed.pages.map(() => ({
    principalKind: "member",
    principalSourceId: "confluence-member:100001:d9d99555-7c2d-5fc9-9d5f-444042ec9317",
    level: "edit",
    general: false,
  })));
  expect(grants.some((grant) => grant.general)).toBe(false);
  expect(grants.some((grant) => grant.principalKind === "container" || grant.principalKind === "workspace")).toBe(false);
  expect(parsed.pages.every((page) => page.grants.filter((grant) => grant.general).length <= 1)).toBe(true);
  expect(parsed.report.warnings.some((entry) => entry.label.startsWith("The exported space is a personal space"))).toBe(true);

  // Storage-format bodies: layouts flattened, macros named, tasks and tables kept.
  const pizzaBlocks = allBlocks(pizza.blocks);
  expect(pizzaBlocks.filter((block) => block.kind === "heading").map((block) => [block.level, block.text])).toEqual([
    [1, "Launch strategy"], [2, "Phased plan"], [2, "Critical decisions"], [2, "Launch checklist"], [2, "Success measures"],
  ]);
  const table = pizzaBlocks.find((block) => block.kind === "table")!;
  expect(table.rows?.[0]).toEqual(["Phase", "Key activities", "Target outcome"]);
  expect(table.rows?.length).toBe(6);
  expect(pizzaBlocks.filter((block) => block.kind === "callout").map((block) => block.text)).toEqual(["info", "note"]);
  expect(pizzaBlocks.filter((block) => block.kind === "task").length).toBe(8);
  expect(pizzaBlocks.filter((block) => block.kind === "task").every((block) => block.checked === false)).toBe(true);
  expect(pizzaBlocks.filter((block) => block.kind === "bulleted-list").length).toBe(5);
  expect(allBlocks(started.blocks).filter((block) => block.kind === "task").length).toBe(9);
  expect(allBlocks(started.blocks).filter((block) => block.kind === "heading").length).toBe(12);
  expect(pageBlocks(parsed).some((block) => block.kind === "media")).toBe(false);

  // `IMP-004`: every image in this export is hosted outside the archive, so each
  // one arrives as a link and is named in the report. Nothing is fetched.
  expect(parsed.media.length).toBe(0);
  expect(parsed.report.unmapped.filter((entry) => entry.label.startsWith("Confluence image is hosted outside the archive")).length).toBe(12);

  expect(labels(parsed.report.unmapped)).toEqual([
    "Confluence app table AO_BAF3AA_AOINLINE_TASK was not read; its inline tasks came from the page bodies instead",
    "Confluence content names no space this export carries, so it landed in the exported space",
    'Confluence content property "collabService" did not cross',
    'Confluence content property "external-version-id" did not cross',
    'Confluence content property "external-versioning-mechanism" did not cross',
    'Confluence content property "generated-by" did not cross',
    'Confluence content property "macroNames" did not cross',
    'Confluence content property "ncs-step-version" did not cross',
    'Confluence content property "ncs-step-version-source" did not cross',
    'Confluence content property "referenceId" did not cross',
    'Confluence content property "share-id" did not cross',
    'Confluence content property "sourceTemplateEntityId" did not cross',
    'Confluence content property "title-status" did not cross',
    "Confluence custom has no Slate equivalent",
    "Confluence database has no Slate equivalent",
    "Confluence image is hosted outside the archive, so it was imported as a link",
    "Confluence inline comment marker dropped, its text kept",
    "Confluence layout section flattened",
    'Confluence macro "blog-posts" has no Slate equivalent',
    'Confluence macro "recently-updated" has no Slate equivalent',
    'Confluence personal label "favourite" is a member\'s favourite, not a page label',
    "Confluence placeholder text dropped",
    "Confluence slide has no Slate equivalent",
    "Confluence slide version belongs to content that was not imported",
    "Confluence spacedescription has no Slate equivalent",
    "Confluence table carries no text; its cell contents were imported as blocks",
    "Confluence whiteboard canvas for database content",
    "Confluence whiteboard canvas for slide content",
    "Confluence whiteboard canvas payload was not imported",
  ]);
  expect(labels(parsed.report.warnings)).toEqual([
    "Confluence space permissions and role assignments were not imported; every restriction stays container-scoped",
    "No content row in this export carries a version comment, so no revision arrived with one",
    "The export declares attachments were backed up but carries no attachment content rows",
    "The exported space is a personal space, so no imported page carries a general access grant",
  ]);
  // This export carries no folders, blog posts, comments or attachments, so
  // those clause journeys stay untested until an export that has them arrives.
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("folder"))).toBe(false);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("blogpost"))).toBe(false);
  // No page in this export has a historical version row, so revision ordering
  // is proven on a synthetic export in `mapping-regressions.test.ts` instead.
  expect(parsed.pages.map((page) => page.revisions.filter((revision) => revision.origin === "publish").length)).toEqual([1, 1, 1]);
  // The placeholders Confluence left in the template page are named with their
  // own text, not with an empty detail.
  expect(parsed.report.unmapped.filter((entry) => entry.label === "Confluence placeholder text dropped").map((entry) => entry.detail).sort()).toEqual(["Insert your LinkedIn URL here", "Insert your Medium profile here", "Insert your Twitter handle here", "Insert your email here"]);
} },
    { name: "the real Google Docs .docx download imports as paragraphs, and the package proves its producer", run: async () => {
  const files = readZipArchive(fixture("google-docs-download.docx"));
  const paths = [...files.keys()].sort();
  const text = (path: string) => new TextDecoder().decode(files.get(path)!);

  // Google Docs writes no document properties and a single package
  // relationship; Word writes `docProps/core.xml` and `docProps/app.xml` and
  // relates both. Google also zeroes every revision-save id and emits no
  // `w:rsids` table.
  expect(paths).toEqual([
    "[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml",
    "word/fontTable.xml", "word/numbering.xml", "word/settings.xml", "word/styles.xml", "word/theme/theme1.xml",
  ]);
  expect(paths.some((path) => path.startsWith("docProps/"))).toBe(false);
  expect(text("[Content_Types].xml").includes("docProps")).toBe(false);
  expect([...text("_rels/.rels").matchAll(/<Relationship\b/g)].length).toBe(1);
  expect(text("word/settings.xml").includes("w:rsids")).toBe(false);
  expect([...text("word/document.xml").matchAll(/w:rsid[A-Za-z]*="(?!00000000)/g)].length).toBe(0);
  // The numbering part is present but empty, so this fixture proves the
  // paragraph path only. Synthetic OOXML fixtures cover lists and headings;
  // the separate Word-produced fixture and its import regression are under
  // tests/flagship/federation (see fixtures/real/PROVENANCE.md).
  expect(/<w:numbering[^>]*\/>/.test(text("word/numbering.xml"))).toBe(true);
  expect(text("word/document.xml").includes("w:numPr")).toBe(false);

  const parsed = googleDocx();
  expect(parsed.format).toBe("google-docx");
  expect(parsed.pages.length).toBe(1);
  expect(parsed.pages[0]!.title).toBe("google-docs-download");
  expect(parsed.pages[0]!.blocks.map((block) => [block.kind, block.text])).toEqual([
    ["paragraph", "Building a plan for launching my pizza resturant"],
    ["paragraph", "This is where a document would be if I wrote one"],
  ]);
  expect(parsed.media.length).toBe(0);
  expect(parsed.report.unmapped).toEqual([]);
} }
  ];
  for (const scenario of cases) {
    try {  await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
});
