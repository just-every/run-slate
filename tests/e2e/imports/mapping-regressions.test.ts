import { expect, test } from "vitest";
import { gzipSync, strToU8 } from "fflate";
import { ImportError, parseImport } from "../../../src/core/features/imports/index";
import type { ImportedBlock, NormalizedImport } from "../../../src/core/features/imports/types";
import {
  confluenceContentHeader, confluenceContentRow, docxHeading, docxParagraph,
  syntheticConfluenceCsvExport, syntheticDocxWith, syntheticNotionArchiveFrom,
} from "./fixtures/builders";

/**
 * Cases the incumbents' committed exports do not contain, each pinned so that
 * reverting the mapping it covers fails here. Every fixture is synthetic and
 * proves no clause on its own; the real exports in `real-exports.test.ts` do
 * that. What these prove is that a construct the real fixtures never exercise
 * is still mapped, and mapped one specific way.
 */

function allBlocks(blocks: ImportedBlock[]): ImportedBlock[] {
  return blocks.flatMap((block) => [block, ...allBlocks(block.children)]);
}

function shape(blocks: ImportedBlock[]): [string, number | undefined, string | undefined][] {
  return allBlocks(blocks).map((block) => [block.kind, block.level, block.text]);
}

function confluence(bytes: Uint8Array, limits?: Record<string, number>): NormalizedImport {
  return parseImport("confluence-space", { name: "synthetic-confluence.zip", bytes }, limits ? { limits } : undefined);
}

function notion(files: Record<string, Uint8Array | string>): NormalizedImport {
  return parseImport("notion-workspace", { name: "synthetic-notion.zip", bytes: syntheticNotionArchiveFrom(files) });
}

const contentHeader = confluenceContentHeader();
const page = (values: Parameters<typeof confluenceContentRow>[0]) => confluenceContentRow({ contenttype: "PAGE", content_status: "current", spaceid: "1", version: "1", ...values });

// ---------------------------------------------------------------- safety ----

test("a gzipped Confluence table member is inflated against a budget, so a nested bomb is refused", () => {
  // The zip's own limits only ever saw the compressed member. 2 MB of one
  // repeated byte gzips to about 2 KB, so the archive is tiny and the bomb is
  // entirely inside the member.
  const bomb = gzipSync(strToU8("A".repeat(2_000_000)));
  const archive = syntheticConfluenceCsvExport({
    tables: { content: [contentHeader, page({ contentid: "10", title: "Overview" })] },
    files: { "bandana.csv.gz": bomb },
  });
  expect(archive.byteLength < 64_000, "the archive itself is small").toBeTruthy();
  expect(() => confluence(archive, { maximumExpandedBytes: 100_000, maximumEntryBytes: 100_000 })).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && error.code === "IMPORT_ARCHIVE_LIMIT_EXCEEDED" });
});

test("a Confluence table member that really is gzipped is read through the gzip path", () => {
  const rows = "contentid,contenttype,title,version,versioncomment,prevver,content_status,spaceid,child_position,parentid\n20,PAGE,Compressed,1,,,current,1,1,\n";
  const parsed = confluence(syntheticConfluenceCsvExport({
    tables: {},
    files: { "content.csv.gz": gzipSync(strToU8(rows)) },
  }));
  expect(parsed.pages.map((entry) => entry.title)).toEqual(["Compressed"]);
});

// ------------------------------------------------------------ confluence ----

test("historical Confluence versions arrive oldest first, with the current version last", () => {
  // The committed Confluence export has no historical page version, so version
  // ordering can only be pinned on a synthetic export.
  const parsed = confluence(syntheticConfluenceCsvExport({
    tables: {
      content: [
        contentHeader,
        page({ contentid: "30", title: "Plan", version: "3" }),
        page({ contentid: "28", title: "Plan", version: "1", prevver: "30", versioncomment: "first" }),
        page({ contentid: "29", title: "Plan", version: "2", prevver: "30", versioncomment: "second" }),
      ],
      bodycontent: [["bodycontentid", "body", "contentid", "bodytypeid"], ["1", "<p>Now</p>", "30", "2"]],
    },
  }));
  expect(parsed.pages[0]!.revisions.map((revision) => [revision.ordinal, revision.comment])).toEqual([
    [1, "first"], [2, "second"], [3, undefined],
  ]);
  expect(parsed.report.created.filter((entry) => entry.kind === "version").length).toBe(3);
});

