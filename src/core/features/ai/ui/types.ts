/**
 * The shapes the AI surfaces render. Every one of them is display data: times and
 * costs arrive already formatted, so no component here formats a date, a duration
 * or a currency. Nothing in this file invents a value — the surfaces render what
 * they are given and nothing else.
 */

export interface AiPerson {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** Capitalises a vocabulary noun for the start of a sentence. */
export function sentenceCase(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/**
 * `AI-002` — Queued → Running → Needs review → Completed, with Cancelled and
 * Failed reachable from any non-terminal state. Completed, Cancelled and Failed
 * are terminal.
 */
export type AiRunState = "queued" | "running" | "needs-review" | "completed" | "cancelled" | "failed";

export const aiRunLifecycle = ["queued", "running", "needs-review", "completed"] as const satisfies readonly AiRunState[];

export const aiRunStateLabel: Record<AiRunState, string> = {
  queued: "Queued",
  running: "Running",
  "needs-review": "Needs review",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** `AI-002` — a run is always started by one of these. `AI-010` records which. */
export type AiFeature =
  | "selection-edit"
  | "page-summary"
  | "comment-summary"
  | "difference-summary"
  | "workspace-answer"
  | "agent-run";

export const aiFeatureLabel: Record<AiFeature, string> = {
  "selection-edit": "Selection edit",
  "page-summary": "Page summary",
  "comment-summary": "Comment summary",
  "difference-summary": "Difference summary",
  "workspace-answer": "Workspace answer",
  "agent-run": "Agent run",
};

/**
 * `AI-008` — every way a run ends badly. `AI-009` allows a retry for exactly one
 * of them: a transient transport failure. Unusable output is never retried.
 */
export type AiFailureReason = "provider-error" | "over-budget" | "invalid-output" | "timed-out" | "transport" | "cancelled";

/** `AI-004` + `REV-005` — a citation names a page and the revision it read. */
export interface AiCitation {
  id: string;
  pageTitle: string;
  revisionLabel: string;
  containerLabel?: string | null;
  /** The passage the output drew on, where the run recorded one. */
  excerpt?: string | null;
  /** `REV-005` — set when the page has moved on since the cited revision. */
  newerRevisionLabel?: string | null;
}

/**
 * `AI-004` — a statement the product cannot cite. It is labelled unsourced and is
 * never presented as drawn from the workspace.
 */
export interface AiUnsourcedStatement {
  id: string;
  text: string;
}

/** `AI-003`/`AI-005` — one change a proposal offers. Nothing applies until accepted. */
export interface AiProposedChange {
  id: string;
  summary: string;
  /** What the change would land on: a page, a block, a comment. */
  targetLabel: string;
  before: string | null;
  after: string;
}

export interface AiDifferenceLine {
  id: string;
  kind: "added" | "removed" | "unchanged";
  text: string;
}

/** `AI-006` — an input whose revision moved while the run was in flight. */
export interface AiStaleInput {
  id: string;
  pageTitle: string;
  runRevisionLabel: string;
  currentRevisionLabel: string;
  changedBy: AiPerson;
  changedAtLabel: string;
  difference: readonly AiDifferenceLine[];
}

/** `AI-005` — what acceptance records, shown back on the accepted proposal. */
export interface AiAcceptanceRecord {
  acceptedBy: AiPerson;
  acceptedAtLabel: string;
  appliedChangeSummaries: readonly string[];
  inputRevisionLabels: readonly string[];
  provider: string;
  model: string;
}

/** `AI-010` — one row of the usage record. */
export interface AiUsageRow {
  id: string;
  startedAtLabel: string;
  provider: string;
  model: string;
  /** Tokens, or the provider's own unit where it does not bill in tokens. */
  units: string;
  unitKind: "tokens" | "provider units";
  cost: string;
  duration: string;
  status: AiRunState;
  feature: AiFeature;
  /** `AI-014` — an agent run names its agent on the usage row. */
  agentName?: string | null;
}

/** `AI-014` — an agent is a named record with instructions, a scope and an owner. */
export interface AiAgent {
  id: string;
  name: string;
  instructions: string;
  sourceScopeLabel: string;
  owner: AiPerson;
  lastRunAtLabel: string | null;
}

/** `AI-015` — one turn of the kept conversation. */
export interface AiChatMessage {
  id: string;
  author: "member" | "assistant";
  authorName: string;
  text: string;
  citations?: readonly AiCitation[];
  unsourced?: readonly AiUnsourcedStatement[];
  /**
   * `AI-015` — the answer is "I could not find that in what you can read". The
   * flag keeps that case out of the sourced-answer shape entirely, so it can
   * never be dressed up with a provider mark or a citation footer.
   */
  notFound?: boolean;
}

/** `AI-017` — the named actions, beside the free-form instruction. */
export const aiWritingActionIds = [
  "improve",
  "shorten",
  "lengthen",
  "proofread",
  "explain",
  "translate",
  "change-tone",
] as const;

export type AiWritingActionId = (typeof aiWritingActionIds)[number];

export const aiWritingActionLabel: Record<AiWritingActionId, string> = {
  improve: "Improve writing",
  shorten: "Make shorter",
  lengthen: "Make longer",
  proofread: "Proofread",
  explain: "Explain this",
  translate: "Translate",
  "change-tone": "Change tone",
};

/** `AI-017` — what a member may do with a result, before anything changes. */
export type AiResultDisposition = "insert-below" | "replace" | "refine" | "discard";

/** `AI-016` — the three things a summary can be taken of. */
export type AiSummarySubject = "page" | "comments" | "difference";
