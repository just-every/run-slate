import { ArrowRight } from "lucide-react";
import { cn } from "../../../ui";
import type { DecisionLink } from "./types";

/**
 * `DEC-003` — superseding links both decisions in both directions, so this list
 * reads the link from whichever side the reader is standing on: what superseded
 * this decision, and what this decision superseded.
 */
export interface DecisionLinkListProps {
  supersededBy: DecisionLink | null;
  supersedes: DecisionLink | null;
  onOpenLinkedDecision?: (link: DecisionLink) => void;
  className?: string;
}

export function DecisionLinkList({
  supersededBy,
  supersedes,
  onOpenLinkedDecision,
  className,
}: DecisionLinkListProps) {
  const rows: Array<{ label: string; link: DecisionLink }> = [];
  if (supersededBy !== null) rows.push({ label: "Superseded by", link: supersededBy });
  if (supersedes !== null) rows.push({ label: "Supersedes", link: supersedes });
  if (rows.length === 0) return null;

  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      <h3 className="text-tiny font-medium text-ink-muted">Linked decisions</h3>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label}>
            <button
              aria-label={`${row.label} ${row.link.pageTitle}, decided ${row.link.decidedAtLabel}. Open it`}
              className="flex w-full items-center gap-1.5 rounded-control px-1 py-1 text-left hover:bg-sidebar-hover"
              disabled={onOpenLinkedDecision === undefined}
              onClick={() => onOpenLinkedDecision?.(row.link)}
              type="button"
            >
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
              <span className="flex-1 text-ui text-ink">{row.link.pageTitle}</span>
              <span className="text-tiny text-ink-muted">{row.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
