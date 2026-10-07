import { Database, FileText, Users } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../ui";
import type { NavEntry, NavNodeKind } from "./types";

function EntryIcon({ icon, kind }: { icon: string | null; kind: NavNodeKind }) {
  if (icon) {
    return (
      <span aria-hidden="true" className="w-5 shrink-0 text-center text-ui leading-none">
        {icon}
      </span>
    );
  }
  const className = "size-4 shrink-0 text-ink-faint";
  if (kind === "container") return <Users aria-hidden="true" className={className} />;
  if (kind === "database") return <Database aria-hidden="true" className={className} />;
  return <FileText aria-hidden="true" className={className} />;
}

export interface NavEntryRowProps {
  entry: NavEntry;
  onOpen: (id: string) => void;
  /** Rendered at the end of the row, e.g. a time or a member count. */
  trailing?: ReactNode;
  className?: string;
}

/** One openable entry in a list on home or in recents. */
export function NavEntryRow({ entry, onOpen, trailing, className }: NavEntryRowProps) {
  return (
    <div className={cn("flex items-center gap-2 rounded-control px-2 hover:bg-sidebar-hover", className)}>
      <button
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => onOpen(entry.id)}
        type="button"
      >
        <EntryIcon icon={entry.icon} kind={entry.kind} />
        <span className="min-w-0 truncate text-ui text-ink">{entry.title}</span>
        {entry.containerName ? (
          <span className="hidden truncate text-tiny text-ink-faint sm:inline">in {entry.containerName}</span>
        ) : null}
      </button>
      {trailing ? <span className="shrink-0 text-tiny text-ink-faint">{trailing}</span> : null}
      {!trailing && entry.metaLabel ? (
        <span className="shrink-0 text-tiny text-ink-faint">{entry.metaLabel}</span>
      ) : null}
    </div>
  );
}
