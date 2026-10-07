import { MoreHorizontal, Paperclip, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Textarea,
  cn,
} from "../../../ui";
import type { CommentRecord } from "./types";

export interface CommentItemProps {
  comment: CommentRecord;
  /** SHARE-002 — reactions and replies need `comment` access or more. */
  canReact: boolean;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onAddReaction: (commentId: string) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
  className?: string;
}

/** COMM-002 — one comment, its own edit and delete, and the tombstone a deletion leaves. */
export function CommentItem({
  comment,
  canReact,
  onToggleReaction,
  onAddReaction,
  onEdit,
  onDelete,
  className,
}: CommentItemProps) {
  const [draft, setDraft] = useState<string | null>(null);

  if (comment.deletedAtLabel) {
    return (
      <article className={cn("flex gap-2 py-1.5", className)}>
        <span aria-hidden="true" className="mt-1 size-6 shrink-0 rounded-full border border-dashed border-line-strong" />
        <p className="text-ui text-ink-faint italic">
          {comment.author.name} deleted this comment on {comment.deletedAtLabel}.
        </p>
      </article>
    );
  }

  const editing = draft !== null;

  return (
    <article className={cn("group/comment flex gap-2 py-1.5", className)}>
      <Avatar className="mt-0.5 size-6 shrink-0">
        <AvatarFallback>{comment.author.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-ui font-medium text-ink">{comment.author.name}</span>
          <span className="text-tiny text-ink-faint">{comment.createdAtLabel}</span>
          {comment.editedAtLabel ? (
            <span className="text-tiny text-ink-faint">· Edited {comment.editedAtLabel}</span>
          ) : null}
          {comment.isOwn ? (
            <div className="ml-auto opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={`Actions for your comment of ${comment.createdAtLabel}`} size="iconSm" variant="ghost">
                    <MoreHorizontal aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDraft(comment.body)}>
                    <Pencil aria-hidden="true" className="size-3.5" />
                    Edit comment
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onDelete(comment.id)}>
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Delete comment
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>

        {editing ? (
          <form
            className="mt-1 flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              onEdit(comment.id, draft);
              setDraft(null);
            }}
          >
            <label className="sr-only" htmlFor={`edit-${comment.id}`}>
              Edit your comment
            </label>
            <Textarea
              id={`edit-${comment.id}`}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              value={draft}
            />
            <div className="flex gap-1.5">
              <Button size="sm" type="submit">
                Save
              </Button>
              <Button onClick={() => setDraft(null)} size="sm" variant="ghost">
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-0.5 text-ui whitespace-pre-wrap text-ink">{comment.body}</p>
        )}

        {comment.attachments.map((attachment) => (
          <p
            className="mt-1.5 flex items-center gap-1.5 rounded-control border border-line bg-sidebar px-2 py-1.5 text-tiny text-ink"
            key={attachment.id}
          >
            <Paperclip aria-hidden="true" className="size-3.5 text-ink-faint" />
            <span className="truncate">{attachment.name}</span>
            <span className="ml-auto shrink-0 text-ink-faint">{attachment.sizeLabel}</span>
          </p>
        ))}

        {comment.reactions.length || canReact ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {comment.reactions.map((reaction) => (
              <button
                aria-pressed={reaction.reactedByViewer}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-tiny transition-colors",
                  reaction.reactedByViewer
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line bg-surface text-ink-muted hover:bg-sidebar-hover",
                )}
                disabled={!canReact}
                key={reaction.emoji}
                onClick={() => onToggleReaction(comment.id, reaction.emoji)}
                title={reaction.reactors.map((person) => person.name).join(", ")}
                type="button"
              >
                <span aria-hidden="true">{reaction.emoji}</span>
                <span className="sr-only">
                  {reaction.emoji} from {reaction.reactors.map((person) => person.name).join(", ")}.
                </span>
                <span aria-hidden="true">{reaction.reactors.length}</span>
              </button>
            ))}
            {canReact ? (
              <Button
                aria-label={`Add a reaction to ${comment.author.name}'s comment`}
                onClick={() => onAddReaction(comment.id)}
                size="iconSm"
                variant="ghost"
              >
                <SmilePlus aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
