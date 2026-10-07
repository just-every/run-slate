import { useId } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "../../../ui";
import { inviteRefusal } from "./member-refusals";
import type { SettingsViewer, WorkspaceRole } from "./types";
import { workspaceRoleLabel } from "./types";

/**
 * `WORK-003` and `WORK-006` — invite by email address. A member may invite no
 * one, so for a member the form stays on screen, disabled, with the reason.
 */
export function InviteMemberForm({
  viewer,
  email,
  onEmailChange,
  role,
  onRoleChange,
  onSubmit,
  submitting = false,
  className,
}: {
  viewer: SettingsViewer;
  email: string;
  onEmailChange: (next: string) => void;
  role: WorkspaceRole;
  onRoleChange: (next: WorkspaceRole) => void;
  onSubmit: () => void;
  submitting?: boolean;
  className?: string;
}) {
  const fieldId = useId();
  const refusal = inviteRefusal(viewer);
  const refused = refusal !== null;

  return (
    <form
      className={cn("flex flex-col gap-2 rounded-card border border-line bg-sidebar p-3", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!refused) onSubmit();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-email`}>
            Invite by email address
          </label>
          <Input
            aria-describedby={refused ? `${fieldId}-reason` : `${fieldId}-note`}
            autoComplete="email"
            disabled={refused || submitting}
            id={`${fieldId}-email`}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="person@example.com"
            type="email"
            value={email}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-tiny font-medium text-ink-muted" id={`${fieldId}-role`}>
            Role
          </span>
          <Select
            disabled={refused || submitting}
            onValueChange={(next) => onRoleChange(next as WorkspaceRole)}
            value={role}
          >
            <SelectTrigger aria-labelledby={`${fieldId}-role`} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">{workspaceRoleLabel.owner}</SelectItem>
              <SelectItem value="member">{workspaceRoleLabel.member}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button disabled={refused || submitting || email.trim().length === 0} type="submit">
          {submitting ? "Sending…" : "Send invitation"}
        </Button>
      </div>
      {refused ? (
        <p className="text-tiny text-ink-muted" id={`${fieldId}-reason`}>
          {refusal}
        </p>
      ) : (
        <p className="text-tiny text-ink-muted" id={`${fieldId}-note`}>
          The invitation can be used once and stops working 24 hours after it is sent.
        </p>
      )}
    </form>
  );
}
