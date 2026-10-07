import type { FormEvent } from "react";
import { Button, Input, Label, Textarea, cn } from "../../../ui";

/**
 * `DEC-005` — recording a completed review: a note, an actor, a time and the
 * next review date. The actor and the time are the server's to record; the form
 * asks for the two a person can supply.
 *
 * Design decision: the fields are controlled from outside, so the surface that
 * submits the review owns the draft and this form holds nothing.
 */
export interface DecisionReviewFormProps {
  note: string;
  onNoteChange: (note: string) => void;
  /** A date-input value; empty sets no next review date. */
  nextReviewAt: string;
  onNextReviewAtChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  className?: string;
}

export function DecisionReviewForm({
  note,
  onNoteChange,
  nextReviewAt,
  onNextReviewAtChange,
  onSubmit,
  busy = false,
  className,
}: DecisionReviewFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className={cn("flex flex-col gap-3", className)} onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-review-note">Review note</Label>
        <Textarea
          className="min-h-20"
          id="decision-review-note"
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="What was checked, and what still holds"
          value={note}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-next-review">Next review date</Label>
        <Input
          className="w-44"
          id="decision-next-review"
          onChange={(event) => onNextReviewAtChange(event.target.value)}
          type="date"
          value={nextReviewAt}
        />
        <p className="text-tiny text-ink-faint">Leave it empty to stop reviewing this decision.</p>
      </div>
      <Button className="self-start" disabled={busy || note.trim().length === 0} type="submit" variant="primary">
        {busy ? "Recording…" : "Record a completed review"}
      </Button>
    </form>
  );
}
