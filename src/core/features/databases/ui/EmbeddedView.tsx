import { ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ErrorState, LoadingState, cn, type SurfaceState } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { ViewRulesBar } from "./ViewRulesBar";
import type { DatabaseField, DatabaseView } from "./types";
import { sentenceCase } from "./types";

/**
 * `DB-011` — a view embedded in a page body. It stays live, shows each reader only
 * the records that reader may read, and carries its own filters and sorts without
 * changing the source view. `BLOCK-010`: it says when it last ran, and a deleted
 * source is stated rather than shown as an empty list.
 */
export function EmbeddedView({
  databaseName,
  sourceViewName,
  view,
  fields,
  state,
  lastRanAt,
  sourceDeleted = false,
  onOpenSource,
  onOpenFilter,
  onOpenSort,
  onClearRules,
  onRefresh,
  children,
  className,
}: {
  databaseName: string;
  /** `DB-011`: the view this embed reads. */
  sourceViewName: string;
  /** The embed's own filters and sorts — changing them never touches the source view. */
  view: DatabaseView;
  fields: readonly DatabaseField[];
  state: SurfaceState;
  lastRanAt: string;
  sourceDeleted?: boolean;
  onOpenSource: () => void;
  onOpenFilter: () => void;
  onOpenSort: () => void;
  onClearRules: () => void;
  onRefresh: () => void;
  /** The rendered layout. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={`Embedded view of ${databaseName}`}
      className={cn("flex flex-col overflow-hidden rounded-card border border-line bg-surface", className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-ui font-medium text-ink">{databaseName}</p>
          <p className="truncate text-tiny text-ink-muted">
            Reads the view “{sourceViewName}” · ran {lastRanAt}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button aria-label="Refresh this embedded view" onClick={onRefresh} size="iconSm" variant="ghost">
            <RefreshCw aria-hidden="true" className="size-3.5" />
          </Button>
          <Button onClick={onOpenSource} size="sm" variant="ghost">
            <ExternalLink aria-hidden="true" className="size-3.5" />
            Open {databaseName}
          </Button>
        </div>
      </header>

      {sourceDeleted ? (
        <ErrorState
          className="m-3"
          detail={`The view “${sourceViewName}” this embed reads has been deleted, so there is nothing to run. Point the embed at another view or remove it.`}
          title="This embed's source is gone"
        />
      ) : (
        <>
          <ViewRulesBar
            fields={fields}
            onClearAll={onClearRules}
            onOpenFilter={onOpenFilter}
            onOpenGroup={onOpenFilter}
            onOpenSort={onOpenSort}
            view={view}
          />
          {state === "loading" ? <LoadingState rows={3} /> : null}
          {state === "error" ? (
            <ErrorState className="m-3" onRetry={onRefresh} title="This embedded view could not be run." />
          ) : null}
          {state === "ready" || state === "empty" ? children : null}
          <p className="border-t border-line px-3 py-2 text-tiny text-ink-muted">
            Filters and sorts set here belong to this embed. The view “{sourceViewName}” is unchanged. Each reader sees
            only the {knowledgeNoun("record")}s they may read.
          </p>
        </>
      )}
      <span className="sr-only">
        {sentenceCase(knowledgeNoun("pageBody"))} embed of {databaseName}.
      </span>
    </section>
  );
}
