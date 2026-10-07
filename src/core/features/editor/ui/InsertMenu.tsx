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
export function InsertMenu({ open, query, onQueryChange, onInsert, onClose, suggested = [], className }: InsertMenuProps) {
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
      className={cn(
        "w-80 overflow-hidden rounded-card border border-line bg-surface shadow-[0_16px_48px_rgb(15_15_15/0.16)]",
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
