import { NOTION_SOURCE_PATH, decodeSourceText, readSourceArchive, utf8 } from "./source-fixtures";
import { NOTION_BASE_PHYSICAL, NOTION_BASE_REPORT, NOTION_BASE_SOURCE, NOTION_BASE_WARNINGS, withExpectedCounts, withPhysicalCounts } from "./expected";
import { deterministicPayload } from "./zip-stream";
import { notionSourceFieldCensus } from "./notion-census";
import type { ArchiveBlueprint, GeneratedZipEntry, PhysicalExpectedCounts } from "./types";

const GENERATED_PAGE_COUNT = 3_020;
const MB = 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 20_000;
const MAX_EXPANDED_BYTES = 512 * MB;
const MAX_ENTRY_BYTES = 64 * MB;

function idFor(index: number): string {
  return "a" + index.toString(16).padStart(31, "0");
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function relativePath(segments: string[]): string {
  return segments.map(pathSegment).join("/");
}

function originalFiles(root: string) {
  const source = readSourceArchive(root, NOTION_SOURCE_PATH);
  const archiveRoot = [...source.files.keys()].map((path) => path.split("/")[0]!).find((part) => part.startsWith("Export-"));
  if (!archiveRoot) throw new Error("Committed Notion export has no unique Export-* root directory.");
  const entries: GeneratedZipEntry[] = [...source.files.entries()].map(([path, bytes]) => ({ path, source: bytes }));
  return {
    archiveRoot,
    entries,
    expandedBytes: entries.reduce((total, entry) => total + (entry.source as Uint8Array).byteLength, 0),
    csvCount: entries.filter((entry) => /\.csv$/i.test(entry.path)).length,
    markdownCount: entries.filter((entry) => /\.md$/i.test(entry.path)).length,
    mediaCount: entries.filter((entry) => !/\.(?:md|csv)$/i.test(entry.path)).length,
  };
}

function sourceTemplate(root: string): { path: string; markdown: string } {
  const source = readSourceArchive(root, NOTION_SOURCE_PATH);
  const item = [...source.files.entries()].find(([path]) => path.endsWith("Eat more pizza 6576adf214d157c89b87cbd372a25a89.md"));
  if (!item) throw new Error("Committed Notion export is missing its source-derived ordinary page template.");
  return { path: item[0], markdown: decodeSourceText(item[1], item[0]) };
}

function generatedPages(archiveRoot: string, sourcePath: string, template: string) {
  const entries: GeneratedZipEntry[] = [];
  const traceMarkers: NonNullable<ArchiveBlueprint["traceMarkers"]> = [];
  const idMappings: NonNullable<ArchiveBlueprint["idMappings"]> = [];
  let ordinal = 0;
  const heading = /^#\s+.*(?:\r?\n|$)/.exec(template)?.[0] ?? "";
  const sourceBody = template.startsWith(heading) ? template.slice(heading.length).trim() : template.trim();
  const makePage = (title: string, directory: string[], links: Array<{ label: string; target: string[] }> = []) => {
    ordinal += 1;
    const id = idFor(ordinal);
    const basename = title + " " + id + ".md";
    const generatedPath = archiveRoot + "/" + [...directory, basename].join("/");
    const marker = "SCALE-MARKER: notion-scale-" + String(ordinal).padStart(6, "0");
    const linkText = links.map((link) => "[" + link.label + "](" + relativePath(link.target) + ")").join("\n\n");
    const content = "# " + title + "\n\n" + sourceBody + "\n\nSource template: " + sourcePath + "\n" + marker + (linkText ? "\n\n" + linkText : "") + "\n";
    const entry: GeneratedZipEntry = { path: generatedPath, source: utf8(content) };
    entries.push(entry);
    traceMarkers.push({ marker, sourcePath, generatedPath, sourceId: id });
    idMappings.push({ sourceId: "generated-notion-page-" + String(ordinal).padStart(6, "0"), generatedId: id, generatedPath });
    return { title, id, file: basename, directory, entry };
  };

  for (let sectorIndex = 1; sectorIndex <= 20; sectorIndex += 1) {
    const sectorTitle = "Scale Sector " + String(sectorIndex).padStart(3, "0");
    const sector = makePage(sectorTitle, []);
    const sectorLinks: string[] = [];
    for (let teamIndex = 1; teamIndex <= 5; teamIndex += 1) {
      const teamTitle = "Scale Team " + String(teamIndex).padStart(2, "0");
      const teamId = idFor(ordinal + 1);
      const firstNoteTitle = "Scale Note " + String(sectorIndex).padStart(3, "0") + "-" + String(teamIndex).padStart(2, "0") + "-01";
      const firstNoteId = idFor(ordinal + 2);
      const team = makePage(teamTitle, [sectorTitle], [
        { label: "Parent: " + sectorTitle, target: ["..", sector.file] },
        { label: "Child: " + firstNoteTitle, target: [teamTitle, firstNoteTitle + " " + firstNoteId + ".md"] },
      ]);
      sectorLinks.push("[" + teamTitle + "](" + relativePath([sectorTitle, team.file]) + ")");
      if (team.id !== teamId) throw new Error("Notion team ID sequence drifted.");
      for (let noteIndex = 1; noteIndex <= 29; noteIndex += 1) {
        const noteTitle = "Scale Note " + String(sectorIndex).padStart(3, "0") + "-" + String(teamIndex).padStart(2, "0") + "-" + String(noteIndex).padStart(2, "0");
        const note = makePage(noteTitle, [sectorTitle, teamTitle], [
          { label: "Parent: " + teamTitle, target: ["..", team.file] },
        ]);
        if (noteIndex === 1 && note.id !== firstNoteId) throw new Error("Notion child ID sequence drifted.");
      }
    }
    if (!(sector.entry.source instanceof Uint8Array)) throw new Error("Generated sector source is not materialized.");
    const currentText = decodeSourceText(sector.entry.source, sector.entry.path);
    sector.entry.source = utf8(currentText + "\n\n" + sectorLinks.join("\n") + "\n");
  }
  if (ordinal !== GENERATED_PAGE_COUNT) throw new Error("Notion page formula produced " + ordinal + " pages.");
  return { entries, traceMarkers, idMappings };
}

function emptyPhysical(): PhysicalExpectedCounts {
  return {
    containers: 0, pages: 0, databases: 0, records: 0, media: 0, versions: 0, restrictions: 0, labels: 0,
    files: 0, pageRows: 0, databaseBackingPages: 0, detachedRecordPages: 0, initialPageRevisions: 0,
    importedSourceRevisions: 0, mappedRestrictionGrants: 0, unresolvedRestrictions: 0, unsupportedConstructs: {},
  };
}

function notionFieldFormatSpec(census: ReturnType<typeof notionSourceFieldCensus>, admitted: boolean) {
  return {
    censusBasis: census.basis,
    sourceSchema: census.sourceSchema,
    sourceDatabaseFields: census.databaseFields,
    sourceRecordCellCounts: census.recordCells,
    sourceInferredFieldTypeCounts: census.sourceInferredFieldTypeCounts,
    expectedPersistedDatabaseFields: admitted ? census.databaseFields : 0,
    expectedPersistedFieldTypeCounts: admitted ? census.nativePersistedFieldTypeCounts : {},
    sourceRecordCellCountsByInferredType: census.recordCellCountsBySourceInferredFieldType,
    persistenceMapping: { title: "text", otherSupportedInferredTypes: "preserved" },
    valueRule: "These are field and cell counts from committed source CSV rows. Matched Markdown record pages may supplement normalized record properties under importer semantics; no native cell count is claimed from that merge.",
  };
}

function zeroRejected() {
  const zero = { containers: 0, pages: 0, databases: 0, records: 0, media: 0, versions: 0, restrictions: 0, labels: 0, unsupportedConstructs: {} };
  return { sourceExpected: zero, nativeExpected: emptyPhysical(), reportProjection: zero };
}

function addMedia(sourceExpected: typeof NOTION_BASE_SOURCE, nativeExpected: PhysicalExpectedCounts, reportProjection: typeof NOTION_BASE_REPORT, count: number) {
  return {
    sourceExpected: withExpectedCounts(sourceExpected, { media: sourceExpected.media + count }),
    nativeExpected: withPhysicalCounts(nativeExpected, { media: nativeExpected.media + count, files: nativeExpected.files + count }),
    reportProjection: withExpectedCounts(reportProjection, { media: reportProjection.media + count }),
  };
}

function fillerFiles(path: string, count: number, byteLength: number, seed: number): GeneratedZipEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    path: path + "/scale-payload-" + String(index + 1).padStart(6, "0") + ".txt",
    source: (async function* () { yield* deterministicPayload(byteLength, seed + index); })(),
  }));
}

