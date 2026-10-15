import type { ImportedBlock, ImportedLink } from "./types";
import { safeUrl } from "../editor/validation";

type Span = { text: string; link?: { href: string } };
type IdFor = (kind: string, id: string) => string;

export function importedHref(link: ImportedLink | undefined, idFor: IdFor): string | undefined {
  if (!link) return undefined;
  if (!link.targetSourceId) return link.href;
  return link.kind === "attachment"
    ? `/api/media/${idFor("file", link.targetSourceId)}`
    : `/app/pages/${idFor("page", link.targetSourceId)}`;
}

/** Markdown labels carry exact ranges so surrounding prose stays unlinked. */
export function importedText(block: ImportedBlock, idFor: IdFor): Span[] {
  const text = block.text ?? "";
  const ranged = block.links.filter(link => link.textStart !== undefined && link.textEnd !== undefined);
  if (!ranged.length) {
    const href = importedHref(block.links[0], idFor);
    return [{ text, ...(href && safeUrl(href) ? { link: { href } } : {}) }];
  }
  const spans: Span[] = [];
  let cursor = 0;
  for (const link of ranged) {
    const start = link.textStart!, end = link.textEnd!;
    if (start < cursor || end < start || end > text.length) continue;
    if (start > cursor) spans.push({ text: text.slice(cursor, start) });
    const href = importedHref(link, idFor);
    spans.push({ text: text.slice(start, end), ...(href && safeUrl(href) ? { link: { href } } : {}) });
    cursor = end;
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor) });
  return spans.length ? spans : [{ text }];
}
