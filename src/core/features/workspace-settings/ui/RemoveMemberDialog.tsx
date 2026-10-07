import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
} from "../../../ui";
import { containerNoun, memberNoun } from "./nouns";
import type { WorkspaceMember } from "./types";

/**
 * `WORK-007` — removing a member, with every consequence named before it
 * happens. None of these is optional and none of them is reversible by
 * re-inviting the person, so they are all on screen.
 */
export function RemoveMemberDialog({
  open,
  onOpenChange,
  member,
  ownedPageCount,
  reassignPages,
  onReassignPagesChange,
  onConfirm,
  submitting = false,
  failure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: WorkspaceMember;
  /** How many pages this member owns (`CONT-006` offers the bulk reassignment). */
  ownedPageCount: number;
  reassignPages: boolean;
  onReassignPagesChange: (next: boolean) => void;
  onConfirm: () => void;
  submitting?: boolean;
  failure?: string | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.name}?</DialogTitle>
          <DialogDescription>
            {member.email} loses access to this workspace at once.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ui text-ink">
            <li>Their sessions and their unused invitations are revoked immediately.</li>
            <li>Their personal grants are removed from every page and every {containerNoun}.</li>
            <li>
              Their personal {containerNoun} is archived rather than exposed to anyone else or deleted.
            </li>
            <li>
              {ownedPageCount > 0
                ? `The ${ownedPageCount} ${ownedPageCount === 1 ? "page" : "pages"} they own are left with no owner.`
                : "They own no page, so no page is left without an owner."}
            </li>
            <li>Their name stays on the activity they created until personal-data erasure anonymises it.</li>
          </ul>

          {ownedPageCount > 0 ? (
            <label className="flex items-start gap-2 rounded-card border border-line bg-sidebar px-3 py-2 text-ui text-ink">
              <Checkbox
                checked={reassignPages}
                className="mt-0.5"
                onCheckedChange={(next) => onReassignPagesChange(next === true)}
              />
              <span>
                Reassign their {ownedPageCount} {ownedPageCount === 1 ? "page" : "pages"} in bulk now
                <span className="block text-tiny text-ink-muted">
                  Slate opens the bulk change after the {memberNoun} is removed. Leaving this unticked leaves the pages
                  without an owner until someone reassigns them.
                </span>
              </span>
            </label>
          ) : null}

          {failure ? <ErrorState detail={failure} title={`Slate could not remove this ${memberNoun}.`} /> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={submitting} onClick={onConfirm} variant="danger">
            {submitting ? "Removing…" : `Remove ${member.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