test("a Confluence restriction naming a user or a group becomes a named grant, never a space-wide one", () => {
  const parsed = confluence(syntheticConfluenceCsvExport({
    tables: {
      content: [contentHeader, page({ contentid: "40", title: "Secret" })],
      user_mapping: [["user_key", "username", "lower_username", "aaid"], ["u1", "ada", "ada", "u1"]],
      content_permissions: [
        ["groupname", "permission_id", "permission_type", "content_id", "principal_type", "principal_id"],
        ["", "1", "VIEW", "40", "USER", "u1"],
        ["editors", "2", "EDIT", "40", "GROUP", ""],
      ],
    },
  }));
  expect(parsed.pages[0]!.grants).toEqual([
    { principalKind: "member", principalSourceId: "confluence-member:u1", level: "view", general: false },
    { principalKind: "group", principalSourceId: "confluence-group:editors", level: "edit", general: false },
  ]);
  expect(parsed.pages[0]!.grants.some((grant) => grant.general)).toBe(false);
  expect(parsed.members.map((member) => [member.sourceId, member.status])).toEqual([["confluence-member:u1", "inactive-historical"]]);
});

test("several space-wide Confluence restrictions collapse into the one general grant, at its strongest level", () => {
  const parsed = confluence(syntheticConfluenceCsvExport({
    tables: {
      content: [contentHeader, page({ contentid: "50", title: "Shared" })],
      content_permissions: [
        ["groupname", "permission_id", "permission_type", "content_id", "principal_type", "principal_id"],
        ["", "1", "VIEW", "50", "ACCESS_CLASS", "all-licensed-users"],
        ["", "2", "EDIT", "50", "ACCESS_CLASS", "all-product-admins"],
      ],
    },
  }));
  expect(parsed.pages[0]!.grants).toEqual([
    { principalKind: "container", principalSourceId: "confluence-space:1", level: "edit", general: true },
  ]);
  expect(parsed.pages[0]!.grants.filter((grant) => grant.general).length).toBe(1);
  expect(parsed.pages[0]!.grants.some((grant) => grant.principalKind === "workspace")).toBe(false);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("more than one space-wide restriction"))).toBe(true);
});

test("a page in a personal Confluence space carries no general grant, and an unknown restriction type invents none", () => {
  const parsed = confluence(syntheticConfluenceCsvExport({
    tables: {
      spaces: [["spaceid", "spacename", "spacekey", "spacetype", "spacestatus"], ["1", "ada", "~ada", "personal", "CURRENT"]],
      content: [contentHeader, page({ contentid: "60", title: "Mine" })],
      content_permissions: [
        ["groupname", "permission_id", "permission_type", "content_id", "principal_type", "principal_id"],
        ["", "1", "VIEW", "60", "ACCESS_CLASS", "all-licensed-users"],
        ["", "2", "SOMETHING_ELSE", "60", "USER", "u1"],
      ],
    },
  }));
  expect(parsed.containers[0]!.personal).toBe(true);
  expect(parsed.pages[0]!.grants).toEqual([]);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("personal space carries no general grant"))).toBe(true);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes('"SOMETHING_ELSE" has no Slate grant level'))).toBe(true);
});

