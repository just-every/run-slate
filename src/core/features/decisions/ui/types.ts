/**
 * The decision layer's local view types (`DEC-001` … `DEC-006`, `REV-005`).
 *
 * Design decision: every date reaches these components as an already-formatted
 * display string. No component in this feature formats, parses or compares a
 * date — the caller decides the calendar, the locale and the wording, so the
 * same components serve a list, a panel and a dialog without disagreeing.
 */

/** A person as the decision surfaces need them. */
export interface DecisionPerson {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** `DEC-002`: the three states, and Superseded is terminal. */
export type DecisionState = "proposed" | "accepted" | "superseded";

export const decisionStates = ["proposed", "accepted", "superseded"] as const satisfies readonly DecisionState[];

export const decisionStateLabel: Record<DecisionState, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  superseded: "Superseded",
};

/** `DEC-001` + `REV-005`: a citation names a page and the exact revision it was made against. */
export interface DecisionCitation {
  id: string;
  pageId: string;
  pageTitle: string;
  revisionId: string;
  revisionLabel: string;
  /** `DEC-003`: a later edit to the cited page makes this false. */
  current: boolean;
  /** Shown when the citation is no longer current. */
  newerRevisionLabel?: string | null;
}

/** One option weighed in the decision. Exactly one option carries `chosen`. */
export interface DecisionOption {
  id: string;
  title: string;
  note: string | null;
  chosen: boolean;
}

/** `DEC-003`: the two-way link between a decision and the decision that supersedes it. */
export interface DecisionLink {
  id: string;
  pageTitle: string;
  decidedAtLabel: string;
}

/** `DEC-001`: the whole decision record that sits over a page. */
export interface DecisionRecord {
  id: string;
  pageId: string;
  pageTitle: string;
  containerLabel: string;
  state: DecisionState;
  question: string;
  options: readonly DecisionOption[];
  outcome: string;
  rationale: string;
  owner: DecisionPerson;
  decidedAtLabel: string;
  reviewAtLabel: string | null;
  /** `DEC-005`: the review date has passed. The decision still reads Accepted. */
  overdue: boolean;
  citations: readonly DecisionCitation[];
  supersededBy?: DecisionLink | null;
  supersedes?: DecisionLink | null;
}

/** `DEC-005`: a completed review — a note, an actor, a time and the next review date. */
export interface DecisionReviewEntry {
  id: string;
  note: string;
  actor: DecisionPerson;
  atLabel: string;
  nextReviewAtLabel: string | null;
}

/** `DEC-004`: one row of the decision log. */
export interface DecisionLogEntry {
  id: string;
  pageId: string;
  pageTitle: string;
  containerLabel: string;
  state: DecisionState;
  owner: DecisionPerson;
  decidedAtLabel: string;
  reviewAtLabel: string | null;
  overdue: boolean;
  /** Every citation still points at the newest revision of its page. */
  citationsCurrent: boolean;
  citationCount: number;
  /** The accepted revision this row opens (`DEC-004`); null while Proposed. */
  acceptedRevisionLabel: string | null;
}

/** A choice offered in the log's filter bar. */
export interface DecisionFilterOption {
  id: string;
  label: string;
}

/** `DEC-004`: the six filters, held by the caller. */
export interface DecisionLogFilterValues {
  state: DecisionState | "all";
  containerId: string;
  ownerId: string;
  /** A date-input value ("" means unfiltered). Never parsed here. */
  decidedFrom: string;
  /** A date-input value ("" means unfiltered). Never parsed here. */
  reviewBefore: string;
  citations: "all" | "current" | "stale";
}

/** The draft a proposed decision is edited as (`DEC-006`). */
export interface DecisionDraft {
  question: string;
  options: readonly DecisionOption[];
  outcome: string;
  rationale: string;
  ownerId: string;
  /** A date-input value. */
  decidedAt: string;
  /** A date-input value, empty when the decision has no review date. */
  reviewAt: string;
  citations: readonly DecisionCitation[];
}

/** Capitalises a vocabulary noun for the start of a sentence. */
export function sentenceCase(noun: string): string {
  return noun.length === 0 ? noun : noun[0].toUpperCase() + noun.slice(1);
}
