import { Search } from "lucide-react";
import { useId } from "react";
import { Input, cn } from "../../../ui";
import { SettingsSection } from "./SettingsSection";
import type { ShortcutGroup } from "./types";

/**
 * `WORK-014` — one reference listing every keyboard shortcut and every typed
 * formatting shortcut the editor accepts, searchable, and reachable from
 * anywhere in the operator app by a single shortcut.
 *
 * The caller supplies the list the editor actually implements; this surface
 * invents no entry and hides none.
 */
export function ShortcutReference({
  groups,
  query,
  onQueryChange,
  openShortcut,
  className,
}: {
  groups: readonly ShortcutGroup[];
  query: string;
  onQueryChange: (next: string) => void;
  /** The one shortcut that opens this reference from anywhere, e.g. "Ctrl /". */
  openShortcut: string;
  className?: string;
}) {
  const searchId = useId();
  const needle = query.trim().toLowerCase();
  const filtered = groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (entry) =>
          needle.length === 0 ||
          entry.label.toLowerCase().includes(needle) ||
          entry.keys.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.entries.length > 0);

  const total = filtered.reduce((count, group) => count + group.entries.length, 0);

  return (
    <SettingsSection
      className={className}
      description={
        <>
          Press <Keys keys={openShortcut} /> anywhere in the app to open this list.
        </>
      }
      title="Shortcuts"
    >
      <div className="flex max-w-96 flex-col gap-1">
        <label className="text-tiny font-medium text-ink-muted" htmlFor={searchId}>
          Search shortcuts
        </label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-4 text-ink-faint" />
          <Input
            className="pl-8"
            id={searchId}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Bold, heading, checklist"
            type="search"
            value={query}
          />
        </div>
      </div>

      {total === 0 ? (
        <p className="py-6 text-ui text-ink-muted" role="status">
          No shortcut matches this search.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {filtered.map((group) => (
            <section className="flex flex-col gap-1" key={group.id}>
              <h3 className="text-ui font-medium text-ink">{group.title}</h3>
              <p className="text-tiny text-ink-muted">
                {group.kind === "typed"
                  ? "Typed as you write. One undo reverses a formatting conversion."
                  : "Pressed together."}
              </p>
              <ul className="mt-1 flex flex-col">
                {group.entries.map((entry) => (
                  <li
                    className="flex items-center justify-between gap-4 border-b border-line py-1.5 last:border-b-0"
                    key={entry.id}
                  >
                    <span className="text-ui text-ink">{entry.label}</span>
                    <Keys keys={entry.keys} typed={group.kind === "typed"} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

function Keys({ keys, typed = false }: { keys: string; typed?: boolean }) {
  return (
    <kbd
      className={cn(
        "rounded-control border border-line-strong bg-sidebar px-1.5 py-0.5 text-tiny whitespace-nowrap text-ink-muted",
        typed && "font-mono",
      )}
    >
      {keys}
    </kbd>
  );
}
