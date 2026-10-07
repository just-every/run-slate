import { Search } from "lucide-react";
import { useId, type ReactNode } from "react";
import { DeniedState, ErrorState, Input, Label, LoadingState, Separator, cn, type SurfaceState } from "../../../ui";
import { AppliedFilters } from "./AppliedFilters";
import { DefaultVisibilityNote } from "./DefaultVisibilityNote";
import { describeFilters } from "./describe";
import { SearchEmpty } from "./SearchEmpty";
import { SearchFacetColumn } from "./SearchFacetColumn";
import { SearchFilters } from "./SearchFilters";
import { SearchResultRow } from "./SearchResultRow";
import { SearchScopeNotice } from "./SearchScopeNotice";
import type {
  SearchFacetGroup,
  SearchFilterOptions,
  SearchFilterState,
  SearchResultItem,
  SearchScope,
} from "./types";

export interface SearchResultsPageProps {
  query: string;
  onQueryChange: (next: string) => void;
  state: SurfaceState;
  results: readonly SearchResultItem[];
  totalCount: number;
  filters: SearchFilterState;
  filterOptions: SearchFilterOptions;
  onFiltersChange: (next: SearchFilterState) => void;
  onRemoveFilter: (appliedId: string) => void;
  onClearFilters: () => void;
  facets: readonly SearchFacetGroup[];
  onToggleFacet: (groupId: string, valueId: string, selected: boolean) => void;
  onOpenResult: (resultId: string) => void;
  onCreatePage: (title: string) => void;
  onRetry?: () => void;
  /** `AI-015` — the generated answer card, when there is one to place here. */
  answer?: ReactNode;
  scope?: SearchScope | null;
  onSearchWholeWorkspace?: () => void;
  className?: string;
}

/**
 * The full-page form of search: the question, the filter bar, the filters in
 * force with their total (`SEARCH-003`), the generated answer above the results
 * (`AI-015`), the ranked results (`SEARCH-002`) and the counted facets beside
 * them. Below the `lg` breakpoint the facets follow the results rather than
 * sitting beside them, so the page never scrolls sideways.
 */
export function SearchResultsPage(props: SearchResultsPageProps) {
  const { state, query, totalCount, filters, filterOptions, className } = props;
  const queryFieldId = useId();
  const applied = describeFilters(filters, filterOptions);
  const matchLabel = totalCount === 1 ? "1 match" : `${totalCount} matches`;

  return (
    <div className={cn("mx-auto flex w-full max-w-wide flex-col gap-4 px-4 py-6", className)}>
      <header className="flex flex-col gap-3">
        <h1 className="text-h2 font-semibold text-ink">Search</h1>
        <div className="relative max-w-reading">
          <Label className="sr-only" htmlFor={queryFieldId}>
            Search or ask a question
          </Label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-4 text-ink-faint" />
          <Input
            className="h-8 pl-8"
            id={queryFieldId}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search or ask a question"
            type="search"
            value={query}
          />
        </div>
        {props.scope && props.onSearchWholeWorkspace ? (
          <SearchScopeNotice onSearchWholeWorkspace={props.onSearchWholeWorkspace} scope={props.scope} />
        ) : null}
        <div className="overflow-x-auto">
          <SearchFilters
            density="bar"
            filters={filters}
            onChange={props.onFiltersChange}
            options={filterOptions}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AppliedFilters
            applied={applied}
            onClearAll={props.onClearFilters}
            onRemove={props.onRemoveFilter}
          />
          {state === "ready" ? (
            <p className="ml-auto text-tiny text-ink-muted" role="status">
              {matchLabel}
            </p>
          ) : null}
        </div>
      </header>

      <Separator />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <main className="min-w-0 flex-1">
          {props.answer ? <div className="mb-4">{props.answer}</div> : null}
          <SearchResultsBody {...props} applied={applied} />
        </main>
        {props.facets.length > 0 ? (
          <aside className="w-full shrink-0 lg:w-panel">
            <SearchFacetColumn facets={props.facets} onToggleFacet={props.onToggleFacet} />
          </aside>
        ) : null}
      </div>

      <DefaultVisibilityNote
        onIncludeHidden={() =>
          props.onFiltersChange({ ...filters, includeArchived: true, includeTrashed: true })
        }
      />
    </div>
  );
}

function SearchResultsBody({
  state,
  results,
  query,
  applied,
  scope = null,
  onOpenResult,
  onCreatePage,
  onClearFilters,
  onRetry,
}: SearchResultsPageProps & { applied: ReturnType<typeof describeFilters> }) {
  if (state === "loading") return <LoadingState rows={8} />;
  if (state === "denied") return <DeniedState />;
  if (state === "error") {
    return (
      <ErrorState
        detail="The results could not be loaded. Your query and filters are unchanged."
        onRetry={onRetry}
        title="Search did not answer"
      />
    );
  }
  if (state === "empty") {
    return (
      <SearchEmpty
        applied={applied}
        onClearFilters={onClearFilters}
        onCreatePage={onCreatePage}
        query={query}
        scope={scope}
      />
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-line">
      {results.map((result) => (
        <li key={result.id}>
          <SearchResultRow onOpen={onOpenResult} result={result} />
        </li>
      ))}
    </ol>
  );
}
