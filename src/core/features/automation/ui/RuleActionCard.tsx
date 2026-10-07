import { CircleSlash, Play } from "lucide-react";
import { RuleCardShell } from "./RuleCardShell";
import { memberNoun } from "./nouns";
import { ruleActionKindLabel, type RuleActionComponent } from "./types";

/**
 * `AUTO-001`, `AUTO-002` — one of the rule's ordered actions. An action beyond
 * the actor's access is not hidden and not silently dropped: the card says it
 * will be skipped and logged when the rule runs.
 */
export interface RuleActionCardProps {
  component: RuleActionComponent;
  /** "Then" on the trunk; the branch passes its own prefix. */
  prefix?: string;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  className?: string;
}

export function RuleActionCard({
  component,
  prefix = "Then",
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
  className,
}: RuleActionCardProps) {
  return (
    <RuleCardShell
      canMoveDown={canMoveDown}
      canMoveUp={canMoveUp}
      className={className}
      icon={<Play aria-hidden="true" className="size-3.5" />}
      note={
        component.exceedsActorAccess ? (
          <span className="mt-1 flex items-center gap-1.5 text-tiny text-warn">
            <CircleSlash aria-hidden="true" className="size-3.5 shrink-0" />
            Beyond this {memberNoun}&rsquo;s access. It is skipped and logged rather than performed.
          </span>
        ) : null
      }
      onMoveDown={onMoveDown}
      onMoveUp={onMoveUp}
      onRemove={onRemove}
      onSelect={onSelect}
      prefix={prefix}
      selected={selected}
      summary={component.summary}
      title={ruleActionKindLabel[component.kind]}
    />
  );
}
