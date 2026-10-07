import { Filter } from "lucide-react";
import { RuleCardShell } from "./RuleCardShell";
import type { RuleConditionComponent } from "./types";

/** `AUTO-001` — one of the rule's ordered conditions. */
export interface RuleConditionCardProps {
  component: RuleConditionComponent;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  className?: string;
}

export function RuleConditionCard({
  component,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
  className,
}: RuleConditionCardProps) {
  return (
    <RuleCardShell
      canMoveDown={canMoveDown}
      canMoveUp={canMoveUp}
      className={className}
      icon={<Filter aria-hidden="true" className="size-3.5" />}
      onMoveDown={onMoveDown}
      onMoveUp={onMoveUp}
      onRemove={onRemove}
      onSelect={onSelect}
      prefix="If"
      selected={selected}
      summary={component.summary}
      title={component.label}
    />
  );
}
