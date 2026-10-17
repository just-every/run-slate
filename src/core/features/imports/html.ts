import { attributesOf as attributes, childNodes as children, elementName, parseMarkupFragment, textOf as text, type MarkupNode } from "./markup";
import { reportUnmapped, reportWarning } from "./report";
import { safeImportLink } from "./url";
import type { ImportedBlock, ImportReport } from "./types";
import { inlineMarkup } from "./inline-markup";
import { parseTableOfContentsSettings } from "./portable-blocks";

type HtmlNode = MarkupNode;
type MediaResolver = (source: string) => string | undefined;

const blockedTags = new Set(["script", "style", "form", "iframe", "object", "embed", "meta", "base", "link"]);

function block(sourceId: string, index: number, kind: ImportedBlock["kind"], value?: string): ImportedBlock {
  return { sourceId: `${sourceId}#html-${index}`, sourceIdentityKind: "path-derived", kind, text: value?.trim() || undefined, links: [], children: [] };
}

function tableRows(node: HtmlNode): string[][] {
  const rows: string[][] = [];
  const visit = (candidate: HtmlNode) => {
    if (elementName(candidate) === "tr") {
      const cells = children(candidate).filter((child) => ["th", "td"].includes(elementName(child) ?? "")).map((cell) => text(cell).trim());
      if (cells.length) rows.push(cells);
      return;
    }
    children(candidate).forEach(visit);
  };
  visit(node);
  return rows;
}

export function htmlBlocks(html: string, sourceId: string, report: ImportReport, resolveMedia?: MediaResolver): ImportedBlock[] {
  const fragment = parseMarkupFragment(html);
  const blocks: ImportedBlock[] = [];
  let index = 0;

  const append = (kind: ImportedBlock["kind"], value?: string) => {
    const next = block(sourceId, index++, kind, value);
    blocks.push(next);
    return next;
  };
  const inline = (kind: ImportedBlock["kind"], node: HtmlNode) => {
    const content = inlineMarkup(node, {skip: child => blockedTags.has(elementName(child) ?? '') || ['ul', 'ol', 'table', 'pre', 'blockquote', 'img', 'nav'].includes(elementName(child) ?? '')});
    const next = append(kind, content.text);
    next.links = content.links;
    if (content.statuses.length) next.statuses = content.statuses;
    return next;
  };

  const visit = (node: HtmlNode) => {
    const tag = elementName(node);
    if (!tag) {
      children(node).forEach(visit);
      return;
    }
    if (blockedTags.has(tag)) {
      reportUnmapped(report, `Removed unsafe HTML element <${tag}>`, sourceId);
      return;
    }
    const attrs = attributes(node);
    if (tag === 'nav' && attrs['data-slate-table-of-contents']) {
      const settings = parseTableOfContentsSettings(attrs['data-slate-table-of-contents']);
      if (settings) { const next = append('table-of-contents'); next.tableOfContents = settings; return; }
    }
    if (tag === "img") {
      const source = attrs.src;
      if (!source) return;
      const mediaSourceId = resolveMedia?.(source);
      if (mediaSourceId) {
        const next = append("media");
        next.mediaSourceId = mediaSourceId;
        next.text = attrs.alt?.trim() || undefined;
      } else {
        const link = safeImportLink(source);
        if (link) {
          const next = append("link", attrs.alt || source);
          next.links.push(link);
          reportWarning(report, "Image was imported as a link because no archive file was present", sourceId, source);
        } else reportUnmapped(report, "Removed unsafe image source", sourceId, source);
      }
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const next = inline("heading", node);
      next.level = Number(tag.slice(1));
      return;
    }
    if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
      if (tag !== 'p' && children(node).some(child => ['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'nav'].includes(elementName(child) ?? ''))) { children(node).forEach(visit); return; }
      if (text(node).trim()) inline("paragraph", node);
      children(node).filter((child) => ["ul", "ol", "table", "pre", "blockquote", "img"].includes(elementName(child) ?? "")).forEach(visit);
      return;
    }
    if (tag === "ul" || tag === "ol") {
      children(node).filter((child) => elementName(child) === "li").forEach((item) => {
        inline(tag === "ul" ? "bulleted-list" : "numbered-list", item);
        children(item).filter(child => ['ul', 'ol'].includes(elementName(child) ?? '')).forEach(visit);
      });
      return;
    }
    if (tag === "blockquote") { inline("quote", node); return; }
    if (tag === "aside") { inline("callout", node); return; }
    if (tag === "span" && attrs['data-slate-status']) { inline("paragraph", node); return; }
    if (tag === "hr") { append("divider"); return; }
    if (tag === "pre") {
      const next = append("code", text(node));
      const code = children(node).find((child) => elementName(child) === "code");
      const language = code ? attributes(code).class?.match(/language-([\w+-]+)/)?.[1] : undefined;
      next.language = language;
      return;
    }
    if (tag === "table") {
      const rows = tableRows(node);
      if (rows.length) { const next = append("table"); next.rows = rows; }
      return;
    }
    if (tag === "a") {
      const link = safeImportLink(attrs.href ?? "");
      if (!link) { reportUnmapped(report, "Removed unsafe link", sourceId, attrs.href); return; }
      const next = append("link", text(node) || link.href);
      next.links.push(link);
      return;
    }
    children(node).forEach(visit);
  };

  children(fragment).forEach(visit);
  return blocks;
}
