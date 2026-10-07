import { Ban, CircleAlert, RefreshCw, Wallet } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Button, cn } from "../../../ui";
import { sentenceCase, type AiFailureReason } from "./types";

/**
 * `AI-008` and `AI-009`. Whatever went wrong, three things are true and all three
 * are on the notice: the run is terminal with its reason readable, nothing was
 * written — no product record, no half-applied proposal — and every manual way
 * of doing the work is still open. The last of those is the one a member
 * actually needs, so it is a line of copy and not an implication.
 *
 * Retry is offered for a transient transport failure and for nothing else
 * (`AI-009`): unusable output is never retried, and the notice says so instead of
 * dangling a button that would burn budget on the same bad answer.
 */
const reasonCopy: Record<AiFailureReason, { title: string; body: string; terminal: "failed" | "cancelled" }> = {
  "provider-error": {
    title: "The AI provider returned an error",
    body: "The provider rejected or could not complete the request.",
    terminal: "failed",
  },
  "over-budget": {
    title: "Refused — this month's AI budget would be exceeded",
    body: "The run was refused before any request reached the provider, so nothing was spent on it. Reservations held by runs still in flight count against the budget and are released when those runs settle.",
    terminal: "failed",
  },
  "invalid-output": {
    title: "The provider's output did not validate",
    body: "What came back did not match the shape this run requires, so it was discarded rather than partly applied.",
    terminal: "failed",
  },
  "timed-out": {
    title: "The run passed 10 minutes and was failed",
    body: "A run that has been running for 10 minutes is failed automatically.",
    terminal: "failed",
  },
  transport: {
    title: "The connection to the AI provider failed",
    body: "A transient transport failure. This is retried automatically, at most 3 attempts over 5 minutes.",
    terminal: "failed",
  },
  cancelled: {
    title: "Cancelled",
    body: "The run was cancelled before it produced anything.",
    terminal: "cancelled",
  },
};

export interface AiFailureNoticeProps {
  reason: AiFailureReason;
  /** The provider's own message, or the budget figures — whatever the run recorded. */
  detail?: string | null;
  /** `AI-009` — e.g. "Attempt 3 of 3". Only meaningful for a transport failure. */
  attemptsLabel?: string | null;
  /** Offered for a transport failure only; ignored for every other reason. */
  onRetry?: () => void;
  /** `AI-008` — the manual route to the same outcome, offered by name. */
  manualActions?: readonly { id: string; label: string; onSelect: () => void }[];
  onDismiss?: () => void;
  className?: string;
}

export function AiFailureNotice({
  reason,
  detail,
  attemptsLabel,
  onRetry,
  manualActions = [],
  onDismiss,
  className,
}: AiFailureNoticeProps) {
  const copy = reasonCopy[reason];
  const cancelled = copy.terminal === "cancelled";
  const retryable = reason === "transport";
  const Glyph = reason === "over-budget" ? Wallet : cancelled ? Ban : CircleAlert;
  const member = knowledgeNoun("member");

  return (
    <section
      aria-labelledby={`ai-failure-${reason}`}
      className={cn(
        "flex flex-col gap-2 rounded-card border p-3",
        cancelled ? "border-line bg-sidebar" : "border-danger/30 bg-danger-soft",
        className,
      )}
      role={cancelled ? undefined : "alert"}
    >
      <h3
        className={cn("flex items-center gap-1.5 text-ui font-medium", cancelled ? "text-ink" : "text-danger")}
        id={`ai-failure-${reason}`}
      >
        <Glyph aria-hidden="true" className="size-4 shrink-0" />
        {copy.title}
      </h3>

      <p className="text-tiny text-ink-muted">{copy.body}</p>
      {detail ? <p className="rounded-control bg-surface px-2 py-1.5 text-tiny text-ink-muted">{detail}</p> : null}
      {attemptsLabel && retryable ? <p className="text-tiny text-ink-faint">{attemptsLabel}</p> : null}

      <p className="text-tiny text-ink-muted">
        The run is {cancelled ? "Cancelled" : "Failed"}, which is terminal. Nothing was written: no {knowledgeNoun("record")}
        , no page change, and no partial proposal. Every manual action is still available to you.
      </p>

      {!retryable && !cancelled ? (
        <p className="text-tiny text-ink-faint">
          This is not retried automatically — only a transient transport failure is. Start a new run if you want to try
          again.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {retryable && onRetry ? (
          <Button onClick={onRetry} size="sm" variant="secondary">
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Try again
          </Button>
        ) : null}
        {manualActions.map((action) => (
          <Button key={action.id} onClick={action.onSelect} size="sm" variant="secondary">
            {action.label}
          </Button>
        ))}
        {onDismiss ? (
          <Button className="ml-auto" onClick={onDismiss} size="sm" variant="ghost">
            Dismiss
          </Button>
        ) : null}
      </div>

      {manualActions.length > 0 ? (
        <p className="text-micro text-ink-faint">{sentenceCase(member)} actions above do the same work by hand.</p>
      ) : null}
    </section>
  );
}
