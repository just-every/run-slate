import { Info } from "lucide-react";
import { Button, cn } from "../../../ui";

/**
 * `ARCH-004` — archiving deletes no data, and permanent deletion is a separate,
 * confirmed action.
 *
 * Design decision: one quiet line. It reassures without competing with the
 * action it sits beside, so it is `text-tiny text-ink-muted` and its icon is
 * decorative.
 */
export interface ArchiveIsNotDeletionNoteProps {
  /** Given, the note offers the way to the trash, where deletion actually happens. */
  onOpenTrash?: () => void;
  className?: string;
}

export function ArchiveIsNotDeletionNote({ onOpenTrash, className }: ArchiveIsNotDeletionNoteProps) {
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-tiny text-ink-muted", className)}>
      <Info aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
      <span>Archiving deletes no data. Permanent deletion is a separate, confirmed action.</span>
      {onOpenTrash ? (
        <Button className="h-auto p-0 text-tiny" onClick={onOpenTrash} size="sm" variant="link">
          Open the trash
        </Button>
      ) : null}
    </p>
  );
}
