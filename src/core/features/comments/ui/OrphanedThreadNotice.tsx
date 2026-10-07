import { Unlink } from "lucide-react";
import { Button, cn } from "../../../ui";
import { pageBodyNoun } from "./nouns";
import type { AnchorRevision } from "./types";

export interface OrphanedThreadNoticeProps {
  /** COMM-004 — the revision the anchor was last resolvable in. */
  revision: AnchorRevision;
  quotedText: string;
  /** REV-005 — opens that revision with its content as committed. */
  onOpenRevision: (revisionId: string) => void;
  className?: string;
}

/**
 * COMM-004 — an inline thread whose anchored text was deleted becomes orphaned rather
 * than lost. It stays in the panel, names the revision it was anchored in, and opens it.
 */
export function OrphanedThreadNotice({ revision, quotedText, onOpenRevision, className }: OrphanedThreadNoticeProps) {
  return (
    <div className={cn("rounded-control border border-warn/30 bg-warn-soft px-2.5 py-2", className)}>
      <p className="flex items-center gap-1.5 text-tiny font-medium text-warn">
        <Unlink aria-hidden="true" className="size-3.5" />
        Anchor removed from the {pageBodyNoun}
      </p>
      <blockquote className="mt-1.5 border-l-2 border-warn/40 pl-2 text-tiny text-ink-muted italic">
        “{quotedText}”
      </blockquote>
      <p className="mt-1.5 text-tiny text-ink-muted">
        This text was deleted, so the thread is kept here instead. It was anchored in {revision.label}, committed{" "}
        {revision.committedAtLabel}.
      </p>
      <Button className="mt-1.5 px-0" onClick={() => onOpenRevision(revision.id)} size="sm" variant="link">
        Open {revision.label}
      </Button>
    </div>
  );
}
