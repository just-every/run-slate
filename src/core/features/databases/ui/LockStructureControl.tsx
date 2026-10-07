import { Lock, Unlock } from "lucide-react";
import { Button, cn } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import type { DatabaseLock } from "./types";
import { sentenceCase } from "./types";

/**
 * `DB-009` — locking a database's structure rejects field, view, filter, sort and
 * layout changes while record edits carry on, names who locked it, and is unlocked
 * by anyone with full access.
 */
export function LockStructureControl({
  lock,
  canUnlock,
  canLock,
  onLock,
  onUnlock,
  className,
}: {
  lock: DatabaseLock | null;
  /** `full` access. Only that level may unlock. */
  canUnlock: boolean;
  /** Edit access is enough to lock. */
  canLock: boolean;
  onLock: () => void;
  onUnlock: () => void;
  className?: string;
}) {
  if (lock === null) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <p className="text-ui text-ink-muted">
          Locking the structure rejects field, view, filter, sort and layout changes.{" "}
          {sentenceCase(knowledgeNoun("record"))} edits carry on as before.
        </p>
        <div>
          <Button disabled={!canLock} onClick={onLock} size="sm" variant="secondary">
            <Lock aria-hidden="true" className="size-3.5" />
            Lock structure
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-card border border-line bg-sidebar p-3", className)}>
      <p className="flex items-center gap-1.5 text-ui font-medium text-ink">
        <Lock aria-hidden="true" className="size-3.5" />
        Structure locked
      </p>
      <p className="text-ui text-ink-muted">
        Locked by {lock.lockedBy} on {lock.lockedAt}. Field, view, filter, sort and layout changes are rejected;{" "}
        {knowledgeNoun("record")} edits are not.
      </p>
      <div>
        <Button disabled={!canUnlock} onClick={onUnlock} size="sm" variant="secondary">
          <Unlock aria-hidden="true" className="size-3.5" />
          Unlock structure
        </Button>
      </div>
      {canUnlock ? null : (
        <p className="text-tiny text-ink-muted">
          Unlocking needs full access to this database. Ask {lock.lockedBy} or another {knowledgeNoun("member")} with
          full access.
        </p>
      )}
    </div>
  );
}
