import { AlertTriangle } from "lucide-react";
import { useId } from "react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "../../../ui";

/**
 * `ARCH-006` — emptying the trash. Explicit, confirmed, and it names what will
 * be destroyed rather than gesturing at it: the body, every revision, uploaded
 * files, comments, analytics rows and AI grounding. `LINK-002` is stated here
 * too, because what happens to existing links is the question a member asks
 * last and can no longer ask afterwards.
 *
 * Design decision: a typed word, not a second button. The action is
 * irreversible and cascades, so the confirm stays disabled until the member has
 * typed the word exactly.
 */
export interface EmptyTrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many records will be destroyed. */
  recordCount: number;
  /** The word the member must type, shown in the label. */
  confirmationWord: string;
  typedConfirmation: string;
  onTypedConfirmationChange: (value: string) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  busy?: boolean;
}

export function EmptyTrashDialog({
  open,
  onOpenChange,
  recordCount,
  confirmationWord,
  typedConfirmation,
  onTypedConfirmationChange,
  onConfirm,
  onCancel,
  busy = false,
}: EmptyTrashDialogProps) {
  const confirmFieldId = useId();
  const recordNoun = knowledgeNoun("record");
  const destroyed = [
    `the ${knowledgeNoun("pageBody")}`,
    "every revision",
    "uploaded files",
    "comments",
    "analytics rows",
    "AI grounding",
  ];
  const matches = typedConfirmation === confirmationWord;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="size-4 text-danger" />
            Empty the trash
          </DialogTitle>
          <DialogDescription>
            {recordCount === 1
              ? `1 ${recordNoun} in the trash will be destroyed. This cannot be undone.`
              : `${recordCount} ${recordNoun}s in the trash will be destroyed. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-ui font-medium text-ink">What is destroyed</p>
            <ul className="list-disc pl-5 text-ui text-ink-muted">
              {destroyed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {/* `LINK-002` — what a surviving link resolves to afterwards. */}
          <p className="text-tiny text-ink-muted">
            Every link to these {recordNoun}s then resolves to a content-free tombstone naming the kind of {recordNoun}{" "}
            and when it was deleted. Activity entries survive, with their references anonymised.
          </p>

          <div className="flex flex-col gap-1">
            <Label htmlFor={confirmFieldId}>Type {confirmationWord} to confirm</Label>
            <Input
              autoComplete="off"
              id={confirmFieldId}
              onChange={(event) => onTypedConfirmationChange(event.target.value)}
              placeholder={confirmationWord}
              value={typedConfirmation}
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={busy} onClick={onCancel ?? (() => onOpenChange(false))} variant="secondary">
            Cancel
          </Button>
          <Button disabled={!matches || busy} onClick={onConfirm} variant="danger">
            {busy ? "Emptying…" : "Empty the trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
