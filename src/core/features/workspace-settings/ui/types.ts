import type { AccessLevel, ExternalAccessSettings } from "../../../shared/knowledge/model";

/** `WORK-008` — the two roles, and nothing else. */
export type WorkspaceRole = "owner" | "member";

export const workspaceRoleLabel: Record<WorkspaceRole, string> = {
  owner: "Workspace owner",
  member: "Member",
};

export interface SettingsViewer {
  memberId: string;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  /** A stored portrait, or `null` for the initial. */
  avatarUrl: string | null;
  /** Written out by the caller, e.g. "3 February 2026". */
  joinedOn: string;
  /** `WORK-003` — the member created at setup. */
  isSetupMember: boolean;
}

/**
 * `WORK-006` — an invitation is single-use and revocable, expires 24 hours
 * after it was sent, and is retained rather than deleted once it has expired.
 * `MAIL-002` — a send that failed carries the provider's error.
 */
export type InvitationState = "pending" | "accepted" | "expired" | "revoked" | "delivery-failed";

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  sentOn: string;
  expiresOn: string;
  state: InvitationState;
  deliveryError: string | null;
  invitedByName: string;
}

export interface WorkspaceGroup {
  id: string;
  name: string;
  memberIds: readonly string[];
  /** How many grants name this group as their principal (`WORK-009`). */
  grantCount: number;
}

export interface GuestGrant {
  id: string;
  /** The page or container the guest was granted, by name. */
  target: string;
  targetKind: "page" | "container";
  level: AccessLevel;
}

export interface WorkspaceGuest {
  id: string;
  /** A guest who has not accepted yet has no name of their own. */
  name: string | null;
  email: string;
  grants: readonly GuestGrant[];
  invitedByName: string;
  acceptedOn: string | null;
}

export type ChatConnectionState = "connected" | "needs-attention";

export interface ChatEventChoice {
  id: string;
  label: string;
  selected: boolean;
}

/** `NOTIF-003` — the one chat destination a workspace owner may connect. */
export interface ChatConnection {
  id: string;
  serviceName: string;
  destinationName: string;
  state: ChatConnectionState;
  events: readonly ChatEventChoice[];
  lastDelivery: { at: string; summary: string } | null;
  lastFailure: { at: string; reason: string } | null;
  connectedByName: string;
  connectedOn: string;
  /** Why the authorisation stopped working, when it did. */
  attentionReason: string | null;
}

export interface AiUsageByDay {
  date: string;
  runs: number;
  /** Pre-formatted by the caller — this surface calculates nothing. */
  cost: string;
}

export interface AiUsageByFeature {
  feature: string;
  runs: number;
  cost: string;
}

/** `AI-001`, `AI-010`, `AI-012`. */
export interface AiSettingsState {
  providerConfigured: boolean;
  providerName: string | null;
  enabled: boolean;
  /** The monthly budget as the owner typed it; `AI-012` requires more than zero. */
  monthlyBudget: string;
  spentThisMonth: string | null;
  reservedThisMonth: string | null;
  usageByDay: readonly AiUsageByDay[];
  usageByFeature: readonly AiUsageByFeature[];
}

export type ThemeChoice = "light" | "dark" | "system";

export interface ShortcutEntry {
  id: string;
  label: string;
  /** "Ctrl B", or the characters typed for a formatting shortcut. */
  keys: string;
}

export interface ShortcutGroup {
  id: string;
  title: string;
  kind: "keyboard" | "typed";
  entries: readonly ShortcutEntry[];
}

/** `WORK-015`. */
export interface IdentityProviderStatus {
  state: "not-configured" | "working" | "failing";
  providerName: string | null;
  failureReason: string | null;
}

export interface SettingsNavItem {
  id: string;
  label: string;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  items: readonly SettingsNavItem[];
}

export type WorkspaceExternalAccess = ExternalAccessSettings;
