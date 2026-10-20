import { XMLParser } from "fast-xml-parser";
import { ImportError } from "./errors";

export type OrderedNode = Record<string, unknown>;

export function orderedXml(text: string, sourceName: string): OrderedNode[] {
  try {
    const parsed = new XMLParser({ attributeNamePrefix: "@_", ignoreAttributes: false, parseTagValue: false, removeNSPrefix: true, preserveOrder: true, textNodeName: "#text", trimValues: false }).parse(text);
    if (!Array.isArray(parsed)) throw new Error("not an ordered document");
    return parsed as OrderedNode[];
  } catch {
    throw new ImportError("IMPORT_FORMAT_INVALID", `${sourceName} is not well-formed XML.`);
  }
}

export function childEntries(node: unknown, tag: string): OrderedNode[] {
  if (!Array.isArray(node)) return [];
  return node.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || !(tag in entry)) return [];
    const value = (entry as OrderedNode)[tag];
    return Array.isArray(value) ? [entry as OrderedNode] : [];
  });
}

export function valueFor(entry: OrderedNode, tag: string): unknown[] {
  const value = entry[tag];
  return Array.isArray(value) ? value : [];
}

export function attributes(nodes: unknown[] | OrderedNode): Record<string, string> {
  const candidates = Array.isArray(nodes) ? nodes : [nodes];
  const attrs = candidates.find((node) => node && typeof node === "object" && ":@" in node) as OrderedNode | undefined;
  const raw = attrs?.[":@"];
  return raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, value]) => typeof value === "string").map(([key, value]) => [key.replace(/^@_/, ""), value as string])) : {};
}

/** Read Word text runs without including field instructions or formatting whitespace. */
export function orderedText(value: unknown): string {
  if (Array.isArray(value)) return value.map(orderedText).join("");
  if (!value || typeof value !== "object") return "";
  const node = value as OrderedNode;
  if ("t" in node) return valueFor(node, "t").map((part) => {
    const text = (part as OrderedNode)["#text"];
    return typeof text === "string" || typeof text === "number" || typeof text === "boolean" ? String(text) : "";
  }).join("");
  if ("tab" in node) return "\t";
  if ("br" in node || "cr" in node) return "\n";
  return Object.entries(node).filter(([key]) => key !== ":@").map(([, child]) => orderedText(child)).join("");
}
