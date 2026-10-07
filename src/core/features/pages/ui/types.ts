import type { PageLifecycle } from "../../../shared/knowledge/model";

/** A stored colour from the workspace palette (`STAT-001`, `PAGE-001`). */
export type KnowledgeColour = "neutral" | "yellow" | "blue" | "green" | "red" | "purple";

/** Tailwind classes for each stored colour. A map, so no colour is ever inlined. */
export const knowledgeColourClass: Record<KnowledgeColour, string> = {
  neutral: "bg-sidebar-hover text-ink-muted",
  yellow: "bg-hl-yellow text-ink",
  blue: "bg-hl-blue text-ink",
  green: "bg-hl-green text-ink",
  red: "bg-hl-red text-ink",
  purple: "bg-hl-purple text-ink",
};

export const knowledgeColourSwatchClass: Record<KnowledgeColour, string> = {
  neutral: "bg-line-strong",
  yellow: "bg-hl-yellow",
  blue: "bg-hl-blue",
  green: "bg-hl-green",
  red: "bg-hl-red",
  purple: "bg-hl-purple",
};

/** A person as every page surface needs them. */
export interface PagePerson {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** A page icon is emoji, a stored image, or nothing (`PAGE-006`). */
export type PageIconValue = { kind: "emoji"; emoji: string } | { kind: "image"; url: string } | null;

/** A status entry from the workspace vocabulary (`STAT-001`). */
export interface PageStatusEntry {
  key: string;
  label: string;
  colour: KnowledgeColour;
  requiresVerification: boolean;
}

/** One crumb in the trail: the container, an ancestor page, or the page itself. */
export interface PageCrumb {
  id: string;
  label: string;
  icon?: PageIconValue;
}

/** `PAGE-012`: the fixed typeface set a page chooses from. */
export const pageTypefaces = [
  { id: "default", label: "Default", sample: "Ag", className: "font-sans" },
  { id: "serif", label: "Serif", sample: "Ag", className: "font-serif" },
  { id: "mono", label: "Mono", sample: "Ag", className: "font-mono" },
] as const;

export type PageTypeface = (typeof pageTypefaces)[number]["id"];

export const pageTypefaceClass: Record<PageTypeface, string> = {
  default: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

export interface PageDisplaySettings {
  typeface: PageTypeface;
  smallText: boolean;
  fullWidth: boolean;
}

/** `PAGE-014`: one emoji reaction and who left it. */
export interface PageReaction {
  emoji: string;
  people: readonly PagePerson[];
  reactedByViewer: boolean;
}

/** `PAGE-010`: one entry in the outline. */
export interface PageOutlineHeading {
  id: string;
  text: string;
  /** 1, 2 or 3 — the heading levels a page body carries. */
  level: 1 | 2 | 3;
}

/** `TREE-001`: one node of a container's tree. */
export interface PageTreeNodeData {
  id: string;
  title: string;
  icon: PageIconValue;
  lifecycle: PageLifecycle;
  hasChildren: boolean;
  children?: readonly PageTreeNodeData[];
}

/** Where a drop lands relative to the node under the pointer (`TREE-002`). */
export type PageDropPosition = "before" | "after" | "inside";

/** The keyboard form of the same move, required at phone width by `NAV-006`. */
export type PageMoveDirection = "up" | "down" | "outdent" | "indent";

/** Capitalises a vocabulary noun for the start of a sentence. */
export function sentenceCase(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}
