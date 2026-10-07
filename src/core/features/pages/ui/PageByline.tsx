import { BookOpen } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, cn } from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { PageReactions } from "./PageReactions";
import { PageStatusChip } from "./PageStatusChip";
import type { PagePerson, PageReaction, PageStatusEntry } from "./types";

/**
 * The byline under a page title: who wrote it, when, who else contributed, how
 * long it takes to read, and its reactions (`PAGE-014`).
 *
 * `STAT-005` decides where the status chip lives. Under `open-vocabulary` it sits
 * here, between the author and the reading time. Under `verification-only` the
 * chip belongs beside the breadcrumb title instead, so this surface leaves the
 * space empty and renders nothing in its place.
 */
export function PageByline({
  author,
  dateLabel,
  contributors = [],
  readingLengthLabel,
  status = null,
  statusProfile,
  reactions = [],
  canReact = false,
  onToggleReaction,
  onSelectStatus,
  align = "start",
  className,
}: {
  author: PagePerson;
  dateLabel: string;
  contributors?: readonly PagePerson[];
  readingLengthLabel?: string;
  status?: PageStatusEntry | null;
  statusProfile: KnowledgePolicyProfile["page.status.v1"];
  reactions?: readonly PageReaction[];
  canReact?: boolean;
  onToggleReaction?: (emoji: string) => void;
  onSelectStatus?: () => void;
  /** The references show both: a left-aligned byline and a centred one. */
  align?: "start" | "center";
  className?: string;
}) {
  const centred = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-ui text-ink-muted",
        centred ? "items-center text-center" : "items-start",
        className,
      )}
    >
      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", centred ? "justify-center" : "")}>
        <span className="flex items-center gap-1.5">
          <Avatar className="size-5">
            {author.imageUrl ? <AvatarImage alt="" src={author.imageUrl} /> : null}
            <AvatarFallback>{author.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="font-medium text-ink">{author.name}</span>
        </span>

        {statusProfile === "open-vocabulary" ? (
          <PageStatusChip onSelect={onSelectStatus} status={status} statusProfile={statusProfile} />
        ) : null}

        {readingLengthLabel ? (
          <span className="flex items-center gap-1 text-tiny">
            <BookOpen aria-hidden="true" className="size-3.5" />
            {readingLengthLabel}
          </span>
        ) : null}

        <span className="text-tiny">{dateLabel}</span>
      </div>

      {contributors.length > 0 ? (
        <div className={cn("flex items-center gap-2 text-tiny", centred ? "justify-center" : "")}>
          <span aria-hidden="true" className="flex -space-x-1.5">
            {contributors.map((person) => (
              <Avatar className="size-5 ring-2 ring-canvas" key={person.id} title={person.name}>
                {person.imageUrl ? <AvatarImage alt="" src={person.imageUrl} /> : null}
                <AvatarFallback>{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            ))}
          </span>
          <span>
            {contributors.length === 1
              ? `${contributors[0]?.name} also contributed`
              : `${contributors.length} others contributed`}
          </span>
        </div>
      ) : null}

      <PageReactions
        canReact={canReact}
        className={centred ? "justify-center" : ""}
        onToggleReaction={onToggleReaction}
        reactions={reactions}
      />
    </div>
  );
}