test("Confluence content the tree would otherwise lose is imported or named: drafts, deleted rows, and second body rows", () => {
  const originalDate='2019-02-03T10:00:00-05:00';
  const parsed = confluence(syntheticConfluenceCsvExport({
    tables: {
      content: [
        [...contentHeader,'creator','creationdate'],
        [...page({ contentid: "70", title: "Live" }),'',''],
        [...page({ contentid: "71", title: "Never published", content_status: "draft" }),'',''],
        [...page({ contentid: "72", title: "Binned", content_status: "deleted" }),'',''],
        [...page({contentid:'73',title:'Announcement',contenttype:'BLOGPOST'}),'original-author',originalDate],
        [...page({contentid:'74',title:'Unpublished news',contenttype:'BLOGPOST',content_status:'draft'}),'original-author',originalDate],
      ],
      user_mapping:[['user_key','username'],['original-author','Original author']],
      bodycontent: [
        ["bodycontentid", "body", "contentid", "bodytypeid"],
        ["1", "<p>Live body</p>", "70", "2"],
        ["2", '"{\\"plugin\\":true}"', "70", "1"],
        ["3", "<p>Draft body</p>", "71", "2"],
        ['4','<p>Announcement body</p>','73','2'],
      ],
    },
  }));
  const live = parsed.pages.find((entry) => entry.title === "Live")!;
  const draft = parsed.pages.find((entry) => entry.title === "Never published")!;
  // A plugin-payload body row must not blank the page it shares an id with.
  expect(shape(live.blocks)).toEqual([["paragraph", undefined, "Live body"]]);
  expect(live.lifecycle).toBe("live");
  expect(draft.lifecycle).toBe("draft");
  expect(shape(draft.blocks)).toEqual([["paragraph", undefined, "Draft body"]]);
  expect(parsed.pages.some((entry) => entry.title === "Binned")).toBe(false);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes('status "deleted"'))).toBe(true);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("body type 1 is a plugin payload"))).toBe(true);
  const post=parsed.pages.find(page=>page.sourceId==='confluence-page:73')!;
  expect(post.post?.publishedAt).toBe(new Date(originalDate).toISOString());
  expect(post.post?.authorSourceId).toBe(parsed.members.find(member=>member.displayName==='Original author')?.sourceId);
  expect(shape(post.blocks)).toEqual([['paragraph',undefined,'Announcement body']]);
  expect(parsed.pages.find(page=>page.sourceId==='confluence-page:74')?.lifecycle).toBe('draft');
  expect(parsed.report.unmapped.some(entry=>entry.label.includes('blogpost has no Slate equivalent'))).toBe(false);
});

test("Confluence storage format loses no text: links in paragraphs, images in lists and headings, and macro prose", () => {
  const body = [
    '<p>See <ac:link><ri:page ri:content-title="Other" /><ac:link-body>the other page</ac:link-body></ac:link> for detail.</p>',
    '<h2>Diagram <ac:image ac:alt="in a heading"><ri:attachment ri:filename="a.png" /></ac:image></h2>',
    '<ul><li>Outer<ac:image ac:alt="in a list"><ri:attachment ri:filename="b.png" /></ac:image><ul><li>Inner</li></ul></li></ul>',
    '<ac:structured-macro ac:name="details"><ac:rich-text-body><p>Prose inside an unmapped macro</p></ac:rich-text-body></ac:structured-macro>',
    '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">python</ac:parameter><ac:plain-text-body>def f():\n    return 1</ac:plain-text-body></ac:structured-macro>',
    '<table><tbody><tr><td><p>Outer cell</p><table><tbody><tr><td><p>Nested cell</p></td></tr></tbody></table></td></tr></tbody></table>',
    '<ac:structured-macro ac:name="toc"><ac:parameter ac:name="minLevel">1</ac:parameter><ac:parameter ac:name="maxLevel">2</ac:parameter><ac:parameter ac:name="type">flat</ac:parameter></ac:structured-macro>',
    '<p>Before <ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Done</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro> and <ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Blocked</ac:parameter><ac:parameter ac:name="colour">Red</ac:parameter></ac:structured-macro> after.</p>',
  ].join("");
  const parsed = confluence(syntheticConfluenceCsvExport({
    tables: {
      content: [
        contentHeader,
        page({ contentid: "80", title: "Rich" }),
        page({ contentid: "81", title: "Other" }),
        confluenceContentRow({ contentid: "82", contenttype: "ATTACHMENT", title: "a.png", content_status: "current", spaceid: "1", version: "1" }),
      ],
      bodycontent: [["bodycontentid", "body", "contentid", "bodytypeid"], ["1", body, "80", "2"]],
    },
    files: { "attachments/82/1": strToU8("PNG") },
  }));
  const rich = parsed.pages.find((entry) => entry.title === "Rich")!;
  const blocks = allBlocks(rich.blocks);
  const texts = blocks.map((block) => block.text);

  // An `ac:link` inside a paragraph is a block of its own, resolved by title.
  const link = blocks.find((block) => block.kind === "link")!;
  expect(link.text).toBe("the other page");
  expect(link.links[0]?.targetSourceId).toBe(parsed.pages.find((entry) => entry.title === "Other")!.sourceId);
  // An image inside a heading or a list item survives as media.
  expect(blocks.filter((block) => block.kind === "media" || block.kind === "link" && block.text === "in a list").map((block) => block.text).sort()).toEqual(["in a heading", "in a list"]);
  expect(blocks.find((block) => block.kind === "heading")?.text).toEqual("Diagram");
  // A nested list item's text belongs to its own item, not twice to its parent.
  expect(blocks.filter((block) => block.kind === "bulleted-list").map((block) => block.text)).toEqual(["Outer", "Inner"]);
  // An unmapped macro keeps its prose and is still named.
  expect(texts.includes("Prose inside an unmapped macro")).toBe(true);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes('macro "details"') && entry.label.includes("body was kept"))).toBe(true);
  // Code is verbatim: the indentation is the content.
  const code = blocks.find((block) => block.kind === "code")!;
  expect(code.text).toBe("def f():\n    return 1");
  expect(code.language).toBe("python");
  // A nested table is its own block; its rows are not hoisted into the outer.
  const tables = blocks.filter((block) => block.kind === "table");
  expect(tables.map((table) => table.rows)).toEqual([[["Outer cell"]], [["Nested cell"]]]);
  // Synthetic mechanics only: the genuine export does not establish IMP-010 for these macros.
  expect(blocks.find(block => block.kind === 'table-of-contents')?.tableOfContents).toEqual({minLevel: 1, maxLevel: 2, style: 'flat'});
  const statusParagraph = blocks.find(block => block.text === 'Before Done and Blocked after.')!;
  expect(statusParagraph.statuses?.map(status => [statusParagraph.text!.slice(status.textStart, status.textEnd), status.colour])).toEqual([['Done', 'green'], ['Blocked', 'red']]);
  expect(parsed.report.unmapped.some(entry => /macro "(?:toc|status)" has no Slate equivalent/.test(entry.label))).toBe(false);
});

