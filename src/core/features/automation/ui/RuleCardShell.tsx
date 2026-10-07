import { ArrowDown, ArrowUp, MoreHorizontal, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "../../../ui";

/**
 * The card body every rail component shares (`AUTO-001`).
 *
 * Design decision: the card is a real button and the reorder menu is its
 * sibling, never its child — a button inside a button is invalid and breaks
 * keyboard traversal. Reordering is therefore reachable from the keyboard
 * through the menu rather than through a drag handle, which has no keyboard
 * equivalent.
 */
export interface RuleCardShellProps {
  /** "When", "If", "Then", or the branch's own label. */
  prefix: string;
  title: string;
  /** The card's own one-line summary of what it does. */
  summary: string;
  icon: ReactNode;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Omitted where the component may not be removed — a rule keeps its trigger. */
  onRemove?: () => void;
  /** A quiet note under the summary, e.g. an action the actor may not perform. */
  note?: ReactNode;
  className?: string;
}

export function RuleCardShell({
  prefix,
  title,
  summary,
  icon,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
  note,
  className,
}: RuleCardShellProps) {
  const label = `${prefix}: ${title}`;

  return (
    <div
      className={cn(
        "flex w-full items-start gap-1 rounded-card border bg-surface transition-colors",
        selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong",
        className,
      )}
    >
      <button
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-card px-3 py-2.5 text-left"
        onClick={onSelect}
        type="button"
      >
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-control bg-sidebar-hover text-ink-muted">
          {icon}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-ui font-medium text-ink">{label}</span>
          <span className="text-tiny text-ink-muted">{summary}</span>
          {note}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={`Reorder or remove ${label}`} className="mt-1.5 mr-1.5" size="iconSm" variant="ghost">
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
            <ArrowUp aria-hidden="true" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
            <ArrowDown aria-hidden="true" />
            Move down
          </DropdownMenuItem>
          {onRemove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-danger" onSelect={onRemove}>
                <Trash2 aria-hidden="true" />
                Remove
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
