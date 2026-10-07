import { ArrowUpRight } from "lucide-react";
import type { FieldRendererProps } from "./props";

/**
 * `DB-002` — a relation to another database. Each linked entry is a real
 * button; opening it is the caller's job.
 */
export function RelationField({
  value,
  onOpenLink,
}: FieldRendererProps & { onOpenLink?: (linkId: string) => void }) {
  if (!value || value.kind !== "relation" || value.links.length === 0) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {value.links.map((link) => (
        <button
          className="inline-flex max-w-full items-center gap-1 rounded-control bg-sidebar-hover px-1.5 py-0.5 text-tiny text-ink hover:bg-sidebar"
          key={link.id}
          onClick={() => onOpenLink?.(link.id)}
          type="button"
        >
          <span className="truncate">{link.label}</span>
          <ArrowUpRight aria-hidden="true" className="size-3 shrink-0 text-ink-faint" />
        </button>
      ))}
    </span>
  );
}
