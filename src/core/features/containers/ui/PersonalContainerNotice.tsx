import { UserLock } from "lucide-react";
import { Button, cn } from "../../../ui";
import { containerNoun, memberNoun, sentenceCase } from "./nouns";

export interface PersonalContainerNoticeProps {
  /** CONT-006 / CONT-005 — moving or sharing a page out is the way to let anyone else in. */
  onMovePages?: () => void;
  className?: string;
}

/** CONT-005 — no other member can be granted access to a personal container. */
export function PersonalContainerNotice({ onMovePages, className }: PersonalContainerNoticeProps) {
  return (
    <section
      className={cn("rounded-card border border-line bg-sidebar px-3 py-2.5", className)}
      aria-labelledby="personal-container-notice"
    >
      <h3 className="flex items-center gap-1.5 text-ui font-medium text-ink" id="personal-container-notice">
        <UserLock aria-hidden="true" className="size-4 text-ink-muted" />
        {sentenceCase(containerNoun)} for you alone
      </h3>
      <p className="mt-1 text-tiny text-ink-muted">
        No other {memberNoun} can be granted access to this {containerNoun}, and it carries no general access grant.
        Its pages are yours until you move or share one into another {containerNoun}. There is no grant list here to
        edit and no invitation to send.
      </p>
      {onMovePages ? (
        <Button className="mt-1.5 px-0" onClick={onMovePages} size="sm" variant="link">
          Move pages to another {containerNoun}
        </Button>
      ) : null}
    </section>
  );
}
