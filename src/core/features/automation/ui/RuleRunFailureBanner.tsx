import { AlertTriangle, PauseCircle } from "lucide-react";
import { Button, cn } from "../../../ui";
import type { RuleDisabledAfterFailure, RuleRun } from "./types";

/**
 * `AUTO-003`, `BASE-OPS-004` — a failed run is visible without a search.
 *
 * Design decision: the failures are lifted above the log rather than sorted to
 * the top of it. A reader who arrives with a filter already applied would
 * otherwise never see them, which is exactly the case the clause is about.
 */
export interface RuleRunFailureBannerProps {
  failures: readonly RuleRun[];
  /** `AUTO-003` — the rule was switched off after repeated failure. */
  disabledAfterFailure: RuleDisabledAfterFailure | null;
  onOpenRun: (runId: string) => void;
  /** Given, a disabled rule offers the way back on. */
  onReenable?: () => void;
  className?: string;
}

export function RuleRunFailureBanner({
  failures,
  disabledAfterFailure,
  onOpenRun,
  onReenable,
  className,
}: RuleRunFailureBannerProps) {
  if (failures.length === 0 && disabledAfterFailure === null) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {failures.length > 0 ? (
        <section
          aria-label="Failed runs"
          className="flex flex-col gap-1.5 rounded-card border border-danger/30 bg-danger-soft p-3"
          role="alert"
        >
          <h3 className="flex items-center gap-1.5 text-ui font-medium text-danger">
            <AlertTriangle aria-hidden="true" className="size-4" />
            {failures.length === 1 ? "1 run failed" : `${failures.length} runs failed`}
          </h3>
          <ul className="flex flex-col gap-1">
            {failures.map((run) => (
              <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" key={run.id}>
                <button
                  className="text-ui text-ink hover:underline"
                  onClick={() => onOpenRun(run.id)}
                  type="button"
                >
                  {run.ruleName}
                </button>
                <span className="text-tiny text-ink-muted">{run.timeLabel}</span>
                {run.detail ? <span className="text-tiny text-ink-muted">{run.detail}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {disabledAfterFailure ? (
        <section
          aria-label="Rule disabled"
          className="flex flex-wrap items-center gap-2 rounded-card border border-warn/30 bg-warn-soft p-3"
        >
          <PauseCircle aria-hidden="true" className="size-4 shrink-0 text-warn" />
          <p className="text-ui text-ink">
            <span className="font-medium">{disabledAfterFailure.ruleName}</span> was disabled on{" "}
            {disabledAfterFailure.disabledAtLabel} after failing {disabledAfterFailure.failureCount} times in a row. It
            runs nothing until it is turned back on.
          </p>
          {onReenable ? (
            <Button className="ml-auto" onClick={onReenable} size="sm" variant="secondary">
              Turn it back on
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
