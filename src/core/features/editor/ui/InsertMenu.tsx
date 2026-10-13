import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "../../../ui";
import { filterInsertGroups, findInsertEntries, type InsertEntry, type InsertKind } from "./blockCatalog";

export interface InsertMenuProps {
  open: boolean;
  anchor?: HTMLElement | Range;
  query: string;
  onQueryChange: (query: string) => void;
  onInsert: (kind: InsertKind) => void;
  onClose: () => void;
  /** Offered first, above the grouped list. */
  suggested?: InsertKind[];
  className?: string;
}

function Row({ entry, onInsert }: { entry: InsertEntry; onInsert: (kind: InsertKind) => void }) {
  const Icon = entry.icon;
  return (
    <CommandItem hint={entry.shortcut} onSelect={() => onInsert(entry.kind)} value={entry.kind}>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
      {entry.name}
    </CommandItem>
  );
}

/**
 * `BLOCK-003` — the insert menu at the cursor: grouped by kind, filtered by
 * what is typed, navigable and selectable by keyboard alone, and every block
 * type this contract names is reachable from it.
 */
export function InsertMenu({ open, anchor, query, onQueryChange, onInsert, onClose, suggested = [], className }: InsertMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({position:"fixed",zIndex:60,left:8,top:8});
  useLayoutEffect(() => {
    if (!open || !anchor || !menu.current) return;
    const update = () => {
      const rect=anchor.getBoundingClientRect();
      const viewport=window.visualViewport;
      const left=viewport?.offsetLeft ?? 0, top=viewport?.offsetTop ?? 0;
      const width=viewport?.width ?? window.innerWidth, height=viewport?.height ?? window.innerHeight;
      const popup=menu.current!;
      const list=popup.querySelector<HTMLElement>('[role="listbox"]');
      const desiredHeight=list ? Math.min(list.scrollHeight,parseFloat(getComputedStyle(list).maxHeight)||list.scrollHeight)+popup.offsetHeight-list.offsetHeight : popup.scrollHeight;
      const availableBelow=Math.max(0,top+height-8-rect.bottom-6);
      const availableAbove=Math.max(0,rect.top-6-top-8);
      const placeBelow=availableBelow>=desiredHeight || availableBelow>=availableAbove;
      const maximumHeight=Math.max(0,Math.min(height-16,placeBelow?availableBelow:availableAbove));
      const menuWidth=Math.min(320,width-16), menuHeight=Math.min(desiredHeight,maximumHeight);
      const y=placeBelow ? rect.bottom+6 : rect.top-menuHeight-6;
      setPosition({position:"fixed",zIndex:60,width:menuWidth,maxHeight:maximumHeight,left:Math.max(left+8,Math.min(rect.left,left+width-menuWidth-8)),top:Math.max(top+8,Math.min(y,top+height-menuHeight-8))});
    };
    update();
    const observer=new ResizeObserver(update);
    observer.observe(menu.current);
    window.addEventListener("scroll",update,true);
    window.addEventListener("resize",update);
    window.visualViewport?.addEventListener("resize",update);
    window.visualViewport?.addEventListener("scroll",update);
    return () => {observer.disconnect();window.removeEventListener("scroll",update,true);window.removeEventListener("resize",update);window.visualViewport?.removeEventListener("resize",update);window.visualViewport?.removeEventListener("scroll",update);};
  }, [open, anchor]);
  if (!open) return null;

  const groups = filterInsertGroups(query);
  const suggestedEntries =
    query.trim().length === 0
      ? findInsertEntries(suggested)
      : findInsertEntries(suggested).filter((entry) =>
          entry.name.toLowerCase().includes(query.trim().toLowerCase()),
        );
  const empty = groups.length === 0 && suggestedEntries.length === 0;

  return (
    <div
      ref={menu}
      style={anchor ? position : undefined}
      className={cn(
        "insert-menu w-80 overflow-hidden rounded-card border border-line bg-surface shadow-[0_16px_48px_rgb(15_15_15/0.16)]",
        className,
      )}
    >
      <Command label="Insert a block" onEscape={onClose}>
        <CommandInput
          autoFocus
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Type to search"
          value={query}
        />
        <CommandList>
          {suggestedEntries.length > 0 ? (
            <CommandGroup heading="Suggested">
              {suggestedEntries.map((entry) => (
                <Row entry={entry} key={`suggested-${entry.kind}`} onInsert={onInsert} />
              ))}
            </CommandGroup>
          ) : null}

          {groups.map((group) => (
            <CommandGroup heading={group.heading} key={group.id}>
              {group.entries.map((entry) => (
                <Row entry={entry} key={entry.kind} onInsert={onInsert} />
              ))}
            </CommandGroup>
          ))}

          {empty ? <CommandEmpty>No block matches “{query}”.</CommandEmpty> : null}
        </CommandList>
      </Command>

      <div className="border-t border-line">
        <button
          className="flex w-full items-center justify-between px-3 py-2 text-ui text-ink-muted transition-colors hover:bg-sidebar-hover hover:text-ink"
          onClick={onClose}
          type="button"
        >
          Close menu
          <span className="text-tiny text-ink-faint">esc</span>
        </button>
      </div>
    </div>
  );
}
