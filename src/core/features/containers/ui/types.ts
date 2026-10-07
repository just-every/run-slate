import type { AccessLevel, ContainerVisibility, GrantPrincipalKind } from "../../../shared/knowledge/model";
import { containerNoun, memberNoun } from "./nouns";

/** CONT-001 — the five visibility values, each stating who may see and join. */
export const containerVisibilityCopy: Record<ContainerVisibility, { label: string; description: string }> = {
  default: {
    label: "Default",
    description: `Every ${memberNoun} of the workspace is a member of this ${containerNoun} and can open it.`,
  },
  open: {
    label: "Open",
    description: `Anyone in the workspace can see this ${containerNoun} and join it themselves.`,
  },
  closed: {
    label: "Closed",
    description: `Anyone in the workspace can see this ${containerNoun} but only its members can join.`,
  },
  private: {
    label: "Private",
    description: `Only its members can see that this ${containerNoun} exists.`,
  },
  personal: {
    label: "Personal",
    description: `Yours alone. No other ${memberNoun} can be granted access to it.`,
  },
};

/** SHARE-002 — what each level carries, stated once. */
export const accessLevelCopy: Record<AccessLevel, { label: string; description: string }> = {
  view: { label: "View", description: "Read only." },
  comment: { label: "Comment", description: "Read and comment." },
  edit: { label: "Edit", description: "Read, edit and comment." },
  full: { label: "Full", description: "Read, edit, comment, share and change access." },
};

export const grantPrincipalKindLabel: Record<GrantPrincipalKind, string> = {
  member: "Person",
  group: "Group",
  container: sentenceCaseContainer(),
  workspace: "Workspace",
};

function sentenceCaseContainer(): string {
  return containerNoun.charAt(0).toUpperCase() + containerNoun.slice(1);
}

/** SHARE-001 — a principal on a grid row, resolved for display. */
export interface GrantPrincipal {
  id: string;
  kind: GrantPrincipalKind;
  name: string;
  /** A group's member count, a person's address — one quiet line under the name. */
  detail: string | null;
  initials: string;
}

export interface ContainerGrantRow {
  grantId: string;
  principal: GrantPrincipal;
  level: AccessLevel;
  /** SHARE-001 — where an inherited grant comes from; null when it is set here. */
  inheritedFrom: string | null;
}

/** CONT-002 — a purpose supplies default values only. */
export interface ContainerPurpose {
  id: string;
  label: string;
  /** The defaults it fills in, said plainly on the control. */
  defaultsSummary: string;
  visibility: ContainerVisibility;
  description: string;
}

export interface ContainerIdentity {
  id: string;
  icon: string;
  name: string;
  description: string;
  key: string | null;
  visibility: ContainerVisibility;
  memberCount: number;
}

export interface ContainerContentItem {
  id: string;
  icon: string;
  title: string;
  ownerName: string;
  updatedAtLabel: string;
  statusLabel: string | null;
}

/** CONT-006 — a partial failure names the pages that failed and applies the rest. */
export interface BulkActionOutcome {
  actionLabel: string;
  appliedCount: number;
  failures: readonly { pageId: string; title: string; reason: string }[];
}
