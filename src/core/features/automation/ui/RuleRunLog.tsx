import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "../../../ui";
import { RuleRunFailureBanner } from "./RuleRunFailureBanner";
import { plural, recordNoun } from "./nouns";
import {
  isFailedRun,
  ruleRunStateCopy,
  type AutomationSurfaceState,
  type RuleDisabledAfterFailure,
  type RuleRun,
} from "./types";

/**
 * `AUTO-003` — the per-run log: the trigger, the actor, the {@link RuleRun.touched}
 * records, the time and the state.
 *
 * Under `source` the log covers the one database the rules belong to and says
 * so; under `container` and `site` it covers every rule in scope.
 */
export interface RuleRunLogProps {
  automationScopeProfile: KnowledgePolicyProfile["automation.scope.v1"];
  /** What the log is scoped to under `source` — the database's own name. */
  scopeTargetLabel: string;
  state: AutomationSurfaceState;
  runs: readonly RuleRun[];
  disabledAfterFailure: RuleDisabledAfterFailure | null;
  onOpenRun: (runId: string) => void;
  onReenableRule?: () => void;
  errorDetail?: string;
  onRetry?: () => void;
  className?: string;
}

export function RuleRunLog({
  automationScopeProfile,
  scopeTargetLabel,
  state,
  runs,
  disabledAfterFailure,
  onOpenRun,
  onReenableRule,
  errorDetail,
  onRetry,
  className,
}: RuleRunLogProps) {
  const failures = runs.filter((run) => isFailedRun(run.state));

  return (
    <section className={cn("flex w-full max-w-wide flex-col gap-3", className)}>
      <header className="flex flex-col gap-1">
        <h2 className="text-h2 font-semibold text-ink">Run log</h2>
        <p className="text-tiny text-ink-muted">
          {automationScopeProfile === "source"
            ? `Every run of the rules on ${scopeTargetLabel}. Rules on other databases keep their own log.`
            : `Every run of every rule in ${scopeTargetLabel}, whichever database its ${plural(recordNoun)} sit in.`}
        </p>
      </header>

      {state === "ready" ? (
        <RuleRunFailureBanner
          disabledAfterFailure={disabledAfterFailure}
          failures={failures}
          onOpenRun={onOpenRun}
          onReenable={onReenableRule}
        />
      ) : null}

      <div className="rounded-card border border-line bg-surface">
        {state === "loading" ? <LoadingState rows={6} /> : null}
        {state === "error" ? (
          <ErrorState className="m-3" detail={errorDetail} onRetry={onRetry} title="The run log could not be loaded" />
        ) : null}
        {state === "empty" ? (
          <EmptyState
            description="Runs appear here the moment a rule is triggered, whether it acted or not."
            title="Nothing has run yet"
          />
        ) : null}
        {state === "ready" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trigger</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Touched</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="max-w-72 align-top">
                    <button
                      className="text-left text-ui text-ink hover:underline"
                      onClick={() => onOpenRun(run.id)}
                      type="button"
                    >
                      {run.ruleName}
                    </button>
                    <span className="block text-tiny text-ink-muted">{run.triggerSummary}</span>
                  </TableCell>
                  <TableCell className="align-top text-tiny whitespace-nowrap text-ink-muted">
                    {run.actorName}
                  </TableCell>
                  <TableCell className="max-w-64 align-top text-tiny text-ink-muted">
                    {run.touched.length === 0 ? (
                      <span className="text-ink-faint">Nothing</span>
                    ) : (
                      <ul className="flex flex-col">
                        {run.touched.map((touched) => (
                          <li className="truncate" key={touched.id}>
                            {touched.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-tiny whitespace-nowrap text-ink-muted">
                    {run.timeLabel}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge tone={ruleRunStateCopy[run.state].tone}>{ruleRunStateCopy[run.state].label}</Badge>
                    {run.detail ? <span className="block pt-0.5 text-tiny text-ink-muted">{run.detail}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>
    </section>
  );
}
