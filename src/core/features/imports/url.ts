import type { ImportedLink } from "./types";

const unsafeSchemes = new Set(["javascript", "data", "vbscript", "file"]);
const browserIgnoredControls = /[\u0000-\u0020\u007f-\u009f]/g;

export function safeImportLink(href: string): ImportedLink | undefined {
  const value = href.trim();
  if (!value) return undefined;
  const scheme = value.replace(browserIgnoredControls, "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && unsafeSchemes.has(scheme)) return undefined;
  return { href: value, kind: scheme ? "external" : "page" };
}