function boundaryBlueprint(root: string, group: string): ArchiveBlueprint {
  const base = originalFiles(root);
  const fieldCensus = notionSourceFieldCensus(base.entries);
  const entries = [...base.entries];
  let sourceExpected = NOTION_BASE_SOURCE;
  let nativeExpected = NOTION_BASE_PHYSICAL;
  let reportProjection = NOTION_BASE_REPORT;
  const derivation = [
    "Copies all " + base.entries.length + " members of " + NOTION_SOURCE_PATH + " byte-for-byte.",
    "Filler media are supported text/plain .txt entries; payload bytes are valid UTF-8 ASCII generated from deterministic 16-byte xorshift patterns repeated four times per 64-byte unit and streamed in bounded chunks.",
  ];
  let archiveExpectation: ArchiveBlueprint["archiveExpectation"] = { outcome: "success" };
  let fillerCount = 0;
  if (group === "boundary-20000" || group === "boundary-20001") {
    const desiredEntries = group === "boundary-20000" ? 20_000 : 20_001;
    fillerCount = desiredEntries - base.entries.length;
    entries.push(...fillerFiles("scale-boundary/files", fillerCount, 0, desiredEntries));
    ({ sourceExpected, nativeExpected, reportProjection } = addMedia(sourceExpected, nativeExpected, reportProjection, fillerCount));
    if (desiredEntries > MAX_ARCHIVE_ENTRIES) {
      archiveExpectation = { outcome: "reject", reason: "entryCount", message: "The archive directory exceeds the import safety limits." };
      ({ sourceExpected, nativeExpected, reportProjection } = zeroRejected());
    }
    derivation.push("The ZIP contains exactly " + desiredEntries + " file entries and no explicit directory entries.");
  } else if (group === "boundary-512m" || group === "boundary-512m-plus-one") {
    const targetBytes = MAX_EXPANDED_BYTES + (group.endsWith("plus-one") ? 1 : 0);
    const remaining = targetBytes - base.expandedBytes;
    const fullEntries = Math.floor(remaining / MAX_ENTRY_BYTES);
    const remainder = remaining - fullEntries * MAX_ENTRY_BYTES;
    fillerCount = fullEntries + (remainder > 0 ? 1 : 0);
    entries.push(...fillerFiles("scale-boundary/expanded", fullEntries, MAX_ENTRY_BYTES, 1_000_000));
    if (remainder > 0) entries.push(...fillerFiles("scale-boundary/expanded-remainder", 1, remainder, 2_000_000));
    ({ sourceExpected, nativeExpected, reportProjection } = addMedia(sourceExpected, nativeExpected, reportProjection, fillerCount));
    if (targetBytes > MAX_EXPANDED_BYTES) {
      archiveExpectation = { outcome: "reject", reason: "expandedBytes", message: "The archive expands beyond the import safety limits." };
      ({ sourceExpected, nativeExpected, reportProjection } = zeroRejected());
    }
    derivation.push("Source expansion " + base.expandedBytes + " + " + fullEntries + " × " + MAX_ENTRY_BYTES + " + " + remainder + " = " + targetBytes + " bytes.");
  } else if (group === "boundary-64m" || group === "boundary-64m-plus-one") {
    const length = MAX_ENTRY_BYTES + (group.endsWith("plus-one") ? 1 : 0);
    fillerCount = 1;
    entries.push(...fillerFiles("scale-boundary/entry", 1, length, 3_000_000));
    ({ sourceExpected, nativeExpected, reportProjection } = addMedia(sourceExpected, nativeExpected, reportProjection, fillerCount));
    if (length > MAX_ENTRY_BYTES) {
      archiveExpectation = { outcome: "reject", reason: "entryBytes", message: "The archive expands beyond the import safety limits." };
      ({ sourceExpected, nativeExpected, reportProjection } = zeroRejected());
    }
    derivation.push("One streamed media entry is exactly " + length + " bytes.");
  } else {
    throw new Error("Unknown Notion boundary group: " + group);
  }
  derivation.push(archiveExpectation.outcome === "success" ? "The relevant inclusive archive limit is expected to accept this exact boundary." : "The unchanged import safety refusal is expected before native publication: " + archiveExpectation.message);
  return {
    group,
    archiveName: "notion-" + group + ".zip",
    format: "notion-workspace",
    entries,
    derivation,
    sourceExpected,
    nativeExpected,
    reportProjection,
    expectedWarnings: archiveExpectation.outcome === "success" ? NOTION_BASE_WARNINGS : {},
    knownSourceLosses: archiveExpectation.outcome === "success" ? ["Baseline Notion property configuration remains in the original source archive; file-count boundary filler is unreferenced media and is assigned to the first imported page by current persistence semantics."] : [],
    sourceInventory: {
      sourceEntries: base.entries.length + fillerCount,
      fixtureFileEntries: base.entries.length,
      sourceExpandedBytes: base.expandedBytes,
      addedMediaFiles: fillerCount,
      sourcePagesIfAdmitted: NOTION_BASE_SOURCE.pages,
      sourceDatabasesIfAdmitted: NOTION_BASE_SOURCE.databases,
      sourceRecordsIfAdmitted: NOTION_BASE_SOURCE.records,
      sourceMediaObjectsIfAdmitted: NOTION_BASE_SOURCE.media + fillerCount,
      physicalPagesIfAdmitted: NOTION_BASE_PHYSICAL.pages,
      physicalFilesIfAdmitted: NOTION_BASE_PHYSICAL.files + fillerCount,
      physicalRevisionsIfAdmitted: NOTION_BASE_PHYSICAL.versions,
      csvFieldCensus: fieldCensus,
    },
    archiveExpectation,
    nativeFormatSpec: notionFieldFormatSpec(fieldCensus, archiveExpectation.outcome === "success"),
    parserObservation: "skip-boundary",
  };
}

