import { archiveMediaType, readZipArchive, requireArchiveText } from "./archive";
import { ImportError } from "./errors";
import { htmlBlocks } from "./html";
import { createImportReport, reportCreated } from "./report";
import { asArray, parseXml, type XmlObject, type XmlValue, xmlAttribute, xmlText } from "./xml";
import type { ImportParseOptions, ImportSourceFile, ImportedMedia, NormalizedImport } from "./types";

function resolveArchivePath(from: string, target: string): string {
  if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(target)) throw new ImportError("IMPORT_FORMAT_INVALID", `EPUB archive reference is unsafe: ${target}.`);
  const prefix = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const segments: string[] = [];
  for (const segment of `${prefix}${target}`.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") { if (!segments.length) throw new ImportError("IMPORT_FORMAT_INVALID", `EPUB reference escapes its package: ${target}.`); segments.pop(); }
    else segments.push(segment);
  }
  return segments.join("/");
}

function rootFilePath(files: Map<string, Uint8Array>): string {
  const container = parseXml(requireArchiveText(files, "META-INF/container.xml"), "META-INF/container.xml");
  const root = container.container as XmlObject | undefined;
  const rootfiles = root?.rootfiles as XmlObject | undefined;
  const rootfile = asArray(rootfiles?.rootfile as XmlObject | XmlObject[] | undefined)[0];
  const path = rootfile && xmlAttribute(rootfile, "full-path");
  if (!path) throw new ImportError("IMPORT_FORMAT_INVALID", "The EPUB container has no package root file.");
  if (!files.has(path)) throw new ImportError("IMPORT_FORMAT_INVALID", `The EPUB package file is absent: ${path}.`);
  return path;
}

function title(opf: XmlObject, fallback: string): string {
  const packageNode = opf.package as XmlObject | undefined;
  const metadata = packageNode?.metadata as XmlObject | undefined;
  return xmlText(metadata?.title as XmlValue | undefined).trim() || fallback;
}

export function parseEpub(source: ImportSourceFile, options?: ImportParseOptions): NormalizedImport {
  const files = readZipArchive(source.bytes, options?.limits);
  const opfPath = rootFilePath(files);
  const opf = parseXml(requireArchiveText(files, opfPath), opfPath);
  const packageNode = opf.package as XmlObject | undefined;
  if (!packageNode) throw new ImportError("IMPORT_FORMAT_INVALID", "The EPUB package file has no package node.");
  const manifest = packageNode.manifest as XmlObject | undefined;
  const spine = packageNode.spine as XmlObject | undefined;
  const items = asArray(manifest?.item as XmlObject | XmlObject[] | undefined);
  const itemById = new Map(items.flatMap((item) => {
    const id = xmlAttribute(item, "id");
    const href = xmlAttribute(item, "href");
    return id && href ? [[id, { href, mediaType: xmlAttribute(item, "media-type") } as const] as const] : [];
  }));
  const spineIds = asArray(spine?.itemref as XmlObject | XmlObject[] | undefined).map((item) => xmlAttribute(item, "idref")).filter((id): id is string => Boolean(id));
  if (!spineIds.length) throw new ImportError("IMPORT_FORMAT_INVALID", "The EPUB package has no reading spine.");
  const id = `epub:${source.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "book"}`;
  const report = createImportReport();
  const mediaByPath = new Map<string, string>();
  const media: ImportedMedia[] = [];
  const addMedia = (path: string): string | undefined => {
    const existing = mediaByPath.get(path);
    if (existing) return existing;
    const bytes = files.get(path);
    if (!bytes) return undefined;
    const mediaId = `${id}:file:${path}`;
    mediaByPath.set(path, mediaId);
    media.push({ sourceId: mediaId, sourceIdentityKind: "path-derived", name: path.split("/").at(-1) ?? path, archivePath: path, mediaType: archiveMediaType(path), bytes });
    reportCreated(report, "file", path, mediaId);
    return mediaId;
  };
  const pages = spineIds.flatMap((itemId, index) => {
    const item = itemById.get(itemId);
    if (!item || !item.mediaType?.includes("html")) return [];
    const path = resolveArchivePath(opfPath, item.href);
    const bytes = files.get(path);
    if (!bytes) throw new ImportError("IMPORT_FORMAT_INVALID", `The EPUB spine document is absent: ${path}.`);
    const pageId = `${id}:chapter:${index + 1}`;
    const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const resolveMedia = (href: string) => {
      try { return addMedia(resolveArchivePath(path, href)); } catch { return undefined; }
    };
    const blocks = htmlBlocks(html, pageId, report, resolveMedia);
    const firstHeading = blocks.find((block) => block.kind === "heading")?.text;
    const pageTitle = firstHeading || path.split("/").at(-1)?.replace(/\.[^.]+$/, "") || `Chapter ${index + 1}`;
    reportCreated(report, "page", pageTitle, pageId);
    return [{ sourceId: pageId, sourceIdentityKind: "path-derived" as const, containerSourceId: id, title: pageTitle, blocks, lifecycle: "live" as const, labels: [], properties: {}, grants: [], revisions: [] }];
  });
  if (!pages.length) throw new ImportError("IMPORT_FORMAT_INVALID", "The EPUB spine has no HTML documents.");
  const bookTitle = title(opf, source.name.replace(/\.epub$/i, "") || "Imported EPUB");
  reportCreated(report, "container", bookTitle, id);
  return { format: "epub", sourceName: source.name, containers: [{ sourceId: id, sourceIdentityKind: "path-derived", name: bookTitle, personal: false, labels: [], grants: [] }], members: [], pages, databases: [], records: [], media, report };
}
