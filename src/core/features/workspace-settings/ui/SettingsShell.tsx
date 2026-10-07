import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button, cn } from "../../../ui";
import { containerNoun } from "./nouns";
import type { SettingsNavGroup } from "./types";

/**
 * `WORK-011` — the navigation of the workspace settings shell. It holds
 * workspace identity, members, groups, guests, the status vocabulary, the
 * published-page and guest switches, connected services, AI, import and export.
 *
 * There is no billing group, no plan, no trial and no marketplace: this product
 * has no plan ladder, so no setting in it can be gated by one.
 */
export const workspaceSettingsNav: readonly SettingsNavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "identity", label: "Identity" },
      { id: "members", label: "Members" },
      { id: "groups", label: "Groups" },
      { id: "guests", label: "Guests" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { id: "status-vocabulary", label: "Status vocabulary" },
      { id: "external-access", label: "External access" },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    items: [
      { id: "connected-services", label: "Connected services" },
      { id: "ai", label: "AI" },
      { id: "identity-provider", label: "Sign-in" },
    ],
  },
  {
    id: "you",
    label: "You",
    items: [
      { id: "theme", label: "Theme" },
      { id: "shortcuts", label: "Shortcuts" },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [
      { id: "import", label: "Import" },
      { id: "export", label: "Export" },
    ],
  },
];

/**
 * `WORK-011` — workspace settings are their own shell with their own
 * navigation, separate from a container's settings shell (`CONT-004`). The
 * separation is stated on screen, because the two shells hold switches that
 * read alike.
 */
export function SettingsShell({
  groups,
  selectedId,
  onSelect,
  onClose,
  children,
  className,
}: {
  groups: readonly SettingsNavGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose?: () => void;
  /** The selected section's pane. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-full flex-col bg-canvas md:flex-row", className)}>
      <nav
        aria-label="Workspace settings"
        className="flex shrink-0 flex-col gap-4 border-b border-line bg-sidebar px-3 py-4 md:w-60 md:border-r md:border-b-0 md:px-2 md:py-5"
      >
        <p className="px-2 text-ui font-semibold text-ink md:px-2">Workspace settings</p>
        <div className="flex gap-4 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0">
          {groups.map((group) => (
            <div className="flex shrink-0 flex-col gap-0.5 md:shrink" key={group.id}>
              <p className="px-2 py-1 text-micro font-medium tracking-wide text-ink-faint uppercase">{group.label}</p>
              <ul className="flex gap-0.5 md:flex-col">
                {group.items.map((item) => {
                  const selected = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "w-full rounded-control px-2 py-1 text-left text-ui whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                          selected ? "bg-sidebar-hover font-medium text-ink" : "text-ink-muted hover:bg-sidebar-hover",
                        )}
                        onClick={() => onSelect(item.id)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="hidden max-w-56 px-2 text-tiny text-ink-faint md:block">
          These settings cover the whole workspace. Each {containerNoun} has its own settings, reached from the{" "}
          {containerNoun} itself; a change here never changes one there.
        </p>
      </nav>

      <div className="min-w-0 flex-1">
        {onClose ? (
          <div className="flex justify-end px-4 pt-3 md:px-8">
            <Button aria-label="Close settings" onClick={onClose} size="icon" variant="ghost">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-wide px-4 py-6 md:px-8 md:py-8">{children}</div>
        <p className="mx-auto w-full max-w-wide px-4 pb-8 text-tiny text-ink-faint md:hidden">
          These settings cover the whole workspace. Each {containerNoun} has its own settings; a change here never
          changes one there.
        </p>
      </div>
    </div>
  );
}
