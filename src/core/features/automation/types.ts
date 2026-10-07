import type { Filter, Values } from "../databases/values";
import type { JsonValue } from "../../shared/api/common";
export type RuleAction =
  | {
      type: "edit-fields";
      values: Values;
    }
  | {
      type: "create-page";
      containerId: string;
      parentPageId?: string;
      title: string;
    }
  | {
      type: "create-record";
      databaseId: string;
      title: string;
      values: Values;
    }
  | {
      type: "move";
      containerId: string;
      parentPageId?: string;
    }
  | {
      type: "archive";
      reason?: string;
    }
  | {
      type: "comment";
      body: JsonValue;
    }
  | {
      type: "notify";
      recipientMemberIds: string[];
      message: string;
    };
export interface RuleDefinition {
  id?: string;
  name: string;
  scope: "source" | "container" | "site";
  sourceDatabaseId?: string;
  containerId?: string;
  trigger: {
    event: string;
    intervalMinutes?: number;
    startsAt?: string;
  };
  conditions: Filter[];
  branch?: {
    relationField: string;
  };
  actions: RuleAction[];
  disabled?: boolean;
}
export interface RuleRow {
  id: string;
  workspace_id: string;
  source_database_id: string | null;
  container_id: string | null;
  scope: RuleDefinition["scope"];
  name: string;
  trigger_json: string;
  conditions_json: string;
  branch_json: string | null;
  actions_json: string;
  actor_member_id: string;
  disabled_at: string | null;
  revision_id: string;
  created_at: string;
}
export interface AutomationEvent {
  key: string;
  event: string;
  ruleId?: string;
  occurredAt?: string;
  pageId?: string;
  databaseId?: string;
  containerId?: string;
  parentRunId?: string;
  chainRuleIds?: string[];
  depth?: number;
}
