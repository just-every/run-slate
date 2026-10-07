import { FilePlus2, FilterX, SearchX } from "lucide-react";
import { AppliedFilters } from "./AppliedFilters";
import { Button, cn } from "../../../ui";
import { containerNoun } from "./nouns";
import type { AppliedFilter, SearchScope } from "./types";

/**
 * `SEARCH-007` — nothing matched. The query and every filter in force are
 * restated, one action clears the filters and one creates a page with that
 * title. Nothing is invented here: no near-miss result, no generated answer.
 */
export function SearchEmpty({
  query,
  applied,
  scope,
  onClearFilters,
  onCreatePage,
  className,
}: {
  query: string;
  applied: readonly AppliedFilter[];
  scope?: SearchScope | null;
  onClearFilters: () => void;
  onCreatePage: (title: string) => void;
  className?: string;
}) {
  const title = query.trim();
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <SearchX aria-hidden="true" className="size-5 text-ink-faint" />
      <div className="flex flex-col gap-1">
        <p className="text-ui font-medium text-ink">
          {"Nothing matched "}
          <span className="text-ink">{`“${query}”`}</span>
        </p>
        {scope ? (
          <p className="text-ui text-ink-muted">
            {`Searching one ${containerNoun}: ${scope.containerName}`}
          </p>
        ) : null}
      </div>

      {applied.length > 0 ? (
        <AppliedFilters applied={applied} className="justify-center" removable={false} />
      ) : (
        <p className="text-ui text-ink-muted">No filters are in force.</p>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onClearFilters} variant="secondary">
          <FilterX aria-hidden="true" className="size-4" />
          Clear the filters
        </Button>
        <Button disabled={title.length === 0} onClick={() => onCreatePage(title)}>
          <FilePlus2 aria-hidden="true" className="size-4" />
          {`Create a page called “${title}”`}
        </Button>
      </div>
    </div>
  );
}
