import { ChevronRight, X } from "lucide-react";
import { useId } from "react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "../../../ui";
import { GuardedAction } from "./GuardedAction";
import { memberNoun, pluralise } from "./nouns";
import type { WorkspaceGroup, WorkspaceMember } from "./types";

/**
 * `WORK-009` — one group. Adding or removing a member changes access at once,
 * and deleting the group removes the grants that name it without touching the
 * grants its members hold themselves.
 */
export function GroupRow({
  group,
  members,
  open,
  onOpenChange,
  onAddMember,
  onRemoveMember,
  onDelete,
  canAdminister,
}: {
  group: WorkspaceGroup;
  /** Every member of the workspace, so the row can name and offer them. */
  members: readonly WorkspaceMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddMember: (groupId: string, memberId: string) => void;
  onRemoveMember: (groupId: string, memberId: string) => void;
  onDelete: (groupId: string) => void;
  canAdminister: boolean;
}) {
  const regionId = useId();
  const inGroup = members.filter((member) => group.memberIds.includes(member.id));
  const available = members.filter((member) => !group.memberIds.includes(member.id));
  const refusal = canAdminister ? null : "Only a workspace owner administers groups.";

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
        <button
          aria-controls={regionId}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 rounded-control px-1 py-0.5 text-left focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          onClick={() => onOpenChange(!open)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className={cn("size-3.5 text-ink-faint transition-transform", open && "rotate-90")} />
          <span className="truncate text-ui font-medium text-ink">{group.name}</span>
          <span className="truncate text-tiny text-ink-muted">
            {group.memberIds.length} {group.memberIds.length === 1 ? memberNoun : pluralise(memberNoun)} ·{" "}
            {group.grantCount} {group.grantCount === 1 ? "grant" : "grants"}
          </span>
        </button>
        <GuardedAction
          align="end"
          label="Delete group"
          onClick={() => onDelete(group.id)}
          reason={refusal}
          variant={refusal ? "secondary" : "danger"}
        />
      </div>

      <div className="flex flex-col gap-3 pb-3" hidden={!open} id={regionId}>
        <ul className="flex flex-wrap gap-1.5">
          {inGroup.length === 0 ? (
            <li className="text-ui text-ink-muted">This group holds no one yet.</li>
          ) : (
            inGroup.map((member) => (
              <li
                className="flex items-center gap-1 rounded-control bg-sidebar-hover py-0.5 pr-0.5 pl-2 text-tiny text-ink"
                key={member.id}
              >
                {member.name}
                <Button
                  aria-label={`Remove ${member.name} from ${group.name}`}
                  disabled={!canAdminister}
                  onClick={() => onRemoveMember(group.id, member.id)}
                  size="iconSm"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-3" />
                </Button>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            disabled={!canAdminister || available.length === 0}
            onValueChange={(memberId) => onAddMember(group.id, memberId)}
            value=""
          >
            <SelectTrigger aria-label={`Add someone to ${group.name}`} className="w-64">
              <SelectValue placeholder={available.length === 0 ? "Everyone is in this group" : `Add a ${memberNoun}`} />
            </SelectTrigger>
            <SelectContent>
              {available.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-tiny text-ink-muted">Access changes the moment the group changes.</p>
        </div>
      </div>
    </li>
  );
}
