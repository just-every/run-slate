/**
 * Shapes the template surfaces render from (`TMPL-001`…`TMPL-006`).
 *
 * Everything here is author-written. Nothing in this feature invents a figure,
 * a description or an outline when the author left one out: an absent value is
 * `null` or an empty list, and the components say so in words (`TMPL-002`).
 */

export type TemplateOrigin = "shipped" | "custom";

/** `TMPL-006` — a template belongs to the workspace or to exactly one container. */
export type TemplateHome =
  | { kind: "workspace" }
  | { kind: "container"; containerId: string; containerName: string };

export interface TemplateCategory {
  id: string;
  label: string;
}

export interface TemplateSummary {
  id: string;
  title: string;
  /** Written by the author; empty when they wrote none. Searched with the title. */
  description: string;
  /** A short glyph the author chose, or `null` for the plain page mark. */
  icon: string | null;
  categoryId: string;
  categoryLabel: string;
  origin: TemplateOrigin;
  home: TemplateHome;
  /**
   * The first lines of the page this template produces, as its author wrote
   * them. Drawn as the card thumbnail. Empty means the card shows no thumbnail.
   */
  outline: readonly string[];
  childPageCount: number;
}

export type TemplateBlockKind = "heading" | "paragraph" | "bullet" | "todo" | "quote" | "divider";

export interface TemplateBlock {
  id: string;
  kind: TemplateBlockKind;
  text: string;
}

export interface TemplateProperty {
  id: string;
  name: string;
  value: string;
}

export interface TemplateChildPage {
  id: string;
  title: string;
  icon: string | null;
}

/**
 * `TMPL-002` — a figure such as a team size or a duration, written by the
 * template's author. There is no estimated figure and no placeholder figure:
 * a template whose author wrote none carries an empty list.
 */
export interface TemplateFigure {
  id: string;
  label: string;
  value: string;
}

export interface TemplateDetail extends TemplateSummary {
  authorName: string;
  body: readonly TemplateBlock[];
  properties: readonly TemplateProperty[];
  children: readonly TemplateChildPage[];
  figures: readonly TemplateFigure[];
}

/** A place a new page can be created (`TMPL-003`). */
export interface TemplateDestination {
  id: string;
  label: string;
  /** The container this destination sits in, for the grouped list. */
  containerName: string;
}
