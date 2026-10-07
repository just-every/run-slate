import { Check, PenLine, Trash2, X } from "lucide-react";
import {
  Button,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  Separator,
  cn,
  type SurfaceState,
} from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { DecisionLinkList } from "./DecisionLinkList";
import { DecisionStateChip } from "./DecisionStateChip";
import { StaleCitationWarning } from "./StaleCitationWarning";
import { sentenceCase, type DecisionCitation, type DecisionLink, type DecisionRecord } from "./types";

/**
 * `DEC-001` — the decision layer over a page, read as a right-hand panel: a
 * fixed head, its own scrolling body, and the one action the decision's state
 * allows pinned to the foot where it cannot be scrolled past.
 *
 * Design decision: the foot carries exactly one primary action and it is the
 * transition `DEC-002` permits from the current state — Accept while Proposed,
 * Supersede once Accepted, nothing at all once Superseded, because Superseded is
 * terminal. Removing the record is a quiet action in the body, and its copy says
 * outright what survives removal, so nobody reads it as deleting the page.
 */
export interface DecisionRecordPanelProps {
  state: SurfaceState;
  /** The decision on this page. Null whenever the surface is not `ready`. */
  decision: DecisionRecord | null;
  /** `DEC-002`: Proposed → Accepted. */
  onAccept?: () => void;
  /** `DEC-002`/`DEC-003`: Accepted → Superseded by another decision. */
  onSupersede?: () => void;
  /** `DEC-006`: opens the editor while the decision is Proposed. */
  onEdit?: () => void;
  /** `DEC-001`: removes the record and leaves the page intact. */
  onRemove?: () => void;
  /** Offered in the empty state: this page carries no decision yet. */
  onAddDecisionRecord?: () => void;
  onOpenCitedRevision: (citation: DecisionCitation) => void;
  onOpenCurrentPage: (citation: DecisionCitation) => void;
  /** `DEC-003`: follows the two-way link to the other decision. */
  onOpenLinkedDecision?: (link: DecisionLink) => void;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  onClose?: () => void;
  className?: string;
}

