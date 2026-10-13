import { GitCompare, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, cn } from "../../../ui";
import type { ConflictChoice, RevisionConflict } from "./types";

export interface BlockConflictBadgeProps {
  conflict: RevisionConflict;
  onChoose: (choice: ConflictChoice) => void;
  className?: string;
}

/**
 * The block-grain form of `SAVE-003`: a body edit carries the block's revision,
 * so a conflict is caught and offered on the block, not on the whole page.
 */
export function BlockConflictBadge({ conflict, onChoose, className }: BlockConflictBadgeProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-card border border-warn/40 bg-warn-soft px-2.5 py-1.5",
        className,
      )}
      role="alert"
    >
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warn" />
      <p className="text-tiny text-ink">
        {conflict.byMemberName} saved this block {conflict.atLabel}. Your draft is kept and nothing was merged.
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button onClick={() => onChoose("compare")} size="sm" variant="ghost">
          <GitCompare aria-hidden="true" className="size-3.5" />
          Compare
        </Button>
        <Button onClick={() => onChoose("reload")} size="sm" variant="ghost">
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Reload theirs
        </Button>
        <Button onClick={() => onChoose("overwrite")} size="sm" variant="secondary">
          Overwrite with mine
        </Button>
      </div>
    </div>
  );
}
