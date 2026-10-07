import { Plus } from "lucide-react";
import { Button, cn } from "../../../ui";
import { RuleActionCard } from "./RuleActionCard";
import { RuleBranchCard } from "./RuleBranchCard";
import { RuleConditionCard } from "./RuleConditionCard";
import { RuleTriggerCard } from "./RuleTriggerCard";
import type { RuleDefinition } from "./types";

/**
 * `AUTO-001`, `AUTO-005` — the vertical rail: When, then the ordered
 * conditions, then the optional branch, then the ordered actions.
 *
 * The rail belongs to `container` and `site` only. Under `source` a rule is one
 * When-and-Do form instead, so this component is never mounted there.
 */
export interface RuleBranchRailProps {
  rule: RuleDefinition;
  selectedComponentId: string | null;
  onSelectComponent: (componentId: string) => void;
  onMoveComponent: (componentId: string, direction: "up" | "down") => void;
  onRemoveComponent: (componentId: string) => void;
  onAddComponent: () => void;
  onAddToBranch: () => void;
  className?: string;
}

export function RuleBranchRail({
  rule,
  selectedComponentId,
  onSelectComponent,
  onMoveComponent,
  onRemoveComponent,
  onAddComponent,
  onAddToBranch,
  className,
}: RuleBranchRailProps) {
  return (
    <div className={cn("flex w-full max-w-reading flex-col gap-2", className)}>
      <RuleTriggerCard
        component={rule.trigger}
        onSelect={() => onSelectComponent(rule.trigger.id)}
        selected={selectedComponentId === rule.trigger.id}
      />

      {rule.conditions.map((condition, index) => (
        <RuleConditionCard
          canMoveDown={index < rule.conditions.length - 1}
          canMoveUp={index > 0}
          component={condition}
          key={condition.id}
          onMoveDown={() => onMoveComponent(condition.id, "down")}
          onMoveUp={() => onMoveComponent(condition.id, "up")}
          onRemove={() => onRemoveComponent(condition.id)}
          onSelect={() => onSelectComponent(condition.id)}
          selected={selectedComponentId === condition.id}
        />
      ))}

      {rule.branch ? (
        <RuleBranchCard
          branch={rule.branch}
          canMoveDown={rule.actions.length > 0}
          canMoveUp={rule.conditions.length > 0}
          onAddToBranch={onAddToBranch}
          onMoveBranchAction={onMoveComponent}
          onMoveDown={() => onMoveComponent(rule.branch?.id ?? "", "down")}
          onMoveUp={() => onMoveComponent(rule.branch?.id ?? "", "up")}
          onRemove={() => onRemoveComponent(rule.branch?.id ?? "")}
          onRemoveBranchAction={onRemoveComponent}
          onSelect={onSelectComponent}
          selectedComponentId={selectedComponentId}
        />
      ) : null}

      {rule.actions.map((action, index) => (
        <RuleActionCard
          canMoveDown={index < rule.actions.length - 1}
          canMoveUp={index > 0}
          component={action}
          key={action.id}
          onMoveDown={() => onMoveComponent(action.id, "down")}
          onMoveUp={() => onMoveComponent(action.id, "up")}
          onRemove={() => onRemoveComponent(action.id)}
          onSelect={() => onSelectComponent(action.id)}
          selected={selectedComponentId === action.id}
        />
      ))}

      <div>
        <Button onClick={onAddComponent} size="sm" variant="secondary">
          <Plus aria-hidden="true" className="size-3.5" />
          Add component
        </Button>
      </div>
    </div>
  );
}
