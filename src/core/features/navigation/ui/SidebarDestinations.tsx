import { Home, Inbox, MessageSquare, Search } from "lucide-react";
import type { ComponentType } from "react";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "../../../ui";
import type { NavDestinationId } from "./types";

const iconDestinations: { id: Exclude<NavDestinationId, "home">; label: string; Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }> }[] = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "search", label: "Search", Icon: Search },
];

export interface SidebarDestinationsProps {
  active: NavDestinationId | null;
  /** Unread notifications waiting in the inbox. */
  inboxUnread: number;
  onSelect: (id: NavDestinationId) => void;
}

export function SidebarDestinations({ active, inboxUnread, onSelect }: SidebarDestinationsProps) {
  const rowClass =
    "flex items-center justify-center rounded-control text-ink-muted hover:bg-sidebar-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <nav aria-label="Destinations" className="flex items-center gap-0.5 px-1">
      <button
        aria-current={active === "home" ? "page" : undefined}
        className={cn(rowClass, "h-7 gap-1.5 px-2 text-ui", active === "home" && "bg-sidebar-hover font-medium text-ink")}
        onClick={() => onSelect("home")}
        type="button"
      >
        <Home aria-hidden="true" className="size-4" />
        Home
      </button>

      {iconDestinations.map(({ id, label, Icon }) => {
        const unread = id === "inbox" ? inboxUnread : 0;
        const accessibleName = unread > 0 ? `${label}, ${unread} unread` : label;
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                aria-current={active === id ? "page" : undefined}
                aria-label={accessibleName}
                className={cn(rowClass, "relative size-7", active === id && "bg-sidebar-hover text-ink")}
                onClick={() => onSelect(id)}
                type="button"
              >
                <Icon aria-hidden="true" className="size-4" />
                {unread > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-micro leading-4 font-medium text-accent-ink"
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent>{accessibleName}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
