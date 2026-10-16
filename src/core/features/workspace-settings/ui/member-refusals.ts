import { memberNoun, pluralise } from "./nouns";
import type { SettingsViewer, WorkspaceInvitation, WorkspaceMember } from "./types";

/**
 * `WORK-003`, `WORK-006` and `WORK-007` in one place: the reason a control is
 * refused, in the words the surface shows. A refusal is never a hidden control —
 * every one of these produces a disabled control that says why.
 *
 * `null` means the action is allowed.
 */

export function removeMemberRefusal({
  viewer,
  member,
  ownerCount,
}: {
  viewer: SettingsViewer;
  member: WorkspaceMember;
  /** How many workspace owners the workspace currently has. */
  ownerCount: number;
}): string | null {
  if (member.isSetupMember && member.id !== viewer.memberId) {
    return `The ${memberNoun} created at setup can be removed only by themselves.`;
  }
  if (member.role === "owner" && ownerCount <= 1) {
    return "This is the last workspace owner. Slate rejects removing them.";
  }
  if (viewer.role !== "owner" && member.id !== viewer.memberId) {
    return `A ${memberNoun} may remove no one. Only a workspace owner removes ${pluralise(memberNoun)}.`;
  }
  if (viewer.role !== "owner" && !member.isSetupMember) {
    return `A ${memberNoun} may remove no one, themselves included.`;
  }
  return null;
}

export function changeRoleRefusal({
  viewer,
  member,
  ownerCount,
}: {
  viewer: SettingsViewer;
  member: WorkspaceMember;
  ownerCount: number;
}): string | null {
  if (viewer.role !== "owner") {
    return "Only a workspace owner changes roles.";
  }
  if (member.role === "owner" && ownerCount <= 1) {
    return "This is the last workspace owner. Slate keeps one.";
  }
  return null;
}

export function inviteRefusal(viewer: SettingsViewer): string | null {
  if (viewer.role !== "owner") {
    return `A ${memberNoun} may invite no one. Only a workspace owner sends an invitation.`;
  }
  return null;
}

export function revokeInvitationRefusal({
  viewer,
  invitation,
}: {
  viewer: SettingsViewer;
  invitation: WorkspaceInvitation;
}): string | null {
  if (viewer.role !== "owner") {
    return "Only a workspace owner revokes an invitation.";
  }
  if (invitation.state === "expired") {
    return "This invitation expired 7 days after it was sent and can no longer be used. Slate keeps it on this list.";
  }
  if (invitation.state === "revoked") {
    return "This invitation is already revoked.";
  }
  if (invitation.state === "accepted") {
    return "This invitation has been used. An invitation is single-use.";
  }
  return null;
}
