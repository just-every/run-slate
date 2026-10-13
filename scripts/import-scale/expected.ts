import type { ExpectedImportCounts, PhysicalExpectedCounts } from "./types";

export const REQUIRED_PROVENANCE = "generated at scale from anonymised exports; no real large export was supplied";

const notionUnsupported = {
  "Archive file was not present": 6,
  "Notion database view configuration": 11,
  "Notion exported a filtered database view as a loose CSV with no host page": 2,
  "Notion exported two databases with the same name in one directory": 1,
  "Notion image is not in the archive, so it was imported as a link": 4,
  "Notion record page is absent from the exported database view": 4,
};

const cloudUnsupported = {
  "Confluence app table AO_BAF3AA_AOINLINE_TASK was not read; its inline tasks came from the page bodies instead": 1,
  "Confluence content names no space this export carries, so it landed in the exported space": 1,
  "Confluence custom has no Slate equivalent": 4,
  "Confluence database has no Slate equivalent": 1,
  "Confluence image is hosted outside the archive, so it was imported as a link": 12,
  "Confluence inline comment marker dropped, its text kept": 1,
  "Confluence layout section flattened": 4,
  'Confluence macro "blog-posts" has no Slate equivalent': 1,
  'Confluence macro "recently-updated" has no Slate equivalent': 1,
  'Confluence personal label "favourite" is a member\'s favourite, not a page label': 1,
  "Confluence placeholder text dropped": 4,
  "Confluence slide has no Slate equivalent": 1,
  "Confluence slide version belongs to content that was not imported": 1,
  "Confluence spacedescription has no Slate equivalent": 1,
  "Confluence table carries no text; its cell contents were imported as blocks": 1,
  "Confluence whiteboard canvas for database content": 1,
  "Confluence whiteboard canvas for slide content": 1,
  "Confluence whiteboard canvas payload was not imported": 1,
};

export const NOTION_BASE_SOURCE: ExpectedImportCounts = {
  containers: 1, pages: 35, databases: 7, records: 22, media: 15, versions: 0,
  restrictions: 0, labels: 0, unsupportedConstructs: notionUnsupported,
};

export const NOTION_BASE_PHYSICAL: PhysicalExpectedCounts = {
  containers: 1,
  pages: 46,
  databases: 7,
  records: 22,
  media: 17,
  versions: 46,
  restrictions: 0,
  labels: 0,
  files: 17,
  pageRows: 46,
  databaseBackingPages: 7,
  detachedRecordPages: 4,
  initialPageRevisions: 46,
  importedSourceRevisions: 0,
  mappedRestrictionGrants: 0,
  unresolvedRestrictions: 0,
  unsupportedConstructs: notionUnsupported,
};

export const NOTION_BASE_REPORT: ExpectedImportCounts = {
  ...NOTION_BASE_SOURCE,
  pages: 39,
  media: 17,
  versions: 35,
};

export const NOTION_BASE_WARNINGS: Record<string, number> = {
  "Notion CSV column arrived with no values, so its property type could not be inferred": 17,
  "Notion CSV column has too few distinct values to tell a select from free text, so it arrived as text": 7,
};

export const CLOUD_BASE_SOURCE: ExpectedImportCounts = {
  containers: 1, pages: 3, databases: 0, records: 0, media: 0, versions: 4,
  restrictions: 3, labels: 0, unsupportedConstructs: cloudUnsupported,
};

export const CLOUD_BASE_WARNINGS: Record<string, number> = {
  "Confluence space permissions and role assignments were not imported; every restriction stays container-scoped": 1,
  "No content row in this export carries a version comment, so no revision arrived with one": 1,
  "The export declares attachments were backed up but carries no attachment content rows": 1,
  "The exported space is a personal space, so no imported page carries a general access grant": 1,
};

export const CLOUD_GROUP_UNSUPPORTED = {
  "Confluence image is hosted outside the archive, so it was imported as a link": 12,
  "Confluence inline comment marker dropped, its text kept": 1,
  "Confluence layout section flattened": 4,
  'Confluence macro "blog-posts" has no Slate equivalent': 1,
  'Confluence macro "recently-updated" has no Slate equivalent': 1,
  "Confluence placeholder text dropped": 4,
  "Confluence table carries no text; its cell contents were imported as blocks": 1,
};

export function addCounts(...maps: Array<Record<string, number>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const map of maps) for (const [label, count] of Object.entries(map)) result[label] = (result[label] ?? 0) + count;
  return Object.fromEntries(Object.entries(result).filter(([, count]) => count > 0).sort(([left], [right]) => left.localeCompare(right)));
}

export function multiplyCounts(counts: Record<string, number>, multiplier: number): Record<string, number> {
  const entries = Object.entries(counts) as Array<[string, number]>;
  const multiplied: Array<[string, number]> = entries
    .filter(([, count]) => count > 0)
    .map(([label, count]): [string, number] => [label, count * multiplier]);
  multiplied.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(multiplied);
}

export function withExpectedCounts(base: ExpectedImportCounts, changes: Partial<Omit<ExpectedImportCounts, "unsupportedConstructs">> & { unsupportedConstructs?: Record<string, number> }): ExpectedImportCounts {
  return {
    containers: changes.containers ?? base.containers,
    pages: changes.pages ?? base.pages,
    databases: changes.databases ?? base.databases,
    records: changes.records ?? base.records,
    media: changes.media ?? base.media,
    versions: changes.versions ?? base.versions,
    restrictions: changes.restrictions ?? base.restrictions,
    labels: changes.labels ?? base.labels,
    unsupportedConstructs: changes.unsupportedConstructs ?? base.unsupportedConstructs,
  };
}

export function withPhysicalCounts(base: PhysicalExpectedCounts, changes: Partial<Omit<PhysicalExpectedCounts, "unsupportedConstructs">> & { unsupportedConstructs?: Record<string, number> }): PhysicalExpectedCounts {
  return {
    containers: changes.containers ?? base.containers,
    pages: changes.pages ?? base.pages,
    databases: changes.databases ?? base.databases,
    records: changes.records ?? base.records,
    media: changes.media ?? base.media,
    versions: changes.versions ?? base.versions,
    restrictions: changes.restrictions ?? base.restrictions,
    labels: changes.labels ?? base.labels,
    unsupportedConstructs: changes.unsupportedConstructs ?? base.unsupportedConstructs,
    files: changes.files ?? base.files,
    pageRows: changes.pageRows ?? base.pageRows,
    databaseBackingPages: changes.databaseBackingPages ?? base.databaseBackingPages,
    detachedRecordPages: changes.detachedRecordPages ?? base.detachedRecordPages,
    initialPageRevisions: changes.initialPageRevisions ?? base.initialPageRevisions,
    importedSourceRevisions: changes.importedSourceRevisions ?? base.importedSourceRevisions,
    mappedRestrictionGrants: changes.mappedRestrictionGrants ?? base.mappedRestrictionGrants,
    unresolvedRestrictions: changes.unresolvedRestrictions ?? base.unresolvedRestrictions,
  };
}
