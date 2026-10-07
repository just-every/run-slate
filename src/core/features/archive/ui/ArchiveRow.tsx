import { MoreHorizontal, RotateCcw, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";
import { EntryKindBadge, EntryKindIcon, EntryLocationLine, EntryStampLine } from "./ArchiveEntryMeta";
import { type ArchivedEntry, archivedKindLabel, describeArchivedDescendants } from "./types";

/**
 * One archived record (`ARCH-001`, `ARCH-002`): the title, the kind, the actor,
 * the time, the prior location trail, the optional reason and how many
 * descendants went with it.
 *
 * Design decision: the row's actions live behind one overflow menu whose
 * accessible name repeats the title, so a screen reader user never meets three
 * identical "More" buttons.
 */
export interface ArchiveRowProps {
  entry: ArchivedEntry;
  onOpen: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ArchiveRow({ entry, onOpen, onRestore, onDelete }: ArchiveRowProps) {
  const descendants = describeArchivedDescendants(entry.descendantCount);

  return (
    <li className="flex items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-sidebar/60">
      <EntryKindIcon className="mt-1" kind={entry.kind} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="max-w-full truncate text-left text-ui font-medium text-ink hover:underline"
            onClick={() => onOpen(entry.id)}
            type="button"
          >
            {entry.title}
          </button>
          <EntryKindBadge kind={entry.kind} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <EntryStampLine person={entry.archivedBy} timeLabel={entry.archivedAtLabel} verb="Archived by" />
          <EntryLocationLine location={entry.priorLocation} />
          {descendants ? <span className="text-tiny text-ink-muted">{descendants}</span> : null}
        </div>
        {entry.reason ? (
          <p className="text-tiny text-ink-muted">
            <span className="text-ink-faint">Reason: </span>
            {entry.reason}
          </p>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={`Actions for ${entry.title}`} size="iconSm" variant="ghost">
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => onOpen(entry.id)}>
            <SquareArrowOutUpRight aria-hidden="true" />
            Open (read-only)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRestore(entry.id)}>
            <RotateCcw aria-hidden="true" />
            Restore
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-danger" onSelect={() => onDelete(entry.id)}>
            <Trash2 aria-hidden="true" />
            Delete this {archivedKindLabel(entry.kind).toLowerCase()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
