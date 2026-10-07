import { FileText, Folder, LayoutTemplate, MessageSquare, Table2, type LucideIcon } from "lucide-react";
import { cn } from "../../../ui";
import { containerNoun, recordNoun, sentenceCase } from "./nouns";
import type { SearchResultKind } from "./types";

/**
 * `SEARCH-002` — every result names its kind. The glyph is decorative; the word
 * carries the meaning, so nothing here is told by icon or colour alone.
 */
const glyphs: Record<SearchResultKind, LucideIcon> = {
  page: FileText,
  record: Table2,
  container: Folder,
  comment: MessageSquare,
  template: LayoutTemplate,
};

export function searchKindLabel(kind: SearchResultKind): string {
  if (kind === "record") return sentenceCase(recordNoun);
  if (kind === "container") return sentenceCase(containerNoun);
  if (kind === "comment") return "Comment";
  if (kind === "template") return "Template";
  return "Page";
}

export function SearchKindGlyph({ kind, className }: { kind: SearchResultKind; className?: string }) {
  const Glyph = glyphs[kind];
  return <Glyph aria-hidden="true" className={cn("size-4 shrink-0 text-ink-faint", className)} />;
}
