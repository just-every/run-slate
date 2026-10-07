import { Avatar, AvatarFallback, AvatarImage, Badge, cn } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import type { RecordComment, RecordPerson, RecordRevision } from "./types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PersonAvatar({ person }: { person: RecordPerson }) {
  return (
    <Avatar className="size-5 shrink-0">
      {person.imageUrl ? <AvatarImage alt="" src={person.imageUrl} /> : null}
      <AvatarFallback>{initials(person.name)}</AvatarFallback>
    </Avatar>
  );
}

/** `DB-012` — a record's comments. */
export function RecordComments({ comments, className }: { comments: readonly RecordComment[]; className?: string }) {
  return (
    <section aria-label="Comments" className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-tiny font-medium tracking-wide text-ink-faint uppercase">Comments</h3>
      {comments.length === 0 ? (
        <p className="text-ui text-ink-muted">No comments on this {knowledgeNoun("record")} yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li className="flex gap-2" key={comment.id}>
              <PersonAvatar person={comment.author} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="flex flex-wrap items-center gap-1.5 text-tiny text-ink-muted">
                  <span className="font-medium text-ink">{comment.author.name}</span>
                  {comment.time}
                  {comment.resolved ? <Badge tone="good">Resolved</Badge> : null}
                </p>
                <p className="text-ui text-ink">{comment.body}</p>
                {comment.replyCount > 0 ? (
                  <p className="text-tiny text-ink-muted">
                    {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** `REV-002` — the history, newest first, with the actor, the time and the origin. Never editable. */
export function RecordHistory({
  revisions,
  onOpenRevision,
  className,
}: {
  revisions: readonly RecordRevision[];
  onOpenRevision: (revisionId: string) => void;
  className?: string;
}) {
  return (
    <section aria-label="History" className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-tiny font-medium tracking-wide text-ink-faint uppercase">History</h3>
      <ol className="flex flex-col">
        {revisions.map((revision) => (
          <li className="border-b border-line last:border-b-0" key={revision.id}>
            <button
              className="flex w-full flex-wrap items-center gap-2 rounded-control px-1 py-2 text-left transition-colors hover:bg-sidebar-hover"
              onClick={() => onOpenRevision(revision.id)}
              type="button"
            >
              <PersonAvatar person={revision.actor} />
              <span className="text-ui text-ink">{revision.actor.name}</span>
              <span className="text-tiny text-ink-muted">{revision.time}</span>
              <span className="text-tiny text-ink-faint">{revision.origin}</span>
              {revision.ordinal ? <Badge tone="outline">Version {revision.ordinal}</Badge> : null}
              {revision.label ? <Badge tone="neutral">{revision.label}</Badge> : null}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
