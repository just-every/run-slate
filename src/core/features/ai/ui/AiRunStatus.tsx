import { Ban, Check, CircleAlert, CircleDot, Clock, Loader2 } from "lucide-react";
import type { ComponentType } from "react";
import { Badge, Button, cn } from "../../../ui";
import { aiRunLifecycle, aiRunStateLabel, type AiRunState } from "./types";

/**
 * `AI-002` as one status line. The four-step ladder is always drawn so a member
 * can see where a run is and what is still ahead of it; Cancelled and Failed are
 * drawn as an end to the ladder rather than as a fifth step, because they are
 * terminal and no step follows them.
 *
 * The 10-minute timeout is named on a Running run rather than only after it
 * fires, so the deadline is visible while it still matters. Cancel is offered on
 * Queued and Running and on nothing else.
 */
const stepIcon: Record<(typeof aiRunLifecycle)[number], ComponentType<{ className?: string }>> = {
  queued: Clock,
  running: Loader2,
  "needs-review": CircleDot,
  completed: Check,
};

export interface AiRunStatusProps {
  state: AiRunState;
  /** How long the run has been in its current state, already formatted. */
  elapsedLabel?: string | null;
  /** `AI-008` — readable on Failed and Cancelled runs. */
  reason?: string | null;
  onCancel?: () => void;
  cancelling?: boolean;
  className?: string;
}

export function AiRunStatus({ state, elapsedLabel, reason, onCancel, cancelling = false, className }: AiRunStatusProps) {
  const terminalBadly = state === "failed" || state === "cancelled";
  const reachedIndex = terminalBadly ? -1 : aiRunLifecycle.indexOf(state as (typeof aiRunLifecycle)[number]);
  const canCancel = state === "queued" || state === "running";

  return (
    <div
      aria-label={`Run status: ${aiRunStateLabel[state]}`}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-3 py-2", className)}
      role="status"
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {aiRunLifecycle.map((step, index) => {
          const Icon = stepIcon[step];
          const current = !terminalBadly && index === reachedIndex;
          const done = !terminalBadly && index < reachedIndex;
          const stopped = terminalBadly && index === 0;
          return (
            <li className="flex items-center gap-1.5" key={step}>
              {index > 0 ? <span aria-hidden="true" className="h-px w-4 bg-line-strong" /> : null}
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-tiny",
                  current && "font-medium text-ink",
                  done && "text-ink-muted",
                  !current && !done && "text-ink-faint",
                  stopped && terminalBadly && "line-through",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-3.5", step === "running" && current && "animate-spin")}
                />
                {aiRunStateLabel[step]}
                {current ? <span className="sr-only">(current)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {terminalBadly ? (
        <Badge tone={state === "failed" ? "danger" : "neutral"}>
          {state === "failed" ? <CircleAlert aria-hidden="true" className="size-3" /> : <Ban aria-hidden="true" className="size-3" />}
          {aiRunStateLabel[state]}
        </Badge>
      ) : null}

      {elapsedLabel ? <span className="text-tiny text-ink-faint">{elapsedLabel}</span> : null}

      {state === "running" ? (
        <span className="text-tiny text-ink-faint">Fails automatically after 10 minutes running.</span>
      ) : null}

      {reason ? (
        <p className={cn("basis-full text-tiny", state === "failed" ? "text-danger" : "text-ink-muted")}>{reason}</p>
      ) : null}

      {canCancel && onCancel ? (
        <Button className="ml-auto" disabled={cancelling} onClick={onCancel} size="sm" variant="secondary">
          {cancelling ? "Cancelling…" : "Cancel run"}
        </Button>
      ) : null}
    </div>
  );
}
