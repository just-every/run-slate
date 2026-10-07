import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";

export type LifecycleProfile = KnowledgePolicyProfile["page.lifecycle.v1"];
export type VersionProfile = KnowledgePolicyProfile["page.version.v1"];

/** A principal a draft has been shared with (`LIFE-002`, `SHARE-001`). */
export interface DraftAudienceEntry {
  id: string;
  name: string;
}

/** The attribution a publish may carry (`LIFE-003`). */
export interface PublishAsOption {
  id: string;
  label: string;
}

/** What a reader will see once the page is published (`LIFE-003`). */
export interface PublishPreview {
  breadcrumb: readonly string[];
  title: string;
  audience: string;
  excerpt: string;
}

export type SubmitState = "ready" | "submitting" | "error";
