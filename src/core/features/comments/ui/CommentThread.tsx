import { ChevronDown, ChevronRight, CircleCheck, MessageSquare, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { AccessLevel } from "../../../shared/knowledge/model";
import { Badge, Button, cn } from "../../../ui";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { OrphanedThreadNotice } from "./OrphanedThreadNotice";
import { canComment, type CommentAnchor, type CommentRecord, type CommentThreadStatus } from "./types";

export interface CommentThreadProps {
  threadId: string;
  /** COMM-001 — an inline anchor on a selection, or the page as a whole. */
  anchor: CommentAnchor;
  status: CommentThreadStatus;
  /** COMM-001 — chronological, oldest first. */
  comments: readonly CommentRecord[];
  viewerAccess: AccessLevel;
  /** Collapse replies behind a disclosure below the first comment. */
  collapseReplies?: boolean;
  onReply: (threadId: string, body: string) => void | Promise<void>;
  onResolve: (threadId: string) => void;
  onReopen: (threadId: string) => void;
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onAddReaction: (commentId: string) => void;
  onMention: () => void;
  onAttach: () => void;
  onOpenRevision: (revisionId: string) => void;
  className?: string;
}

/** COMM-001, COMM-005, COMM-007 — one thread of either anchor. */
export function CommentThread({
  threadId,
  anchor,
  status,
  comments,
  viewerAccess,
  collapseReplies = false,
  onReply,
  onResolve,
  onReopen,
  onEditComment,
  onDeleteComment,
  onToggleReaction,
  onAddReaction,
  onMention,
  onAttach,
  onOpenRevision,
  className,
}: CommentThreadProps) {
  const [repliesShown, setRepliesShown] = useState(!collapseReplies);
  const allowed = canComment(viewerAccess);
  const [first, ...replies] = comments;
  const orphan = anchor.kind === "inline" ? anchor.orphanedIn : null;

  return (
    <section
      aria-label={anchor.kind === "inline" ? `Thread on “${anchor.quotedText}”` : `Thread on ${anchor.pageTitle}`}
      className={cn("flex flex-col gap-2", className)}
    >
      <header className="flex items-center gap-1.5">
        {anchor.kind === "page" ? (
          <span className="flex items-center gap-1 text-tiny text-ink-muted">
            <MessageSquare aria-hidden="true" className="size-3.5" />
            On the whole page
          </span>
        ) : (
          <span className="text-tiny text-ink-muted">Anchored in the body</span>
        )}
        <Badge className="ml-auto" tone={status === "resolved" ? "good" : "neutral"}>
          {status === "resolved" ? "Resolved" : "Open"}
        </Badge>
        {allowed ? (
          status === "resolved" ? (
            <Button onClick={() => onReopen(threadId)} size="sm" variant="ghost">
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Reopen
            </Button>
          ) : (
            <Button onClick={() => onResolve(threadId)} size="sm" variant="ghost">
              <CircleCheck aria-hidden="true" className="size-3.5" />
              Resolve
            </Button>
          )
        ) : null}
      </header>

      {anchor.kind === "inline" ? (
        orphan ? (
          <OrphanedThreadNotice onOpenRevision={onOpenRevision} quotedText={anchor.quotedText} revision={orphan} />
        ) : (
          <blockquote className="rounded-control border border-line bg-sidebar px-2.5 py-1.5 text-tiny text-ink-muted">
            <span className="bg-hl-yellow px-0.5">{anchor.quotedText}</span>
          </blockquote>
        )
      ) : null}

      {status === "resolved" ? (
        <p className="text-tiny text-ink-faint">
          Hidden from the body while it is resolved. It stays readable here and in search, with its comments and
          reactions.
        </p>
      ) : null}

      <div className="divide-y divide-line">
        {first ? (
          <CommentItem
            canReact={allowed}
            comment={first}
            onAddReaction={onAddReaction}
            onDelete={onDeleteComment}
            onEdit={onEditComment}
            onToggleReaction={onToggleReaction}
          />
        ) : null}

        {replies.length && collapseReplies ? (
          <button
            aria-expanded={repliesShown}
            className="flex w-full items-center gap-1 py-1.5 text-tiny text-ink-muted hover:text-ink"
            onClick={() => setRepliesShown((shown) => !shown)}
            type="button"
          >
            {repliesShown ? (
              <ChevronDown aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-3.5" />
            )}
            {repliesShown ? "Hide" : "Show"} {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </button>
        ) : null}

        {repliesShown
          ? replies.map((comment) => (
              <CommentItem
                canReact={allowed}
                comment={comment}
                key={comment.id}
                onAddReaction={onAddReaction}
                onDelete={onDeleteComment}
                onEdit={onEditComment}
                onToggleReaction={onToggleReaction}
              />
            ))
          : null}
      </div>

      <CommentComposer
        onAttach={onAttach}
        onMention={onMention}
        onSubmit={(body) => onReply(threadId, body)}
        placeholder="Reply…"
        submitLabel="Send reply"
        viewerAccess={viewerAccess}
      />
      {comments.some((comment) => comment.reactions.length) ? (
        <p className="text-micro text-ink-faint">Reactions show who reacted and never notify anyone.</p>
      ) : null}
    </section>
  );
}
