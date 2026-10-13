import { CLOUD_SOURCE_PATH, readSourceArchive, sourceCsvTables } from "./source-fixtures";
import { addCounts, CLOUD_BASE_SOURCE, CLOUD_BASE_WARNINGS, CLOUD_GROUP_UNSUPPORTED, multiplyCounts, withExpectedCounts } from "./expected";
import { serializeCsv, requireCsvTable, type CsvTable } from "./csv";
import type { ArchiveBlueprint, GeneratedZipEntry, PhysicalExpectedCounts } from "./types";

const PAGE_IDS = {
  overview: "163939",
  gettingStarted: "163941",
  pizza: "164011",
  pizzaDraft: "294914",
};
const KNOWN_PRINCIPAL = "100001:d9d99555-7c2d-5fc9-9d5f-444042ec9317";
const UNKNOWN_PRINCIPAL = "scale-unknown-principal-0001";
const SCALE_GROUPS = 999;
const GENERATED_PAGE_COUNT = 3 * (SCALE_GROUPS + 1);
const GENERATED_SOURCE_VERSION_COUNT = 4 * (SCALE_GROUPS + 1);
const GENERATED_LABEL_COUNT = 3 * SCALE_GROUPS;
const DEFAULT_DESTINATION_STATUSES = [
  { key: "rough-draft", active: true, requiresVerification: false },
  { key: "in-progress", active: true, requiresVerification: false },
  { key: "ready-for-review", active: true, requiresVerification: false },
  { key: "verified", active: true, requiresVerification: true },
];
const PAGE_STATUS_LOSS_DETAIL = "Original status retained in source archive and revision history; no matching active unverified destination status was granted.";
const PERSONAL_CONTAINER_DETAIL = "Imported as a private container owned by the importing member; historical personal ownership does not activate source accounts.";
const RESTRICTION_WARNING_DETAIL = "Source edit restrictions conservatively close native page inheritance. Explicitly mapped members or groups receive the source edit grant; the importing member retains recovery access.";

function generatedId(group: number, slot: number, base: number): string {
  return String(base + group * 10 + slot);
}

function cloneRow(row: Record<string, string>): Record<string, string> {
  return { ...row };
}

function requireRow(table: CsvTable, field: string, value: string): Record<string, string> {
  const row = table.rows.find((candidate) => candidate[field] === value);
  if (!row) throw new Error(table.path + " is missing source row " + field + "=" + value + ".");
  return row;
}

function idMapForGroup(group: number) {
  return new Map([
    [PAGE_IDS.overview, generatedId(group, 1, 90_000_000_000)],
    [PAGE_IDS.gettingStarted, generatedId(group, 2, 90_000_000_000)],
    [PAGE_IDS.pizza, generatedId(group, 3, 90_000_000_000)],
    [PAGE_IDS.pizzaDraft, generatedId(group, 4, 90_000_000_000)],
  ]);
}

function replacePageLinkIds(body: string, ids: Map<string, string>): string {
  let updated = body;
  for (const [sourceId, generated] of ids) {
    updated = updated.replace(new RegExp("([?&]pageId=)" + sourceId + "(?=[&#]|$)", "g"), "$1" + generated);
    updated = updated.replace(new RegExp("(/pages/)" + sourceId + "(?=[/?#]|$)", "g"), "$1" + generated);
  }
  return updated;
}

function generatedBody(body: string, group: number, sourceId: string, targetId: string): string {
  const marker = "SCALE-MARKER: cloud-scale-" + String(group).padStart(4, "0") + "-" + sourceId;
  return body + "\n<p>" + marker + "</p><p><a href=\"https://fixture.example.test/pages/viewpage.action?pageId=" + targetId + "\">Generated page link " + String(group).padStart(4, "0") + "</a></p>";
}

function serializeTable(table: CsvTable): GeneratedZipEntry {
  return { path: table.path, source: serializeCsv(table) };
}