// ---------------------------------------------------------------- notion ----

test("Notion pages with the same title in one directory keep separate identities and links resolve by path", () => {
  const parsed = notion({
    "Root aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md": "# Root\n\n[first](Root/Untitled 11111111111111111111111111111111.md)\n\n[second](Root/Untitled 22222222222222222222222222222222.md)",
    "Root/Untitled 11111111111111111111111111111111.md": "# Untitled\n\ntype: first",
    "Root/Untitled 22222222222222222222222222222222.md": "# Untitled\n\ntype: second",
  });
  const root = parsed.pages.find((entry) => entry.title === "Root")!;
  const first = parsed.pages.find((entry) => entry.properties.type === "first")!;
  const second = parsed.pages.find((entry) => entry.properties.type === "second")!;
  expect(first.sourceId).not.toBe(second.sourceId);
  expect(root.blocks.flatMap((block) => block.links).map((link) => link.targetSourceId)).toEqual([first.sourceId, second.sourceId]);
});

test("a Notion archive file with an unusual extension is imported as media, never reported absent", () => {
  const parsed = notion({
    "Page aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md": "# Page\n\n![Shot](Page/photo.heic)\n\n[Deck](Page/deck.key)",
    "Page/photo.heic": new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99]),
    "Page/deck.key": new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]),
  });
  expect(parsed.media.map((media) => [media.name, media.mediaType]).sort()).toEqual([
    ["deck.key", "application/vnd.apple.keynote"],
    ["photo.heic", "image/heic"],
  ]);
  expect(parsed.report.unmapped.filter((entry) => entry.label === "Archive file was not present")).toEqual([]);
  const media = allBlocks(parsed.pages[0]!.blocks).find((block) => block.kind === "media")!;
  expect(media.mediaSourceId).toBe(parsed.media.find((entry) => entry.name === "photo.heic")!.sourceId);
});

test("Notion fenced code keeps its indentation and a wrapped quote stays one block", () => {
  const parsed = notion({
    "Page aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md": "# Page\n\n```python\ndef f():\n    return 1\n```\n\n> A quote that the exporter\n> wrapped across two lines.\n",
  });
  expect(shape(parsed.pages[0]!.blocks)).toEqual([
    ["code", undefined, "def f():\n    return 1"],
    ["quote", undefined, "A quote that the exporter wrapped across two lines."],
  ]);
  expect(parsed.pages[0]!.blocks[0]!.language).toBe("python");
});

test("Notion heading levels and to-do state are carried exactly", () => {
  const parsed = notion({
    "Page aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md": "# Page\n\n## Second level\n\n### Third level\n\n- [x]  Done item\n\n- [ ]  Open item\n",
  });
  expect(shape(parsed.pages[0]!.blocks)).toEqual([
    ["heading", 2, "Second level"],
    ["heading", 3, "Third level"],
    ["task", undefined, "Done item"],
    ["task", undefined, "Open item"],
  ]);
  expect(allBlocks(parsed.pages[0]!.blocks).filter((block) => block.kind === "task").map((block) => block.checked)).toEqual([true, false]);
});

