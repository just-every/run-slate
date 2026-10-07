import { GitCompare, RefreshCw, TriangleAlert } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import type { ConflictChoice, RevisionConflict } from "./types";

export interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflict: RevisionConflict;
  /** What was being saved: a block, the title, a property, the order. */
  subject: string;
  onChoose: (choice: ConflictChoice) => void;
  /** True once compare was chosen, so both versions are shown side by side. */
  comparing?: boolean;
}

function Version({ heading, body }: { heading: string; body?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-card border border-line bg-sidebar p-3">
      <p className="text-tiny font-medium text-ink-muted">{heading}</p>
      <p className="mt-1 text-small whitespace-pre-wrap text-ink">{body ?? "No text was recorded for this version."}</p>
    </div>
  );
}

/**
 * `SAVE-003` — an edit submitted against a superseded revision is rejected with
 * 409. The local draft is kept, and nothing is merged automatically.
 */
export function ConflictDialog({
  open,
  onOpenChange,
  conflict,
  subject,
  onChoose,
  comparing = false,
}: ConflictDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert aria-hidden="true" className="size-4 text-warn" />
            This {subject} changed while you were editing
          </DialogTitle>
          <DialogDescription>
            {conflict.byMemberName} saved revision {conflict.currentRevision} {conflict.atLabel}, after you began
            editing revision {conflict.fromRevision}. Your draft is kept here and nothing has been merged
            automatically — choose which version to keep.
          </DialogDescription>
        </DialogHeader>

        {comparing ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Version body={conflict.localPreview} heading="Your unsaved draft" />
            <Version body={conflict.serverPreview} heading={`Saved by the other ${knowledgeNoun("member")}`} />
          </div>
        ) : (
          <p className="text-ui text-ink-muted">
            Compare the two versions, reload the saved one and lose your draft, or overwrite the saved one with
            your draft.
          </p>
        )}

        <DialogFooter>
          <Button onClick={() => onChoose("compare")} variant="secondary">
            <GitCompare aria-hidden="true" className="size-3.5" />
            {comparing ? "Hide the comparison" : "Compare the two"}
          </Button>
          <Button onClick={() => onChoose("reload")} variant="secondary">
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Reload the saved version
          </Button>
          <Button onClick={() => onChoose("overwrite")} variant="danger">
            Overwrite with my draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
