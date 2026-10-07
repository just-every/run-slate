import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ImportError } from "./errors";

export type XmlValue = string | number | boolean | XmlObject | XmlValue[];
export type XmlObject = { [key: string]: XmlValue | undefined };

const maximumXmlCharacters = 64 * 1024 * 1024;

function validateXml(text: string, sourceName: string) {
  if (text.length > maximumXmlCharacters) throw new ImportError("IMPORT_FORMAT_INVALID", `${sourceName} exceeds the XML import limit.`);
  if (/<!\s*(?:doctype|entity)\b/i.test(text)) throw new ImportError("IMPORT_FORMAT_INVALID", `${sourceName} contains a prohibited XML declaration.`);
  if (XMLValidator.validate(text) !== true) throw new ImportError("IMPORT_FORMAT_INVALID", `${sourceName} is not well-formed XML.`);
}

export function parseXml(text: string, sourceName: string): XmlObject {
  try {
    validateXml(text, sourceName);
    const value = new XMLParser({
      attributeNamePrefix: "@_",
      ignoreAttributes: false,
      parseTagValue: false,
      removeNSPrefix: true,
      textNodeName: "#text",
      trimValues: false,
    }).parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("root is not an object");
    return value as XmlObject;
  } catch {
    throw new ImportError("IMPORT_FORMAT_INVALID", `${sourceName} is not well-formed XML.`);
  }
}

export function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function xmlText(value: XmlValue | undefined): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(xmlText).join("");
  if (!value) return "";
  return Object.entries(value).filter(([key]) => !key.startsWith("@_")).map(([, child]) => xmlText(child)).join("");
}

export function xmlAttribute(value: XmlObject | undefined, name: string): string | undefined {
  const attribute = value?.[`@_${name}`];
  return typeof attribute === "string" || typeof attribute === "number" ? String(attribute) : undefined;
}

export function walkXml(value: XmlValue | undefined, visit: (node: XmlObject) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkXml(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  visit(value);
  Object.entries(value).filter(([key]) => !key.startsWith("@_")).forEach(([, child]) => walkXml(child, visit));
}

export function childValues(node: XmlObject | undefined, name: string): XmlValue[] {
  return asArray(node?.[name] as XmlValue | XmlValue[] | undefined);
}
