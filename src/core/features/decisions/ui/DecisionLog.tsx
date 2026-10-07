import { Check, TriangleAlert } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import {
  Button,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  type SurfaceState,
} from "../../../ui";
import { DecisionLogFilters } from "./DecisionLogFilters";
import { DecisionStateChip } from "./DecisionStateChip";
import {
  sentenceCase,
  type DecisionFilterOption,
  type DecisionLogEntry,
  type DecisionLogFilterValues,
} from "./types";

/**
 * `DEC-004` — the decision log: every decision, filtered on six axes, each row
 * opening the exact accepted revision.
 *
 * Design decision: the row's link is the page title and its accessible name says
 * which revision it opens, because "open the decision" and "open the revision
 * the decision was accepted at" are different destinations and the difference is
 * the whole point of the clause. The table scrolls inside its own container so
 * the page never scrolls sideways.
 */
export interface DecisionLogProps {
  state: SurfaceState;
  decisions: readonly DecisionLogEntry[];
  filters: DecisionLogFilterValues;
  onFiltersChange: (filters: DecisionLogFilterValues) => void;
  containers: readonly DecisionFilterOption[];
  owners: readonly DecisionFilterOption[];
  /** `DEC-004`: opens the exact accepted revision behind this decision. */
  onOpenDecision: (entry: DecisionLogEntry) => void;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  onClearFilters?: () => void;
  className?: string;
}

export function DecisionLog({
  state,
  decisions,
  filters,
  onFiltersChange,
  containers,
  owners,
  onOpenDecision,
  onRetry,
  onRequestAccess,
  onClearFilters,
  className,
}: DecisionLogProps) {
  return (
    <section aria-label="Decision log" className={cn("flex flex-col gap-3", className)}>
      <DecisionLogFilters
        containers={containers}
        filters={filters}
        onFiltersChange={onFiltersChange}
        owners={owners}
      />

      {state === "loading" ? <LoadingState rows={6} /> : null}
      {state === "error" ? (
        <ErrorState detail="The decision log could not be loaded." onRetry={onRetry} title="Something went wrong" />
      ) : null}
      {state === "denied" ? <DeniedState onRequestAccess={onRequestAccess} /> : null}
      {state === "empty" ? (
        <EmptyState
          action={
            onClearFilters ? (
              <Button onClick={onClearFilters} variant="secondary">
                Clear the filters
              </Button>
            ) : null
          }
          description="No decision matches these filters."
          title="Nothing to show"
        />
      ) : null}

      {state === "ready" ? (
        <div className="overflow-x-auto rounded-card border border-line">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Decision</TableHead>
                <TableHead>State</TableHead>
                <TableHead>{sentenceCase(knowledgeNoun("container"))}</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Decided</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Citations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="min-w-56">
                    <button
                      aria-label={
                        entry.acceptedRevisionLabel === null
                          ? `Open ${entry.pageTitle}`
                          : `Open ${entry.pageTitle} at ${entry.acceptedRevisionLabel}, the accepted revision`
                      }
                      className="text-left text-ui text-ink underline-offset-4 hover:underline"
                      onClick={() => onOpenDecision(entry)}
                      type="button"
                    >
                      {entry.pageTitle}
                    </button>
                    {entry.acceptedRevisionLabel === null ? null : (
                      <span className="block text-tiny text-ink-faint">
                        Opens {entry.acceptedRevisionLabel}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DecisionStateChip overdue={entry.overdue} state={entry.state} terminal />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{entry.containerLabel}</TableCell>
                  <TableCell className="whitespace-nowrap">{entry.owner.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{entry.decidedAtLabel}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {entry.reviewAtLabel ?? <span className="text-ink-faint">None</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <CitationCell citationCount={entry.citationCount} current={entry.citationsCurrent} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}

/** `DEC-003`: whether every citation still points at its page's newest revision. */
function CitationCell({ citationCount, current }: { citationCount: number; current: boolean }) {
  if (current) {
    return (
      <span className="inline-flex items-center gap-1 text-ui text-ink-muted">
        <Check aria-hidden="true" className="size-3.5" />
        {citationCount} current
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-ui text-warn">
      <TriangleAlert aria-hidden="true" className="size-3.5" />
      Not current
    </span>
  );
}
