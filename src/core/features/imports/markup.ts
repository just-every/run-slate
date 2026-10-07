import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

export type MarkupNode = DefaultTreeAdapterMap["node"];

/**
 * HTML void elements. A self-closing `<br/>` must stay void; every other
 * self-closing tag has to be given an explicit end tag before an HTML parser
 * sees it, or the parser nests the rest of the document inside it.
 */
const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const selfClosing = /<([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\/>/g;

/**
 * Confluence storage format is XHTML carrying namespaced elements
 * (`<ac:image>`, `<ri:url ri:value="…" />`). It is parsed with the HTML parser
 * so that HTML entities resolve, which means every self-closing non-void tag
 * has to be expanded first.
 */
export function expandSelfClosingTags(markup: string): string {
  return markup.replace(selfClosing, (match, tag: string, attributes: string) =>
    voidElements.has(tag.toLowerCase()) ? match : `<${tag}${attributes}></${tag}>`);
}

export function parseMarkupFragment(markup: string): MarkupNode {
  return parseFragment(markup) as MarkupNode;
}

export function elementName(node: MarkupNode): string | undefined {
  return "tagName" in node && typeof node.tagName === "string" ? node.tagName.toLowerCase() : undefined;
}

export function childNodes(node: MarkupNode): MarkupNode[] {
  return "childNodes" in node && Array.isArray(node.childNodes) ? node.childNodes : [];
}

export function attributesOf(node: MarkupNode): Record<string, string> {
  if (!("attrs" in node) || !Array.isArray(node.attrs)) return {};
  return Object.fromEntries(node.attrs.map((attribute) => [attribute.name.toLowerCase(), attribute.value]));
}

export function textOf(node: MarkupNode, skip: (name: string) => boolean = () => false): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  const name = elementName(node);
  if (name && skip(name)) return "";
  return childNodes(node).map((child) => textOf(child, skip)).join("");
}

export function findElements(node: MarkupNode, name: string): MarkupNode[] {
  const found: MarkupNode[] = [];
  const visit = (candidate: MarkupNode) => {
    if (elementName(candidate) === name) found.push(candidate);
    childNodes(candidate).forEach(visit);
  };
  childNodes(node).forEach(visit);
  return found;
}