export function DecisionRecordPanel({
  state,
  decision,
  onAccept,
  onSupersede,
  onEdit,
  onRemove,
  onAddDecisionRecord,
  onOpenCitedRevision,
  onOpenCurrentPage,
  onOpenLinkedDecision,
  onRetry,
  onRequestAccess,
  onClose,
  className,
}: DecisionRecordPanelProps) {
  const ready = state === "ready" && decision !== null;
  const supersededBy = decision?.supersededBy ?? null;

  return (
    <aside
      aria-label="Decision record"
      className={cn("flex h-full w-full flex-col border-l border-line bg-surface md:w-panel", className)}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <h2 className="flex-1 text-ui font-semibold text-ink">Decision record</h2>
        {ready ? <DecisionStateChip overdue={decision.overdue} state={decision.state} terminal /> : null}
        {onClose ? (
          <Button aria-label="Close the decision record" onClick={onClose} size="iconSm" variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state === "loading" ? <LoadingState rows={6} /> : null}
        {state === "error" ? (
          <ErrorState className="m-3" detail="The decision record could not be loaded." onRetry={onRetry} title="Something went wrong" />
        ) : null}
        {state === "denied" ? <DeniedState onRequestAccess={onRequestAccess} /> : null}
        {state === "empty" ? (
          <EmptyState
            action={
              onAddDecisionRecord ? (
                <Button onClick={onAddDecisionRecord} variant="primary">
                  Add a decision record
                </Button>
              ) : null
            }
            description="This page carries no decision yet. Adding one keeps the page as it is and lays a decision over it."
            title="No decision on this page"
          />
        ) : null}
        {ready ? (
          <div className="flex flex-col gap-4 p-3">
            <section className="flex flex-col gap-1">
              <h3 className="text-tiny font-medium text-ink-muted">Question</h3>
              <p className="text-body text-ink">{decision.question}</p>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-tiny font-medium text-ink-muted">Options considered</h3>
              <ul className="flex flex-col gap-1.5">
                {decision.options.map((option) => (
                  <li
                    className={cn(
                      "rounded-card border p-2",
                      option.chosen ? "border-line-strong bg-sidebar" : "border-line",
                    )}
                    key={option.id}
                  >
                    <p className="flex items-start gap-1.5 text-ui text-ink">
                      {option.chosen ? <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /> : null}
                      <span className="flex-1">{option.title}</span>
                      {option.chosen ? <span className="text-tiny font-medium text-ink-muted">Chosen</span> : null}
                    </p>
                    {option.note === null ? null : <p className="pt-0.5 text-tiny text-ink-muted">{option.note}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-1">
              <h3 className="text-tiny font-medium text-ink-muted">Outcome</h3>
              <p className="text-body text-ink">{decision.outcome}</p>
            </section>

            <section className="flex flex-col gap-1">
              <h3 className="text-tiny font-medium text-ink-muted">Rationale</h3>
              <p className="text-body whitespace-pre-line text-ink">{decision.rationale}</p>
            </section>

            <Separator />

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-ui">
              <dt className="text-tiny text-ink-muted">Owner</dt>
              <dd className="text-ink">{decision.owner.name}</dd>
              <dt className="text-tiny text-ink-muted">{sentenceCase(knowledgeNoun("container"))}</dt>
              <dd className="text-ink">{decision.containerLabel}</dd>
              <dt className="text-tiny text-ink-muted">Decided</dt>
              <dd className="text-ink">{decision.decidedAtLabel}</dd>
              <dt className="text-tiny text-ink-muted">Review</dt>
              <dd className="text-ink">
                {decision.reviewAtLabel === null ? (
                  <span className="text-ink-muted">No review date</span>
                ) : (
                  <>
                    {decision.reviewAtLabel}
                    {decision.overdue ? <span className="text-warn"> — overdue</span> : null}
                  </>
                )}
              </dd>
            </dl>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-tiny font-medium text-ink-muted">Citations</h3>
              {decision.citations.length === 0 ? (
                <p className="text-ui text-ink-muted">This decision cites no revisions.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {decision.citations.map((citation) => (
                    <li className="flex flex-col gap-1.5" key={citation.id}>
                      <button
                        aria-label={`Open ${citation.pageTitle} at ${citation.revisionLabel}, the revision this decision cites`}
                        className="flex flex-col items-start gap-0.5 rounded-control px-1 py-0.5 text-left hover:bg-sidebar-hover"
                        onClick={() => onOpenCitedRevision(citation)}
                        type="button"
                      >
                        <span className="text-ui text-ink">{citation.pageTitle}</span>
                        <span className="text-tiny text-ink-muted">{citation.revisionLabel}</span>
                      </button>
                      {citation.current ? null : (
                        <StaleCitationWarning
                          citation={citation}
                          onOpenCitedRevision={onOpenCitedRevision}
                          onOpenCurrent={onOpenCurrentPage}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <DecisionLinkList
              onOpenLinkedDecision={onOpenLinkedDecision}
              supersededBy={supersededBy}
              supersedes={decision.supersedes ?? null}
            />

            {onRemove ? (
              <>
                <Separator />
                <section className="flex flex-col gap-1.5">
                  <Button className="self-start text-danger" onClick={onRemove} size="sm" variant="ghost">
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Remove decision record
                  </Button>
                  <p className="text-tiny text-ink-muted">
                    Removing the decision record leaves the page intact: its {knowledgeNoun("pageBody")}, comments,
                    grants, versions and links are unchanged.
                  </p>
                </section>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {ready ? (
        <footer className="flex flex-col gap-1.5 border-t border-line px-3 py-2.5">
          {decision.state === "proposed" ? (
            <>
              <Button className="w-full" disabled={onAccept === undefined} onClick={onAccept} variant="primary">
                Accept decision
              </Button>
              {onEdit ? (
                <Button className="w-full" onClick={onEdit} size="sm" variant="ghost">
                  <PenLine aria-hidden="true" className="size-3.5" />
                  Edit this proposal
                </Button>
              ) : null}
            </>
          ) : null}
          {decision.state === "accepted" ? (
            <Button className="w-full" disabled={onSupersede === undefined} onClick={onSupersede} variant="primary">
              Supersede decision
            </Button>
          ) : null}
          {decision.state === "superseded" ? (
            <p className="text-tiny text-ink-muted">
              Superseded is terminal — this decision cannot change again.
              {supersededBy !== null && onOpenLinkedDecision ? (
                <>
                  {" "}
                  <button
                    className="text-accent underline-offset-4 hover:underline"
                    onClick={() => onOpenLinkedDecision(supersededBy)}
                    type="button"
                  >
                    Open the decision that superseded it
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </footer>
      ) : null}
    </aside>
  );
}
