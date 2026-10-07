import { AlertTriangle, Plus } from "lucide-react";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import {
  Badge,
  Button,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  type SurfaceState,
} from "../../../ui";
import { containerNoun, plural, recordNoun } from "./nouns";
import { ruleRunStateCopy, ruleScopeCopy, type RuleListRow } from "./types";

/**
 * `AUTO-005` — the rule list that `container` and `site` create rules from.
 *
 * Under `source` there is no such list: a rule is created from its database's
 * own view settings and belongs to that database, so this surface renders
 * nothing at all rather than an empty shell.
 */
export interface RuleListProps {
  automationScopeProfile: KnowledgePolicyProfile["automation.scope.v1"];
  state: SurfaceState;
  rules: readonly RuleListRow[];
  onOpenRule: (ruleId: string) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onCreateRule: () => void;
  errorDetail?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  className?: string;
}

export function RuleList({
  automationScopeProfile,
  state,
  rules,
  onOpenRule,
  onToggleRule,
  onCreateRule,
  errorDetail,
  onRetry,
  onRequestAccess,
  className,
}: RuleListProps) {
  if (automationScopeProfile === "source") return null;

  return (
    <section className={cn("flex w-full max-w-wide flex-col gap-3", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2 font-semibold text-ink">Rules</h2>
        <Button onClick={onCreateRule} size="sm" variant="primary">
          <Plus aria-hidden="true" className="size-3.5" />
          New rule
        </Button>
      </header>
      <p className="text-tiny text-ink-muted">
        Every rule in this {containerNoun} and across the workspace, whichever database its{" "}
        {plural(recordNoun)} sit in.
      </p>

      <div className="rounded-card border border-line bg-surface">
        {state === "loading" ? <LoadingState rows={5} /> : null}
        {state === "error" ? (
          <ErrorState className="m-3" detail={errorDetail} onRetry={onRetry} title="The rules could not be loaded" />
        ) : null}
        {state === "denied" ? <DeniedState onRequestAccess={onRequestAccess} /> : null}
        {state === "empty" ? (
          <EmptyState
            action={
              <Button onClick={onCreateRule} size="sm" variant="secondary">
                Write the first rule
              </Button>
            }
            description="A rule watches for something happening and then does the work that always follows it."
            title="No rules yet"
          />
        ) : null}
        {state === "ready" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="max-w-64">
                    <button
                      className="max-w-full truncate text-left font-medium text-ink hover:underline"
                      onClick={() => onOpenRule(rule.id)}
                      type="button"
                    >
                      {rule.name}
                    </button>
                    {rule.disabledAfterFailure ? (
                      <span className="flex items-center gap-1 text-tiny text-danger">
                        <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                        Disabled after repeated failure
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-tiny text-ink-muted">
                    {ruleScopeCopy[rule.scope].label}
                    <span className="block text-ink-faint">{rule.scopeTargetLabel}</span>
                  </TableCell>
                  <TableCell className="max-w-56 text-tiny text-ink-muted">{rule.triggerSummary}</TableCell>
                  <TableCell className="text-tiny text-ink-muted whitespace-nowrap">{rule.actorName}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {rule.lastRunLabel === null ? (
                      <span className="text-tiny text-ink-faint">Never run</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {rule.lastRunState ? (
                          <Badge tone={ruleRunStateCopy[rule.lastRunState].tone}>
                            {ruleRunStateCopy[rule.lastRunState].label}
                          </Badge>
                        ) : null}
                        <span className="text-tiny text-ink-muted">{rule.lastRunLabel}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      aria-label={`${rule.enabled ? "Turn off" : "Turn on"} ${rule.name}`}
                      checked={rule.enabled}
                      onCheckedChange={(next) => onToggleRule(rule.id, next)}
                    />
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
