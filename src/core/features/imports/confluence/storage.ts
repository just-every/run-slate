import { attributesOf, childNodes, elementName, expandSelfClosingTags, findElements, parseMarkupFragment, textOf, type MarkupNode } from "../markup";
import { safeImportLink } from "../url";
import type { ImportedBlock } from "../types";

/**
 * Confluence storage format: XHTML plus `ac:`/`ri:` elements. Layouts are
 * flattened, the panel macros become callouts, `ac:task-list` becomes tasks, and
 * every other macro is named rather than guessed at. Image and link targets keep
 * their raw reference so the space parser can resolve them against the export's
 * own tables and attachments.
 *
 * The rule everywhere below is that text is never lost: a construct with no
 * Slate equivalent still yields its prose, and the construct itself is named in
 * the report.
 */

export interface StorageConstruct {
  label: string;
  detail?: string;
}

export interface StorageResult {
  blocks: ImportedBlock[];
  constructs: StorageConstruct[];
}

const calloutMacros = new Set(["info", "note", "tip", "warning", "panel", "success", "error"]);
const inlineOnly = new Set(["ac:placeholder"]);
const layoutElements = new Set(["ac:layout", "ac:layout-section", "ac:layout-cell", "ac:rich-text-body", "ac:task-body", "tbody", "thead", "colgroup"]);
/** Children a text-bearing element owns that must become blocks of their own. */
const nestedBlockTags = ["ac:image", "ac:structured-macro", "ac:task-list", "ac:link", "table", "ul", "ol", "pre", "blockquote"];
const listTags = new Set(["ul", "ol"]);

