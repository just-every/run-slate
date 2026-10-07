import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui";
import type { SubmitState, VersionEntry, VersionProfile } from "./types";

export interface DeleteVersionDialogProps {
  /** `REV-006` — deletion is offered only under `labelled`. */
  versionProfile: VersionProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: VersionEntry;
  state: SubmitState;
  errorMessage?: string;
  onDelete: () => void;
}

function blockedReason(version: VersionEntry): string | null {
  if (version.isCurrent) return "This is the current revision, and the current revision cannot be deleted.";
  if (version.isPublished) return "This is the published revision, and the published revision cannot be deleted.";
  return null;
}

/** `REV-006` — deleting one intermediate version removes its content and leaves a
 * numbered tombstone in history naming who deleted it and when. */
export function DeleteVersionDialog({
  versionProfile,
  open,
  onOpenChange,
  version,
  state,
  errorMessage,
  onDelete,
}: DeleteVersionDialogProps) {
  if (versionProfile !== "labelled") return null;

  const blocked = blockedReason(version);
  const submitting = state === "submitting";
  const name = version.ordinal !== null ? `version ${version.ordinal}` : `the revision from ${version.at}`;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            Saved {version.at} by {version.actorName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-4 py-3">
          {blocked ? (
            <p
              className="flex items-start gap-1.5 rounded-card border border-warn/30 bg-warn-soft p-2.5 text-ui text-ink"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
              {blocked}
            </p>
          ) : (
            <>
              <p className="text-ui text-ink">
                Its content is removed and cannot be recovered. The history keeps a numbered tombstone in its
                place, naming who deleted it and when, so the numbering of the other versions does not move.
              </p>
              <p className="text-ui text-ink-muted">
                Only an intermediate version can be deleted: the current revision and the published revision
                stay.
              </p>
            </>
          )}
          {state === "error" && errorMessage ? (
            <p
              className="flex items-start gap-1.5 rounded-card border border-danger/30 bg-danger-soft p-2.5 text-ui text-danger"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {errorMessage}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button disabled={submitting} onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={submitting || blocked !== null} onClick={onDelete} variant="danger">
            {submitting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {submitting ? "Deleting" : "Delete this version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
