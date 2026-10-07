import { UploadCloud } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui";

export interface UnpublishedChangesBarProps {
  /** When the revision readers currently see was published, written out. */
  publishedAt: string;
  /** When the working revision was last saved, written out. */
  editedAt: string;
  onRepublish: () => void;
  onComparePublished?: () => void;
  /** The discard confirmation is controlled so the caller owns the flow. */
  discardConfirmOpen: boolean;
  onDiscardConfirmOpenChange: (open: boolean) => void;
  onDiscardConfirmed: () => void;
}

/**
 * `LIFE-005` — shown to anyone who may edit. Everyone else sees the published revision
 * until this page is republished; discarding restores the published revision as the
 * working revision and deletes no version.
 */
export function UnpublishedChangesBar({
  publishedAt,
  editedAt,
  onRepublish,
  onComparePublished,
  discardConfirmOpen,
  onDiscardConfirmOpenChange,
  onDiscardConfirmed,
}: UnpublishedChangesBarProps) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-3 border-b border-line bg-accent-soft px-4 py-2.5">
        <UploadCloud aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-ui text-ink">
            <span className="font-semibold">This page has unpublished changes.</span> Every other reader still
            sees the revision published on {publishedAt}. Your edits from {editedAt} become visible when you
            republish.
          </p>
          <p className="text-tiny text-ink-muted">
            Only people who may edit this page can see this notice, and only they can see the working revision.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {onComparePublished ? (
            <Button onClick={onComparePublished} size="sm" variant="ghost">
              Compare with published
            </Button>
          ) : null}
          <Button onClick={() => onDiscardConfirmOpenChange(true)} size="sm" variant="secondary">
            Discard changes
          </Button>
          <Button onClick={onRepublish} size="sm">
            Republish
          </Button>
        </div>
      </div>

      <Dialog onOpenChange={onDiscardConfirmOpenChange} open={discardConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard the unpublished changes?</DialogTitle>
            <DialogDescription>
              The revision published on {publishedAt} becomes the working revision again, and your edits from{" "}
              {editedAt} stop being the draft you are writing.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-3">
            <p className="text-ui text-ink-muted">
              No version is deleted. Every revision stays in this page&rsquo;s history, including the one you are
              discarding, so you can compare it or restore it later.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => onDiscardConfirmOpenChange(false)} variant="secondary">
              Keep editing
            </Button>
            <Button onClick={onDiscardConfirmed} variant="danger">
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
