import { Zap } from "lucide-react";
import { RuleCardShell } from "./RuleCardShell";
import { ruleTriggerKindLabel, type RuleTriggerComponent } from "./types";

/**
 * `AUTO-001` — the trigger card. A rule has exactly one trigger, so the card
 * offers no remove and both move items sit disabled: the bound is stated by the
 * control rather than hidden from the keyboard.
 */
export interface RuleTriggerCardProps {
  component: RuleTriggerComponent;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}

export function RuleTriggerCard({ component, selected, onSelect, className }: RuleTriggerCardProps) {
  return (
    <RuleCardShell
      canMoveDown={false}
      canMoveUp={false}
      className={className}
      icon={<Zap aria-hidden="true" className="size-3.5" />}
      onMoveDown={() => undefined}
      onMoveUp={() => undefined}
      onSelect={onSelect}
      prefix="When"
      selected={selected}
      summary={component.summary}
      title={ruleTriggerKindLabel[component.kind]}
    />
  );
}
