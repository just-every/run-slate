import { useId } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "../../../ui";
import { EntryKindBadge } from "./ArchiveEntryMeta";
import { ArchiveIsNotDeletionNote } from "./ArchiveIsNotDeletionNote";
import { type ArchiveCandidate, type ArchivePerson, describeArchiveCascade, locationPath } from "./types";

/**
 * `ARCH-001` — the confirm step for archiving. Archiving records the actor, the
 * time, the prior location and an optional reason, and takes the record's
 * descendants with it, so the dialog shows all five before anything happens.
 *
 * Design decision: the cascade is stated as a sentence rather than a count in a
 * corner — "3 pages beneath it are archived too" is the fact a member needs to
 * read to decide, and it is the one this dialog can never bury.
 */
export interface ArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ArchiveCandidate;
  /** The actor that will be recorded. */
  actor: ArchivePerson;
  /** The time that will be recorded, already formatted for display. */
  timeLabel: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** `ARCH-004`: given, the note offers the way to the trash. */
  onOpenTrash?: () => void;
}

export function ArchiveDialog({
  open,
  onOpenChange,
  entry,
  actor,
  timeLabel,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  busy = false,
  onOpenTrash,
}: ArchiveDialogProps) {
  const reasonId = useId();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Archive {entry.title}</DialogTitle>
            <EntryKindBadge kind={entry.kind} />
          </div>
          {/* `ARCH-001` — the descendants go with it, said in words. */}
          <DialogDescription>{describeArchiveCascade(entry.descendantCount)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <dl className="flex flex-col gap-1.5 text-tiny">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-faint">Archived by</dt>
              <dd className="text-ink-muted">{actor.name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-faint">Archived at</dt>
              <dd className="text-ink-muted">{timeLabel}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-faint">Prior location</dt>
              <dd className="break-words text-ink-muted">{locationPath(entry.priorLocation)}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-1">
            <Label htmlFor={reasonId}>Reason (optional)</Label>
            <Textarea
              id={reasonId}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Why this is being archived"
              value={reason}
            />
          </div>

          <ArchiveIsNotDeletionNote onOpenTrash={onOpenTrash} />
        </div>

        <DialogFooter>
          <Button disabled={busy} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button disabled={busy} onClick={onConfirm} variant="primary">
            {busy ? "Archiving…" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
