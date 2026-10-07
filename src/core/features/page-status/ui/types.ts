import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";

export type StatusProfile = KnowledgePolicyProfile["page.status.v1"];

export const statusColourKeys = ["yellow", "blue", "green", "red", "purple"] as const;
export type StatusColourKey = (typeof statusColourKeys)[number];

/** One entry of the workspace status vocabulary (`STAT-001`). */
export interface StatusEntry {
  key: string;
  label: string;
  colour: StatusColourKey;
  requiresVerification: boolean;
  /** A retired entry stays on the pages that carry it and is not offered again. */
  retired: boolean;
  /** How many pages carry it, for the bulk change offered on retirement. */
  pageCount: number;
}

/** The longest custom label `STAT-005` allows under `open-vocabulary`. */
export const customStatusLabelLimit = 20;

export type VerificationExpiryChoice = "7" | "30" | "90" | "date" | "none";

export type SubmitState = "ready" | "submitting" | "error";
