import { mutationGuard } from "../../app/operations";
import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { database, fields } from "../databases/repository";
import { requirePageLevel, requireContainerLevel } from "../sharing/current-access";
import type { RuleRow, RuleAction, RuleDefinition } from "./types";
type Scope = Pick<RuleRow,"scope"|"source_database_id"|"container_id">;
const denied = () => { throw new ApiProblem(403,"AUTOMATION_SCOPE","Action target is outside the rule's current scope."); };
export async function assertPageScope(ctx: FeatureContext, scope: Scope, pageId: string) {
  await requirePageLevel(ctx,pageId,"view");
  const row = await ctx.db.prepare("SELECT p.container_id,r.database_id FROM pages p LEFT JOIN database_records r ON r.page_id=p.id WHERE p.id=? AND p.workspace_id=?").bind(pageId,ctx.actor.workspaceId).first<{container_id:string;database_id:string|null}>();
  if (!row || scope.scope === "source" && row.database_id !== scope.source_database_id || scope.scope === "container" && row.container_id !== scope.container_id) denied();
}
export async function assertActionScope(ctx: FeatureContext, scope: Scope, action: RuleAction, target?: string) {
  if (target) await assertPageScope(ctx,scope,target);
  if (action.type === "create-record") {
    const db = await database(ctx,action.databaseId,"edit");
    if (scope.scope === "source" && action.databaseId !== scope.source_database_id) denied();
    if (scope.scope === "container") {
      const p = await ctx.db.prepare("SELECT container_id FROM pages WHERE id=?").bind(db.page_id).first<{container_id:string}>();
      if (p?.container_id !== scope.container_id) denied();
    }
  }
  if (action.type === "create-page" || action.type === "move") {
    await requireContainerLevel(ctx,action.containerId,"edit");
    if (action.parentPageId) await requirePageLevel(ctx,action.parentPageId,"edit");
    if (scope.scope === "container" && action.containerId !== scope.container_id) denied();
    if (scope.scope === "source") {
      if (action.type === "create-page") denied();
      const db = await database(ctx,scope.source_database_id!,"edit");
      const p = await ctx.db.prepare("SELECT container_id FROM pages WHERE id=?").bind(db.page_id).first<{container_id:string}>();
      if (action.parentPageId !== db.page_id || action.containerId !== p?.container_id) denied();
    }
  }
}
export async function validateRuleScope(ctx: FeatureContext, rule: RuleDefinition) {
  const scope = {scope:rule.scope,source_database_id:rule.sourceDatabaseId??null,container_id:rule.containerId??null};
  for (const action of rule.actions) await assertActionScope(ctx,scope,action);
  if (rule.branch && rule.scope === "source") {
    const relation = (await fields(ctx,rule.sourceDatabaseId!)).find(f=>f.id === rule.branch!.relationField && f.type === "relation");
    if (!relation || relation.config.databaseId !== rule.sourceDatabaseId) denied();
  }
  if (rule.trigger.event === "schedule" && rule.scope !== "source" && (rule.branch || rule.conditions.length || rule.actions.some(a=>!["create-page","create-record"].includes(a.type))))
    throw new ApiProblem(400,"SCHEDULE_TARGET_REQUIRED","Scheduled target actions require a source database; site/container schedules support creation actions.");
}

/** Bind scope checks to the semantic action's atomic D1 batch, including moves racing preparation. */
export function scopedActionContext(ctx: FeatureContext, scope: Scope, action: RuleAction, target: string) {
  const guards: D1PreparedStatement[] = [];
  const page = (id:string) => {
    if (scope.scope === "source") guards.push(mutationGuard(ctx.db,"SELECT database_id=? FROM database_records WHERE page_id=?",[scope.source_database_id,id]));
    if (scope.scope === "container") guards.push(mutationGuard(ctx.db,"SELECT container_id=? FROM pages WHERE id=? AND deleted_at IS NULL",[scope.container_id,id]));
  };
  if (target) page(target);
  if (action.type === "create-record" && scope.scope === "container") guards.push(mutationGuard(ctx.db,"SELECT p.container_id=? FROM databases d JOIN pages p ON p.id=d.page_id WHERE d.id=?",[scope.container_id,action.databaseId]));
  if ((action.type === "create-page" || action.type === "move") && action.parentPageId) guards.push(mutationGuard(ctx.db,"SELECT container_id=? FROM pages WHERE id=? AND deleted_at IS NULL",[action.containerId,action.parentPageId]));
  const db = new Proxy(ctx.db,{get(target,key){
    if (key === "batch") return async (statements: D1PreparedStatement[]) => {
      const results = await target.batch([...guards, ...statements]);
      return results.slice(guards.length);
    };
    const value=Reflect.get(target,key);return typeof value === "function" ? value.bind(target) : value;
  }});
  return {...ctx,db};
}
