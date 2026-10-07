import { registerActivityResolver } from "../activity/service";
import { ruleRow } from "./service";
import { ApiProblem } from "../../app/problems";
import type { FeatureContext } from "../../app/feature-context";
import { createUlid } from "../../shared/ulid";
export function automationActivity(
  ctx: FeatureContext,
  runId: string,
  actorId: string,
  state: string,
) {
  return ctx.db
    .prepare(
      "INSERT INTO activity_entries (id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,automation_run_id,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      createUlid(),
      ctx.actor.workspaceId,
      actorId,
      "automation",
      `automation.${state}`,
      "automation-run",
      runId,
      JSON.stringify({ state }),
      runId,
      ctx.now,
    );
}

export function registerAutomationActivity() {
  const allowed = async (ctx: FeatureContext, ruleId: string) => {
    try { await ruleRow(ctx,ruleId); return true; }
    catch(e) { if (e instanceof ApiProblem && [401,403,404].includes(e.status)) return false; throw e; }
  };
  registerActivityResolver("automation-rule", allowed);
  registerActivityResolver("automation-run",async(ctx,id)=>{
    const run = await ctx.db.prepare("SELECT rule_id FROM automation_runs WHERE id=? AND workspace_id=?").bind(id,ctx.actor.workspaceId).first<{rule_id:string}>();
    return !!run && allowed(ctx,run.rule_id);
  });
}
