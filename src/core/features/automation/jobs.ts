import { automationActivity } from "./activity";
import { processAutomationJob } from "./worker";
export { processAutomationJob } from "./worker";
import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { mutationGuard } from "../../app/operations";
import { createUlid } from "../../shared/ulid";
import { currentSubject, requirePageLevel } from "../sharing/current-access";
import { authorizeRule } from "./service";
import type { RuleRow, AutomationEvent, RuleAction } from "./types";
import { matches } from "../databases/values";
import { openRecord } from "../databases/records";
import { readPage } from "../pages/service";
import {
  executeAction,
  prepareAction,
  type AutomationAdapters,
  type PreparedAction,
} from "./actions";
export interface AutomationLimits {
  chainDepth: number;
  runsPerMinute: number;
  consecutiveFailures: number;
  targetsPerRun: number;
}
export const defaultAutomationLimits: AutomationLimits = {
  chainDepth: 5,
  runsPerMinute: 100,
  consecutiveFailures: 3,
  targetsPerRun: 100,
};
export async function actorContext(ctx: FeatureContext, rule: RuleRow) {
  const actor = await ctx.db
    .prepare(
      "SELECT id,workspace_id AS workspaceId,email,display_name AS displayName,display_name AS name,initials,role FROM members WHERE id=? AND workspace_id=? AND status='active'",
    )
    .bind(rule.actor_member_id, rule.workspace_id)
    .first<FeatureContext["actor"]>();
  if (!actor)
    throw new ApiProblem(
      401,
      "ACTOR_INACTIVE",
      "The automation actor is inactive.",
    );
  return { ...ctx, actor, authorizationEpoch: undefined };
}
export async function enqueueAutomationEvent(
  ctx: FeatureContext,
  event: AutomationEvent,
  limits = defaultAutomationLimits,
) {
  await currentSubject(ctx);
  // Scheduled targets are internal durable commands; the worker checks the rule actor,
  // rather than borrowing the maintenance runner's unrelated page grants.
  if (event.pageId && !(event.event === "schedule" && event.ruleId)) await requirePageLevel(ctx, event.pageId, "view");
  const rules = await ctx.db
    .prepare("SELECT * FROM automation_rules WHERE workspace_id=?")
    .bind(ctx.actor.workspaceId)
    .all<RuleRow>();
  const queued: string[] = [];
  for (const r of rules.results) {
    const trigger = JSON.parse(r.trigger_json);
    if (event.occurredAt && r.created_at > event.occurredAt) continue;
    if (
      (event.ruleId && event.ruleId !== r.id) ||
      trigger.event !== event.event ||
      (r.scope === "source" && r.source_database_id !== event.databaseId) ||
      (r.scope === "container" && r.container_id !== event.containerId)
    )
      continue;
    const prior = await ctx.db
      .prepare("SELECT id FROM automation_jobs WHERE rule_id=? AND event_key=?")
      .bind(r.id, event.key)
      .first();
    if (prior) continue;
    let state = "queued",
      reason: string | null = null;
    if (r.disabled_at) {
      state = "disabled";
      reason = "Rule is disabled.";
    } else if (
      event.chainRuleIds?.includes(r.id) ||
      (event.depth ?? 0) >= limits.chainDepth
    ) {
      state = "throttled";
      reason = "Automation chain limit reached.";
    }
    const runId = createUlid(),
      jobId = createUlid();
    const count = await ctx.db
      .prepare(
        "SELECT COUNT(*) AS n FROM automation_runs WHERE workspace_id=? AND created_at>=? AND state NOT IN ('configuration-changed','throttled','disabled')",
      )
      .bind(
        ctx.actor.workspaceId,
        new Date(Date.parse(ctx.now) - 60000).toISOString(),
      )
      .first<{
        n: number;
      }>();
    if (state === "queued" && count!.n >= limits.runsPerMinute) {
      state = "throttled";
      reason = "Workspace automation rate limit reached.";
    }
    try {
      await ctx.db.batch([
        ...(state === "queued"
          ? [
              mutationGuard(
                ctx.db,
                "SELECT COUNT(*)<? FROM automation_runs WHERE workspace_id=? AND created_at>=? AND state NOT IN ('configuration-changed','throttled','disabled')",
                [
                  limits.runsPerMinute,
                  ctx.actor.workspaceId,
                  new Date(Date.parse(ctx.now) - 60000).toISOString(),
                ],
              ),
            ]
          : []),
        ctx.db
          .prepare(
            "INSERT INTO automation_runs (id,rule_id,workspace_id,actor_member_id,state,trigger_json,detail_json,parent_run_id,chain_depth,queued_at,finished_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            runId,
            r.id,
            ctx.actor.workspaceId,
            r.actor_member_id,
            state,
            JSON.stringify(event),
            JSON.stringify({ reason, ruleRevisionId: r.revision_id }),
            event.parentRunId ?? null,
            event.depth ?? 0,
            ctx.now,
            state === "queued" ? null : ctx.now,
            ctx.now,
          ),
        ctx.db
          .prepare(
            "INSERT INTO automation_jobs (id,run_id,event_key,rule_id,payload_json,state,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            jobId,
            runId,
            event.key,
            r.id,
            JSON.stringify({ event, ruleRevisionId: r.revision_id }),
            state,
            ctx.now,
          ),
        automationActivity(ctx, runId, r.actor_member_id, state),
      ]);
      if (state === "queued") queued.push(jobId);
    } catch (e) {
      if (String(e).includes("UNIQUE constraint")) continue;
      if (
        String(e).includes("core_write_guards") ||
        String(e).includes("CHECK constraint")
      ) {
        await ctx.db.batch([
          ctx.db
            .prepare(
              "INSERT INTO automation_runs (id,rule_id,workspace_id,actor_member_id,state,trigger_json,detail_json,parent_run_id,chain_depth,finished_at,created_at) VALUES (?,?,?,?,'throttled',?,?,?,?,?,?)",
            )
            .bind(
              runId,
              r.id,
              ctx.actor.workspaceId,
              r.actor_member_id,
              JSON.stringify(event),
              JSON.stringify({
                reason: "Workspace automation rate limit reached.",
              }),
              event.parentRunId ?? null,
              event.depth ?? 0,
              ctx.now,
              ctx.now,
            ),
          ctx.db
            .prepare(
              "INSERT INTO automation_jobs (id,run_id,event_key,rule_id,payload_json,state,created_at) VALUES (?,?,?,?,?,'throttled',?)",
            )
            .bind(
              jobId,
              runId,
              event.key,
              r.id,
              JSON.stringify({ event, ruleRevisionId: r.revision_id }),
              ctx.now,
            ),
          automationActivity(ctx, runId, r.actor_member_id, "throttled"),
        ]);
        continue;
      }
      throw e;
    }
  }
  return { jobIds: queued };
}
export async function runAutomationSchedule(
  ctx: FeatureContext,
  adapters: AutomationAdapters,
  limits = defaultAutomationLimits,
) {
  const rules = await ctx.db
    .prepare(
      "SELECT * FROM automation_rules WHERE workspace_id=? AND disabled_at IS NULL AND json_extract(trigger_json,'$.event')='schedule'",
    )
    .bind(ctx.actor.workspaceId)
    .all<RuleRow>();
  for (const r of rules.results) {
    const t = JSON.parse(r.trigger_json);
    const elapsed = Date.parse(ctx.now) - Date.parse(t.startsAt);
    if (elapsed < 0) continue;
    const slot = Math.floor(elapsed / (t.intervalMinutes * 60000));
    const targeted = r.scope === "source" && (r.branch_json || JSON.parse(r.conditions_json).length || JSON.parse(r.actions_json).some((a: RuleAction)=>!["create-page","create-record"].includes(a.type)));
    const targets = targeted ? (await ctx.db.prepare("SELECT r.page_id,p.container_id FROM database_records r JOIN pages p ON p.id=r.page_id WHERE r.database_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL").bind(r.source_database_id).all<{page_id:string;container_id:string}>()).results : [{page_id:undefined,container_id:undefined}];
    for (const target of targets) await enqueueAutomationEvent(
      ctx,
      {
        key: `schedule:${r.id}:${slot}:${target.page_id ?? "root"}`,
        pageId: target.page_id,
        ruleId: r.id,
        event: "schedule",
        databaseId: r.source_database_id ?? undefined,
        containerId: target.container_id ?? r.container_id ?? undefined,
      },
      limits,
    );
  }
  const jobs = await ctx.db
    .prepare(
      "SELECT j.id FROM automation_jobs j JOIN automation_rules r ON r.id=j.rule_id WHERE r.workspace_id=? AND (j.state='queued' OR j.state='running' AND j.lease_until<?) ORDER BY j.created_at LIMIT 50",
    )
    .bind(ctx.actor.workspaceId, ctx.now)
    .all<{
      id: string;
    }>();
  for (const j of jobs.results)
    await processAutomationJob(ctx, j.id, adapters, limits);
}
