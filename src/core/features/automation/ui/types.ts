import type { AutomationScope } from "../../../shared/knowledge/model";
import { containerNoun, plural, recordNoun, sentenceCase } from "./nouns";

/**
 * Local domain types for the automation surfaces (`AUTO-001` … `AUTO-005`).
 *
 * Design decision: every time arrives already formatted — each field is named
 * `…Label` — so no component here formats a date. The same holds for a run's
 * touched records: they arrive resolved to titles, because a run log may never
 * name a record its reader cannot see.
 */

/** `AUTO-001` — triggers are record and page events and a schedule. */
export type RuleTriggerKind =
  | "record-created"
  | "record-field-changed"
  | "record-moved"
  | "page-created"
  | "page-edited"
  | "page-commented"
  | "page-archived"
  | "schedule";

/** `AUTO-001` — what an action may do. Nothing outside this list is offered. */
export type RuleActionKind =
  | "edit-field"
  | "create-page"
  | "create-record"
  | "move"
  | "archive"
  | "add-comment"
  | "send-notification";

export const ruleTriggerKindLabel: Record<RuleTriggerKind, string> = {
  "record-created": `${sentenceCase(recordNoun)} added`,
  "record-field-changed": `${sentenceCase(recordNoun)} field changed`,
  "record-moved": `${sentenceCase(recordNoun)} moved`,
  "page-created": "Page created",
  "page-edited": "Page edited",
  "page-commented": "Comment added",
  "page-archived": "Page archived",
  schedule: "On a schedule",
};

export const ruleActionKindLabel: Record<RuleActionKind, string> = {
  "edit-field": "Edit a field",
  "create-page": "Create a page",
  "create-record": `Create a ${recordNoun}`,
  move: "Move it",
  archive: "Archive it",
  "add-comment": "Add a comment",
  "send-notification": "Send a notification",
};

/** `AUTO-003` — the ten states a run can end in. */
export type RuleRunState =
  | "configuration-changed"
  | "queued"
  | "running"
  | "success"
  | "no-action"
  | "condition-not-met"
  | "throttled"
  | "error"
  | "failure"
  | "disabled";

export type RunStateTone = "neutral" | "accent" | "good" | "warn" | "danger" | "draft" | "outline";

export const ruleRunStateCopy: Record<RuleRunState, { label: string; tone: RunStateTone }> = {
  "configuration-changed": { label: "Configuration changed", tone: "draft" },
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  success: { label: "Success", tone: "good" },
  "no-action": { label: "No action", tone: "neutral" },
  "condition-not-met": { label: "Condition not met", tone: "neutral" },
  throttled: { label: "Throttled", tone: "warn" },
  error: { label: "Error", tone: "danger" },
  failure: { label: "Failure", tone: "danger" },
  disabled: { label: "Disabled", tone: "warn" },
};

/** `AUTO-003`, `BASE-OPS-004` — the states a reader must meet without searching. */
export function isFailedRun(state: RuleRunState): boolean {
  return state === "error" || state === "failure";
}

/** `AUTO-005` — what each scope value covers, said in one line on the selector. */
export const ruleScopeCopy: Record<AutomationScope, { label: string; statement: string }> = {
  source: {
    label: "This database",
    statement: `Runs on the ${plural(recordNoun)} of the one database the rule was created from.`,
  },
  container: {
    label: `This ${containerNoun}`,
    statement: `Runs on every page and ${recordNoun} in this ${containerNoun}, whichever database they sit in.`,
  },
  site: {
    label: "The whole workspace",
    statement: `Runs across every ${containerNoun} the actor can reach.`,
  },
};

export interface RuleActor {
  id: string;
  name: string;
  /** One line naming the access the rule is bound to, e.g. "Edit on People Ops". */
  accessSummary: string;
  imageUrl?: string | null;
}

/** One card on the rail, or one row of the `source` form. */
export interface RuleTriggerComponent {
  id: string;
  kind: RuleTriggerKind;
  /** The card's own summary line, e.g. "When Status becomes Blocked". */
  summary: string;
}

export interface RuleConditionComponent {
  id: string;
  label: string;
  summary: string;
}

export interface RuleActionComponent {
  id: string;
  kind: RuleActionKind;
  summary: string;
  /** `AUTO-002` — set when this action would exceed the actor's access. */
  exceedsActorAccess?: boolean;
}

/** `AUTO-001` — the optional branch over related records. */
export interface RuleBranch {
  id: string;
  label: string;
  summary: string;
  actions: readonly RuleActionComponent[];
}

export interface RuleDefinition {
  id: string;
  name: string;
  scope: AutomationScope;
  /** What the scope resolves to for this rule: a database, a container, the workspace. */
  scopeTargetLabel: string;
  enabled: boolean;
  actor: RuleActor;
  trigger: RuleTriggerComponent;
  conditions: readonly RuleConditionComponent[];
  branch: RuleBranch | null;
  actions: readonly RuleActionComponent[];
  /** `AUTO-005` — where an imported rule arrived from; it keeps the scope it came with. */
  importedFrom: string | null;
}

/** `AUTO-005` — one row of the cross-container rule list. */
export interface RuleListRow {
  id: string;
  name: string;
  scope: AutomationScope;
  scopeTargetLabel: string;
  triggerSummary: string;
  actorName: string;
  enabled: boolean;
  lastRunLabel: string | null;
  lastRunState: RuleRunState | null;
  /** `AUTO-003` — disabled after repeated failure, said wherever the name appears. */
  disabledAfterFailure: boolean;
}

export interface RuleRunTouched {
  id: string;
  title: string;
}

/** `AUTO-003` — one run. */
export interface RuleRun {
  id: string;
  ruleId: string;
  ruleName: string;
  triggerSummary: string;
  actorName: string;
  touched: readonly RuleRunTouched[];
  timeLabel: string;
  state: RuleRunState;
  /** Why it ended that way — the failure, the skipped action, the throttle. */
  detail: string | null;
}

/** `AUTO-003` — a rule switched off after repeated failure. */
export interface RuleDisabledAfterFailure {
  ruleName: string;
  failureCount: number;
  disabledAtLabel: string;
}

/** The surfaces that never render a denied state narrow `SurfaceState` to four. */
export type AutomationSurfaceState = "ready" | "loading" | "empty" | "error";