function contentPropertyAccounting(
  rows: Record<string, string>[],
  contentRows: Record<string, string>[],
) {
  const importedCurrentPages = new Set(contentRows
    .filter((row) => row.content_status === "current" && !row.prevver && ["PAGE", "FOLDER"].includes(row.contenttype ?? ""))
    .map((row) => row.contentid));
  const byName = new Map<string, { rows: number; unsupported: number; malformed: number; withoutImportedCurrentPage: number }>();
  for (const row of rows) {
    const name = row.propertyname || "(unnamed)";
    const counts = byName.get(name) ?? { rows: 0, unsupported: 0, malformed: 0, withoutImportedCurrentPage: 0 };
    counts.rows += 1;
    if (name !== "titleEmoji") counts.unsupported += 1;
    else {
      const value = (row.stringval ?? "").replace(/^"|"$/g, "");
      const codePoint = Number.parseInt(value, 16);
      const valid = /^[0-9a-f]+$/i.test(value) && Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff;
      if (!valid) counts.malformed += 1;
      else if (!importedCurrentPages.has(row.contentid ?? "")) counts.withoutImportedCurrentPage += 1;
    }
    byName.set(name, counts);
  }

  const propertyNameRows: Record<string, number> = {};
  const categories: Record<string, {
    label: string;
    rawRows: number;
    unsupportedRows: number;
    malformedRows: number;
    withoutImportedCurrentPageRows: number;
    reportItems: number;
    detail: string;
  }> = {};
  let lostRows = 0;
  for (const [name, counts] of [...byName.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    propertyNameRows[name] = counts.rows;
    const nameLosses = counts.unsupported + counts.malformed + counts.withoutImportedCurrentPage;
    if (!nameLosses) continue;
    lostRows += nameLosses;
    categories[name] = {
      label: `Confluence content property "${name}" did not cross`,
      rawRows: nameLosses,
      unsupportedRows: counts.unsupported,
      malformedRows: counts.malformed,
      withoutImportedCurrentPageRows: counts.withoutImportedCurrentPage,
      reportItems: 1,
      detail: `${nameLosses} rows: ${counts.unsupported} unsupported, ${counts.malformed} malformed, ${counts.withoutImportedCurrentPage} without an imported current page`,
    };
  }
  const titleEmoji = byName.get("titleEmoji") ?? { rows: 0, unsupported: 0, malformed: 0, withoutImportedCurrentPage: 0 };
  return {
    totalRows: rows.length,
    propertyNameRows,
    lostRows,
    supportedTitleEmoji: {
      rows: titleEmoji.rows,
      nativeCurrentPageIcons: titleEmoji.rows - titleEmoji.malformed - titleEmoji.withoutImportedCurrentPage,
      malformedRows: titleEmoji.malformed,
      withoutImportedCurrentPageRows: titleEmoji.withoutImportedCurrentPage,
    },
    reportSummary: {
      itemCount: Object.keys(categories).length,
      lostRows,
      categories,
    },
  };
}

export function buildCloudBlueprint(root: string, group: string, allowedMemberEmail: string): ArchiveBlueprint {
  if (group !== "cloud-csv-scale") throw new Error("Unsupported Cloud CSV group: " + group);
  const archive = readSourceArchive(root, CLOUD_SOURCE_PATH);
  const tables = sourceCsvTables(archive.files);
  const content = requireCsvTable(tables, "content");
  const bodycontent = requireCsvTable(tables, "bodycontent");
  const permissions = requireCsvTable(tables, "content_permissions");
  const properties = requireCsvTable(tables, "contentproperties");
  const labels = requireCsvTable(tables, "label");
  const contentLabels = requireCsvTable(tables, "content_label");

  const templateIds = [PAGE_IDS.overview, PAGE_IDS.gettingStarted, PAGE_IDS.pizza, PAGE_IDS.pizzaDraft];
  const templateRows = new Map(templateIds.map((id) => [id, requireRow(content, "contentid", id)]));
  const bodyRows = new Map(templateIds.map((id) => [id, requireRow(bodycontent, "contentid", id)]));
  const knownPermissionRows = [PAGE_IDS.overview, PAGE_IDS.gettingStarted, PAGE_IDS.pizza]
    .map((id) => requireRow(permissions, "content_id", id));
  if (knownPermissionRows.some((row) => row.principal_id !== KNOWN_PRINCIPAL)) {
    throw new Error("The expected Cloud source restriction principal differs from the committed fixture.");
  }
  const sourcePermissionTypes = [...new Set(knownPermissionRows.map((row) => row.permission_type).filter(Boolean))].sort();

  const originalEntries = [...archive.files.entries()].map(([path, bytes]) => ({ path, source: bytes } as GeneratedZipEntry));
  const generatedIds: NonNullable<ArchiveBlueprint["idMappings"]> = [];
  const traceMarkers: NonNullable<ArchiveBlueprint["traceMarkers"]> = [];
  const contentRows = content.rows.map(cloneRow);
  const bodyRowsOut = bodycontent.rows.map(cloneRow);
  const permissionRows = permissions.rows.map(cloneRow);
  const propertyRows = properties.rows.map(cloneRow);
  const labelRows = labels.rows.map(cloneRow);
  const contentLabelRows = contentLabels.rows.map(cloneRow);
  for (let groupIndex = 1; groupIndex <= SCALE_GROUPS; groupIndex += 1) {
    const idMap = idMapForGroup(groupIndex);
    const bodyContentIds = new Map<string, string>();
    templateIds.forEach((sourceId, slot) => {
      bodyContentIds.set(sourceId, generatedId(groupIndex, slot + 1, 91_000_000_000));
    });

    const titleSuffix = " [Generated Scale " + String(groupIndex).padStart(4, "0") + "]";
    for (const sourceId of templateIds) {
      const source = templateRows.get(sourceId)!;
      const row = cloneRow(source);
      const generated = idMap.get(sourceId)!;
      row.contentid = generated;
      row.title = source.title + titleSuffix;
      row.lowertitle = row.title.toLowerCase();
      if (row.parentid && idMap.has(row.parentid)) row.parentid = idMap.get(row.parentid)!;
      if (row.prevver && idMap.has(row.prevver)) row.prevver = idMap.get(row.prevver)!;
      contentRows.push(row);
      generatedIds.push({ sourceId: "group-" + String(groupIndex).padStart(4, "0") + ":confluence-content:" + sourceId, generatedId: generated, generatedPath: "content.csv.gz#" + generated });
    }

    for (const sourceId of templateIds) {
      const source = bodyRows.get(sourceId)!;
      const row = cloneRow(source);
      const generated = idMap.get(sourceId)!;
      const targetSourceId = sourceId === PAGE_IDS.overview ? PAGE_IDS.gettingStarted : sourceId === PAGE_IDS.gettingStarted ? PAGE_IDS.pizza : PAGE_IDS.overview;
      const targetId = idMap.get(targetSourceId)!;
      row.bodycontentid = bodyContentIds.get(sourceId)!;
      row.contentid = generated;
      row.body = generatedBody(replacePageLinkIds(source.body, idMap), groupIndex, generated, targetId);
      bodyRowsOut.push(row);
      const marker = "SCALE-MARKER: cloud-scale-" + String(groupIndex).padStart(4, "0") + "-" + generated;
      traceMarkers.push({ marker, sourcePath: "bodycontent.csv.gz#" + sourceId, generatedPath: "bodycontent.csv.gz#" + generated, sourceId: generated });
      generatedIds.push({ sourceId: "group-" + String(groupIndex).padStart(4, "0") + ":bodycontent:" + sourceId, generatedId: bodyContentIds.get(sourceId)!, generatedPath: "bodycontent.csv.gz#" + bodyContentIds.get(sourceId)! });
    }

    const sourceProperties = properties.rows.filter((candidate) => templateIds.includes(candidate.contentid));
    sourceProperties.forEach((source, index) => {
      const row = cloneRow(source);
      row.propertyid = generatedId(groupIndex, index + 1, 92_000_000_000);
      row.contentid = idMap.get(source.contentid)!;
      propertyRows.push(row);
      generatedIds.push({ sourceId: "group-" + String(groupIndex).padStart(4, "0") + ":content-property:" + source.propertyid, generatedId: row.propertyid, generatedPath: "contentproperties.csv.gz#" + row.propertyid });
    });

    for (let slot = 0; slot < 3; slot += 1) {
      const sourceId = [PAGE_IDS.overview, PAGE_IDS.gettingStarted, PAGE_IDS.pizza][slot]!;
      const row = cloneRow(knownPermissionRows[slot]!);
      const permissionId = generatedId(groupIndex, slot + 1, 93_000_000_000);
      row.permission_id = permissionId;
      row.content_id = idMap.get(sourceId)!;
      const unknown = groupIndex === 1 && sourceId === PAGE_IDS.overview;
      if (unknown) row.principal_id = UNKNOWN_PRINCIPAL;
      permissionRows.push(row);
      generatedIds.push({
        sourceId: "group-" + String(groupIndex).padStart(4, "0") + ":content-permission:" + knownPermissionRows[slot]!.permission_id,
        generatedId: permissionId,
        generatedPath: "content_permissions.csv.gz#" + permissionId,
      });
    }

    for (let slot = 0; slot < 3; slot += 1) {
      const sourceId = [PAGE_IDS.overview, PAGE_IDS.gettingStarted, PAGE_IDS.pizza][slot]!;
      const pageId = idMap.get(sourceId)!;
      const labelLinkId = generatedId(groupIndex, slot + 1, 94_000_000_000);
      contentLabelRows.push({
        id: labelLinkId,
        labelid: "940000000001",
        contentid: pageId,
        pagetemplateid: "",
        owner: "",
        creationdate: "2026-09-11 00:00:00.000",
        lastmoddate: "2026-09-11 00:00:00.000",
        labelableid: pageId,
        labelabletype: "CONTENT",
      });
      generatedIds.push({
        sourceId: "group-" + String(groupIndex).padStart(4, "0") + ":content-label-link:" + sourceId,
        generatedId: labelLinkId,
        generatedPath: "content_label.csv.gz#" + labelLinkId,
      });
    }
  }

  labelRows.push({
    labelid: "940000000001",
    name: "generated-scale",
    owner: "",
    namespace: "global",
    creationdate: "2026-09-11 00:00:00.000",
    lastmoddate: "2026-09-11 00:00:00.000",
  });
  generatedIds.push({ sourceId: "generated-global-label:generated-scale", generatedId: "940000000001", generatedPath: "label.csv.gz#940000000001" });

  const generatedTables = new Map(tables);
  generatedTables.set("content", { ...content, rows: contentRows });
  generatedTables.set("bodycontent", { ...bodycontent, rows: bodyRowsOut });
  generatedTables.set("content_permissions", { ...permissions, rows: permissionRows });
  generatedTables.set("contentproperties", { ...properties, rows: propertyRows });
  generatedTables.set("label", { ...labels, rows: labelRows });
  generatedTables.set("content_label", { ...contentLabels, rows: contentLabelRows });

  const generatedTableNames = new Set(["content", "bodycontent", "content_permissions", "contentproperties", "label", "content_label"]);
  const entries = originalEntries.map((entry) => {
    const name = (entry.path.split("/").at(-1) ?? entry.path).replace(/\.csv(?:\.gz)?$/i, "");
    const table = generatedTables.get(name);
    return table && generatedTableNames.has(name) ? serializeTable(table) : entry;
  });

  const sourcePropertyAccounting = contentPropertyAccounting(properties.rows, content.rows);
  const generatedPropertyAccounting = contentPropertyAccounting(propertyRows, contentRows);
  const propertyReportItems = Object.fromEntries(Object.values(generatedPropertyAccounting.reportSummary.categories).map((category) => [category.label, category.reportItems]));
  const publishedIds = new Set(contentRows.filter((row) => row.content_status === "current" && !row.prevver).map((row) => row.contentid));
  const importedPageRows = [
    ...contentRows.filter((row) => ["PAGE", "FOLDER"].includes(row.contenttype ?? "") && row.content_status === "current" && !row.prevver),
    ...contentRows.filter((row) => ["PAGE", "FOLDER"].includes(row.contenttype ?? "") && row.content_status === "draft" && (!row.prevver || !publishedIds.has(row.prevver))),
  ];
  const eligibleDefaultStatusKeys = new Set(DEFAULT_DESTINATION_STATUSES.filter((status) => status.active && !status.requiresVerification).map((status) => status.key));
  const statusGroups = new Map<string, string[]>();
  for (const row of importedPageRows) {
    const status = row.content_status ?? "";
    if (!status || eligibleDefaultStatusKeys.has(status)) continue;
    const sourceIds = statusGroups.get(status) ?? [];
    sourceIds.push(`confluence-page:${row.contentid}`);
    statusGroups.set(status, sourceIds);
  }
  const pageStatusAdaptations = [...statusGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([status, sourceIds]) => ({
    sourceStatus: status,
    count: sourceIds.length,
    sourceIds: sourceIds.sort(),
    expectedReportItem: { kind: "construct", label: status, detail: PAGE_STATUS_LOSS_DETAIL },
  }));
  const spacesTable = requireCsvTable(tables, "spaces");
  const privateContainerWarnings = spacesTable.rows
    .filter((space) => (space.spacetype ?? "").toLowerCase() === "personal")
    .map((space) => {
      const sourceId = `confluence-space:${space.spaceid}`;
      return { kind: "container", sourceId, label: space.spacename || space.spacekey || sourceId, detail: PERSONAL_CONTAINER_DETAIL };
    });
  const hasEditRestrictions = permissionRows.some((row) => row.permission_type === "EDIT");
  const restrictionWarnings = hasEditRestrictions
    ? [{ kind: "construct", label: "Source edit restrictions", detail: RESTRICTION_WARNING_DETAIL }]
    : [];
  const expectedWarnings = { ...CLOUD_BASE_WARNINGS };
  if (hasEditRestrictions) expectedWarnings["Source edit restrictions"] = 1;
  for (const warning of privateContainerWarnings) expectedWarnings[warning.label] = (expectedWarnings[warning.label] ?? 0) + 1;
  const unsupported = addCounts(CLOUD_BASE_SOURCE.unsupportedConstructs, multiplyCounts(CLOUD_GROUP_UNSUPPORTED, SCALE_GROUPS), propertyReportItems);
  const sourceExpected = withExpectedCounts(CLOUD_BASE_SOURCE, {
    pages: GENERATED_PAGE_COUNT,
    versions: GENERATED_SOURCE_VERSION_COUNT,
    restrictions: 3 + 3 * SCALE_GROUPS,
    labels: GENERATED_LABEL_COUNT,
    unsupportedConstructs: unsupported,
  });
  const nativeExpected: PhysicalExpectedCounts = {
    containers: 1,
    pages: GENERATED_PAGE_COUNT,
    databases: 0,
    records: 0,
    media: 0,
    versions: GENERATED_PAGE_COUNT + GENERATED_SOURCE_VERSION_COUNT,
    restrictions: sourceExpected.restrictions,
    labels: GENERATED_LABEL_COUNT,
    files: 0,
    pageRows: GENERATED_PAGE_COUNT,
    databaseBackingPages: 0,
    detachedRecordPages: 0,
    initialPageRevisions: GENERATED_PAGE_COUNT,
    importedSourceRevisions: GENERATED_SOURCE_VERSION_COUNT,
    mappedRestrictionGrants: 3 + 3 * SCALE_GROUPS - 1,
    unresolvedRestrictions: 1,
    unsupportedConstructs: unsupported,
  };
  const reportProjection = withExpectedCounts(sourceExpected, {
    versions: nativeExpected.versions,
    media: nativeExpected.files,
  });
  const propertyNameRows = sourcePropertyAccounting.propertyNameRows;
  const generatedPropertyNameRows = generatedPropertyAccounting.propertyNameRows;

  return {
    group,
    archiveName: "cloud-csv-scale.zip",
    format: "confluence-space",
    entries,
    derivation: [
      "Copies all " + archive.files.size + " entries of " + CLOUD_SOURCE_PATH + "; root table members retain their exporter .csv.gz names and plain CSV encoding.",
      "Repeats the three current pages, their Pizza draft version, bodies, content properties, tree parent links and page restriction rows " + SCALE_GROUPS + " times.",
      "Maps each copied content ID, bodycontent ID, contentproperty ID, permission ID and label-link ID into deterministic non-overlapping decimal ranges; parent, prevver and pageId links use the same group map.",
      "Each generated current page receives one generated-scale global label. Source principal " + KNOWN_PRINCIPAL + " maps only through the explicit operator option " + allowedMemberEmail + "; unknown principal " + UNKNOWN_PRINCIPAL + " has no source mapping and must remain closed.",
      "Cloned page and draft bodies retain their source Cloud storage content, then add a unique marker and an internal pageId link. The manifest lists each marker and its source bodycontent ID.",
      `Destination-native page-status adaptations are separate from sourceExpected: ${pageStatusAdaptations.reduce((count, group) => count + group.count, 0)} imported pages carry statuses outside the default active unverified keys. Personal source containers are imported privately and are recorded as destination warnings.`,
    ],
    sourceExpected,
    nativeExpected,
    reportProjection,
    expectedWarnings,
    knownSourceLosses: [
      "Source namespace=my favourite is a member favorite, not a page label. Only generated namespace=global labels are counted as page labels.",
      "Source spacepermissions and spacerole_assignments remain unsupported; page-level content permissions are distinct restrictions.",
      "Remote source image URLs remain external links because the committed export has no attachment content rows; native media/files are zero.",
      "The source contentproperties table has " + sourcePropertyAccounting.totalRows + " rows across names " + JSON.stringify(propertyNameRows) + "; the generated table has " + generatedPropertyAccounting.totalRows + " rows across names " + JSON.stringify(generatedPropertyNameRows) + ". Only valid titleEmoji values on imported current pages map to native icons (" + sourcePropertyAccounting.supportedTitleEmoji.nativeCurrentPageIcons + " source rows; " + generatedPropertyAccounting.supportedTitleEmoji.nativeCurrentPageIcons + " generated rows). Other source configuration remains in the original archive; generated report accounting summarizes " + generatedPropertyAccounting.reportSummary.lostRows + " unsupported or unmapped raw rows in " + generatedPropertyAccounting.reportSummary.itemCount + " name-based items, with exact per-name detail " + JSON.stringify(generatedPropertyAccounting.reportSummary.categories) + ". This does not claim general content-property fidelity.",
      "The generated pages repeat the fixture's unsupported macro, layout, placeholder, inline-comment and empty-table constructs; their report counts are derived from the source body construct census.",
    ],
    archiveExpectation: { outcome: "success" },
    restrictionSpec: {
      archiveFormat: "Confluence Cloud CSV export",
      sourceTable: "content_permissions.csv.gz",
      sourcePropertyNames: ["permission_id", "permission_type", "content_id", "principal_type", "principal_id", "groupname"],
      sourceAndClonedPermissionTypes: sourcePermissionTypes,
      knownSourcePrincipalType: "USER",
      knownSourcePrincipalId: KNOWN_PRINCIPAL,
      allowedMemberEmail,
      mappingMode: "explicit-operator-mapping; no same-email inference",
      unknownSourcePrincipalType: "USER",
      unknownSourcePrincipalId: UNKNOWN_PRINCIPAL,
      unknownRestriction: "fail-closed; one generated restriction replaces the known grant on its isolated page",
      knownRestrictionCount: 3 + 3 * SCALE_GROUPS - 1,
      unknownRestrictionCount: 1,
    },
    sourceInventory: {
      sourceEntries: archive.files.size,
      sourceCurrentPages: 3,
      sourceDraftVersions: 1,
      generatedGroups: SCALE_GROUPS,
      generatedCurrentPages: 3 * SCALE_GROUPS,
      generatedDraftVersions: SCALE_GROUPS,
      generatedRestrictionRows: 3 * SCALE_GROUPS,
      generatedKnownRestrictionRows: 3 * SCALE_GROUPS - 1,
      generatedUnknownRestrictionRows: 1,
      generatedLabels: GENERATED_LABEL_COUNT,
      generatedGlobalLabelRows: 1,
      destinationNativeAdaptations: {
        statusLookup: {
          policy: "verification-only",
          match: "Exact source status key must match an active destination key with requires_verification=false.",
          destinationStatuses: DEFAULT_DESTINATION_STATUSES,
          sourceMapping: "src/core/features/imports/confluence/space.ts assigns content_status to each imported page; src/core/features/imports/persist.ts looks up page.status by exact key.",
        },
        pageStatusLosses: pageStatusAdaptations,
        pageStatusLossCount: pageStatusAdaptations.reduce((count, group) => count + group.count, 0),
        personalContainerWarnings: privateContainerWarnings,
        personalContainerWarningCount: privateContainerWarnings.length,
        restrictionWarnings,
        warningCount: privateContainerWarnings.length + restrictionWarnings.length,
      },
      contentPropertyAccounting: {
        sourceArchive: sourcePropertyAccounting,
        generatedArchive: generatedPropertyAccounting,
        reportSummarySemantics: {
          itemKind: "unmapped construct",
          cardinality: "One item per distinct property name with at least one unsupported, malformed, or without-an-imported-current-page row.",
          detail: "Each item's row total and unsupported, malformed, and without-an-imported-current-page counts are independently derived from raw CSV rows.",
          reportItemCount: generatedPropertyAccounting.reportSummary.itemCount,
          rawLostRows: generatedPropertyAccounting.reportSummary.lostRows,
        },
      },
    },
    parserObservation: "run",
    traceMarkers,
    idMappings: generatedIds,
  };
}
