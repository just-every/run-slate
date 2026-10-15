import type { SourceIdentityKind } from "../types";

/**
 * Notion's Markdown-and-CSV export names a page `<title> <32 hex>.md` and names
 * the directory holding that page's children `<title>` — the identifier is
 * dropped from the directory. A database is `<title> <32 hex>_all.csv` beside a
 * `<title>` directory of its record pages. Every path question below is asked in
 * terms of that "tree key": the archive path with the extension, the `_all`
 * suffix and the trailing identifier removed, which is what the directories
 * actually spell.
 */

const nativeIdSuffix = /(?:\s|_)([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
/**
 * Notion abbreviates the identifier to its first four and last four hex digits
 * when it writes a filtered database view out as a loose CSV
 * (`Untitled 70fa-235b_all.csv`). It is an identifier, not part of the title.
 */
const shortIdSuffix = /(?:\s|_)[0-9a-f]{4}-[0-9a-f]{4}$/i;

export interface NotionIdentity {
  sourceId: string;
  sourceIdentityKind: SourceIdentityKind;
}

export function withoutExtension(path: string): string {
  return path.replace(/\.[^./]+$/, "");
}

/** `…/Topics 70fa…_all.csv` and `…/Topics 70fa….md` both stem to `…/Topics 70fa…`. */
export function stem(path: string): string {
  return withoutExtension(path).replace(/_all$/, "");
}

export function nativeId(path: string): string | undefined {
  return stem(path).split("/").at(-1)?.match(nativeIdSuffix)?.[1]?.toLowerCase();
}

export function treeKey(path: string): string {
  return stem(path).split("/").map(segment => segment.replace(nativeIdSuffix, "").replace(shortIdSuffix, "")).join("/");
}

export function parentKey(key: string): string {
  const cut = key.lastIndexOf("/");
  return cut === -1 ? "" : key.slice(0, cut);
}

export function titleFor(path: string): string {
  return treeKey(path).split("/").at(-1)?.trim() || "Untitled";
}

export function identityFor(path: string, prefix: string): NotionIdentity {
  const native = nativeId(path);
  return native
    ? { sourceId: `${prefix}:native:${native}`, sourceIdentityKind: "native" }
    : { sourceId: `${prefix}:path:${stem(path)}`, sourceIdentityKind: "path-derived" };
}

/**
 * Resolves an href written inside a Markdown page against that page's archive
 * path. Notion percent-encodes every path segment, including the emoji it keeps
 * in directory names, so the href is decoded before it is resolved.
 */
export function resolveArchiveHref(from: string, href: string): string | undefined {
  if (!href || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split(/[?#]/, 1)[0]!);
  } catch {
    return undefined;
  }
  if (!decoded || decoded.includes("\0") || decoded.includes("\\")) return undefined;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const segments: string[] = [];
  for (const segment of `${base}${decoded}`.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return undefined;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length ? segments.join("/") : undefined;
}
