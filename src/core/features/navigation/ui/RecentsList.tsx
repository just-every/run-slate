import { DeniedState, EmptyState, ErrorState, LoadingState, type SurfaceState, cn } from "../../../ui";
import { NavEntryRow } from "./NavEntryRow";
import type { RecentEntry } from "./types";

/** Groups entries under their day heading, keeping the order the caller gave. */
function groupByDay(entries: readonly RecentEntry[]): { day: string; entries: RecentEntry[] }[] {
  const groups: { day: string; entries: RecentEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last && last.day === entry.dayLabel) last.entries.push(entry);
    else groups.push({ day: entry.dayLabel, entries: [entry] });
  }
  return groups;
}

export interface RecentsListProps {
  state: SurfaceState;
  /** NAV-002 — newest first, as the caller ordered them. */
  entries: readonly RecentEntry[];
  onOpen: (id: string) => void;
  onRetry?: () => void;
  errorDetail?: string;
  /** Renders the page heading; off when the list sits inside another surface. */
  showHeading?: boolean;
  className?: string;
}

/** NAV-002 — the member's recently opened pages, newest first and grouped by day. */
export function RecentsList({
  state,
  entries,
  onOpen,
  onRetry,
  errorDetail,
  showHeading = true,
  className,
}: RecentsListProps) {
  const groups = groupByDay(entries);

  return (
    <div className={cn("mx-auto w-full max-w-reading px-4 py-8 sm:px-6", className)}>
      {showHeading ? <h1 className="px-2 text-h1 font-semibold text-ink">Recents</h1> : null}

      {state === "loading" ? <LoadingState rows={6} /> : null}
      {state === "error" ? (
        <div className="mt-6 px-2">
          <ErrorState detail={errorDetail} onRetry={onRetry} title="Recents could not be loaded" />
        </div>
      ) : null}
      {state === "denied" ? <DeniedState className="mt-6" /> : null}
      {state === "empty" ? (
        <EmptyState className="mt-6" description="Pages you open appear here, and only for you." title="Nothing opened yet" />
      ) : null}

      {state === "ready" ? (
        <div className="mt-6 flex flex-col gap-6">
          {groups.map((group) => (
            <section className="flex flex-col gap-1" key={group.day}>
              <h2 className="px-2 text-tiny font-medium tracking-wide text-ink-faint uppercase">{group.day}</h2>
              <ul className="flex flex-col">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <NavEntryRow entry={entry} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
