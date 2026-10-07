import { ALargeSmall, ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, Keyboard, Plus } from "lucide-react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  cn,
} from "../../../ui";
import { insertGroups, type InsertKind } from "./blockCatalog";
import type { BlockMove } from "./types";

export interface TouchInsertBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (kind: InsertKind) => void;
  onMove: (move: BlockMove) => void;
  /** Opens the formatting controls for the current selection. */
  onFormat?: () => void;
  onDismissKeyboard?: () => void;
  className?: string;
}

/**
 * `BLOCK-003` on touch, as `NAV-006` requires: a labelled control above the
 * keyboard opens the same block list as a bottom sheet in two columns.
 */
export function TouchInsertBar({
  open,
  onOpenChange,
  onInsert,
  onMove,
  onFormat,
  onDismissKeyboard,
  className,
}: TouchInsertBarProps) {
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 border-t border-line bg-surface px-2 py-1.5",
          className,
        )}
      >
        <Button aria-label="Outdent this block" onClick={() => onMove({ kind: "outdent" })} size="icon" variant="ghost">
          <ChevronsLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button aria-label="Indent this block" onClick={() => onMove({ kind: "indent" })} size="icon" variant="ghost">
          <ChevronsRight aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label="Move this block up"
          onClick={() => onMove({ kind: "step", direction: "up" })}
          size="icon"
          variant="ghost"
        >
          <ArrowUp aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label="Move this block down"
          onClick={() => onMove({ kind: "step", direction: "down" })}
          size="icon"
          variant="ghost"
        >
          <ArrowDown aria-hidden="true" className="size-4" />
        </Button>

        <Button className="mx-1" onClick={() => onOpenChange(true)} size="sm" variant="subtle">
          <Plus aria-hidden="true" className="size-4" />
          Insert a block
        </Button>

        {onFormat ? (
          <Button aria-label="Format the selected text" onClick={onFormat} size="icon" variant="ghost">
            <ALargeSmall aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
        {onDismissKeyboard ? (
          <Button
            aria-label="Hide the keyboard"
            className="ml-auto"
            onClick={onDismissKeyboard}
            size="icon"
            variant="ghost"
          >
            <Keyboard aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>

      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent className="gap-0 overflow-y-auto p-4" side="bottom">
          <SheetHeader>
            <SheetTitle>Insert a block</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 pt-2">
            {insertGroups.map((group) => (
              <section key={group.id}>
                <h3 className="px-1 pb-1 text-micro font-medium tracking-wide text-ink-faint uppercase">
                  {group.heading}
                </h3>
                <ul className="grid grid-cols-2 gap-2">
                  {group.entries.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <li key={entry.kind}>
                        <button
                          className="flex w-full items-center gap-2 rounded-card border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover"
                          onClick={() => onInsert(entry.kind)}
                          type="button"
                        >
                          <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                          <span className="min-w-0">
                            <span className="block truncate text-ui font-medium text-ink">{entry.name}</span>
                            {entry.shortcut ? (
                              <span className="block text-tiny text-ink-faint">{entry.shortcut}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