export function buildNotionBlueprint(root: string, group: string): ArchiveBlueprint {
  if (group.startsWith("boundary-")) return boundaryBlueprint(root, group);
  if (group !== "notion-scale") throw new Error("Unsupported Notion group: " + group);
  const base = originalFiles(root);
  const fieldCensus = notionSourceFieldCensus(base.entries);
  const template = sourceTemplate(root);
  const generated = generatedPages(base.archiveRoot, template.path, template.markdown);
  const physical = withPhysicalCounts(NOTION_BASE_PHYSICAL, {
    pages: NOTION_BASE_PHYSICAL.pages + GENERATED_PAGE_COUNT,
    versions: NOTION_BASE_PHYSICAL.versions + GENERATED_PAGE_COUNT,
    pageRows: NOTION_BASE_PHYSICAL.pageRows + GENERATED_PAGE_COUNT,
    initialPageRevisions: NOTION_BASE_PHYSICAL.initialPageRevisions + GENERATED_PAGE_COUNT,
  });
  return {
    group,
    archiveName: "notion-scale.zip",
    format: "notion-workspace",
    entries: [...base.entries, ...generated.entries],
    derivation: [
      "Copies " + NOTION_SOURCE_PATH + " byte-for-byte, preserving its 7 typed CSV databases, 22 source rows and 15 media objects.",
      "Adds " + GENERATED_PAGE_COUNT + " ordinary Markdown pages in 20 sector roots, 5 nested teams per root and 29 notes per team: 20 × (1 + 5 + 5 × 29).",
      "Page content derives from " + template.path + "; each has a deterministic source marker and sequential 32-hex source ID. The new page tree and parent/child links are deterministic.",
    ],
    sourceExpected: withExpectedCounts(NOTION_BASE_SOURCE, { pages: NOTION_BASE_SOURCE.pages + GENERATED_PAGE_COUNT }),
    nativeExpected: physical,
    reportProjection: withExpectedCounts(NOTION_BASE_REPORT, { pages: NOTION_BASE_REPORT.pages + GENERATED_PAGE_COUNT, versions: NOTION_BASE_REPORT.versions + GENERATED_PAGE_COUNT }),
    expectedWarnings: NOTION_BASE_WARNINGS,
    knownSourceLosses: [
      "Notion source view metadata has no native database-view equivalent; unsupported view counts stay in the original export report.",
      "Two loose filtered CSVs remain without host pages and the duplicate Untitled database-name ambiguity remains explicit.",
      "Notion _all.csv files carry no property-type schema: first columns become titles and other types are inferred from values. The 17 empty columns and 7 low-cardinality columns stay explicit warnings because select-versus-text cannot be recovered; no richer source type is invented.",
      "Physical expectations include 7 database backing pages, 4 detached record pages, 46 initial page revisions and 17 per-page file copies. The prior import receipt projected 39 pages and 35 versions, omitting database backing pages and their initial snapshots.",
    ],
    sourceInventory: {
      sourceEntries: base.entries.length,
      sourceExpandedBytes: base.expandedBytes,
      sourceMarkdownPages: base.markdownCount,
      sourceCsvDatabases: base.csvCount,
      sourceMediaObjects: base.mediaCount,
      generatedOrdinaryPages: GENERATED_PAGE_COUNT,
      generatedIdRangeStart: "a" + (1).toString(16).padStart(31, "0"),
      generatedIdRangeEnd: idFor(GENERATED_PAGE_COUNT),
      csvFieldCensus: fieldCensus,
    },
    archiveExpectation: { outcome: "success" },
    restrictionSpec: { sourceFormat: "Notion Markdown and CSV", sourceRestrictedPages: 0, sourcePrincipals: 0, generatedRestrictions: 0, unknownPrincipalPolicy: "not-applicable" },
    nativeFormatSpec: notionFieldFormatSpec(fieldCensus, true),
    parserObservation: "run",
    traceMarkers: generated.traceMarkers,
    idMappings: generated.idMappings,
  };
}

export function notionGroupNames(): string[] {
  return ["notion-scale", "boundary-20000", "boundary-20001", "boundary-512m", "boundary-512m-plus-one", "boundary-64m", "boundary-64m-plus-one"];
}
