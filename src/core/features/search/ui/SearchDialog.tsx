import { Search } from "lucide-react";
import type { ReactNode } from "react";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DeniedState,
  ErrorState,
  LoadingState,
  cn,
  type SurfaceState,
} from "../../../ui";
import { describeFilters } from "./describe";
import { SearchEmpty } from "./SearchEmpty";
import { SearchFilters } from "./SearchFilters";
import { SearchResultLine } from "./SearchResultRow";
import { SearchScopeNotice } from "./SearchScopeNotice";
import type { SearchFilterOptions, SearchFilterState, SearchResultGroup, SearchScope } from "./types";

export interface SearchDialogProps {
  /** The question as typed. The dialog never edits it except through `onQueryChange`. */
  query: string;
  onQueryChange: (next: string) => void;
  state: SurfaceState;
  /** Ranked results in caller-supplied period groups such as "Today" (`SEARCH-001`). */
  groups: readonly SearchResultGroup[];
  /** Every match, not just this page of them (`SEARCH-001`). */
  totalCount: number;
  filters: SearchFilterState;
  filterOptions: SearchFilterOptions;
  onFiltersChange: (next: SearchFilterState) => void;
  onClearFilters: () => void;
  onOpenResult: (resultId: string) => void;
  onCreatePage: (title: string) => void;
  onDismiss: () => void;
  onRetry?: () => void;
  /** `SEARCH-006` — the one container this search is scoped to. */
  scope?: SearchScope | null;
  onSearchWholeWorkspace?: () => void;
  /** The right-hand preview of the highlighted result. Omitted, no pane is drawn. */
  preview?: ReactNode;
  /** The mounting surface passes true; stories leave it off so nothing steals focus. */
  autoFocusInput?: boolean;
  className?: string;
}

/**
 * `SEARCH-001` / `SEARCH-002` — one question field over everything the searching
 * member may read, its filters, and the ranked results grouped by period with
 * each result's kind and its matched text in context. Arrow keys, Enter and
 * Escape come from the `Command` primitives, so the whole panel is keyboard
 * navigable without a pointer.
 */
export function SearchDialog({
  query,
  onQueryChange,
  state,
  groups,
  totalCount,
  filters,
  filterOptions,
  onFiltersChange,
  onClearFilters,
  onOpenResult,
  onCreatePage,
  onDismiss,
  onRetry,
  scope = null,
  onSearchWholeWorkspace,
  preview,
  autoFocusInput = false,
  className,
}: SearchDialogProps) {
  const applied = describeFilters(filters, filterOptions);
  const matchLabel = totalCount === 1 ? "1 match" : `${totalCount} matches`;

  return (
    <div
      className={cn(
        "flex min-h-full w-full items-start justify-center overflow-hidden bg-overlay px-4 py-8 sm:py-12",
        className,
      )}
    >
      <div
        aria-label="Search"
        aria-modal="true"
        className="flex w-full max-w-wide flex-col overflow-hidden rounded-card border border-line bg-surface shadow-[0_16px_48px_rgb(15_15_15/0.16)]"
        role="dialog"
      >
        <Command className="flex-1" label="Search results" onEscape={onDismiss}>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-ink-faint" />
            <CommandInput
              aria-label="Search or ask a question"
              autoFocus={autoFocusInput}
              className="pl-6"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search or ask a question"
              value={query}
            />
          </div>

          <div className="border-b border-line px-3 py-2">
            <div className="overflow-x-auto">
              <SearchFilters
                className="flex-nowrap"
                density="chips"
                filters={filters}
                onChange={onFiltersChange}
                options={filterOptions}
              />
            </div>
          </div>

          {scope && onSearchWholeWorkspace ? (
            <div className="border-b border-line px-3 py-2">
              <SearchScopeNotice onSearchWholeWorkspace={onSearchWholeWorkspace} scope={scope} />
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1">
              {state === "loading" ? <LoadingState rows={6} /> : null}
              {state === "error" ? (
                <div className="p-3">
                  <ErrorState
                    detail="The results could not be loaded. Your filters are unchanged."
                    onRetry={onRetry}
                    title="Search did not answer"
                  />
                </div>
              ) : null}
              {state === "denied" ? <DeniedState /> : null}
              {state === "empty" ? (
                <SearchEmpty
                  applied={applied}
                  onClearFilters={onClearFilters}
                  onCreatePage={onCreatePage}
                  query={query}
                  scope={scope}
                />
              ) : null}
              {state === "ready" ? (
                <CommandList className="max-h-[26rem] px-2 py-1">
                  {groups.map((group) => (
                    <CommandGroup heading={group.label} key={group.id}>
                      {group.results.map((result) => (
                        <CommandItem key={result.id} onSelect={() => onOpenResult(result.id)} value={result.id}>
                          <SearchResultLine result={result} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              ) : null}
            </div>

            {preview ? (
              <aside
                aria-label="Preview of the highlighted result"
                className="hidden w-panel shrink-0 border-l border-line lg:block"
              >
                {preview}
              </aside>
            ) : null}
          </div>
        </Command>

        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
          <p className="text-tiny text-ink-muted" role="status">
            {state === "ready" ? matchLabel : null}
          </p>
          <p className="hidden text-tiny text-ink-faint sm:block">
            Up and down arrows move, Enter opens, Escape closes
          </p>
        </div>
      </div>
    </div>
  );
}
