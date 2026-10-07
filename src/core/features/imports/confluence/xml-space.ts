import { archiveMediaType, requireArchiveText } from "../archive";
import { ImportError } from "../errors";
import { htmlBlocks } from "../html";
import { createImportReport, reportCreated, reportMissingArchiveFile, reportUnmapped, reportWarning } from "../report";
import { asArray, parseXml, walkXml, type XmlObject, type XmlValue, xmlAttribute, xmlText } from "../xml";
import type { ImportSourceFile, ImportedGrant, ImportedMedia, ImportedPage, ImportedRevision, NormalizedImport } from "../types";

interface ConfluenceEntity {
  node: XmlObject;
  className: string;
  id: string;
  properties: Map<string, XmlValue>;
}

function className(node: XmlObject): string {
  return xmlAttribute(node, "class") ?? xmlAttribute(node, "className") ?? "";
}

function nameMatches(entity: ConfluenceEntity, suffix: string): boolean {
  return entity.className.toLowerCase().split(".").at(-1) === suffix.toLowerCase();
}

function objectId(node: XmlObject, properties: Map<string, XmlValue>): string | undefined {
  const direct = xmlAttribute(node, "id") ?? xmlText(properties.get("id"));
  if (direct) return direct.trim();
  const child = asArray(node.id as XmlValue | XmlValue[] | undefined)[0];
  return xmlText(child).trim() || undefined;
}

function propertiesFor(node: XmlObject): Map<string, XmlValue> {
  const values = new Map<string, XmlValue>();
  for (const property of asArray(node.property as XmlObject | XmlObject[] | undefined)) {
    if (!property || typeof property !== "object") continue;
    const name = xmlAttribute(property, "name");
    if (name) values.set(name, property);
  }
  return values;
}

function entities(xml: XmlObject): ConfluenceEntity[] {
  const result: ConfluenceEntity[] = [];
  walkXml(xml, (node) => {
    const type = className(node);
    if (!type) return;
    const properties = propertiesFor(node);
    const id = objectId(node, properties);
    if (id) result.push({ node, className: type, id, properties });
  });
  return result;
}

function property(entity: ConfluenceEntity, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = xmlText(entity.properties.get(name)).trim();
    if (value) return value;
  }
  return undefined;
}

function propertyId(entity: ConfluenceEntity, ...names: string[]): string | undefined {
  return property(entity, ...names)?.match(/[A-Za-z0-9_.:-]+/)?.[0];
}

function labels(entity: ConfluenceEntity): string[] {
  const value = entity.properties.get("labels") ?? entity.properties.get("label");
  if (!value) return [];
  const collected: string[] = [];
  walkXml(value, (node) => {
    const name = xmlText(node).trim();
    if (name && name.length < 256 && !/^(?:labels?|collection|set)$/i.test(name)) collected.push(name);
  });
  return [...new Set(collected)];
}

function pageLifecycle(entity: ConfluenceEntity): ImportedPage["lifecycle"] {
  const status = property(entity, "contentStatus", "status")?.toLowerCase();
  if (status === "draft") return "draft";
  if (status === "archived") return "archived";
  return "live";
}

function pageGrant(entity: ConfluenceEntity, containerSourceId: string): ImportedGrant[] {
  const restricted = property(entity, "restricted", "hasRestrictions", "isRestricted")?.toLowerCase();
  if (restricted !== "true") return [];
  return [{ principalKind: "container", principalSourceId: containerSourceId, level: "view", general: true }];
}

function findArchivePath(files: Map<string, Uint8Array>, name: string): string | undefined {
  const target = name.toLowerCase();
  return [...files.keys()].find((path) => path.split("/").at(-1)?.toLowerCase() === target);
}

