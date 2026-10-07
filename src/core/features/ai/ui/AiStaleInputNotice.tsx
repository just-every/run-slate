import { GitCompareArrows, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, cn } from "../../../ui";
import type { AiStaleInput } from "./types";

/**
 * `AI-006` — an input moved under the run. The clause requires the difference to
 * be shown before acceptance is possible, and then exactly two ways forward:
 * regenerate against what the page says now, or accept explicitly against the
 * current revision. Both are offered as real buttons with the consequence
 * written next to them; neither is the quiet default.
 *
 * The difference is rendered as lines rather than a prose summary, with the kind
 * spelled out for a reader who cannot see the colour.
 */
export function AiStaleInputNotice({
  inputs,
  onRegenerate,
  onAcceptAgainstCurrent,
  acknowledged = false,
  className,
}: {
  inputs: readonly AiStaleInput[];
  onRegenerate: () => void;
  /** The explicit second route: accept knowing the input has moved. */
  onAcceptAgainstCurrent: () => void;
  /** Set once the member has taken the explicit route, so the block stops blocking. */
  acknowledged?: boolean;
  className?: string;
}) {
  if (inputs.length === 0) return null;

  return (
    <section
      aria-labelledby="ai-stale-input-heading"
      className={cn("flex flex-col gap-2 rounded-card border border-warn/30 bg-warn-soft p-3", className)}
    >
      <h3 className="flex items-center gap-1.5 text-ui font-medium text-warn" id="ai-stale-input-heading">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        {inputs.length === 1 ? "An input has changed since this run started" : `${inputs.length} inputs have changed since this run started`}
      </h3>
      <p className="text-tiny text-ink-muted">
        This proposal cannot be accepted until you have seen what moved and chosen how to go on.
      </p>

      <ul className="flex flex-col gap-2">
        {inputs.map((input) => (
          <li className="rounded-control border border-line bg-surface p-2.5" key={input.id}>
            <p className="text-tiny font-medium text-ink">{input.pageTitle}</p>
            <p className="mt-0.5 text-micro text-ink-faint">
              Read at {input.runRevisionLabel} · now at {input.currentRevisionLabel} · changed by {input.changedBy.name},{" "}
              {input.changedAtLabel}
            </p>
            <div className="mt-1.5 overflow-x-auto">
              <dl className="min-w-max text-micro">
                {input.difference.map((line) => (
                  <div className="flex items-baseline gap-2" key={line.id}>
                    <dt className="w-16 shrink-0 text-ink-faint">
                      {line.kind === "added" ? "Added" : line.kind === "removed" ? "Removed" : "Unchanged"}
                    </dt>
                    <dd
                      className={cn(
                        "font-mono whitespace-pre-wrap",
                        line.kind === "added" && "text-good",
                        line.kind === "removed" && "text-danger line-through",
                        line.kind === "unchanged" && "text-ink-muted",
                      )}
                    >
                      {line.text}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>

      {acknowledged ? (
        <p className="flex items-center gap-1.5 text-tiny font-medium text-ink">
          <GitCompareArrows aria-hidden="true" className="size-3.5" />
          You chose to accept against the current revision. Acceptance is unblocked.
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Button className="w-full sm:w-auto" onClick={onRegenerate} size="sm">
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Regenerate against the current revision
            </Button>
            <p className="mt-1 text-micro text-ink-faint">Discards this proposal and starts a fresh run.</p>
          </div>
          <div className="flex-1">
            <Button className="w-full sm:w-auto" onClick={onAcceptAgainstCurrent} size="sm" variant="secondary">
              Accept against the current revision
            </Button>
            <p className="mt-1 text-micro text-ink-faint">Keeps this proposal, knowing the page has moved on.</p>
          </div>
        </div>
      )}
    </section>
  );
}
