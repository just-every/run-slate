import { Search } from "lucide-react";
import { useId } from "react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import {
  Button,
  cn,
  DeniedState,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  type SurfaceState,
} from "../../../ui";
import { ArchiveKindFilterChips } from "./ArchiveKindFilterChips";
import { ArchiveRow } from "./ArchiveRow";
import { type ArchivedEntry, type ArchiveKindFilter } from "./types";

/**
 * The archive (`ARCH-001`, `ARCH-002`). Archived records are absent from the
 * tree, from default search, from content queries and from AI grounding, which
 * leaves this filtered list as the way they are discovered — so the filter row
 * is the first thing in the surface, and the standing line states plainly what
 * archived costs and what it does not.
 *
 * Design decision: rows, not a table. Each archived record carries four lines of
 * provenance (actor, time, prior location, reason) that a table would either
 * truncate or force sideways at 390px.
 */
export interface ArchiveListProps {
  state: SurfaceState;
  entries: readonly ArchivedEntry[];
  /** `ARCH-002`: the archived filter, by kind. */
  kindFilter: ArchiveKindFilter;
  onKindFilterChange: (value: ArchiveKindFilter) => void;
  titleFilter: string;
  onTitleFilterChange: (value: string) => void;
  onOpen: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearFilters?: () => void;
  /** `ARCH-004`: given, the archive offers the way to the trash. */
  onOpenTrash?: () => void;
  errorDetail?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  className?: string;
}

export function ArchiveList({
  state,
  entries,
  kindFilter,
  onKindFilterChange,
  titleFilter,
  onTitleFilterChange,
  onOpen,
  onRestore,
  onDelete,
  onClearFilters,
  onOpenTrash,
  errorDetail,
  onRetry,
  onRequestAccess,
  className,
}: ArchiveListProps) {
  const filterFieldId = useId();
  const recordNoun = knowledgeNoun("record");
  const containerNoun = knowledgeNoun("container");
  const showControls = state === "ready" || state === "loading" || state === "empty";

  return (
    <section className={cn("flex w-full max-w-wide flex-col gap-3", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2 font-semibold text-ink">Archive</h2>
        {onOpenTrash ? (
          <Button onClick={onOpenTrash} size="sm" variant="secondary">
            Open the trash
          </Button>
        ) : null}
      </header>

      {/* `ARCH-002` — what archived means, said once, quietly, in full. */}
      <p className="text-tiny text-ink-muted">
        Archived {recordNoun}s are read-only. They are out of the tree, out of default search, out of content queries
        and out of AI grounding. Their existing links, mentions and citations still resolve, and their comments,
        versions and grants are unchanged.
      </p>

      {showControls ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative min-w-56 flex-1">
            <Label className="sr-only" htmlFor={filterFieldId}>
              Filter the archive by title
            </Label>
            <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-ink-faint" />
            <Input
              className="pl-7"
              id={filterFieldId}
              onChange={(event) => onTitleFilterChange(event.target.value)}
              placeholder="Filter by title"
              type="search"
              value={titleFilter}
            />
          </div>
          <ArchiveKindFilterChips
            groupLabel="Filter the archive by kind"
            onChange={onKindFilterChange}
            value={kindFilter}
          />
        </div>
      ) : null}

      <div className="rounded-card border border-line bg-surface">
        {state === "loading" ? <LoadingState rows={5} /> : null}
        {state === "error" ? (
          <ErrorState
            className="m-3"
            detail={errorDetail}
            onRetry={onRetry}
            title="The archive could not be loaded"
          />
        ) : null}
        {state === "denied" ? <DeniedState onRequestAccess={onRequestAccess} /> : null}
        {state === "empty" ? (
          <EmptyState
            action={
              onClearFilters ? (
                <Button onClick={onClearFilters} size="sm" variant="secondary">
                  Clear the filters
                </Button>
              ) : null
            }
            description={`Archived pages, ${containerNoun}s and databases appear here, and stay here until someone restores or deletes them.`}
            title="Nothing in the archive"
          />
        ) : null}
        {state === "ready" ? (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <ArchiveRow entry={entry} key={entry.id} onDelete={onDelete} onOpen={onOpen} onRestore={onRestore} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
