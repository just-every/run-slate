import {
  AtSign,
  Bot,
  Check,
  Globe,
  KeyRound,
  MessageSquare,
  Reply,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type { ComponentType } from "react";
import { Avatar, AvatarFallback, AvatarImage, cn } from "../../../ui";
import { notificationKindCopy, type NotificationEntry, type NotificationKind } from "./types";

/** One glyph per `NOTIF-001` event, so the kind never rests on colour alone. */
const kindIcon: Record<NotificationKind, ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>> = {
  mention: AtSign,
  comment: MessageSquare,
  reply: Reply,
  "page-published": Globe,
  "page-republished": Globe,
  "verification-lapsed": ShieldAlert,
  "access-granted": KeyRound,
  "ai-review": Bot,
  "ai-failed": TriangleAlert,
};

/**
 * `NOTIF-001`, `NOTIF-002` — one inbox entry: who acted, what happened, the
 * page it happened on, the quoted snippet where the event has one, the time, an
 * unread dot and a resolved marker.
 *
 * Design decision: the whole entry is one button. Opening it marks it read and
 * opens the referenced record at the referenced comment, which is a single act,
 * so it gets a single control rather than a row of competing links.
 */
export interface NotificationRowProps {
  entry: NotificationEntry;
  onOpen: (entry: NotificationEntry) => void;
  className?: string;
}

export function NotificationRow({ entry, onOpen, className }: NotificationRowProps) {
  const copy = notificationKindCopy[entry.kind];
  const Icon = kindIcon[entry.kind];
  const line = entry.actor ? `${entry.actor.name} ${copy.event}` : copy.systemEvent;

  return (
    <li>
      <button
        className={cn(
          "flex w-full items-start gap-2.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover",
          className,
        )}
        onClick={() => onOpen(entry)}
        type="button"
      >
        {entry.actor ? (
          <Avatar className="mt-0.5 size-6">
            {entry.actor.imageUrl ? <AvatarImage alt="" src={entry.actor.imageUrl} /> : null}
            <AvatarFallback>{entry.actor.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-hover">
            <Icon aria-hidden="true" className="size-3.5 text-ink-muted" />
          </span>
        )}

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-1.5 text-ui text-ink">
            <Icon aria-hidden="true" className="size-3.5 shrink-0 self-center text-ink-faint" />
            <span className="text-ink-muted">{line}</span>
            <span className="font-medium text-ink">{entry.pageTitle}</span>
          </span>

          {entry.pageTrail.length > 0 ? (
            <span className="truncate text-tiny text-ink-faint">{entry.pageTrail.join(" / ")}</span>
          ) : null}

          {entry.snippet ? (
            <span className="mt-0.5 border-l-2 border-line pl-2 text-tiny text-ink-muted">
              &ldquo;{entry.snippet}&rdquo;
            </span>
          ) : null}

          {entry.resolved ? (
            <span className="mt-0.5 flex items-center gap-1 text-tiny text-good">
              <Check aria-hidden="true" className="size-3.5" />
              Thread resolved
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-tiny whitespace-nowrap text-ink-faint">{entry.timeLabel}</span>
          {entry.read ? (
            <span className="text-micro text-ink-faint">Read</span>
          ) : (
            <span className="flex items-center gap-1 text-micro text-accent">
              <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
              Unread
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
