import { Badge, TableCell, TableRow, type BadgeProps } from "../../../ui";
import { GuardedAction } from "./GuardedAction";
import { revokeInvitationRefusal } from "./member-refusals";
import type { InvitationState, SettingsViewer, WorkspaceInvitation } from "./types";
import { workspaceRoleLabel } from "./types";

const stateLabel: Record<InvitationState, string> = {
  pending: "Waiting to be accepted",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
  "delivery-failed": "Not delivered",
};

const stateTone: Record<InvitationState, BadgeProps["tone"]> = {
  pending: "accent",
  accepted: "good",
  expired: "neutral",
  revoked: "neutral",
  "delivery-failed": "danger",
};

/**
 * `WORK-006` — one invitation. It is single-use, revocable until it is used,
 * and it stops working 24 hours after it was sent; an expired invitation stays
 * on this list, marked expired, rather than disappearing.
 *
 * `MAIL-002` — a send that failed shows the provider's error and is never
 * reported as sent.
 */
export function InvitationRow({
  invitation,
  viewer,
  onRevoke,
}: {
  invitation: WorkspaceInvitation;
  viewer: SettingsViewer;
  onRevoke: (invitationId: string) => void;
}) {
  const refusal = revokeInvitationRefusal({ viewer, invitation });

  return (
    <TableRow>
      <TableCell>
        <p className="truncate text-ui text-ink">{invitation.email}</p>
        <p className="text-tiny text-ink-muted">
          Invited by {invitation.invitedByName} as {workspaceRoleLabel[invitation.role].toLowerCase()}
        </p>
        {invitation.state === "delivery-failed" && invitation.deliveryError ? (
          <p className="mt-1 max-w-reading rounded-control bg-danger-soft px-2 py-1 text-tiny text-danger">
            Slate did not deliver this invitation. The mail provider said: {invitation.deliveryError}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-ink-muted">{invitation.sentOn}</TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge tone={stateTone[invitation.state]}>{stateLabel[invitation.state]}</Badge>
        <span className="mt-0.5 block text-tiny text-ink-faint">
          {invitation.state === "expired" ? `Expired ${invitation.expiresOn}` : `Expires ${invitation.expiresOn}`}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <GuardedAction align="end" label="Revoke" onClick={() => onRevoke(invitation.id)} reason={refusal} />
      </TableCell>
    </TableRow>
  );
}
