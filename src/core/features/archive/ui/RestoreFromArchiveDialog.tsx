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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui";
import { EntryKindBadge } from "./ArchiveEntryMeta";
import {
  type ArchivedEntry,
  destinationPath,
  locationPath,
  type RestoreDestination,
} from "./types";

/**
 * `ARCH-003` — restore from the archive, both paths in one component. A record
 * whose prior parent is still there names the exact destination and returns to
 * it; a record whose prior parent is gone cannot be restored until the member
 * chooses where it goes, so the confirm stays disabled until they do.
 *
 * Design decision: the guarantee that identifiers, revisions, comments, grants
 * and status survive is stated on both paths, because choosing a new
 * destination is the moment a member is most likely to fear losing them.
 */
export interface RestoreFromArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ArchivedEntry;
  /** Offered only when the prior parent is gone. */
  destinations: readonly RestoreDestination[];
  selectedDestinationId: string | null;
  onSelectDestination: (destinationId: string) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  busy?: boolean;
}

const unchangedLine =
  "It keeps the same identifiers, revisions, comments, grants and status. Nothing about it is rewritten by the restore.";

export function RestoreFromArchiveDialog({
  open,
  onOpenChange,
  entry,
  destinations,
  selectedDestinationId,
  onSelectDestination,
  onConfirm,
  onCancel,
  busy = false,
}: RestoreFromArchiveDialogProps) {
  const destinationId = useId();
  const priorParentGone = !entry.priorLocation.stillExists;
  const canConfirm = !busy && (!priorParentGone || selectedDestinationId !== null);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Restore {entry.title}</DialogTitle>
            <EntryKindBadge kind={entry.kind} />
          </div>
          <DialogDescription>
            {priorParentGone
              ? `Its prior location, ${locationPath(entry.priorLocation)}, no longer exists. Choose where it should go.`
              : `Restoring returns it beneath ${locationPath(entry.priorLocation)}, in its previous position.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-ui text-ink-muted">{unchangedLine}</p>

          {priorParentGone ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={destinationId}>Destination (required)</Label>
              {destinations.length === 0 ? (
                <p className="text-tiny text-ink-muted">
                  No destination is available to restore into. Create one first, then restore.
                </p>
              ) : (
                <Select onValueChange={onSelectDestination} value={selectedDestinationId ?? undefined}>
                  <SelectTrigger className="w-full" id={destinationId}>
                    <SelectValue placeholder="Choose a destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((destination) => (
                      <SelectItem key={destination.id} value={destination.id}>
                        {destinationPath(destination)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-tiny text-ink-faint">
                The restore completes once a destination is chosen.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={busy} onClick={onCancel ?? (() => onOpenChange(false))} variant="secondary">
            Cancel
          </Button>
          <Button disabled={!canConfirm} onClick={onConfirm} variant="primary">
            {busy ? "Restoring…" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
