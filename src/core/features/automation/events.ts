import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import {
  enqueueAutomationEvent,
  runAutomationSchedule,
  type AutomationLimits,
  defaultAutomationLimits,
} from "./jobs";
import { automationAdapters } from "./adapters";
/** Drain committed content outbox; operation keys recover causal ancestry across restarts. */
export async function runAutomationMaintenance(
  ctx: FeatureContext,
  limits: AutomationLimits = defaultAutomationLimits,
) {
  const cursor =
    (
      await ctx.db
        .prepare(
          "SELECT sequence FROM automation_event_cursors WHERE workspace_id=?",
        )
        .bind(ctx.actor.workspaceId)
        .first<{
          sequence: number;
        }>()
    )?.sequence ?? 0;
  const events = await ctx.db
    .prepare(
      "SELECT e.*,p.database_id,p.container_id,p.page_kind FROM content_events e JOIN pages p ON p.id=e.page_id WHERE p.workspace_id=? AND e.sequence>? ORDER BY e.sequence LIMIT 100",
    )
    .bind(ctx.actor.workspaceId, cursor)
    .all<{
      sequence: number;
      page_id: string;
      revision_id: string;
      actor_member_id: string;
      kind: string;
      database_id: string | null;
      container_id: string;
      page_kind: string;
      created_at: string;
    }>();
  for (const e of events.results) {
    const origin = await ctx.db
      .prepare(
        "SELECT operation_key FROM operation_receipts WHERE workspace_id=? AND json_extract(response_json,'$.receipt.revisionId')=? LIMIT 1",
      )
      .bind(ctx.actor.workspaceId, e.revision_id)
      .first<{
        operation_key: string;
      }>();
    let parentRunId: string | undefined,
      depth = 0,
      chainRuleIds: string[] = [];
    if (origin?.operation_key.startsWith("auto:")) {
      parentRunId = origin.operation_key.split(":")[1];
      const parent = await ctx.db
        .prepare(
          "SELECT rule_id,trigger_json,chain_depth FROM automation_runs WHERE id=?",
        )
        .bind(parentRunId)
        .first<{
          rule_id: string;
          trigger_json: string;
          chain_depth: number;
        }>();
      if (parent) {
        depth = parent.chain_depth + 1;
        chainRuleIds = [
          ...(JSON.parse(parent.trigger_json).chainRuleIds ?? []),
          parent.rule_id,
        ];
      }
    }
    const actor = await ctx.db
      .prepare(
        "SELECT id,workspace_id AS workspaceId,email,display_name AS displayName,initials,role FROM members WHERE id=? AND status='active'",
      )
      .bind(e.actor_member_id)
      .first<FeatureContext["actor"]>();
    if (actor) {
      try {
        await enqueueAutomationEvent(
          { ...ctx, actor },
          {
            key: `content:${e.sequence}`,
            occurredAt: e.created_at,
            event:
              e.page_kind === "record" && e.kind === "created"
                ? "record-created"
                : e.page_kind === "record" &&
                    ["properties", "record-properties"].includes(e.kind)
                  ? "record-updated"
                  : e.kind,
            pageId: e.page_id,
            databaseId: e.database_id ?? undefined,
            containerId: e.container_id,
            parentRunId,
            depth,
            chainRuleIds,
          },
          limits,
        );
      } catch (error) {
        if (
          !(error instanceof ApiProblem) ||
          ![401, 403, 404].includes(error.status)
        )
          throw error;
      }
    }
    await ctx.db
      .prepare(
        "INSERT INTO automation_event_cursors (workspace_id,sequence) VALUES (?,?) ON CONFLICT(workspace_id) DO UPDATE SET sequence=MAX(sequence,excluded.sequence)",
      )
      .bind(ctx.actor.workspaceId, e.sequence)
      .run();
  }
  await runAutomationSchedule(ctx, automationAdapters, limits);
}
export async function scheduledAutomation(
  env: import("../../app/types").AppBindings,
  now = new Date().toISOString(),
) {
  const workspaces = await env.DB.prepare("SELECT id FROM workspaces").all<{
    id: string;
  }>();
  for (const workspace of workspaces.results) {
    const actor = await env.DB.prepare(
      "SELECT m.id,m.workspace_id AS workspaceId,w.name AS workspaceName,m.email,m.display_name AS displayName,m.initials,m.role FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? AND m.status='active' ORDER BY m.id LIMIT 1",
    )
      .bind(workspace.id)
      .first<FeatureContext["actor"]>();
    if (actor)
      await runAutomationMaintenance({
        db: env.DB,
        files: env.FILES,
        jobs: env.JOBS,
        actor,
        now,
      });
  }
}
export async function handleAutomationJob(
  env: import("../../app/types").AppBindings,
  message: unknown,
): Promise<boolean> {
  if (
    !message ||
    typeof message !== "object" ||
    (
      message as {
        type?: string;
      }
    ).type !== "automation.drain"
  )
    return false;
  await scheduledAutomation(env);
  return true;
}