function resolveConfluenceLinks(pages: ImportedPage[], pageIds: Map<string, string>) {
  for (const page of pages) {
    for (const block of page.blocks) for (const link of block.links) {
      const pageId = link.href.match(/[?&]pageId=([^&#/]+)/i)?.[1] ?? link.href.match(/^page:(.+)$/i)?.[1];
      const targetSourceId = pageId ? pageIds.get(pageId) : undefined;
      if (targetSourceId) { link.kind = "page"; link.targetSourceId = targetSourceId; }
    }
  }
}

export function parseConfluenceXmlSpace(files: Map<string, Uint8Array>, source: ImportSourceFile): NormalizedImport {
  const entitiesPath = [...files.keys()].find((path) => path.split("/").at(-1)?.toLowerCase() === "entities.xml");
  if (!entitiesPath) throw new ImportError("IMPORT_FORMAT_INVALID", "The Confluence archive has no entities.xml export.");
  const allEntities = entities(parseXml(requireArchiveText(files, entitiesPath), entitiesPath));
  const spaces = allEntities.filter((entity) => nameMatches(entity, "Space"));
  if (!spaces.length) throw new ImportError("IMPORT_FORMAT_INVALID", "The Confluence archive has no space entity.");
  const report = createImportReport();
  const containers = spaces.map((space) => {
    const id = `confluence-space:${space.id}`;
    const name = property(space, "name", "key") ?? `Confluence space ${space.id}`;
    reportCreated(report, "container", name, id);
    return { sourceId: id, sourceIdentityKind: "native" as const, name, key: property(space, "key"), personal: false, labels: labels(space), grants: [] };
  });
  const containerFor = (entity: ConfluenceEntity): string => {
    const spaceId = propertyId(entity, "spaceId", "space") ?? spaces[0]!.id;
    return `confluence-space:${spaceId}`;
  };
  const pageEntities = allEntities.filter((entity) => nameMatches(entity, "Page") || nameMatches(entity, "Folder"));
  const pageIds = new Map(pageEntities.map((entity) => [entity.id, `confluence-page:${entity.id}`]));
  const pages: ImportedPage[] = pageEntities.map((entity) => {
    const isFolder = nameMatches(entity, "Folder");
    const id = pageIds.get(entity.id)!;
    const title = property(entity, "title", "name") ?? `${isFolder ? "Folder" : "Page"} ${entity.id}`;
    const body = isFolder ? "" : property(entity, "body", "bodyAsString") ?? "";
    const page = {
      sourceId: id,
      sourceIdentityKind: "native" as const,
      parentSourceId: (() => { const parent = propertyId(entity, "parentId", "parent"); return parent ? pageIds.get(parent) : undefined; })(),
      containerSourceId: containerFor(entity),
      title,
      blocks: isFolder ? [] : htmlBlocks(body, id, report),
      lifecycle: pageLifecycle(entity),
      labels: labels(entity),
      properties: {},
      status: property(entity, "contentStatus", "status"),
      grants: pageGrant(entity, containerFor(entity)),
      revisions: [] as ImportedRevision[],
    };
    if (isFolder) reportUnmapped(report, "Confluence folder imported as an empty-body page", id);
    reportCreated(report, "page", title, id);
    return page;
  });
  resolveConfluenceLinks(pages, pageIds);

  const media: ImportedMedia[] = [];
  for (const attachment of allEntities.filter((entity) => nameMatches(entity, "Attachment"))) {
    const name = property(attachment, "fileName", "title", "name");
    if (!name) { reportUnmapped(report, "Confluence attachment has no filename", `confluence-attachment:${attachment.id}`); continue; }
    const archivePath = findArchivePath(files, name);
    if (!archivePath) { reportMissingArchiveFile(report, name, `confluence-attachment:${attachment.id}`); continue; }
    const sourceId = `confluence-attachment:${attachment.id}`;
    media.push({ sourceId, sourceIdentityKind: "native", name, archivePath, mediaType: archiveMediaType(archivePath), bytes: files.get(archivePath)! });
    reportCreated(report, "file", name, sourceId);
  }
  for (const version of allEntities.filter((entity) => nameMatches(entity, "Version"))) {
    const contentId = propertyId(version, "contentId", "content", "originalContent");
    const page = contentId ? pages.find((candidate) => candidate.sourceId === pageIds.get(contentId)) : undefined;
    if (!page) { reportUnmapped(report, "Confluence version could not be associated with a page", `confluence-version:${version.id}`); continue; }
    const sourceId = `confluence-version:${version.id}`;
    page.revisions.push({ sourceId, sourceIdentityKind: "native", ordinal: Number(property(version, "version", "versionNumber")) || undefined, label: property(version, "title"), status: property(version, "contentStatus", "status"), comment: property(version, "comment", "message"), createdAt: property(version, "creationDate", "created"), origin: "publish", blocks: [] });
    reportCreated(report, "version", `Version ${property(version, "version", "versionNumber") ?? version.id}`, sourceId);
  }
  for (const entity of allEntities) {
    if (["Whiteboard", "BlogPost", "Calendar"].some((name) => nameMatches(entity, name))) reportUnmapped(report, `Unsupported Confluence ${entity.className.split(".").at(-1)}`, `confluence:${entity.id}`);
  }
  if (pages.some((page) => page.grants.length)) reportWarning(report, "Restricted page grants remain scoped to the source container", undefined);
  return { format: "confluence-space", sourceName: source.name, containers, members: [], pages, databases: [], records: [], media, report };
}
