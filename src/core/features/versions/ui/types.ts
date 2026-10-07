import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";

export type VersionProfile = KnowledgePolicyProfile["page.version.v1"];

/** A revision as `REV-001` defines it, written out for a reader. */
export interface VersionEntry {
  id: string;
  /** Assigned only where `REV-007` says so; null under `autosnapshot`. */
  ordinal: number | null;
  /** The time of the revision, already written out. */
  at: string;
  actorName: string;
  origin: "autosave" | "publish";
  /** The version comment taken at publish; only carried under `labelled`. */
  comment: string | null;
  /** The page's status at that moment; only carried under `labelled`. */
  statusLabel: string | null;
  isCurrent: boolean;
  isPublished: boolean;
  /** Present when the version's content was deleted under `REV-006`. */
  tombstone: VersionTombstone | null;
}

export interface VersionTombstone {
  deletedByName: string;
  /** When it was deleted, already written out. */
  deletedAt: string;
}

export type CompareBlockKind = "added" | "removed" | "changed" | "unchanged";

export interface CompareBlock {
  id: string;
  kind: CompareBlockKind;
  /** The block as it stands in the older revision, or null where it did not exist. */
  before: string | null;
  /** The block as it stands in the newer revision, or null where it was removed. */
  after: string | null;
}

export interface CompareSide {
  /** How the revision is named to the reader, such as "Version 4" or a time. */
  label: string;
  at: string;
  actorName: string;
}

export type SubmitState = "ready" | "submitting" | "error";