function skipInline(name: string): boolean {
  return inlineOnly.has(name);
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function text(node: MarkupNode): string {
  return collapse(textOf(node, skipInline));
}

/** Text this element owns, excluding the nested constructs that become blocks. */
function ownText(node: MarkupNode, exclude: Set<string>): string {
  return collapse(textOf(node, (name) => skipInline(name) || exclude.has(name)));
}

/** Descendants of `node` that are not inside a nested `stopAt` element. */
function findOwnElements(node: MarkupNode, name: string, stopAt: string[]): MarkupNode[] {
  const stop = new Set(stopAt);
  const found: MarkupNode[] = [];
  const visit = (candidate: MarkupNode) => {
    for (const child of childNodes(candidate)) {
      const tag = elementName(child);
      if (tag === name) { found.push(child); continue; }
      if (tag && stop.has(tag)) continue;
      visit(child);
    }
  };
  visit(node);
  return found;
}

/** `<ac:image><ri:attachment ri:filename="x"/></ac:image>` or `<ri:url ri:value="https://…"/>`. */
function imageReference(node: MarkupNode): { attachment?: string; url?: string } {
  const attachment = findElements(node, "ri:attachment")[0];
  const url = findElements(node, "ri:url")[0];
  return {
    attachment: attachment ? attributesOf(attachment)["ri:filename"] : undefined,
    url: url ? attributesOf(url)["ri:value"] : undefined,
  };
}

export function parseStorageFormat(xhtml: string, sourceId: string): StorageResult {
  const fragment = parseMarkupFragment(expandSelfClosingTags(xhtml));
  const constructs: StorageConstruct[] = [];
  const seen = new Set<string>();
  let index = 0;

  const note = (label: string, detail?: string) => {
    const key = `${label}|${detail ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    constructs.push({ label, detail });
  };

  const make = (kind: ImportedBlock["kind"], value?: string): ImportedBlock =>
    ({ sourceId: `${sourceId}#block-${index++}`, sourceIdentityKind: "path-derived", kind, text: value || undefined, links: [], children: [] });

  const externalLinks = (node: MarkupNode, block: ImportedBlock, stopAt: string[]) => {
    for (const anchor of findOwnElements(node, "a", stopAt)) {
      const link = safeImportLink(attributesOf(anchor).href ?? "");
      if (link) block.links.push({ ...link, kind: "external" });
      else note("Confluence link has an unsafe href", attributesOf(anchor).href);
    }
  };

  const noteInlineMarkers = (node: MarkupNode) => {
    for (const placeholder of findElements(node, "ac:placeholder")) {
      note("Confluence placeholder text dropped", collapse(textOf(placeholder)) || undefined);
    }
    for (const marker of findElements(node, "ac:inline-comment-marker")) {
      note("Confluence inline comment marker dropped, its text kept", attributesOf(marker)["ac:ref"]);
    }
  };

  const visit = (node: MarkupNode, into: ImportedBlock[]) => {
    const tag = elementName(node);
    if (!tag) return;

    if (layoutElements.has(tag)) {
      if (tag === "ac:layout-section") note("Confluence layout section flattened", attributesOf(node)["ac:type"]);
      childNodes(node).forEach((child) => visit(child, into));
      return;
    }

    if (tag === "ac:structured-macro") {
      const name = attributesOf(node)["ac:name"] ?? "";
      const body = findOwnElements(node, "ac:rich-text-body", ["ac:structured-macro"])[0];
      const parameters = findOwnElements(node, "ac:parameter", ["ac:structured-macro"]);
      if (calloutMacros.has(name)) {
        const callout = make("callout", name);
        if (body) childNodes(body).forEach((child) => visit(child, callout.children));
        into.push(callout);
        return;
      }
      if (name === "expand") {
        const expandable = make("expandable", parameters.map((parameter) => (attributesOf(parameter)["ac:name"] === "title" ? text(parameter) : "")).find(Boolean));
        if (body) childNodes(body).forEach((child) => visit(child, expandable.children));
        into.push(expandable);
        return;
      }
      if (name === "code") {
        // Code is verbatim: indentation and blank lines are the content.
        const plain = findOwnElements(node, "ac:plain-text-body", ["ac:structured-macro"])[0];
        const code = make("code", textOf(plain ?? node).replace(/^\n+|\s+$/g, ""));
        code.language = parameters.map((parameter) => (attributesOf(parameter)["ac:name"] === "language" ? text(parameter) : "")).find(Boolean);
        into.push(code);
        return;
      }
      const parameterNames = parameters.map((parameter) => attributesOf(parameter)["ac:name"]).filter(Boolean).join(", ") || undefined;
      if (body && text(body)) {
        note(`Confluence macro "${name}" has no Slate equivalent; its body was kept as plain blocks`, parameterNames);
        childNodes(body).forEach((child) => visit(child, into));
        return;
      }
      note(`Confluence macro "${name}" has no Slate equivalent`, parameterNames);
      return;
    }

    if (tag === "ac:task-list") { childNodes(node).forEach((child) => visit(child, into)); return; }
    if (tag === "ac:task") {
      const body = findOwnElements(node, "ac:task-body", ["ac:task"])[0];
      const task = make("task", text(body ?? node));
      task.checked = text(findOwnElements(node, "ac:task-status", ["ac:task"])[0] ?? node).toLowerCase() === "complete";
      if (body) externalLinks(body, task, []);
      into.push(task);
      return;
    }

    if (tag === "ac:image") {
      const { attachment, url } = imageReference(node);
      const media = make("media", attributesOf(node)["ac:alt"]);
      if (attachment) media.links.push({ href: attachment, kind: "attachment" });
      else if (url) {
        const link = safeImportLink(url);
        if (!link) { note("Confluence image has an unsafe source", url); return; }
        media.links.push(link);
      } else { note("Confluence image has no resource reference"); return; }
      into.push(media);
      return;
    }

    if (tag === "ac:link") {
      const page = findElements(node, "ri:page")[0];
      const attachment = findElements(node, "ri:attachment")[0];
      const body = findElements(node, "ac:link-body")[0] ?? findElements(node, "ac:plain-text-link-body")[0];
      const title = page ? attributesOf(page)["ri:content-title"] : attachment ? attributesOf(attachment)["ri:filename"] : undefined;
      if (!title) {
        const value = text(body ?? node);
        note("Confluence link has no page or attachment reference", value || undefined);
        if (value) into.push(make("paragraph", value));
        return;
      }
      const link = make("link", (body ? text(body) : "") || title);
      link.links.push({ href: title, kind: page ? "page" : "attachment" });
      into.push(link);
      return;
    }

    if (tag === "ac:inline-comment-marker") {
      note("Confluence inline comment marker dropped, its text kept", attributesOf(node)["ac:ref"]);
      childNodes(node).forEach((child) => visit(child, into));
      return;
    }
    if (tag === "ac:placeholder") { note("Confluence placeholder text dropped", collapse(textOf(node)) || undefined); return; }

    if (/^h[1-6]$/.test(tag)) {
      const value = ownText(node, new Set(nestedBlockTags));
      const heading = make("heading", value);
      heading.level = Number(tag.slice(1));
      externalLinks(node, heading, nestedBlockTags);
      noteInlineMarkers(node);
      if (heading.text) into.push(heading);
      // A heading can carry an inline image or macro; it must not vanish.
      childNodes(node).filter((child) => nestedBlockTags.includes(elementName(child) ?? "")).forEach((child) => visit(child, into));
      return;
    }
    if (tag === "p") {
      const value = ownText(node, new Set(nestedBlockTags));
      const paragraph = make("paragraph", value);
      externalLinks(node, paragraph, nestedBlockTags);
      noteInlineMarkers(node);
      if (value) into.push(paragraph);
      childNodes(node).filter((child) => nestedBlockTags.includes(elementName(child) ?? "")).forEach((child) => visit(child, into));
      return;
    }
    if (listTags.has(tag)) {
      for (const item of childNodes(node).filter((child) => elementName(child) === "li")) {
        // A nested list's text belongs to its own items, not to this one.
        const entry = make(tag === "ul" ? "bulleted-list" : "numbered-list", ownText(item, new Set(nestedBlockTags)));
        externalLinks(item, entry, nestedBlockTags);
        noteInlineMarkers(item);
        childNodes(item).filter((child) => nestedBlockTags.includes(elementName(child) ?? "")).forEach((child) => visit(child, entry.children));
        if (entry.text || entry.children.length) into.push(entry);
      }
      return;
    }
    if (tag === "table") {
      // Only this table's own rows; a nested table becomes its own block.
      const rows = findOwnElements(node, "tr", ["table"]).map((row) =>
        childNodes(row).filter((cell) => ["th", "td"].includes(elementName(cell) ?? "")).map((cell) => ownText(cell, new Set(nestedBlockTags))));
      if (rows.some((row) => row.some(Boolean))) {
        const table = make("table");
        table.rows = rows;
        into.push(table);
      } else if (rows.length) {
        note("Confluence table carries no text; its cell contents were imported as blocks", `${rows.length} rows`);
      }
      for (const cell of findOwnElements(node, "td", ["table"]).concat(findOwnElements(node, "th", ["table"]))) {
        childNodes(cell).filter((child) => nestedBlockTags.includes(elementName(child) ?? "")).forEach((child) => visit(child, into));
      }
      return;
    }
    if (tag === "blockquote") { const quote = make("quote", text(node)); if (quote.text) into.push(quote); return; }
    if (tag === "hr") { into.push(make("divider")); return; }
    if (tag === "pre") { into.push(make("code", textOf(node).replace(/^\n+|\s+$/g, ""))); return; }
    if (tag === "a") {
      const link = safeImportLink(attributesOf(node).href ?? "");
      if (!link) { note("Confluence link has an unsafe href", attributesOf(node).href); return; }
      const block = make("link", text(node) || link.href);
      // Storage-format `<a>` hrefs are absolute URLs or in-page fragments; only
      // `<ac:link>` names another page or attachment in this export.
      block.links.push({ ...link, kind: "external" });
      into.push(block);
      return;
    }
    if (["script", "style", "iframe", "object", "embed", "form"].includes(tag)) {
      note(`Removed unsafe HTML element <${tag}>`);
      return;
    }
    childNodes(node).forEach((child) => visit(child, into));
  };

  const blocks: ImportedBlock[] = [];
  childNodes(fragment).forEach((child) => visit(child, blocks));
  return { blocks, constructs };
}
