import { createHash } from "node:crypto";
import { CLOUD_SOURCE_PATH, NOTION_SOURCE_PATH, readSourceArchive, sourceCsvTables } from "./source-fixtures";
import type { ArchiveBlueprint, GeneratedZipEntry, PhysicalExpectedCounts } from "./types";
import { utf8 } from "./source-fixtures";

const PAGE_COUNT = 3_000;
const GROUP_COUNT = 1_000;
const KNOWN_PRINCIPAL = "100001:d9d99555-7c2d-5fc9-9d5f-444042ec9317";
const UNKNOWN_PRINCIPAL = "scale-unknown-principal-server-dc-0001";
const DEFAULT_DESTINATION_STATUSES = [
  { key: "rough-draft", active: true, requiresVerification: false },
  { key: "in-progress", active: true, requiresVerification: false },
  { key: "ready-for-review", active: true, requiresVerification: false },
  { key: "verified", active: true, requiresVerification: true },
];
const PAGE_STATUS_LOSS_DETAIL = "Original status retained in source archive and revision history; no matching active unverified destination status was granted.";
const RESTRICTION_WARNING = "Restrictions remain closed unless explicitly mapped to existing workspace members or groups; the importing member retains recovery access";
const CLASS = {
  space: "com.atlassian.confluence.spaces.Space",
  page: "com.atlassian.confluence.pages.Page",
  bodyContent: "com.atlassian.confluence.core.BodyContent",
  attachment: "com.atlassian.confluence.pages.Attachment",
  permissionSet: "com.atlassian.confluence.security.ContentPermissionSet",
  permission: "com.atlassian.confluence.security.ContentPermission",
  user: "com.atlassian.confluence.user.ConfluenceUserImpl",
  label: "com.atlassian.confluence.labels.Label",
  labelling: "com.atlassian.confluence.labels.Labelling",
};

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cdata(value: string): string {
  return "<![CDATA[" + value.replace(/\]\]>/g, "]]]]><![CDATA[>") + "]]>";
}

function htmlText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, number: string) => String.fromCodePoint(Number(number)))
    .replace(/\s+/g, " ")
    .trim();
}

function makeIds(group: number) {
  const base = 800_000_000_000 + group * 10;
  return [String(base + 1), String(base + 2), String(base + 3)];
}

function entity(className: string, id: string, properties: string): string {
  return "<object class=\"" + className + "\" id=\"" + xmlEscape(id) + "\"><property name=\"id\">" + xmlEscape(id) + "</property>" + properties + "</object>\n";
}

function property(name: string, value: string): string {
  return "<property name=\"" + name + "\">" + value + "</property>";
}

function textProperty(name: string, value: string): string {
  return property(name, xmlEscape(value));
}

function relationProperty(name: string, id: string): string {
  return property(name, "<id>" + xmlEscape(id) + "</id>");
}

function buildSourceTemplates(root: string): Array<{ id: string; title: string; body: string }> {
  const archive = readSourceArchive(root, CLOUD_SOURCE_PATH);
  const tables = sourceCsvTables(archive.files);
  const content = tables.get("content");
  const bodies = tables.get("bodycontent");
  if (!content || !bodies) throw new Error("Committed Cloud fixture lacks content/bodycontent tables for Server/DC text derivation.");
  const wanted = [
    { id: "163939", title: "Overview" },
    { id: "163941", title: "Getting started in Confluence" },
    { id: "164011", title: "Pizza Restaurant Launch Plan" },
  ];
  return wanted.map((template) => {
    const row = bodies.rows.find((candidate) => candidate.contentid === template.id);
    if (!row) throw new Error("Cloud source bodycontent is missing " + template.id + ".");
    const sourceContent = content.rows.find((candidate) => candidate.contentid === template.id);
    if (!sourceContent) throw new Error("Cloud source content row is missing " + template.id + ".");
    return { id: template.id, title: sourceContent.title || template.title, body: htmlText(row.body).slice(0, 360) };
  });
}

