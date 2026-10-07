import { useId } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableCell,
  TableRow,
} from "../../../ui";
import { GuardedAction } from "./GuardedAction";
import { changeRoleRefusal, removeMemberRefusal } from "./member-refusals";
import type { SettingsViewer, WorkspaceMember, WorkspaceRole } from "./types";
import { workspaceRoleLabel } from "./types";

/** `WORK-003`, `WORK-007`, `WORK-008` — one member, with the refusals stated. */
export function MemberRow({
  member,
  viewer,
  ownerCount,
  onRoleChange,
  onRemove,
}: {
  member: WorkspaceMember;
  viewer: SettingsViewer;
  ownerCount: number;
  onRoleChange: (memberId: string, role: WorkspaceRole) => void;
  onRemove: (memberId: string) => void;
}) {
  const roleReasonId = useId();
  const roleRefusal = changeRoleRefusal({ viewer, member, ownerCount });
  const removeRefusal = removeMemberRefusal({ viewer, member, ownerCount });

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar>
            {member.avatarUrl ? <AvatarImage alt="" src={member.avatarUrl} /> : null}
            <AvatarFallback>{member.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-ui text-ink">
              {member.name}
              {member.id === viewer.memberId ? <Badge tone="neutral">You</Badge> : null}
              {member.isSetupMember ? <Badge tone="outline">Set up this workspace</Badge> : null}
            </p>
            <p className="truncate text-tiny text-ink-muted">{member.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-ink-muted">{member.joinedOn}</TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Select
            disabled={roleRefusal !== null}
            onValueChange={(next) => onRoleChange(member.id, next as WorkspaceRole)}
            value={member.role}
          >
            <SelectTrigger
              aria-describedby={roleRefusal ? roleReasonId : undefined}
              aria-label={`Role for ${member.name}`}
              className="w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">{workspaceRoleLabel.owner}</SelectItem>
              <SelectItem value="member">{workspaceRoleLabel.member}</SelectItem>
            </SelectContent>
          </Select>
          {roleRefusal ? (
            <span className="max-w-[16rem] text-tiny text-ink-muted" id={roleReasonId}>
              {roleRefusal}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <GuardedAction
          align="end"
          label="Remove"
          onClick={() => onRemove(member.id)}
          reason={removeRefusal}
          variant={removeRefusal ? "secondary" : "danger"}
        />
      </TableCell>
    </TableRow>
  );
}
