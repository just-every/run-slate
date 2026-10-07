import { Clock } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button, Separator, cn } from "../../../ui";
import { DecisionReviewForm } from "./DecisionReviewForm";
import type { DecisionReviewEntry } from "./types";

/**
 * `DEC-005` — the review date has passed.
 *
 * Design decision: the notice says in its first two lines that the decision
 * stays Accepted, because an overdue label sitting next to a warning reads as a
 * lapse unless the product says otherwise. The two ways to end the overdue
 * state — record a completed review, or supersede — are offered together, and
 * the completed reviews already recorded are listed beneath them so the reader
 * can see the decision has been tended before.
 */
export interface DecisionReviewNoticeProps {
  /** The review date that has passed, already formatted. */
  reviewAtLabel: string;
  /** The owner who is notified until the review is recorded. */
  ownerName: string;
  reviews: readonly DecisionReviewEntry[];
  note: string;
  onNoteChange: (note: string) => void;
  nextReviewAt: string;
  onNextReviewAtChange: (value: string) => void;
  onRecordReview: () => void;
  onSupersede: () => void;
  busy?: boolean;
  className?: string;
}

export function DecisionReviewNotice({
  reviewAtLabel,
  ownerName,
  reviews,
  note,
  onNoteChange,
  nextReviewAt,
  onNextReviewAtChange,
  onRecordReview,
  onSupersede,
  busy = false,
  className,
}: DecisionReviewNoticeProps) {
  return (
    <section
      aria-labelledby="decision-review-heading"
      className={cn("flex flex-col gap-3 rounded-card border border-warn/30 bg-warn-soft p-3", className)}
    >
      <h3 className="flex items-center gap-1.5 text-ui font-medium text-warn" id="decision-review-heading">
        <Clock aria-hidden="true" className="size-4" />
        Review overdue
      </h3>
      <p className="text-ui text-ink">
        The review date of {reviewAtLabel} has passed. This decision stays Accepted — being overdue does not change its
        state.
      </p>
      <p className="text-tiny text-ink-muted">
        {ownerName} is notified until a {knowledgeNoun("member")} records a completed review — a note, an actor, a time
        and the next review date — or supersedes the decision.
      </p>

      <div className="rounded-card bg-surface p-3">
        <DecisionReviewForm
          busy={busy}
          nextReviewAt={nextReviewAt}
          note={note}
          onNextReviewAtChange={onNextReviewAtChange}
          onNoteChange={onNoteChange}
          onSubmit={onRecordReview}
        />
        <Separator className="my-3" />
        <Button disabled={busy} onClick={onSupersede} variant="secondary">
          Supersede instead
        </Button>
      </div>

      {reviews.length === 0 ? null : (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-tiny font-medium text-ink-muted">Completed reviews</h4>
          <ul className="flex flex-col gap-1.5">
            {reviews.map((review) => (
              <li className="rounded-card bg-surface p-2" key={review.id}>
                <p className="text-ui text-ink">{review.note}</p>
                <p className="pt-0.5 text-tiny text-ink-muted">
                  {review.actor.name} · {review.atLabel} ·{" "}
                  {review.nextReviewAtLabel === null
                    ? "no next review date"
                    : `next review ${review.nextReviewAtLabel}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
