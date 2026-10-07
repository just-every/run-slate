import { ArrowRight, Plus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui";
import type { DecisionLink } from "./types";

/**
 * `DEC-003` — changing an accepted decision is done by superseding it, which
 * links both decisions in both directions.
 *
 * Design decision: the successor is chosen before the confirm button becomes
 * usable, because a supersession with no successor would leave a terminal state
 * pointing nowhere. The two-way link is spelled out in both directions, in the
 * order the reader will meet them.
 */
export interface SupersedeDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The accepted decision being superseded, named so the dialog is unambiguous. */
  decisionTitle: string;
  candidates: readonly DecisionLink[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  /** Offered when the superseding decision does not exist yet. */
  onCreateNew?: () => void;
  busy?: boolean;
}

export function SupersedeDecisionDialog({
  open,
  onOpenChange,
  decisionTitle,
  candidates,
  selectedId,
  onSelect,
  onConfirm,
  onCreateNew,
  busy = false,
}: SupersedeDecisionDialogProps) {
  const chosen = candidates.find((candidate) => candidate.id === selectedId) ?? null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby="supersede-decision-description">
        <DialogHeader>
          <DialogTitle>Supersede this decision</DialogTitle>
          <DialogDescription id="supersede-decision-description">
            Choose the decision that replaces &ldquo;{decisionTitle}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="pb-1 text-tiny font-medium text-ink-muted">Superseding decision</legend>
            {candidates.length === 0 ? (
              <p className="text-ui text-ink-muted">No other decision is available to supersede this one.</p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-card border border-line p-1">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-control px-2 py-1.5 hover:bg-sidebar-hover">
                      <input
                        checked={selectedId === candidate.id}
                        className="mt-1 size-3.5 accent-accent"
                        name="superseding-decision"
                        onChange={() => onSelect(candidate.id)}
                        type="radio"
                        value={candidate.id}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-ui text-ink">{candidate.pageTitle}</span>
                        <span className="text-tiny text-ink-muted">Decided {candidate.decidedAtLabel}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {onCreateNew ? (
            <Button className="self-start" onClick={onCreateNew} size="sm" variant="secondary">
              <Plus aria-hidden="true" className="size-3.5" />
              Create a new decision instead
            </Button>
          ) : null}

          <p className="flex items-start gap-1.5 text-tiny text-ink-muted">
            <ArrowRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Both decisions will link to each other in both directions: this decision will name{" "}
              {chosen === null ? "its successor" : chosen.pageTitle} as its successor, and that decision will name this
              one as what it supersedes.
            </span>
          </p>
          <p className="text-tiny text-ink-muted">
            This decision becomes Superseded, which is terminal — it cannot return to Accepted or be edited again.
          </p>
        </div>

        <DialogFooter>
          <Button disabled={busy} onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={busy || selectedId === null} onClick={onConfirm} variant="primary">
            {busy ? "Superseding…" : "Supersede decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
