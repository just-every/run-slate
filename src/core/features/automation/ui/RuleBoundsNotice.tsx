import { Repeat } from "lucide-react";
import { cn } from "../../../ui";

/**
 * `AUTO-004` — the three bounds on a running rule, stated where a rule is
 * written rather than buried in a log.
 *
 * Design decision: the depth and the rate limit arrive as props. They are
 * tested capacity from the manifest, and a component that carried its own
 * numbers would drift from the deployment the moment either changed.
 */
export interface RuleBoundsNoticeProps {
  /** The chain depth a rule chain stops at. */
  chainDepth: number;
  /** The workspace's rate limit, as a count over a window. */
  rateLimitRuns: number;
  rateLimitWindowLabel: string;
  className?: string;
}

export function RuleBoundsNotice({ chainDepth, rateLimitRuns, rateLimitWindowLabel, className }: RuleBoundsNoticeProps) {
  return (
    <section
      aria-label="Limits on how a rule runs"
      className={cn("flex items-start gap-2 rounded-card border border-line bg-sidebar p-3", className)}
    >
      <Repeat aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
      <ul className="flex flex-col gap-1 text-tiny text-ink-muted">
        <li>A rule never triggers itself. Its own changes do not start it again.</li>
        <li>
          A chain of rules stops at {chainDepth} {chainDepth === 1 ? "rule" : "rules"} deep. Anything past that depth
          does not run.
        </li>
        <li>
          Past {rateLimitRuns} runs {rateLimitWindowLabel}, a run is throttled and written to the log. It is never
          dropped silently.
        </li>
      </ul>
    </section>
  );
}
