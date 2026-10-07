import { cn } from "../../../ui";
import { type ArchiveKindFilter, archiveKindFilterLabel, archiveKindFilters } from "./types";

/**
 * The kind chips both lists carry. In the archive they are the archived filter
 * that makes an archived record discoverable (`ARCH-002`); in the trash they
 * narrow the listing and never leave it (`ARCH-005`).
 *
 * Design decision: real buttons with `aria-pressed`, so the chosen chip is
 * announced rather than shown only as a tint.
 */
export interface ArchiveKindFilterChipsProps {
  value: ArchiveKindFilter;
  onChange: (value: ArchiveKindFilter) => void;
  /** Names what the chips filter, e.g. "Filter the archive by kind". */
  groupLabel: string;
  className?: string;
}

export function ArchiveKindFilterChips({ value, onChange, groupLabel, className }: ArchiveKindFilterChipsProps) {
  return (
    <div aria-label={groupLabel} className={cn("flex flex-wrap items-center gap-1", className)} role="group">
      {archiveKindFilters.map((filter) => {
        const selected = filter === value;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "h-7 rounded-control border px-2.5 text-tiny transition-colors",
              selected
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-line-strong text-ink-muted hover:bg-sidebar-hover hover:text-ink",
            )}
            key={filter}
            onClick={() => onChange(filter)}
            type="button"
          >
            {archiveKindFilterLabel(filter)}
          </button>
        );
      })}
    </div>
  );
}
