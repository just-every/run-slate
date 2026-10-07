import { MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";
import { EntryKindBadge, EntryKindIcon, EntryLocationLine, EntryStampLine } from "./ArchiveEntryMeta";
import { describeTrashCascade, type TrashedEntry } from "./types";

/**
 * One trashed record (`ARCH-005`): the deleting member, the time, the prior
 * location and the descendants that went with it.
 *
 * Design decision: the title is text, not a link. A page in the trash is absent
 * from every surface but this one, so there is nowhere for a title to open to —
 * the only ways out are restore and permanent deletion.
 */
export interface TrashRowProps {
  entry: TrashedEntry;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
}

export function TrashRow({ entry, onRestore, onDeletePermanently }: TrashRowProps) {
  const cascade = describeTrashCascade(entry.descendantCount);

  return (
    <li className="flex items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-sidebar/60">
      <EntryKindIcon className="mt-1" kind={entry.kind} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="max-w-full truncate text-ui font-medium text-ink">{entry.title}</span>
          <EntryKindBadge kind={entry.kind} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <EntryStampLine person={entry.deletedBy} timeLabel={entry.deletedAtLabel} verb="Deleted by" />
          <EntryLocationLine location={entry.priorLocation} />
          {cascade ? <span className="text-tiny text-ink-muted">{cascade}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button onClick={() => onRestore(entry.id)} size="sm" variant="secondary">
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Restore
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Actions for ${entry.title}`} size="iconSm" variant="ghost">
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onRestore(entry.id)}>
              <RotateCcw aria-hidden="true" />
              Restore to its prior place
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onSelect={() => onDeletePermanently(entry.id)}>
              <Trash2 aria-hidden="true" />
              Delete permanently
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
