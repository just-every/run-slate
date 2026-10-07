import { GitBranch, Plus } from "lucide-react";
import { Button, cn } from "../../../ui";
import { RuleActionCard } from "./RuleActionCard";
import { RuleCardShell } from "./RuleCardShell";
import type { RuleBranch } from "./types";

/**
 * `AUTO-001` — the optional branch over related records, and the actions that
 * run inside it.
 *
 * Design decision: the branch is drawn as an indented, labelled limb off the
 * trunk rather than a nested canvas. Its label is a real heading so the reading
 * order of the rail matches its shape.
 */
export interface RuleBranchCardProps {
  branch: RuleBranch;
  selectedComponentId: string | null;
  onSelect: (componentId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  onMoveBranchAction: (actionId: string, direction: "up" | "down") => void;
  onRemoveBranchAction: (actionId: string) => void;
  onAddToBranch: () => void;
  className?: string;
}

export function RuleBranchCard({
  branch,
  selectedComponentId,
  onSelect,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMoveBranchAction,
  onRemoveBranchAction,
  onAddToBranch,
  className,
}: RuleBranchCardProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h4 className="text-micro font-medium tracking-wide text-ink-faint uppercase">Branch</h4>
      <RuleCardShell
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        icon={<GitBranch aria-hidden="true" className="size-3.5" />}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        onRemove={onRemove}
        onSelect={() => onSelect(branch.id)}
        prefix="For each"
        selected={selectedComponentId === branch.id}
        summary={branch.summary}
        title={branch.label}
      />
      <div className="ml-4 flex flex-col gap-2 border-l border-line pl-4">
        {branch.actions.map((action, index) => (
          <RuleActionCard
            canMoveDown={index < branch.actions.length - 1}
            canMoveUp={index > 0}
            component={action}
            key={action.id}
            onMoveDown={() => onMoveBranchAction(action.id, "down")}
            onMoveUp={() => onMoveBranchAction(action.id, "up")}
            onRemove={() => onRemoveBranchAction(action.id)}
            onSelect={() => onSelect(action.id)}
            prefix="In the branch"
            selected={selectedComponentId === action.id}
          />
        ))}
        <div>
          <Button onClick={onAddToBranch} size="sm" variant="secondary">
            <Plus aria-hidden="true" className="size-3.5" />
            Add to branch
          </Button>
        </div>
      </div>
    </div>
  );
}