export function buildServerDcBlueprint(root: string, group: string, allowedMemberEmail: string): ArchiveBlueprint {
  if (group !== "server-dc-entities") throw new Error("Unsupported Server/DC group: " + group);
  const templates = buildSourceTemplates(root);
  const objects: string[] = [];
  const notion = readSourceArchive(root, NOTION_SOURCE_PATH);
  const sourceMedia = [...notion.files].filter(([path, bytes]) => /\.png$/i.test(path) && bytes.byteLength <= 1024 * 1024).sort(([a], [b]) => a.localeCompare(b)).slice(0, 3);
  if (sourceMedia.length !== 3) throw new Error("Expected three bounded PNG files in the committed anonymized Notion export.");
  const mediaSpec = sourceMedia.map(([path, bytes], slot) => {
    const ownerId = makeIds(1)[slot]!;
    const attachmentId = String(860_000_000_001 + slot);
    return {sourceArchive: NOTION_SOURCE_PATH, sourcePath: path, sourceId: `confluence-attachment:${attachmentId}`, attachmentId, ownerPageSourceId: `confluence-page:${ownerId}`, containerReference: slot === 1 ? String(810_000_000_011 + slot) : ownerId, archivePath: `attachments/${ownerId}/${attachmentId}/1`, version: 1, name: "reference.png", contentType: "image/png", bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), accessCase: slot === 0 ? "unknown-principal-closed" : "known-principal-restricted"};
  });
  const historicalPageSpec: Array<Record<string, string | number | string[]>> = [];
  const traceMarkers: NonNullable<ArchiveBlueprint["traceMarkers"]> = [];
  const idMappings: NonNullable<ArchiveBlueprint["idMappings"]> = [];
  const pageStatusSourceIds: string[] = [];
  const knownUserId = "700000000001";
  const spaceId = "700000000000";
  const labelId = "700000000002";
  objects.push(entity(CLASS.space, spaceId, textProperty("name", "Generated Server/DC Space") + textProperty("key", "SCALE")));
  objects.push(entity(CLASS.user, knownUserId,
    textProperty("key", KNOWN_PRINCIPAL) + textProperty("name", "Scale reader") + textProperty("lowerName", "scale-reader")));
  objects.push(entity(CLASS.label, labelId,
    textProperty("name", "generated-scale") + textProperty("namespace", "global")));
  idMappings.push({ sourceId: "source-space:generated", generatedId: spaceId, generatedPath: "entities.xml" });
  idMappings.push({ sourceId: "source-user:" + KNOWN_PRINCIPAL, generatedId: knownUserId, generatedPath: "entities.xml" });
  idMappings.push({ sourceId: "generated-global-label:generated-scale", generatedId: labelId, generatedPath: "entities.xml#Label:" + labelId });

  for (let groupIndex = 1; groupIndex <= GROUP_COUNT; groupIndex += 1) {
    const [rootId, childAId, childBId] = makeIds(groupIndex);
    const ids = [rootId, childAId, childBId];
    const titles = [
      "Scale " + String(groupIndex).padStart(4, "0") + " Root",
      "Scale " + String(groupIndex).padStart(4, "0") + " Guide",
      "Scale " + String(groupIndex).padStart(4, "0") + " Record",
    ];
    for (let slot = 0; slot < 3; slot += 1) {
      const id = ids[slot]!;
      pageStatusSourceIds.push(`confluence-page:${id}`);
      const parentId = slot === 0 ? "" : rootId;
      const template = templates[slot]!;
      const bodyContentId = String(850_000_000_000 + groupIndex * 10 + slot + 1);
      const labellingId = String(840_000_000_000 + groupIndex * 10 + slot + 1);
      const versionId = String(810_000_000_000 + groupIndex * 10 + slot + 1);
      const historicalBodyId = String(870_000_000_000 + groupIndex * 10 + slot + 1);
      const marker = "SCALE-MARKER: server-dc-" + String(groupIndex).padStart(4, "0") + "-" + String(slot + 1);
      const plain = template.body || template.title;
      const siblingTitle = titles[(slot + 1) % 3]!;
      const pageResource = slot === 0
        ? `<ri:page ri:content-title="${xmlEscape(siblingTitle)}" ri:space-key="SCALE"/>`
        : slot === 1
          ? `<ri:page ri:content-title="${xmlEscape(siblingTitle + " (revision 1)")}"/>`
          : `<ri:page ri:content-id="${String(810_000_000_000 + groupIndex * 10 + (slot + 1) % 3 + 1)}" ri:content-title="${xmlEscape(siblingTitle)}" ri:space-key="SCALE"/>`;
      let body = "<h1>" + xmlEscape(titles[slot]!) + "</h1><p>" + xmlEscape(plain) + "</p><p>" + xmlEscape(marker) + "</p><p><ac:link>" + pageResource + "<ac:link-body>Generated sibling page</ac:link-body></ac:link></p>";
      if (groupIndex === 1) {
        const attachment = mediaSpec[slot]!;
        const siblingAttachment = mediaSpec[(slot + 1) % 3]!;
        const attachmentOwner = slot === 1
          ? `<ri:page ri:content-title="${xmlEscape(siblingTitle + " (revision 1)")}"/>`
          : `<ri:page ri:content-title="${xmlEscape(siblingTitle)}" ri:space-key="SCALE"/>`;
        body += `<p><ac:image ac:alt="Owned source image"><ri:attachment ri:filename="${attachment.name}" ri:version-at-save="1"/></ac:image></p><p><ac:link><ri:attachment ri:filename="${siblingAttachment.name}" ri:version-at-save="1">${attachmentOwner}</ri:attachment><ac:link-body>Restricted sibling attachment</ac:link-body></ac:link></p>`;
      }
      const pageProperties =
        textProperty("spaceId", spaceId) + relationProperty("space", spaceId) +
        (parentId ? textProperty("parentId", parentId) + relationProperty("parent", parentId) : "") +
        textProperty("title", titles[slot]!) +
        textProperty("bodyContentId", bodyContentId) + relationProperty("bodyContent", bodyContentId) +
        textProperty("contentStatus", "current") + textProperty("version", "2") +
        property("historicalVersions", "<set><id>" + versionId + "</id></set>") +
        property("labels", "<set><id>" + xmlEscape(labelId) + "</id></set>");
      objects.push(entity(CLASS.page, id, pageProperties));
      objects.push(entity(CLASS.bodyContent, bodyContentId,
        textProperty("contentId", id) + relationProperty("content", id) +
        property("body", cdata(body)) + textProperty("bodyTypeId", "2")));
      objects.push(entity(CLASS.labelling, labellingId,
        textProperty("contentId", id) + relationProperty("content", id) +
        textProperty("labelId", labelId) + relationProperty("label", labelId) +
        textProperty("namespace", "global") + textProperty("owner", "")));

      const historicalMarker = "HISTORY-MARKER: server-dc-" + String(groupIndex).padStart(4, "0") + "-" + String(slot + 1);
      const historicalBody = "<p>Historical revision: " + xmlEscape(plain) + "</p><p>" + historicalMarker + "</p>";
      const historicalDate = "2025-01-02T03:04:05.000Z";
      const historicalComment = "Source-derived generated historical Page revision";
      objects.push(entity(CLASS.page, versionId,
        relationProperty("space", spaceId) + relationProperty("originalVersion", id) +
        textProperty("contentStatus", "historical") + textProperty("version", "1") + textProperty("title", titles[slot]! + " (revision 1)") +
        relationProperty("bodyContent", historicalBodyId) + textProperty("versionComment", historicalComment) + textProperty("lastModificationDate", historicalDate)));
      objects.push(entity(CLASS.bodyContent, historicalBodyId,
        relationProperty("content", versionId) + property("body", cdata(historicalBody)) + textProperty("bodyTypeId", "2")));
      historicalPageSpec.push({sourceId: `confluence-page:${versionId}`, ownerPageSourceId: `confluence-page:${id}`, bodyContentId: historicalBodyId, ordinal: 1, title: titles[slot]! + " (revision 1)", labels: [], status: "historical", comment: historicalComment, createdAt: historicalDate, marker: historicalMarker, bodySha256: createHash("sha256").update(historicalBody).digest("hex")});
      traceMarkers.push({marker: historicalMarker, sourcePath: "bodycontent.csv.gz#" + template.id, generatedPath: "entities.xml#Page:" + versionId, sourceId: versionId});

      const setId = String(820_000_000_000 + groupIndex * 10 + slot + 1);
      const permissionId = String(830_000_000_000 + groupIndex * 10 + slot + 1);
      const unknown = groupIndex === 1 && slot === 0;
      const principalName = unknown ? UNKNOWN_PRINCIPAL : KNOWN_PRINCIPAL;
      const principalRef = unknown ? UNKNOWN_PRINCIPAL : knownUserId;
      objects.push(entity(CLASS.permissionSet, setId,
        textProperty("contentId", id) + relationProperty("content", id) +
        textProperty("type", "VIEW") + property("permissions", "<set><id>" + permissionId + "</id></set>")));
      objects.push(entity(CLASS.permission, permissionId,
        relationProperty("owningSet", setId) + relationProperty("permissionSet", setId) +
        textProperty("contentId", id) + textProperty("type", "VIEW") +
        textProperty("userName", principalName) + relationProperty("userSubject", principalRef)));

      traceMarkers.push({ marker, sourcePath: "bodycontent.csv.gz#" + template.id, generatedPath: "entities.xml#Page:" + id, sourceId: id });
      idMappings.push({ sourceId: "group-" + groupIndex + ":confluence-page:" + template.id, generatedId: id, generatedPath: "entities.xml#Page:" + id });
      idMappings.push({ sourceId: "group-" + groupIndex + ":confluence-bodycontent:" + template.id, generatedId: bodyContentId, generatedPath: "entities.xml#BodyContent:" + bodyContentId });
      idMappings.push({ sourceId: "group-" + groupIndex + ":confluence-labelling:" + template.id, generatedId: labellingId, generatedPath: "entities.xml#Labelling:" + labellingId });
      idMappings.push({ sourceId: "group-" + groupIndex + ":confluence-version:" + template.id, generatedId: versionId, generatedPath: "entities.xml#Page:" + versionId });
      idMappings.push({ sourceId: "group-" + groupIndex + ":content-permission-set:" + id, generatedId: setId, generatedPath: "entities.xml#ContentPermissionSet:" + setId });
      idMappings.push({ sourceId: "group-" + groupIndex + ":content-permission:" + id, generatedId: permissionId, generatedPath: "entities.xml#ContentPermission:" + permissionId });
    }
  }

  for (const attachment of mediaSpec) objects.push(entity(CLASS.attachment, attachment.attachmentId,
    relationProperty("container", attachment.containerReference) + textProperty("title", attachment.name) + textProperty("version", String(attachment.version)) + textProperty("contentType", attachment.contentType)));
  const xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<hibernate-generic>\n" + objects.join("") + "</hibernate-generic>\n";
  const entries: GeneratedZipEntry[] = [{ path: "entities.xml", source: utf8(xml) }, ...mediaSpec.map((item, index) => ({path: item.archivePath, source: sourceMedia[index]![1]}))];
  const pageStatusAdaptations = pageStatusSourceIds.length
    ? [{ sourceStatus: "current", count: pageStatusSourceIds.length, sourceIds: pageStatusSourceIds.sort(), expectedReportItem: { kind: "construct", label: "current", detail: PAGE_STATUS_LOSS_DETAIL } }]
    : [];
  const expectedWarnings = { [RESTRICTION_WARNING]: pageStatusSourceIds.length > 0 ? 1 : 0 };
  const nativeExpected: PhysicalExpectedCounts = {
    containers: 1,
    pages: PAGE_COUNT,
    databases: 0,
    records: 0,
    media: mediaSpec.length,
    versions: PAGE_COUNT * 2,
    restrictions: PAGE_COUNT,
    labels: PAGE_COUNT,
    files: mediaSpec.length,
    pageRows: PAGE_COUNT,
    databaseBackingPages: 0,
    detachedRecordPages: 0,
    initialPageRevisions: PAGE_COUNT,
    importedSourceRevisions: PAGE_COUNT,
    mappedRestrictionGrants: PAGE_COUNT - 1,
    unresolvedRestrictions: 1,
    unsupportedConstructs: {},
  };
  const sourceExpected = {
    containers: 1, pages: PAGE_COUNT, databases: 0, records: 0, media: mediaSpec.length, versions: PAGE_COUNT,
    restrictions: PAGE_COUNT, labels: PAGE_COUNT, unsupportedConstructs: {},
  };
  const reportProjection = { ...sourceExpected, versions: nativeExpected.versions };
  const templateCounts = templates.map((template) => template.id + ":" + template.body.length).join(",");

  return {
    group,
    archiveName: "server-dc-entities-scale.zip",
    format: "confluence-space",
    entries,
    derivation: [
      "No exporter-produced Server/DC fixture was supplied. This Server/DC entities.xml ZIP is generated construct coverage derived from the committed anonymized Cloud bodies at " + CLOUD_SOURCE_PATH + ".",
      "Builds " + GROUP_COUNT + " nested three-page trees from Overview, Getting started and Pizza source body text, yielding " + PAGE_COUNT + " current Page objects, 3,000 historical Page objects, and 6,000 referenced BodyContent objects.",
      "Every Page refers to its own BodyContent; current bodies additionally have scalar IDs. Each BodyContent content reference names its exact current or historical Page and carries bodyTypeId 2 storage-format HTML.",
      "Every current Page has one historical Page via historicalVersions; each historical Page has originalVersion, version 1, versionComment, lastModificationDate and its own referenced body. Each current Page has one ContentPermissionSet with a scalar contentId and native content reference, and one VIEW ContentPermission referenced by the set permissions collection.",
      "A Label and Labelling entity model the global generated-scale label. Page.labels is a set of Label IDs, and each Labelling has scalar and native references to its Page and Label.",
      "The page hierarchy uses parentId and parent references; every page carries one deterministic body marker and internal page link. The 3,000 page references comprise 1,000 current titles with space keys, 1,000 historical titles scoped to the source owner's space, and 1,000 explicit historical IDs with current titles and space keys. All three cross-owner attachment links use nested page titles; one uses a historical title.",
      "One ConfluenceUserImpl entity has explicit key/name source identities and maps only to the selected destination member " + allowedMemberEmail + ". One permission references an unknown source user without an entity; its userSubject and userName assert the same opaque source identity, with no destination mapping, and remain fail-closed.",
      "This is generated construct coverage, not validation against an exporter-produced Server/DC archive or a claim that every vendor-version XML serializer uses this exact object graph.",
      `Destination-native page-status adaptations are separate from sourceExpected: ${pageStatusSourceIds.length} imported pages carry a status outside the default active unverified keys.`,
    ],
    sourceExpected,
    nativeExpected,
    reportProjection,
    expectedWarnings,
    knownSourceLosses: [
      "Cloud source storage-format markup was reduced to a bounded text excerpt before embedding in Server/DC HTML. Original Cloud macros, layouts, inline comment markers, placeholders and image links are not represented by entities.xml content.",
      "Cloud supplies no binary attachments. Three bounded PNG payloads from the committed anonymized Notion archive are copied byte-for-byte to numeric attachments/<page>/<attachment>/<version> paths. Attachment container references and HTML links are generated construct coverage, not an exporter-produced DC archive.",
      "Only generated-scale labels are present. Source Cloud contentproperties property types are documented in the Cloud CSV manifest, not invented as Server/DC entity properties.",
      "BodyContent, Label and Labelling entities are generated to exercise referenced object graphs; no actual Server/DC export was supplied to validate a vendor-version serializer.",
    ],
    sourceInventory: {
      generatedTrees: GROUP_COUNT,
      pagesPerTree: 3,
      sourceTemplateBodies: templateCounts,
      generatedPages: PAGE_COUNT,
      pageVersions: PAGE_COUNT,
      bodyContents: PAGE_COUNT * 2,
      currentPageEntities: PAGE_COUNT,
      historicalPageEntities: PAGE_COUNT,
      historicalPages: historicalPageSpec,
      currentSearchMarkers: traceMarkers.filter(item => item.marker.startsWith("SCALE-MARKER:")).map(item => ({...item, constructKind: "current-page", ownerPageSourceId: `confluence-page:${item.sourceId}`})),
      searchProbes: {
        knownRestricted: {sourceId: "confluence-page:800000000012", marker: "SCALE-MARKER: server-dc-0001-2", title: "Scale 0001 Guide"},
        unknownClosed: {sourceId: "confluence-page:800000000011", marker: "SCALE-MARKER: server-dc-0001-1", title: "Scale 0001 Root"},
        historicalRetentionOnly: {sourceId: "confluence-page:810000000012", ownerPageSourceId: "confluence-page:800000000012", marker: "HISTORY-MARKER: server-dc-0001-2", searchableAsIndependentPage: false},
      },
      attachmentEntities: mediaSpec.length,
      attachments: mediaSpec,
      permissionSets: PAGE_COUNT,
      permissions: PAGE_COUNT,
      labels: PAGE_COUNT,
      entityCounts: "21,006 = 1 Space + 1 ConfluenceUserImpl + 1 Label + 6,000 Page (3,000 current and 3,000 historical) + 6,000 BodyContent + 3,000 ContentPermissionSet + 3,000 ContentPermission + 3,000 Labelling + 3 Attachment",
      destinationNativeAdaptations: {
        statusLookup: {
          policy: "verification-only",
          match: "Exact source status key must match an active destination key with requires_verification=false.",
          destinationStatuses: DEFAULT_DESTINATION_STATUSES,
          sourceMapping: "src/core/features/imports/confluence/xml-space.ts preserves contentStatus as page.status; src/core/features/imports/persist.ts looks up page.status by exact key.",
        },
        pageStatusLosses: pageStatusAdaptations,
        pageStatusLossCount: pageStatusAdaptations.reduce((count, group) => count + group.count, 0),
        personalContainerWarnings: [],
        personalContainerWarningCount: 0,
        restrictionWarnings: pageStatusSourceIds.length
          ? [{ kind: "construct", label: RESTRICTION_WARNING }]
          : [],
        warningCount: Object.values(expectedWarnings).reduce((count, value) => count + value, 0),
      },
    },
    archiveExpectation: { outcome: "success" },
    restrictionSpec: {
      archiveFormat: "Confluence Server/Data Center entities.xml",
      entityClassNames: {
        space: CLASS.space,
        page: CLASS.page,
        bodyContent: CLASS.bodyContent,
        attachment: CLASS.attachment,
        permissionSet: CLASS.permissionSet,
        permission: CLASS.permission,
        user: CLASS.user,
        label: CLASS.label,
        labelling: CLASS.labelling,
      },
      propertyNames: {
        page: ["id", "spaceId", "space", "parentId", "parent", "title", "bodyContentId", "bodyContent", "contentStatus", "version", "historicalVersions", "labels"],
        bodyContent: ["id", "contentId", "content", "body", "bodyTypeId"],
        historicalPage: ["id", "space", "originalVersion", "contentStatus", "version", "title", "bodyContent", "versionComment", "lastModificationDate"],
        attachment: ["id", "container", "title", "version", "contentType"],
        permissionSet: ["id", "contentId", "content", "type", "permissions"],
        permission: ["id", "owningSet", "permissionSet", "contentId", "type", "userName", "userSubject"],
        user: ["id", "key", "name", "lowerName"],
        label: ["id", "name", "namespace"],
        labelling: ["id", "contentId", "content", "labelId", "label", "namespace", "owner"],
      },
      referenceScheme: {
        pageBodyContent: "Page.bodyContentId is scalar and Page.bodyContent is an id reference; BodyContent.contentId is scalar and BodyContent.content references the Page.",
        pageLabels: "Page.labels is a set of Label id references; each Labelling carries scalar contentId/labelId and native content/label references.",
        historicalContent: "Current Page.historicalVersions references the historical Page; historical Page.originalVersion points to the current Page. Both have separate BodyContent records.",
        attachmentContent: "Attachment.container references the actual owning current Page, or its historical alias. Binary paths use the current Page ID, attachment entity ID and version.",
        permissionSetContent: "ContentPermissionSet.contentId is scalar and ContentPermissionSet.content references the Page.",
        permissionSetPermissions: "ContentPermissionSet.permissions is a set of ContentPermission id references.",
        permissionOwner: "ContentPermission.owningSet and ContentPermission.permissionSet both reference the ContentPermissionSet; its contentId also names the restricted Page.",
        userSubject: "Known userSubject references the ConfluenceUserImpl id whose key is the source principal ID; the unknown userSubject references no entity.",
      },
      permissionType: "VIEW",
      permissionSetReferenceCollection: "permissions -> set -> id references",
      knownSourcePrincipalId: KNOWN_PRINCIPAL,
      allowedMemberEmail,
      mappingMode: "explicit-operator-mapping; no same-email inference",
      unknownSourcePrincipalId: UNKNOWN_PRINCIPAL,
      unknownUserReference: UNKNOWN_PRINCIPAL,
      unknownRestriction: "fail-closed; no ConfluenceUserImpl or destination mapping exists",
      knownRestrictionCount: PAGE_COUNT - 1,
      unknownRestrictionCount: 1,
    },
    nativeFormatSpec: {
      status: "generated construct coverage; no exporter-produced Server/Data Center fixture was supplied; not vendor-real-format verification",
      archiveMember: "entities.xml",
      objectClasses: CLASS,
      generatedEntityCount: 21_006,
      bodyContentType: "storage-format XHTML with ac:link/ri:page and ac:image/ri:attachment (bodyTypeId=2)",
      storageReferenceCounts: {pageLinks: PAGE_COUNT, historicalAliasPageLinks: GROUP_COUNT * 2, titlePageLinks: GROUP_COUNT * 2, titleWithSpaceKeyPageLinks: GROUP_COUNT, titleInOwnerSpacePageLinks: GROUP_COUNT, explicitIdPageLinks: GROUP_COUNT, ownedImages: mediaSpec.length, crossOwnerAttachmentLinks: mediaSpec.length, attachmentOwnerTitleLinks: mediaSpec.length},
      labelNamespace: "global",
    },
    parserObservation: "run",
    traceMarkers,
    idMappings,
  };
}
