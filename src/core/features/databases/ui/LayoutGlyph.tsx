import { Calendar, GalleryVertical, GanttChartSquare, KanbanSquare, List, Table2 } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "../../../ui";
import type { DatabaseLayout } from "./types";

/** `DB-004` — the six layouts, their names and their glyphs, declared once. */
export const layoutLabel: Record<DatabaseLayout, string> = {
  table: "Table",
  board: "Board",
  list: "List",
  gallery: "Gallery",
  calendar: "Calendar",
  timeline: "Timeline",
};

export const layoutOrder: readonly DatabaseLayout[] = ["table", "board", "list", "gallery", "calendar", "timeline"];

const glyphs: Record<DatabaseLayout, ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>> = {
  table: Table2,
  board: KanbanSquare,
  list: List,
  gallery: GalleryVertical,
  calendar: Calendar,
  timeline: GanttChartSquare,
};

/**
 * A board needs the field it groups by and a calendar or timeline needs the field
 * it dates by (`DB-004`). Everything else reads the records as they are.
 */
export const layoutRequirement: Record<DatabaseLayout, "group" | "date" | null> = {
  table: null,
  board: "group",
  list: null,
  gallery: null,
  calendar: "date",
  timeline: "date",
};

export function LayoutGlyph({ layout, className }: { layout: DatabaseLayout; className?: string }) {
  const Glyph = glyphs[layout];
  return <Glyph aria-hidden="true" className={cn("size-4 shrink-0", className)} />;
}
