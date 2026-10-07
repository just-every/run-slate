import { Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui";

export interface DiscardDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageTitle: string;
  /** Moves the draft to trash. */
  onDiscard: () => void;
  /** Leaves it a draft and closes the editor. */
  onCloseDraft: () => void;
}

/**
 * `LIFE-007` — discarding a draft moves it to trash rather than deleting it, closing it
 * leaves it a draft, and neither action notifies anyone or leaves a trace in another
 * tree.
 */
export function DiscardDraftDialog({
  open,
  onOpenChange,
  pageTitle,
  onDiscard,
  onCloseDraft,
}: DiscardDraftDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard &ldquo;{pageTitle}&rdquo;?</DialogTitle>
          <DialogDescription>Choose what happens to this unpublished draft.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5 px-4 py-3">
          <p className="text-ui text-ink">
            <span className="font-medium">Discarding moves it to trash.</span> It is not deleted: it stays in
            trash with its history, and you can restore it from there.
          </p>
          <p className="text-ui text-ink">
            <span className="font-medium">Closing leaves it a draft.</span> It stays in your own tree, still
            private, and you can carry on writing it whenever you like.
          </p>
          <p className="text-tiny text-ink-muted">
            Neither action notifies anyone, and neither leaves a trace in anyone else&rsquo;s tree.
          </p>
        </div>
        <DialogFooter className="justify-between">
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Keep writing
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={onCloseDraft} variant="secondary">
              Close draft
            </Button>
            <Button onClick={onDiscard} variant="danger">
              <Trash2 aria-hidden="true" className="size-4" />
              Move to trash
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
