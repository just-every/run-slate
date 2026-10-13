import { ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";
import type { BlockMove } from "./types";

export interface BlockHandleProps {
  /** Names this block for a screen reader: its first words, or its type. */
  blockLabel: string;
  canEdit: boolean;
  onInsert: (anchor: HTMLElement) => void;
  onMove: (move: BlockMove) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * `BLOCK-001` with `NAV-006`: the handle is a real button with an accessible
 * name and a keyboard menu, because a hover-only drag target cannot be reached
 * on a touch client or from the keyboard.
 */
export function BlockHandle({
  blockLabel,
  canEdit,
  onInsert,
  onMove,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
}: BlockHandleProps) {
  if (!canEdit) return <div aria-hidden="true" className="block-gutter w-12" />;

  return (
    <div className="block-gutter flex w-12 shrink-0 items-start justify-end gap-0.5 pt-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100">
      <Button
        aria-label={`Insert a block after ${blockLabel}`}
        onClick={(event) => onInsert(event.currentTarget)}
        size="iconSm"
        variant="ghost"
      >
        <Plus aria-hidden="true" className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Block actions for ${blockLabel}`}
            draggable
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            size="iconSm"
            variant="ghost"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onSelect={() => onMove({ kind: "step", direction: "up" })}>
            <ArrowUp aria-hidden="true" className="size-3.5" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove({ kind: "step", direction: "down" })}>
            <ArrowDown aria-hidden="true" className="size-3.5" />
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove({ kind: "indent" })} shortcut="Tab">
            <ChevronsRight aria-hidden="true" className="size-3.5" />
            Indent
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove({ kind: "outdent" })} shortcut="Shift Tab">
            <ChevronsLeft aria-hidden="true" className="size-3.5" />
            Outdent
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy aria-hidden="true" className="size-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDelete}>
            <Trash2 aria-hidden="true" className="size-3.5 text-danger" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
