import { useId } from "react";
import type { AutomationScope } from "../../../shared/knowledge/model";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { Button, Input, Label, cn } from "../../../ui";
import { RuleActorNotice } from "./RuleActorNotice";
import { RuleBoundsNotice } from "./RuleBoundsNotice";
import { RuleBranchRail } from "./RuleBranchRail";
import { RuleConfigPanel, type RuleConfigField } from "./RuleConfigPanel";
import { RuleScopeSelect } from "./RuleScopeSelect";
import { RuleSourceForm } from "./RuleSourceForm";
import { ruleScopeCopy, type RuleDefinition } from "./types";

const allScopes: readonly AutomationScope[] = ["source", "container", "site"];

/** The card selected on the rail, described by whoever owns the rule. */
export interface RuleEditorSelection {
  title: string;
  description: string;
  fields: readonly RuleConfigField[];
}

/**
 * `AUTO-001`, `AUTO-005` — writing a rule, in both shapes the policy allows.
 *
 * Under `source` this is one When-and-Do form: no scope selector, no site
 * option, no branch rail, no way through to a cross-container rule list.
 * Under `container` and `site` it is the rail — When, If, Branch, Then — with
 * the scope selector and a configuration panel for the selected card, and
 * neither of those two values hides anything from the other.
 */
export interface RuleEditorProps {
  automationScopeProfile: KnowledgePolicyProfile["automation.scope.v1"];
  rule: RuleDefinition;
  selectedComponentId: string | null;
  selection: RuleEditorSelection | null;
  /** `AUTO-004` — the bounds, as data from the manifest. */
  chainDepth: number;
  rateLimitRuns: number;
  rateLimitWindowLabel: string;
  /** What each scope value resolves to for this rule. */
  scopeTargetLabels: Partial<Record<AutomationScope, string>>;
  onNameChange: (name: string) => void;
  onScopeChange: (scope: AutomationScope) => void;
  onEnabledChange: (enabled: boolean) => void;
  onSelectComponent: (componentId: string) => void;
  onMoveComponent: (componentId: string, direction: "up" | "down") => void;
  onRemoveComponent: (componentId: string) => void;
  onAddComponent: () => void;
  onAddToBranch: () => void;
  onAddCondition: () => void;
  onAddAction: () => void;
  onConfigFieldChange: (fieldId: string, value: string) => void;
  onOpenRuleDetails: () => void;
  /** `AUTO-005` — the way back to the rule list, which `source` has no room for. */
  onReturnToRules?: () => void;
  onChangeActor?: () => void;
  className?: string;
}

export function RuleEditor(props: RuleEditorProps) {
  const { automationScopeProfile: profile, rule, selection, className } = props;
  const nameId = useId();
  const isSource = profile === "source";

  return (
    <section className={cn("flex w-full flex-col gap-4 bg-canvas p-4 lg:p-6", className)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <Label htmlFor={nameId}>Rule name</Label>
          <Input
            className="max-w-96 text-h3 font-semibold"
            id={nameId}
            onChange={(event) => props.onNameChange(event.target.value)}
            placeholder="Name this rule"
            value={rule.name}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={props.onOpenRuleDetails} size="sm" variant="ghost">
            Rule details
          </Button>
          <Button onClick={() => props.onEnabledChange(!rule.enabled)} size="sm" variant="primary">
            {rule.enabled ? "Turn off rule" : "Turn on rule"}
          </Button>
          {!isSource && props.onReturnToRules ? (
            <Button onClick={props.onReturnToRules} size="sm" variant="ghost">
              Return to rules
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {isSource ? null : (
            <div className="flex flex-col gap-1.5">
              <RuleScopeSelect
                onChange={props.onScopeChange}
                options={allScopes}
                targetLabels={props.scopeTargetLabels}
                value={rule.scope}
              />
              <p className="text-tiny text-ink-muted">
                Scope is stored on every rule, under every profile. A rule that arrives through an import keeps the
                scope it came with — it is never rewritten to the scope of the workspace it lands in.
              </p>
              {rule.importedFrom ? (
                <p className="text-tiny text-ink-muted">
                  Imported from {rule.importedFrom}, and kept its scope: {ruleScopeCopy[rule.scope].label.toLowerCase()}
                  .
                </p>
              ) : null}
            </div>
          )}

          {isSource ? (
            <RuleSourceForm
              onAddAction={props.onAddAction}
              onAddCondition={props.onAddCondition}
              onMoveComponent={props.onMoveComponent}
              onRemoveComponent={props.onRemoveComponent}
              onSelectComponent={props.onSelectComponent}
              rule={rule}
              selectedComponentId={props.selectedComponentId}
            />
          ) : (
            <RuleBranchRail
              onAddComponent={props.onAddComponent}
              onAddToBranch={props.onAddToBranch}
              onMoveComponent={props.onMoveComponent}
              onRemoveComponent={props.onRemoveComponent}
              onSelectComponent={props.onSelectComponent}
              rule={rule}
              selectedComponentId={props.selectedComponentId}
            />
          )}

          {isSource ? (
            <p className="max-w-reading text-tiny text-ink-muted">
              This rule&rsquo;s scope is stored with it. Read under a workspace that lists rules across{" "}
              {ruleScopeCopy.container.label.toLowerCase()}s, it still says it belongs to {rule.scopeTargetLabel}, and an
              imported rule keeps the scope it arrived with.
            </p>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-panel lg:shrink-0">
          {selection ? (
            <RuleConfigPanel
              description={selection.description}
              fields={selection.fields}
              onFieldChange={props.onConfigFieldChange}
              onRemove={
                props.selectedComponentId && props.selectedComponentId !== rule.trigger.id
                  ? () => props.onRemoveComponent(props.selectedComponentId ?? "")
                  : undefined
              }
              title={selection.title}
            />
          ) : (
            <p className="rounded-card border border-dashed border-line p-3 text-tiny text-ink-muted">
              Select a card to configure it.
            </p>
          )}
          <RuleActorNotice actor={rule.actor} onChangeActor={props.onChangeActor} />
          <RuleBoundsNotice
            chainDepth={props.chainDepth}
            rateLimitRuns={props.rateLimitRuns}
            rateLimitWindowLabel={props.rateLimitWindowLabel}
          />
        </div>
      </div>
    </section>
  );
}
