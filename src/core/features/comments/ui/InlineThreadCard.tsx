import { Check, Link2, MoreHorizontal, Trash2 } from "lucide-react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "../../../ui";
import { CommentThread, type CommentThreadProps } from "./CommentThread";
import { canComment } from "./types";

export interface InlineThreadCardProps extends Omit<CommentThreadProps, "className" | "collapseReplies"> {
  /**
   * Distance in pixels from the top of the body column to the thread's anchor. The card
   * floats beside the body aligned to it, so this is a genuinely dynamic value.
   */
  anchorOffset: number;
  /** Highlighted because the reader selected it in the discussions panel (`COMM-006`). */
  selected?: boolean;
  viewerAccess: AccessLevel;
  onCopyLink: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  className?: string;
}

/**
 * The floating card beside the body, aligned to its anchor, carrying the resolve tick
 * and the overflow menu (`COMM-001`, `COMM-007`).
 */
export function InlineThreadCard({
  anchorOffset,
  selected = false,
  onCopyLink,
  onDeleteThread,
  className,
  ...thread
}: InlineThreadCardProps) {
  const allowed = canComment(thread.viewerAccess);

  return (
    <div
      className={cn(
        "w-full rounded-card border bg-surface p-2.5 shadow-sm md:absolute md:right-0 md:w-panel",
        selected ? "border-accent ring-2 ring-accent/30" : "border-line",
        className,
      )}
      style={{ top: anchorOffset }}
    >
      <div className="mb-1 flex items-center justify-end gap-0.5">
        {allowed && thread.status === "open" ? (
          <Button
            aria-label="Resolve this thread"
            onClick={() => thread.onResolve(thread.threadId)}
            size="iconSm"
            variant="ghost"
          >
            <Check aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="More thread actions" size="iconSm" variant="ghost">
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onCopyLink(thread.threadId)}>
              <Link2 aria-hidden="true" className="size-3.5" />
              Copy link to thread
            </DropdownMenuItem>
            {thread.status === "resolved" && allowed ? (
              <DropdownMenuItem onSelect={() => thread.onReopen(thread.threadId)}>Reopen thread</DropdownMenuItem>
            ) : null}
            {allowed ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDeleteThread(thread.threadId)}>
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Delete thread
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommentThread {...thread} />
    </div>
  );
}
