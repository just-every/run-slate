import { Database, Plus } from "lucide-react";
import { Button, cn } from "../../../ui";
import { RuleActionCard } from "./RuleActionCard";
import { RuleConditionCard } from "./RuleConditionCard";
import { RuleTriggerCard } from "./RuleTriggerCard";
import { plural, recordNoun } from "./nouns";
import type { RuleDefinition } from "./types";

/**
 * `AUTO-005` under `source` — one When-and-Do form.
 *
 * The scope selector, the site option, the branch rail and the cross-container
 * rule list are all absent here, because the rule belongs to the one database
 * it was created from. Its scope is still stored, so the same rule read under
 * `container` or `site` shows everything it carries.
 */
export interface RuleSourceFormProps {
  rule: RuleDefinition;
  selectedComponentId: string | null;
  onSelectComponent: (componentId: string) => void;
  onMoveComponent: (componentId: string, direction: "up" | "down") => void;
  onRemoveComponent: (componentId: string) => void;
  onAddCondition: () => void;
  onAddAction: () => void;
  className?: string;
}

export function RuleSourceForm({
  rule,
  selectedComponentId,
  onSelectComponent,
  onMoveComponent,
  onRemoveComponent,
  onAddCondition,
  onAddAction,
  className,
}: RuleSourceFormProps) {
  return (
    <div className={cn("flex w-full max-w-reading flex-col gap-4", className)}>
      <p className="flex items-start gap-1.5 text-tiny text-ink-muted">
        <Database aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>
          This rule belongs to <span className="font-medium text-ink">{rule.scopeTargetLabel}</span> and runs on its{" "}
          {plural(recordNoun)} only.
        </span>
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="text-tiny font-medium text-ink">When</h3>
        <RuleTriggerCard
          component={rule.trigger}
          onSelect={() => onSelectComponent(rule.trigger.id)}
          selected={selectedComponentId === rule.trigger.id}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-tiny font-medium text-ink">Only if</h3>
        {rule.conditions.length === 0 ? (
          <p className="text-tiny text-ink-muted">No conditions. Every trigger runs the actions below.</p>
        ) : (
          rule.conditions.map((condition, index) => (
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
          ))
        )}
        <div>
          <Button onClick={onAddCondition} size="sm" variant="ghost">
            <Plus aria-hidden="true" className="size-3.5" />
            Add a condition
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-tiny font-medium text-ink">Do</h3>
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
            prefix="Do"
            selected={selectedComponentId === action.id}
          />
        ))}
        <div>
          <Button onClick={onAddAction} size="sm" variant="ghost">
            <Plus aria-hidden="true" className="size-3.5" />
            Add an action
          </Button>
        </div>
      </section>
    </div>
  );
}
