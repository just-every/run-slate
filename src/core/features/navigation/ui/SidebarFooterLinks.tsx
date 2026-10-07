import { CircleHelp, Library, Trash2 } from "lucide-react";
import { cn } from "../../../ui";
import type { NavFooterId } from "./types";

const links: { id: NavFooterId; label: string; Icon: typeof Library }[] = [
  { id: "library", label: "Library", Icon: Library },
  { id: "trash", label: "Trash", Icon: Trash2 },
  { id: "help", label: "Help", Icon: CircleHelp },
];

export interface SidebarFooterLinksProps {
  active?: NavFooterId | null;
  onSelect: (id: NavFooterId) => void;
}

/** Library, trash (ARCH-005) and help sit at the foot of the one sidebar. */
export function SidebarFooterLinks({ active, onSelect }: SidebarFooterLinksProps) {
  return (
    <nav aria-label="Workspace tools" className="flex flex-col gap-0.5 px-1">
      {links.map(({ id, label, Icon }) => (
        <button
          aria-current={active === id ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-control px-1.5 py-1 text-left text-ui text-ink-muted hover:bg-sidebar-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
            active === id && "bg-sidebar-hover font-medium text-ink",
          )}
          key={id}
          onClick={() => onSelect(id)}
          type="button"
        >
          <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
          {label}
        </button>
      ))}
    </nav>
  );
}
