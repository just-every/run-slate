import { X } from "lucide-react";
import { Button, cn } from "../../../ui";
import type { AppliedFilter } from "./types";

/**
 * `SEARCH-003` — the filters in force, shown with the results. Each is a real
 * button that drops that one filter; one further action clears them all. None of
 * this changes the query text.
 */
export function AppliedFilters({
  applied,
  onRemove,
  onClearAll,
  className,
  /** When false the chips are read-only — the no-results state uses that. */
  removable = true,
}: {
  applied: readonly AppliedFilter[];
  onRemove?: (appliedId: string) => void;
  onClearAll?: () => void;
  className?: string;
  removable?: boolean;
}) {
  if (applied.length === 0) return null;
  return (
    <div aria-label="Filters in force" className={cn("flex flex-wrap items-center gap-1.5", className)} role="group">
      <span className="text-tiny text-ink-muted">Filters in force</span>
      {applied.map((filter) =>
        removable && onRemove ? (
          <Button
            className="h-6 gap-1 rounded-full border-line px-2 text-tiny font-normal"
            key={filter.id}
            onClick={() => onRemove(filter.id)}
            variant="secondary"
          >
            <span className="text-ink-muted">{filter.group}</span>
            <span className="text-ink">{filter.value}</span>
            <X aria-hidden="true" className="size-3 text-ink-faint" />
            <span className="sr-only">{`Remove the ${filter.group} filter ${filter.value}`}</span>
          </Button>
        ) : (
          <span
            className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2 text-tiny"
            key={filter.id}
          >
            <span className="text-ink-muted">{filter.group}</span>
            <span className="text-ink">{filter.value}</span>
          </span>
        ),
      )}
      {onClearAll ? (
        <Button className="h-6 px-2 text-tiny font-normal" onClick={onClearAll} variant="link">
          Clear all filters
        </Button>
      ) : null}
    </div>
  );
}
