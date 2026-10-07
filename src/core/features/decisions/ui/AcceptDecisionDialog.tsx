import { Lock } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui";
import type { DecisionCitation } from "./types";

/**
 * `DEC-003` — accepting freezes the decision together with the revisions it
 * cites.
 *
 * Design decision: the dialog lists those revisions by page and revision label
 * rather than counting them, because the frozen set is exactly what the reader
 * is agreeing to, and it states the one way out — superseding — before the
 * confirm button rather than after the fact.
 */
export interface AcceptDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question the decision answers, so the dialog names what is being accepted. */
  question: string;
  citations: readonly DecisionCitation[];
  onConfirm: () => void;
  busy?: boolean;
}

export function AcceptDecisionDialog({
  open,
  onOpenChange,
  question,
  citations,
  onConfirm,
  busy = false,
}: AcceptDecisionDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby="accept-decision-description">
        <DialogHeader>
          <DialogTitle>Accept this decision?</DialogTitle>
          <DialogDescription id="accept-decision-description">
            Accepting freezes the decision&rsquo;s content — the question, the options, the outcome and the rationale —
            together with the revisions it cites.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-ui text-ink">{question}</p>

          <div className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 text-tiny font-medium text-ink-muted">
              <Lock aria-hidden="true" className="size-3.5" />
              Revisions frozen with this decision
            </h3>
            {citations.length === 0 ? (
              <p className="text-tiny text-ink-muted">This decision cites no revisions.</p>
            ) : (
              <ul className="flex flex-col gap-1 rounded-card border border-line p-2">
                {citations.map((citation) => (
                  <li className="flex flex-wrap items-baseline justify-between gap-2 text-ui" key={citation.id}>
                    <span className="text-ink">{citation.pageTitle}</span>
                    <span className="text-tiny text-ink-muted">{citation.revisionLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-tiny text-ink-muted">
            From then on the only way to change this decision is to supersede it with another decision. Later edits to a
            cited page add a warning that the citation is no longer current; they never rewrite the accepted rationale.
          </p>
        </div>

        <DialogFooter>
          <Button disabled={busy} onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={busy} onClick={onConfirm} variant="primary">
            {busy ? "Accepting…" : "Accept decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
