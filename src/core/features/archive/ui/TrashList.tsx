import { Search, Trash2 } from "lucide-react";
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
import { TrashRow } from "./TrashRow";
import { type ArchiveKindFilter, type TrashedEntry } from "./types";

/**
 * The trash (`ARCH-005`). Deleted pages and their descendants are listed here
 * with the deleting member, the time and the prior location, and are restorable
 * to that place. Nothing leaves on a timer.
 *
 * Design decision: the search is labelled as searching the trash, and the
 * standing line says so as well. A trashed page is absent from every other
 * surface, so a member who searches here must never think they are searching
 * the workspace.
 */
export interface TrashListProps {
  state: SurfaceState;
  entries: readonly TrashedEntry[];
  /** Searches within the trash only (`ARCH-005`). */
  query: string;
  onQueryChange: (query: string) => void;
  kindFilter: ArchiveKindFilter;
  onKindFilterChange: (value: ArchiveKindFilter) => void;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
  /** `ARCH-006`: opens the confirmed empty-the-trash step. */
  onEmptyTrash: () => void;
  onClearFilters?: () => void;
  errorDetail?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  className?: string;
}

export function TrashList({
  state,
  entries,
  query,
  onQueryChange,
  kindFilter,
  onKindFilterChange,
  onRestore,
  onDeletePermanently,
  onEmptyTrash,
  onClearFilters,
  errorDetail,
  onRetry,
  onRequestAccess,
  className,
}: TrashListProps) {
  const searchFieldId = useId();
  const memberNoun = knowledgeNoun("member");
  const showControls = state === "ready" || state === "loading" || state === "empty";

  return (
    <section className={cn("flex w-full max-w-wide flex-col gap-3", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2 font-semibold text-ink">Trash</h2>
        <Button disabled={state !== "ready"} onClick={onEmptyTrash} size="sm" variant="secondary">
          <Trash2 aria-hidden="true" className="size-3.5" />
          Empty trash
        </Button>
      </header>

      {/* `ARCH-005` — nothing leaves on a timer, and nothing here shows anywhere else. */}
      <p className="text-tiny text-ink-muted">
        Nothing leaves the trash on a timer. Deleted pages stay here, with everything beneath them, until a {memberNoun}{" "}
        restores them to their prior place or empties the trash. A page in the trash is absent from every other surface,
        and the search and filters below cover the trash only.
      </p>

      {showControls ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative min-w-56 flex-1">
            <Label className="sr-only" htmlFor={searchFieldId}>
              Search the trash
            </Label>
            <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-ink-faint" />
            <Input
              className="pl-7"
              id={searchFieldId}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search the trash"
              type="search"
              value={query}
            />
          </div>
          <ArchiveKindFilterChips
            groupLabel="Filter the trash by kind"
            onChange={onKindFilterChange}
            value={kindFilter}
          />
        </div>
      ) : null}

      <div className="rounded-card border border-line bg-surface">
        {state === "loading" ? <LoadingState rows={5} /> : null}
        {state === "error" ? (
          <ErrorState className="m-3" detail={errorDetail} onRetry={onRetry} title="The trash could not be loaded" />
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
            description="Deleted pages arrive here with everything beneath them, and wait until someone restores or destroys them."
            title="The trash is empty"
          />
        ) : null}
        {state === "ready" ? (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <TrashRow
                entry={entry}
                key={entry.id}
                onDeletePermanently={onDeletePermanently}
                onRestore={onRestore}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