test("a Notion CSV column of comma-separated values is a multi-select, and its options are collected", () => {
  const parsed = notion({
    "Page aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md": "# Page",
    "Tags cccccccccccccccccccccccccccccccc_all.csv": "Name,Labels,Owner\nFirst,\"alpha, beta\",Ada\nSecond,alpha,Grace\n",
  });
  const database = parsed.databases[0]!;
  expect(database.fields.map((field) => [field.name, field.type])).toEqual([
    ["Name", "title"], ["Labels", "multi-select"], ["Owner", "text"],
  ]);
  expect(database.fields[1]!.options).toEqual(["alpha", "beta"]);
  expect(parsed.records[0]!.fields.Labels).toEqual(["alpha", "beta"]);
});

// ------------------------------------------------------------------ docx ----

test("Word numbering decides bullet from ordinal, and w:numId=0 is not a list at all", () => {
  const numbering = [
    '<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>',
    '<w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>',
    '<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>',
    '<w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>',
    // A `w:lvlOverride` replaces the abstract format for one level.
    '<w:num w:numId="3"><w:abstractNumId w:val="10"/><w:lvlOverride w:ilvl="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:lvlOverride></w:num>',
    // A `w:num` whose abstract definition the part does not carry.
    '<w:num w:numId="4"><w:abstractNumId w:val="99"/></w:num>',
  ].join("");
  const parsed = parseImport("docx", {
    name: "lists.docx",
    bytes: syntheticDocxWith({
      numbering,
      body: [
        docxHeading("Title", 2),
        docxParagraph("Bullet", "1"),
        docxParagraph("Nested bullet", "1", "1"),
        docxParagraph("Ordinal", "2"),
        docxParagraph("Overridden to ordinal", "3"),
        docxParagraph("Missing definition", "4"),
        docxParagraph("Cancelled numbering", "0"),
        docxParagraph("Plain"),
      ].join(""),
    }),
  });
  expect(shape(parsed.pages[0]!.blocks)).toEqual([
    ["heading", 2, "Title"],
    ["bulleted-list", 1, "Bullet"],
    ["bulleted-list", 2, "Nested bullet"],
    ["numbered-list", 1, "Ordinal"],
    ["numbered-list", 1, "Overridden to ordinal"],
    ["bulleted-list", 1, "Missing definition"],
    ["paragraph", undefined, "Cancelled numbering"],
    ["paragraph", undefined, "Plain"],
  ]);
  expect(parsed.report.unmapped.some((entry) => entry.label.startsWith("Word numbering definition is missing") && entry.detail?.includes("numId 4"))).toBe(true);
});

test("a Word document with no numbering part still imports its paragraphs and headings", () => {
  const parsed = parseImport("docx", {
    name: "plain.docx",
    bytes: syntheticDocxWith({ body: [docxHeading("Heading one", 1), docxParagraph("Body")].join("") }),
  });
  expect(shape(parsed.pages[0]!.blocks)).toEqual([["heading", 1, "Heading one"], ["paragraph", undefined, "Body"]]);
  expect(parsed.report.unmapped).toEqual([]);
});


test("a Confluence restriction without a principal type does not invent a general grant", () => {
  const parsed = confluence(syntheticConfluenceCsvExport({ tables: {
    content: [contentHeader, page({ contentid: "99", title: "Unknown principal" })],
    content_permissions: [
      ["groupname", "permission_id", "permission_type", "content_id", "principal_type", "principal_id"],
      ["", "1", "VIEW", "99", "", ""],
    ],
  } }));
  expect(parsed.pages[0]!.grants).toEqual([]);
  expect(parsed.report.unmapped.some((entry) => entry.label.includes("restriction principal type"))).toBe(true);
});


test("duplicate Notion database titles do not assign record bodies by archive order", () => {
  const parsed = notion({
    "Tasks aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.csv": "Name,Status\nSame,One\nSame,Two\n",
    "Tasks/Same bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.md": "# Same\n\nFirst body",
    "Tasks/Same cccccccccccccccccccccccccccccccc.md": "# Same\n\nSecond body",
  });
  expect(parsed.records).toHaveLength(2);
  expect(parsed.records.every((record) => !record.pageSourceId)).toBe(true);
  expect(parsed.pages).toHaveLength(2);
  expect(parsed.report.unmapped.filter((entry) => entry.label.includes("ambiguous exported record pages"))).toHaveLength(2);
});
