import type { FilterValue } from "../../../databases/ui/workspace/FilterBuilder";
export type Action = {
  type:
    | "edit-fields"
    | "create-page"
    | "create-record"
    | "move"
    | "archive"
    | "comment"
    | "notify";
  containerId?: string;
  databaseId?: string;
  parentPageId?: string;
  title?: string;
  values?: Record<string, unknown>;
  reason?: string;
  body?: string;
  recipientMemberIds?: string[];
  message?: string;
};
export type RuleDraft = {
  name: string;
  scope: "source" | "container" | "site";
  sourceDatabaseId?: string;
  containerId?: string;
  trigger: { event: string; intervalMinutes?: number; startsAt?: string };
  conditions: FilterValue[];
  branch?: { relationField: string };
  actions: Action[];
  disabled: boolean;
};
export type RuleRow = {
  id: string;
  name: string;
  scope: RuleDraft["scope"];
  source_database_id: string | null;
  container_id: string | null;
  trigger_json: string;
  conditions_json: string;
  branch_json: string | null;
  actions_json: string;
  revision_id: string;
  disabled_at: string | null;
  actor_member_id: string;
};
export function ruleDraft(rule?: RuleRow): RuleDraft {
  return rule
    ? {
        name: rule.name,
        scope: rule.scope,
        sourceDatabaseId: rule.source_database_id ?? undefined,
        containerId: rule.container_id ?? undefined,
        trigger: JSON.parse(rule.trigger_json),
        conditions: JSON.parse(rule.conditions_json),
        branch: rule.branch_json ? JSON.parse(rule.branch_json) : undefined,
        actions: JSON.parse(rule.actions_json),
        disabled: !!rule.disabled_at,
      }
    : {
        name: "",
        scope: "source",
        trigger: { event: "record-created" },
        conditions: [],
        actions: [],
        disabled: false,
      };
}
