import { AlertTriangle, CalendarClock, RefreshCw } from "lucide-react";
import { Button, cn } from "../../../ui";

export interface ScheduledNoticeProps {
  /** The scheduled time, already written out for the reader. */
  scheduledFor: string;
  /** `scheduled` is the ordinary state; `failed` is a schedule that did not fire. */
  state: "scheduled" | "failed";
  /** What went wrong, as reported to the operators under `BASE-OPS-004`. */
  failureDetail?: string;
  onCancel: () => void;
  onEditSchedule?: () => void;
  onPublishNow?: () => void;
}

/**
 * `LIFE-004` — the scheduled time wherever the page appears to its author, a cancel
 * action that returns the page to a draft and publishes nothing, and the failed state
 * that leaves the page scheduled and reports the failure.
 */
export function ScheduledNotice({
  scheduledFor,
  state,
  failureDetail,
  onCancel,
  onEditSchedule,
  onPublishNow,
}: ScheduledNoticeProps) {
  const failed = state === "failed";
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-card border px-3 py-2.5",
        failed ? "border-danger/30 bg-danger-soft" : "border-warn/30 bg-warn-soft",
      )}
      role={failed ? "alert" : undefined}
    >
      {failed ? (
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
      ) : (
        <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {failed ? (
          <>
            <p className="text-ui font-medium text-danger">The scheduled publish did not run.</p>
            <p className="text-ui text-ink-muted">
              This page is still scheduled for {scheduledFor} and nothing has been published.
              {failureDetail ? ` ${failureDetail}` : ""} The failure has been reported to the operators.
            </p>
          </>
        ) : (
          <>
            <p className="text-ui font-medium text-ink">Scheduled to publish on {scheduledFor}.</p>
            <p className="text-ui text-ink-muted">
              It publishes itself at that time, with no further action from you. Until then it stays a private
              draft.
            </p>
          </>
        )}
        <p className="text-tiny text-ink-muted">
          Cancelling returns this page to a draft and publishes nothing.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {failed && onPublishNow ? (
          <Button onClick={onPublishNow} size="sm" variant="secondary">
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Publish now
          </Button>
        ) : null}
        {onEditSchedule ? (
          <Button onClick={onEditSchedule} size="sm" variant="ghost">
            Change time
          </Button>
        ) : null}
        <Button onClick={onCancel} size="sm" variant="secondary">
          Cancel schedule
        </Button>
      </div>
    </div>
  );
}
