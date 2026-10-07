import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { id } from './persistence';
import type { ModelRoute } from './provider';
export function reserveBudget(ctx:FeatureContext,runId:string,amount:number,route:ModelRoute,skillRevisionId?:string):D1PreparedStatement[]{
 if(amount>route.maxRunMicros)throw new ApiProblem(429,'RUN_BUDGET_EXCEEDED','The estimated maximum exceeds the owner run ceiling.');
 const month=ctx.now.slice(0,7);
 const ownerCeiling=route.accountingUnit==='tokens'?"COALESCE((SELECT monthly_units FROM intelligence_allowances WHERE workspace_id=workspaces.id),0)":'ai_monthly_budget_micros';
 const unitFilter=route.accountingUnit==='tokens'?"provider='local-codex'":"provider<>'local-codex'";
 const charge='CASE WHEN released_at IS NULL THEN MAX(reserved_micros,charged_micros+uncertain_micros) ELSE charged_micros+uncertain_micros END';
 return [mutationGuard(ctx.db,`SELECT ai_enabled=1 AND ${ownerCeiling}>0 AND ${ownerCeiling}>=?+(SELECT COALESCE(SUM(${charge}),0) FROM intelligence_budgets WHERE workspace_id=? AND month=? AND ${unitFilter}) FROM workspaces WHERE id=?`,[amount,ctx.actor.workspaceId,month,ctx.actor.workspaceId]),mutationGuard(ctx.db,`SELECT ? >= ?+COALESCE(SUM(${charge}),0) FROM intelligence_budgets WHERE workspace_id=? AND month=? AND provider=?`,[route.monthlyMicros,amount,ctx.actor.workspaceId,month,route.provider]),ctx.db.prepare('INSERT INTO intelligence_budgets(id,workspace_id,run_id,month,provider,skill_revision_id,reserved_micros,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id(),ctx.actor.workspaceId,runId,month,route.provider,skillRevisionId??null,amount,ctx.now)];
}
export function settleBudget(ctx:FeatureContext,runId:string,cost:number){return ctx.db.prepare('UPDATE intelligence_budgets SET released_at=? WHERE id=(SELECT id FROM intelligence_budgets WHERE run_id=? ORDER BY created_at DESC,id DESC LIMIT 1)').bind(ctx.now,runId);}
/** Recheck changed ceilings/rates at every execution boundary without recapturing an existing reservation. */
export async function recheckBudget(ctx:FeatureContext,run:import('./contracts').RunRow,route:ModelRoute){
 const stored=JSON.parse(run.input_json).route as ModelRoute|undefined;
 if(!stored||['inputMicrosPerMillion','outputMicrosPerMillion','accountingUnit'].some(key=>stored[key as keyof ModelRoute]!==route[key as keyof ModelRoute]))throw new ApiProblem(409,'MODEL_PRICES_CHANGED','Model rates changed; prepare a newly budgeted successor.');
 if(run.reserved_micros>route.maxRunMicros)throw new ApiProblem(429,'RUN_BUDGET_EXCEEDED','The current owner run ceiling is lower than this reservation.');
 const charge='CASE WHEN released_at IS NULL THEN MAX(reserved_micros,charged_micros+uncertain_micros) ELSE charged_micros+uncertain_micros END';
 const totals=await ctx.db.prepare(`SELECT COALESCE(SUM(${charge}),0) total FROM intelligence_budgets WHERE workspace_id=? AND month=? AND provider=?`).bind(ctx.actor.workspaceId,ctx.now.slice(0,7),route.provider).first<{total:number}>();
 const workspace=await ctx.db.prepare('SELECT ai_monthly_budget_micros FROM workspaces WHERE id=?').bind(ctx.actor.workspaceId).first<{ai_monthly_budget_micros:number}>();
 const ceiling=route.accountingUnit==='tokens'?await ctx.db.prepare('SELECT monthly_units FROM intelligence_allowances WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<number>('monthly_units'):workspace?.ai_monthly_budget_micros;
 if(!ceiling||totals!.total>ceiling||totals!.total>route.monthlyMicros)throw new ApiProblem(429,'BUDGET_EXHAUSTED','The current provider or owner monthly ceiling does not cover committed work.');
}
