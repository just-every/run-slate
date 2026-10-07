import { Database, FileText, FolderClosed } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, Badge, cn } from "../../../ui";
import { type ArchiveLocation, type ArchivedKind, archivedKindLabel, type ArchivePerson, locationPath } from "./types";

/**
 * The small pieces every archived (`ARCH-002`) and trashed (`ARCH-005`) row is
 * made of: the kind, who did it and when, and the prior location.
 *
 * Design decision: they live in one file because both lists show exactly the
 * same facts about a record and must state them identically. Nothing here reads
 * meaning from colour alone — every glyph is decorative and carries a text
 * label beside it.
 */

const kindIcon = { page: FileText, container: FolderClosed, database: Database } as const;

export function EntryKindIcon({ kind, className }: { kind: ArchivedKind; className?: string }) {
  const Icon = kindIcon[kind];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0 text-ink-faint", className)} />;
}

export function EntryKindBadge({ kind, className }: { kind: ArchivedKind; className?: string }) {
  return (
    <Badge className={cn("shrink-0", className)} tone="outline">
      {archivedKindLabel(kind)}
    </Badge>
  );
}

/**
 * `ARCH-001` and `ARCH-005` both record an actor and a time. The time is a
 * display string the caller formatted.
 */
export function EntryStampLine({
  verb,
  person,
  timeLabel,
  className,
}: {
  /** "Archived by", "Deleted by" — the sentence opener this surface uses. */
  verb: string;
  person: ArchivePerson;
  timeLabel: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-tiny text-ink-muted", className)}>
      <Avatar className="size-4">
        {person.imageUrl ? <AvatarImage alt="" src={person.imageUrl} /> : null}
        <AvatarFallback>{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span>
        {verb} {person.name} · {timeLabel}
      </span>
    </span>
  );
}

/**
 * The prior location both clauses record. `ARCH-003` needs the reader to see
 * when that parent is gone, so a missing parent is said in words, not implied.
 */
export function EntryLocationLine({ location, className }: { location: ArchiveLocation; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-tiny text-ink-muted", className)}>
      <span className="break-words">Was in {locationPath(location)}</span>
      {location.stillExists ? null : <Badge tone="warn">Prior location gone</Badge>}
    </span>
  );
}
