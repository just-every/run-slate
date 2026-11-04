import { assertActionScope, validateRuleScope } from "./scope";
import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { commitOperation, mutationGuard } from "../../app/operations";
import {
  requireContainerLevel,
  requireWorkspaceOwner,
  currentSubject,
} from "../sharing/current-access";
import { database, revision } from "../databases/repository";
import { createUlid } from "../../shared/ulid";
import { readRunHistory } from "./run-log";
import type { RuleDefinition, RuleRow } from "./types";
export async function authorizeRule(
  ctx: FeatureContext,
  rule: Pick<RuleRow, "scope" | "source_database_id" | "container_id">,
  edit = false,
) {
  await currentSubject(ctx);
  if (rule.scope === "source") {
    if (!rule.source_database_id)
      throw new ApiProblem(400, "INVALID_SCOPE", "Source database required.");
    await database(ctx, rule.source_database_id, edit ? "edit" : "view");
  } else if (rule.scope === "container") {
    if (!rule.container_id)
      throw new ApiProblem(400, "INVALID_SCOPE", "Container required.");
    await requireContainerLevel(ctx, rule.container_id, edit ? "edit" : "view");
  } else await requireWorkspaceOwner(ctx);
}
export async function ruleRow(ctx: FeatureContext, id: string, edit = false) {
  const r = await ctx.db
    .prepare("SELECT * FROM automation_rules WHERE id=? AND workspace_id=?")
    .bind(id, ctx.actor.workspaceId)
    .first<RuleRow>();
  if (!r) throw new ApiProblem(404, "NOT_FOUND", "Not found.");
  await authorizeRule(ctx, r, edit);
  if (!edit) await authorizeDefinition(ctx,r);
  return r;
}
export function validateRule(rule: RuleDefinition) {
  if (
    !rule.name?.trim() ||
    !["source", "container", "site"].includes(rule.scope) ||
    !Array.isArray(rule.conditions) ||
    !Array.isArray(rule.actions) ||
    rule.actions.length > 50
  )
    throw new ApiProblem(400, "INVALID_RULE", "Invalid rule configuration.");
  if (
    ![
      "created",
      "properties",
      "blocks",
      "published",
      "record-created",
      "record-updated",
      "schedule",
    ].includes(rule.trigger?.event)
  )
    throw new ApiProblem(400, "INVALID_TRIGGER", "Unsupported trigger.");
  if (
    rule.trigger.event === "schedule" &&
    (!Number.isInteger(rule.trigger.intervalMinutes) ||
      rule.trigger.intervalMinutes! < 1 ||
      !rule.trigger.startsAt ||
      !Number.isFinite(Date.parse(rule.trigger.startsAt)))
  )
    throw new ApiProblem(
      400,
      "INVALID_SCHEDULE",
      "Choose a valid start and positive interval in minutes.",
    );
  for (const a of rule.actions) {
    if ((rule.scope === "source" && (a.type === "create-page" || a.type === "create-record" && a.databaseId !== rule.sourceDatabaseId)) ||
        (rule.scope === "container" && (a.type === "create-page" || a.type === "move") && a.containerId !== rule.containerId))
      throw new ApiProblem(403,"AUTOMATION_SCOPE","Action destination is outside the declared rule scope.");
    if (
      ![
        "edit-fields",
        "create-page",
        "create-record",
        "move",
        "archive",
        "comment",
        "notify",
      ].includes(a.type)
    )
      throw new ApiProblem(
        400,
        "FORBIDDEN_AUTOMATION_ACTION",
        "Automation cannot execute this action.",
      );
  }
}
export async function saveRule(
  ctx: FeatureContext,
  input: RuleDefinition & {
    operationKey: string;
    expectedRevisionId?: string;
  },
) {
  validateRule(input);
  return commitOperation(ctx, {
    operationKey: input.operationKey,
    action: "automation.configure",
    request: input,
    authorize: async () => {
      if (input.id) {
        const r = await ruleRow(ctx, input.id, true);
        if (r.actor_member_id !== ctx.actor.id)
          throw new ApiProblem(
            403,
            "ACTOR_REQUIRED",
            "Only the rule actor can change its delegated actions.",
          );
      }
      await authorizeRule(
        ctx,
        {
          scope: input.scope,
          source_database_id: input.sourceDatabaseId ?? null,
          container_id: input.containerId ?? null,
        },
        true,
      );
    },
    prepare: async ({ revisionId }) => {
      await validateRuleScope(ctx, input);
      const id = input.id ?? createUlid(),
        statements = input.id
          ? [
              mutationGuard(
                ctx.db,
                "SELECT revision_id=? FROM automation_rules WHERE id=?",
                [input.expectedRevisionId ?? "", id],
              ),
            ]
          : [];
      statements.push(
        ctx.db
          .prepare(
            "INSERT INTO automation_rules (id,workspace_id,source_database_id,container_id,scope,name,trigger_json,conditions_json,branch_json,actions_json,actor_member_id,disabled_at,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_database_id=excluded.source_database_id,container_id=excluded.container_id,scope=excluded.scope,name=excluded.name,trigger_json=excluded.trigger_json,conditions_json=excluded.conditions_json,branch_json=excluded.branch_json,actions_json=excluded.actions_json,disabled_at=excluded.disabled_at,disabled_reason=NULL,consecutive_failures=0,updated_at=excluded.updated_at,revision_id=excluded.revision_id",
          )
          .bind(
            id,
            ctx.actor.workspaceId,
            input.sourceDatabaseId ?? null,
            input.containerId ?? null,
            input.scope,
            input.name,
            JSON.stringify(input.trigger),
            JSON.stringify(input.conditions),
            input.branch ? JSON.stringify(input.branch) : null,
            JSON.stringify(input.actions),
            ctx.actor.id,
            input.disabled ? ctx.now : null,
            ctx.now,
            ctx.now,
            revisionId,
          ),
        revision(ctx, revisionId, "automation-rule", id, input),
        ctx.db
          .prepare(
            "INSERT INTO automation_runs (id,rule_id,workspace_id,actor_member_id,state,trigger_json,created_at,finished_at) VALUES (?,?,?,?,'configuration-changed','{}',?,?)",
          )
          .bind(
            createUlid(),
            id,
            ctx.actor.workspaceId,
            ctx.actor.id,
            ctx.now,
            ctx.now,
          ),
      );
      return {
        entity: { id, kind: "automation-rule", revisionId },
        value: { id, revisionId },
        statements,
      };
    },
  });
}
export async function listRules(ctx: FeatureContext) {
  await currentSubject(ctx);
  const rows = await ctx.db
    .prepare(
      "SELECT * FROM automation_rules WHERE workspace_id=? ORDER BY name,id",
    )
    .bind(ctx.actor.workspaceId)
    .all<RuleRow>();
  const items = [];
  for (const r of rows.results) {
    try {
      await authorizeRule(ctx, r);
      await authorizeDefinition(ctx,r);
      const failure = await ctx.db.prepare(
        "SELECT state,created_at,detail_json FROM automation_runs WHERE rule_id=? AND state IN ('error','failure') ORDER BY created_at DESC,id DESC LIMIT 1",
      ).bind(r.id).first<{state: string; created_at: string; detail_json: string}>();
      items.push({...r, latestFailure: failure ? {
        state: failure.state, createdAt: failure.created_at,
        message: JSON.parse(failure.detail_json).message,
      } : null});
    } catch (e) {
      if (!(e instanceof ApiProblem) || ![403, 404].includes(e.status)) throw e;
    }
  }
  return { items };
}
export async function runLog(ctx: FeatureContext, id: string) {
  return readRunHistory(ctx, await ruleRow(ctx, id));
}

/** Delegated literal payloads belong to the actor, and remain gated by current destinations. */
export async function authorizeDefinition(ctx: FeatureContext, rule: RuleRow) {
  if (rule.actor_member_id !== ctx.actor.id) throw new ApiProblem(403,"RULE_AUDIENCE","Rule definitions are private to their delegated actor.");
  for (const action of JSON.parse(rule.actions_json)) await assertActionScope(ctx,rule,action);
}
