import {docxLinks} from './provider-folders/docx-links';
import { archiveMediaType, readZipArchive, requireArchiveText } from "./archive";
import { ImportError } from "./errors";
import { attributes, childEntries, orderedText, orderedXml, valueFor, type OrderedNode } from "./docx-xml";
import { docxTable } from "./docx-tables";
import { createImportReport, reportCreated, reportMissingArchiveFile, reportUnmapped } from "./report";
import { asArray, parseXml, type XmlObject, xmlAttribute } from "./xml";
import type { ImportFormat, ImportParseOptions, ImportSourceFile, ImportedBlock, ImportedMedia, NormalizedImport } from "./types";

function styleForParagraph(paragraph: OrderedNode): string | undefined {
  const properties = childEntries(valueFor(paragraph, "p"), "pPr")[0];
  const style = properties ? childEntries(valueFor(properties, "pPr"), "pStyle")[0] : undefined;
  return style ? attributes(style).val : undefined;
}

interface NumberingReference {
  numId: string;
  level: number;
}

function numberingReference(paragraph: OrderedNode): NumberingReference | undefined {
  const properties = childEntries(valueFor(paragraph, "p"), "pPr")[0];
  const numbering = properties ? childEntries(valueFor(properties, "pPr"), "numPr")[0] : undefined;
  if (!numbering) return undefined;
  const value = valueFor(numbering, "numPr");
  const numId = attributes(childEntries(value, "numId")[0] ?? {}).val;
  const level = Number(attributes(childEntries(value, "ilvl")[0] ?? {}).val ?? "0");
  // `w:numId="0"` is OOXML's way of saying "this paragraph is not numbered",
  // which a style may have set and this paragraph then cancelled.
  if (!numId || numId === "0") return undefined;
  return { numId, level: Number.isFinite(level) ? level : 0 };
}

/**
 * `word/numbering.xml` says whether a numbered paragraph is a bullet or an
 * ordinal: `w:num` maps a `numId` to an `abstractNum`, whose `w:lvl` entries
 * carry the `w:numFmt` for each indent level, and a `w:lvlOverride` on the
 * `w:num` replaces that format for one level. Google Docs writes the part even
 * when a document uses no lists, so an absent or empty part is normal. A `w:num`
 * whose `abstractNum` the part does not carry is named, never guessed at.
 */
interface DocxNumbering {
  formats: Map<string, Map<number, string>>;
  missingAbstractNum: Map<string, string>;
}

