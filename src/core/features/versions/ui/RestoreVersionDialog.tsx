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
import type { CompareSide, SubmitState } from "./types";

export interface RestoreVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: CompareSide;
  state: SubmitState;
  errorMessage?: string;
  onRestore: () => void;
}

/**
 * `REV-003` — restoring writes a new revision holding the earlier content, records who
 * restored which revision, and changes no link, comment anchor, child page, grant or
 * public link.
 */
export function RestoreVersionDialog({
  open,
  onOpenChange,
  version,
  state,
  errorMessage,
  onRestore,
}: RestoreVersionDialogProps) {
  const submitting = state === "submitting";
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore {version.label}?</DialogTitle>
          <DialogDescription>
            Saved {version.at} by {version.actorName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-ui text-ink">
            Restoring writes a <span className="font-medium">new revision</span> holding this content. Nothing
            in the history is overwritten and no version is removed, so you can restore the current revision
            again afterwards.
          </p>
          <p className="text-ui text-ink-muted">
            No link, comment anchor, child page, grant or public link changes. Anyone who could read the page a
            moment ago can still read it, and every link to it still resolves.
          </p>
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
          <Button disabled={submitting} onClick={onRestore}>
            {submitting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {submitting ? "Restoring" : "Restore this revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
