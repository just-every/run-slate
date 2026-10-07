import { MessageSquare, Star } from "lucide-react";
import type { ReactNode } from "react";
import { AvatarStack, Button, cn } from "../../../ui";
import type { PagePerson } from "./types";

/**
 * The thin bar over an open page. It carries the trail, the status chip slot
 * (`STAT-005` under `verification-only`), when the page was last edited, the
 * avatar stack of who else has it open — which is the whole of what `SAVE-006`
 * permits — and slots for share, comments, favourite (`PAGE-008`) and the
 * overflow menu.
 */
export function PageHeaderBar({
  breadcrumbSlot,
  statusSlot,
  lastEditedLabel,
  alsoOpen = [],
  commentsOpen = false,
  commentCount = 0,
  onToggleComments,
  isFavourite = false,
  onToggleFavourite,
  shareSlot,
  actionsSlot,
  className,
}: {
  breadcrumbSlot: ReactNode;
  statusSlot?: ReactNode;
  lastEditedLabel?: string | null;
  alsoOpen?: readonly PagePerson[];
  commentsOpen?: boolean;
  commentCount?: number;
  onToggleComments?: () => void;
  isFavourite?: boolean;
  onToggleFavourite?: () => void;
  shareSlot?: ReactNode;
  actionsSlot?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-line bg-canvas px-2 sm:px-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {breadcrumbSlot}
        {statusSlot ? <div className="shrink-0">{statusSlot}</div> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {lastEditedLabel ? (
          <span className="hidden text-tiny text-ink-faint md:inline">{lastEditedLabel}</span>
        ) : null}

        {alsoOpen.length > 0 ? <AvatarStack className="ml-1" people={alsoOpen} /> : null}

        {shareSlot}

        {onToggleComments ? (
          <Button
            aria-label={commentCount === 1 ? "1 comment" : `${commentCount} comments`}
            aria-pressed={commentsOpen}
            className={commentsOpen ? "bg-sidebar-hover text-ink" : undefined}
            onClick={onToggleComments}
            size="icon"
            variant="ghost"
          >
            <MessageSquare aria-hidden="true" className="size-4" />
            {commentCount > 0 ? <span className="sr-only">{commentCount}</span> : null}
          </Button>
        ) : null}

        {onToggleFavourite ? (
          <Button
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={isFavourite}
            onClick={onToggleFavourite}
            size="icon"
            variant="ghost"
          >
            <Star
              aria-hidden="true"
              className={cn("size-4", isFavourite ? "fill-warn text-warn" : undefined)}
            />
          </Button>
        ) : null}

        {actionsSlot}
      </div>
    </header>
  );
}