const orderedFormats = new Set(["decimal", "decimalZero", "ordinal", "ordinalText", "cardinalText", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman"]);

function levelFormats(node: XmlObject): Map<number, string> {
  const levels = new Map<number, string>();
  for (const level of asArray(node.lvl as XmlObject | XmlObject[] | undefined)) {
    if (!level || typeof level !== "object") continue;
    const format = xmlAttribute(asArray(level.numFmt as XmlObject | XmlObject[] | undefined)[0], "val");
    if (format) levels.set(Number(xmlAttribute(level, "ilvl") ?? "0"), format);
  }
  return levels;
}

function numberingFormats(xml: string): DocxNumbering {
  const root = (parseXml(xml, "word/numbering.xml").numbering ?? {}) as XmlObject;
  const abstractFormats = new Map<string, Map<number, string>>();
  for (const abstract of asArray(root.abstractNum as XmlObject | XmlObject[] | undefined)) {
    if (!abstract || typeof abstract !== "object") continue;
    const id = xmlAttribute(abstract, "abstractNumId");
    if (id) abstractFormats.set(id, levelFormats(abstract));
  }
  const formats = new Map<string, Map<number, string>>();
  const missingAbstractNum = new Map<string, string>();
  for (const num of asArray(root.num as XmlObject | XmlObject[] | undefined)) {
    if (!num || typeof num !== "object") continue;
    const numId = xmlAttribute(num, "numId");
    if (!numId) continue;
    const abstractId = xmlAttribute(asArray(num.abstractNumId as XmlObject | XmlObject[] | undefined)[0], "val");
    if (!abstractId || !abstractFormats.has(abstractId)) {
      missingAbstractNum.set(numId, abstractId ?? "(none)");
      continue;
    }
    const levels = new Map(abstractFormats.get(abstractId)!);
    for (const override of asArray(num.lvlOverride as XmlObject | XmlObject[] | undefined)) {
      if (!override || typeof override !== "object") continue;
      for (const [level, format] of levelFormats(override)) levels.set(level, format);
    }
    formats.set(numId, levels);
  }
  return { formats, missingAbstractNum };
}

function relationshipTargets(xml: string): Map<string, string> {
  const root = parseXml(xml, "word/_rels/document.xml.rels");
  const relations = (root.Relationships as XmlObject | undefined)?.Relationship;
  return new Map(asArray(relations as XmlObject | XmlObject[] | undefined).flatMap((relation) => {
    if (!relation || typeof relation !== "object") return [];
    const id = xmlAttribute(relation, "Id");
    const target = xmlAttribute(relation, "Target");
    return id && target ? [[id, target] as const] : [];
  }));
}

function descendants(value: unknown, tag: string): OrderedNode[] {
  if (Array.isArray(value)) return value.flatMap(child => descendants(child, tag));
  if (!value || typeof value !== "object") return [];
  const node = value as OrderedNode;
  return [...(tag in node ? [node] : []), ...Object.entries(node).filter(([key]) => key !== ":@").flatMap(([, child]) => descendants(child, tag))];
}

function embeddedImages(value: unknown): { relationshipId: string; altText: string }[] {
  return descendants(value, "drawing").flatMap(drawing => {
    const descriptions = descendants(valueFor(drawing, "drawing"), "docPr");
    const altText = descriptions.length ? attributes(descriptions[0]!).descr ?? "" : "";
    return descendants(valueFor(drawing, "drawing"), "blip").flatMap(blip => {
      const relationshipId = attributes(blip).embed;
      return relationshipId ? [{ relationshipId, altText }] : [];
    });
  });
}

function makeBlock(sourceId: string, index: number, kind: ImportedBlock["kind"], text?: string): ImportedBlock {
  return { sourceId: `${sourceId}#block-${index}`, sourceIdentityKind: "path-derived", kind, text: text?.trim() || undefined, links: [], children: [] };
}

function titleFor(source: ImportSourceFile): string {
  return source.name.replace(/\.[^.]+$/, "") || "Imported document";
}

export function parseDocx(source: ImportSourceFile, format: Extract<ImportFormat, "docx" | "google-docx"> = "docx", options?: ImportParseOptions): NormalizedImport {
  const files = readZipArchive(source.bytes, options?.limits);
  const documentXml = requireArchiveText(files, "word/document.xml");
  const relationships = files.has("word/_rels/document.xml.rels") ? relationshipTargets(requireArchiveText(files, "word/_rels/document.xml.rels")) : new Map<string, string>();
  const numbering: DocxNumbering = files.has("word/numbering.xml")
    ? numberingFormats(requireArchiveText(files, "word/numbering.xml"))
    : { formats: new Map(), missingAbstractNum: new Map() };
  const report = createImportReport();
  const id = `${format}:${source.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "document"}`;
  const mediaByRelationship = new Map<string, string>();
  const media: ImportedMedia[] = [];
  const addRelationshipMedia = (relationshipId: string): string | undefined => {
    const existing = mediaByRelationship.get(relationshipId);
    if (existing) return existing;
    const target = relationships.get(relationshipId);
    if (!target || /^(?:https?:|\/|\\)/i.test(target) || target.split("/").includes("..")) return undefined;
    const archivePath = `word/${target.replace(/^\.\//, "")}`;
    const bytes = files.get(archivePath);
    if (!bytes) { reportMissingArchiveFile(report, archivePath, id); return undefined; }
    const mediaId = `${id}:media:${archivePath}`;
    mediaByRelationship.set(relationshipId, mediaId);
    media.push({ sourceId: mediaId, sourceIdentityKind: "path-derived", name: archivePath.split("/").at(-1) ?? archivePath, archivePath, mediaType: archiveMediaType(archivePath), bytes });
    reportCreated(report, "file", archivePath, mediaId);
    return mediaId;
  };

  const document = orderedXml(documentXml, "word/document.xml").find((entry) => "document" in entry);
  const body = document ? childEntries(valueFor(document, "document"), "body")[0] : undefined;
  if (!body) throw new ImportError("IMPORT_FORMAT_INVALID", "word/document.xml has no document body.");
  const blocks: ImportedBlock[] = [];
  let blockIndex = 0;
  for (const entry of valueFor(body, "body")) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as OrderedNode;
    if ("p" in node) {
      const value = orderedText(valueFor(node, "p")).trim();
      if (value) {
        const style = styleForParagraph(node);
        const heading = style?.match(/^heading\s*([1-6])$/i);
        const list = heading ? undefined : numberingReference(node);
        const format = list ? numbering.formats.get(list.numId)?.get(list.level) : undefined;
        if (list && !format) {
          const cause = numbering.missingAbstractNum.has(list.numId) ? ` (abstractNumId ${numbering.missingAbstractNum.get(list.numId)})` : "";
          reportUnmapped(report, "Word numbering definition is missing, so the list item arrived unordered", id, `numId ${list.numId} level ${list.level}${cause}`);
        }
        const kind = heading ? "heading" : list ? (format && orderedFormats.has(format) ? "numbered-list" : "bulleted-list") : "paragraph";
        const block = makeBlock(id, blockIndex++, kind, value);
        block.links = docxLinks(valueFor(node, "p"), relationships);
        if (heading) block.level = Number(heading[1]);
        if (list) block.level = list.level + 1;
        blocks.push(block);
      }
      for (const { relationshipId, altText } of embeddedImages(valueFor(node, "p"))) {
        const mediaSourceId = addRelationshipMedia(relationshipId);
        if (mediaSourceId) {
          const block = makeBlock(id, blockIndex++, "media");
          block.mediaSourceId = mediaSourceId;
          const file = media.find(file => file.sourceId === mediaSourceId)!;
          file.altText ??= altText;
          // Descriptions belong to a drawing occurrence, even when several
          // drawings share one relationship and one stored media file.
          block.canonicalBlock = {
            id: block.sourceId, blockType: "media", parentBlockId: null, treePosition: String(blockIndex - 1).padStart(8, "0"),
            content: { kind: file.mediaType.startsWith("image/") ? "image" : file.mediaType.startsWith("video/") ? "video" : file.mediaType.startsWith("audio/") ? "audio" : "file", source: { url: `/api/media/${mediaSourceId}`, name: file.name, fileId: mediaSourceId, contentType: file.mediaType }, caption: "", alt: altText },
          };
          blocks.push(block);
        }
      }
      continue;
    }
    if ("tbl" in node) {
      const block = makeBlock(id, blockIndex, "table");
      const table = docxTable(node, block.sourceId);
      if (table.rows.length) {
        block.rows = table.rows;
        if (table.content) block.canonicalBlock = { id: block.sourceId, blockType: "table", content: table.content, parentBlockId: null, treePosition: String(blockIndex).padStart(8, "0") };
        blockIndex++;
        blocks.push(block);
        const tableLinks=docxLinks(valueFor(node,"tbl"),relationships);
        if(tableLinks.length){
          reportUnmapped(report,"Word table hyperlinks are retained as link blocks after the table",id);
          for(const link of tableLinks){const linked=makeBlock(id,blockIndex++,"link",link.href);linked.links=[{href:link.href,kind:link.kind}];blocks.push(linked);}
        }
      }
    }
  }
  const title = blocks.find(block => block.kind === "heading" && block.level === 1)?.text || titleFor(source);
  reportCreated(report, "container", title, id);
  reportCreated(report, "page", title, id);
  return {
    format, sourceName: source.name,
    containers: [{ sourceId: id, sourceIdentityKind: "path-derived", name: title, personal: false, labels: [], grants: [] }],
    members: [],
    pages: [{ sourceId: id, sourceIdentityKind: "path-derived", containerSourceId: id, title, blocks, lifecycle: "live", labels: [], properties: {}, grants: [], revisions: [] }],
    databases: [], records: [], media, report,
  };
}
