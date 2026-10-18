import { cn } from "../../../ui";
import type { PageOutlineHeading } from "./types";

/**
 * `PAGE-010` — the outline built from a page's headings. Selecting an entry
 * scrolls to that heading. A page with no headings shows no outline at all
 * rather than an empty one, so this returns nothing when the list is empty.
 */
const indentClass: Record<1 | 2 | 3, string> = {
  1: "pl-0",
  2: "pl-3",
  3: "pl-6",
};

const weightClass: Record<1 | 2 | 3, string> = {
  1: "font-medium",
  2: "",
  3: "text-tiny",
};

export function PageOutline({
  headings,
  activeId = null,
  onSelectHeading,
  title = "On this page",
  className,
}: {
  headings: readonly PageOutlineHeading[];
  activeId?: string | null;
  onSelectHeading: (headingId: string) => void;
  title?: string;
  className?: string;
}) {
  if (headings.length === 0) return null;

  return (
    <nav aria-label="Page outline" className={cn("flex flex-col gap-1", className)}>
      <p className="px-2 text-micro font-medium tracking-wide text-ink-faint uppercase">{title}</p>
      <ul className="flex flex-col">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id}>
              <button
                aria-current={active ? "location" : undefined}
                className={cn(
                  "block w-full break-words rounded-control py-1 pr-2 text-left text-ui transition-colors",
                  indentClass[heading.level],
                  weightClass[heading.level],
                  active ? "bg-sidebar-hover text-ink" : "text-ink-muted hover:bg-sidebar-hover hover:text-ink",
                )}
                onClick={() => onSelectHeading(heading.id)}
                type="button"
              >
                <span className={cn("border-l-2 pl-2", active ? "border-ink" : "border-transparent")}>
                  {heading.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
