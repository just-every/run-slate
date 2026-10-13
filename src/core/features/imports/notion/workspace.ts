import {archiveMediaSource} from '../archive-stream';
import { archiveMediaType, readZipArchive, requireArchiveText } from "../archive";
import { parseCsv, validateCsvTable } from "../csv";
import { ImportError } from "../errors";
import { createImportReport, reportCreated, reportMissingArchiveFile, reportUnmapped, reportWarning } from "../report";
import type { ImportParseOptions, ImportSourceFile, ImportedDatabase, ImportedMedia, ImportedPage, ImportedRecord, NormalizedImport } from "../types";
import { notionFieldValue, notionFields, type NotionFieldType } from "./fields";
import { parseNotionMarkdown, walkBlocks, type NotionDocument } from "./markdown";
import { identityFor, parentKey, resolveArchiveHref, titleFor, treeKey } from "./paths";

interface NotionPage {
  path: string;
  page: ImportedPage;
  document: NotionDocument;
  directory: string;
}

interface NotionDatabase {
  path: string;
  database: ImportedDatabase;
  records: ImportedRecord[];
  types: NotionFieldType[];
}

/** A tree key two different files claim: usable for neither's tree lookup. */
const ambiguous = Symbol("ambiguous tree key");
type ByKey<T> = Map<string, T | typeof ambiguous>;

function index<T extends { path: string }>(entries: T[]): ByKey<T> {
  const byKey: ByKey<T> = new Map();
  for (const entry of entries) {
    const key = treeKey(entry.path);
    byKey.set(key, byKey.has(key) ? ambiguous : entry);
  }
  return byKey;
}

function resolved<T>(byKey: ByKey<T>, key: string): T | undefined {
  const found = byKey.get(key);
  return found === ambiguous || found === undefined ? undefined : found;
}

function bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseNotionWorkspace(source: ImportSourceFile, options?: ImportParseOptions): NormalizedImport {
  return parseNotionFiles(readZipArchive(source.bytes,options?.limits),source,options);
}
export function parseNotionFiles(files:Map<string,Uint8Array>,source:Pick<ImportSourceFile,'name'>,options?:ImportParseOptions):NormalizedImport {
  const markdownPaths = [...files.keys()].filter((path) => /\.md$/i.test(path)).sort();
  if (!markdownPaths.length) throw new ImportError("IMPORT_FORMAT_INVALID", "The Notion archive has no Markdown pages.");
  const csvPaths = [...files.keys()].filter((path) => /\.csv$/i.test(path)).sort();

  const report = createImportReport();
  const containerSourceId = "notion-workspace:archive";

  // Every archive file that is not a page or a database is media. There is no
  // extension allowlist: a file the archive contains is never reported missing.
  const mediaBySourceId = new Map<string, ImportedMedia>();
  const mediaByPath = new Map<string, string>();
  for (const path of [...files.keys()].sort()) {
    if (/\.(?:md|csv)$/i.test(path)) continue;
    const sourceId = `notion-file:${path}`;
    mediaByPath.set(path, sourceId);
    mediaBySourceId.set(sourceId, {
      sourceId,
      sourceIdentityKind: "path-derived",
      name: path.split("/").at(-1) ?? path,
      archivePath: path,
      mediaType: archiveMediaType(path,archiveMediaType(path)==='application/octet-stream'?(archiveMediaSource(files,path)?.prefix??files.get(path)):undefined),
      source:archiveMediaSource(files,path),
      get bytes(){return files.get(path)!;},
    });
  }

  const pages: NotionPage[] = markdownPaths.map((path) => {
    const identity = identityFor(path, "notion-page");
    const document = parseNotionMarkdown(requireArchiveText(files, path), identity.sourceId);
    const title = titleFor(path);
    return {
      path,
      document,
      directory: parentKey(treeKey(path)),
      page: {
        sourceId: identity.sourceId,
        sourceIdentityKind: identity.sourceIdentityKind,
        containerSourceId,
        title,
        blocks: document.blocks,
        lifecycle: "live",
        labels: [],
        properties: document.properties,
        grants: [],
        revisions: [],
      },
    };
  });

  // Same-titled siblings share a tree key (Notion exports three `Untitled`
  // pages into one directory), so links resolve by exact archive path and only
  // the tree lookup uses keys — where a collision is reported, never guessed.
  const pagesByPath = new Map(pages.map((entry) => [entry.path, entry]));
  const pagesByKey = index(pages);

  const databases: NotionDatabase[] = csvPaths.map((path) => {
    const identity = identityFor(path, "notion-database");
    const { header, records } = validateCsvTable(parseCsv(bom(requireArchiveText(files, path))));
    const fields = notionFields(header, records, identity.sourceId);
    const types = fields.map((field) => field.type as NotionFieldType);
    return {
      path,
      types,
      database: {
        sourceId: identity.sourceId,
        sourceIdentityKind: identity.sourceIdentityKind,
        containerSourceId,
        parentSourceId: (resolved(pagesByKey, treeKey(path)) ?? resolved(pagesByKey, parentKey(treeKey(path))))?.page.sourceId,
        title: titleFor(path),
        fields,
      },
      records: records.map((row, index) => ({
        sourceId: `${identity.sourceId}:record:${index + 1}`,
        sourceIdentityKind: "path-derived" as const,
        databaseSourceId: identity.sourceId,
        fields: Object.fromEntries(header.map((name, column) => [name, notionFieldValue(types[column]!, row[column] ?? "")])),
        blocks: [],
        labels: [],
      })),
    };
  });
  const databasesByPath = new Map(databases.map((entry) => [entry.path, entry]));
  const databasesByKey = index(databases);

  // The tree: a page's children live in a directory spelled with the page's
  // title and no identifier. A record page's directory is the database's, whose
  // own parent page then owns it.
  for (const entry of pages) {
    if (pagesByKey.get(entry.directory) === ambiguous) {
      reportUnmapped(report, "Notion exported two pages whose directories share a name, so this page's parent is ambiguous", entry.page.sourceId, entry.directory);
      continue;
    }
    const parent = resolved(pagesByKey, entry.directory) ?? resolved(pagesByKey, parentKey(entry.directory));
    if (parent && parent !== entry) entry.page.parentSourceId = parent.page.sourceId;
  }

  // A CSV row and a Markdown page with the same title in the database's own
  // directory are the same thing (`record.page-parity.v1`, `record-is-page`).
  for (const entry of databases) {
    const directory = treeKey(entry.path);
    const candidates = pages.filter((page) => page.directory === directory);
    const taken = new Set<string>();
    const titleColumn = entry.database.fields[0]?.name;
    for (const record of entry.records) {
      const title = titleColumn ? String(record.fields[titleColumn] ?? "") : "";
      const matches = candidates.filter((page) => page.page.title === title);
      const rowsWithTitle = entry.records.filter((row) => titleColumn && String(row.fields[titleColumn] ?? "") === title);
      if (matches.length > 1 || (matches.length && rowsWithTitle.length > 1)) {
        reportUnmapped(report, "Notion database row has ambiguous exported record pages", record.sourceId, title);
        continue;
      }
      const match = matches[0];
      if (!match) {
        if (candidates.length) reportUnmapped(report, "Notion database row has no exported record page", record.sourceId, title);
        continue;
      }
      taken.add(match.path);
      record.pageSourceId = match.page.sourceId;
      record.blocks = match.page.blocks;
      for (const [name, value] of Object.entries(match.document.properties)) {
        if (!(name in record.fields)) record.fields[name] = value;
      }
    }
    for (const page of candidates) {
      if (!taken.has(page.path)) {
        reportUnmapped(report, "Notion record page is absent from the exported database view", page.page.sourceId, entry.database.title);
      }
    }
    for (const field of entry.database.fields) {
      if (field.type !== "text" || field.name === entry.database.fields[0]?.name) continue;
      const values = entry.records.map((record) => record.fields[field.name]).filter(Boolean);
      reportWarning(
        report,
        values.length
          ? "Notion CSV column has too few distinct values to tell a select from free text, so it arrived as text"
          : "Notion CSV column arrived with no values, so its property type could not be inferred",
        entry.database.sourceId,
        field.name,
      );
    }
    if (!entry.database.parentSourceId && !candidates.length) {
      reportUnmapped(report, "Notion exported a filtered database view as a loose CSV with no host page", entry.database.sourceId, entry.path);
    }
  }

  // Links. Notion percent-encodes relative archive paths; a target is resolved
  // by its exact path, and everything that does not resolve inside the archive
  // stays a link and is named in the report (`IMP-004`). Nothing is fetched.
  const referencedMedia = new Set<string>();
  for (const entry of pages) {
    walkBlocks(entry.page.blocks, (block) => {
      for (const link of block.links) {
        const target = resolveArchiveHref(entry.path, link.href);
        if (!target) {
          link.kind = "external";
          continue;
        }
        const page = pagesByPath.get(target);
        if (page) {
          link.kind = "page";
          link.targetSourceId = page.page.sourceId;
          continue;
        }
        const database = databasesByPath.get(target);
        if (database) {
          link.kind = "database";
          link.targetSourceId = database.database.sourceId;
          continue;
        }
        const media = mediaByPath.get(target);
        if (media) {
          link.kind = "attachment";
          link.targetSourceId = media;
          referencedMedia.add(media);
          continue;
        }
        link.kind = "external";
        reportMissingArchiveFile(report, target, entry.page.sourceId);
      }
      if (block.kind !== "media") return;
      const attachment = block.links.find((link) => link.kind === "attachment" && link.targetSourceId);
      if (attachment) {
        block.mediaSourceId = attachment.targetSourceId;
        return;
      }
      block.kind = "link";
      reportUnmapped(report, "Notion image is not in the archive, so it was imported as a link", entry.page.sourceId, block.links[0]?.href);
    });
  }

  for (const entry of pages) reportCreated(report, "page", entry.page.title, entry.page.sourceId);
  for (const entry of databases) {
    reportCreated(report, "database", entry.database.title, entry.database.sourceId);
    for (const record of entry.records) reportCreated(report, "record", entry.database.title, record.sourceId);
  }
  for (const media of mediaBySourceId.values()) {
    reportCreated(report, "file", media.archivePath ?? media.name, media.sourceId);
    if (!referencedMedia.has(media.sourceId)) reportWarning(report, "Archive file is not referenced by any exported page", media.sourceId, media.archivePath);
  }
  for (const entry of pages) {
    for (const item of entry.document.unmapped) reportUnmapped(report, item.label, entry.page.sourceId, item.detail);
  }
  for (const key of databasesByKey.keys()) {
    if (databasesByKey.get(key) === ambiguous) reportUnmapped(report, "Notion exported two databases with the same name in one directory", undefined, key);
  }
  reportCreated(report, "container", source.name, containerSourceId);

  return {
    format: "notion-workspace",
    sourceName: source.name,
    containers: [{
      sourceId: containerSourceId,
      sourceIdentityKind: "path-derived",
      name: source.name.replace(/\.zip$/i, "") || "Notion workspace",
      personal: false,
      labels: [],
      grants: [],
    }],
    members: [],
    pages: pages.map((entry) => entry.page),
    databases: databases.map((entry) => entry.database),
    records: databases.flatMap((entry) => entry.records),
    media: [...mediaBySourceId.values()],
    report,
  };
}
