import type {FeatureContext} from '../../app/feature-context';
import {mutationGuard} from '../../app/operations';
import type {RunRow} from '../ai/contracts';
import {id} from '../ai/persistence';
/** attentionBudget is minutes per recipient per UTC day; admission reserves one bounded interruption. */
export function reserveAttention(ctx:FeatureContext,runId:string,key:string,recipient=ctx.actor.id){
 const day=ctx.now.slice(0,10);
 return [mutationGuard(ctx.db,"SELECT COALESCE(json_extract(policy_json,'$.attentionBudget'),0)*60 >= 30+COALESCE((SELECT SUM(seconds) FROM intelligence_interruptions WHERE workspace_id=? AND recipient_id=? AND substr(created_at,1,10)=? AND state IN ('reserved','delivered')),0) FROM intelligence_model_policy WHERE workspace_id=?",[ctx.actor.workspaceId,recipient,day,ctx.actor.workspaceId]),ctx.db.prepare("INSERT INTO intelligence_interruptions(id,workspace_id,recipient_id,equivalence_key,run_id,seconds,state,mandatory,created_at,updated_at) VALUES(?,?,?,?,?,30,'reserved',0,?,?)").bind(id(),ctx.actor.workspaceId,recipient,key,runId,ctx.now,ctx.now)];
}
export function releaseAttention(ctx:FeatureContext,runId:string){return ctx.db.prepare("UPDATE intelligence_interruptions SET state='released',updated_at=? WHERE run_id=? AND state='reserved'").bind(ctx.now,runId);}
export function deliverAttention(ctx:FeatureContext,run:RunRow,event:string){
 // Direct failure/review notices are mandatory: they must not disappear when another notice consumed the allowance.
 return [ctx.db.prepare("UPDATE intelligence_interruptions SET state='delivered',mandatory=1,updated_at=? WHERE run_id=? AND state='reserved'").bind(ctx.now,run.id),ctx.db.prepare("INSERT OR IGNORE INTO intelligence_interruptions(id,workspace_id,recipient_id,equivalence_key,run_id,seconds,state,mandatory,created_at,updated_at) SELECT ?,?,?,?, ?,30,'delivered',1,?,? WHERE NOT EXISTS(SELECT 1 FROM intelligence_interruptions WHERE run_id=? AND state='delivered')").bind(id(),run.workspace_id,run.requester_id,`${run.id}:${event}`,run.id,ctx.now,ctx.now,run.id)];
}
export async function requireAttentionCapacity(ctx:FeatureContext){
 const row=await ctx.db.prepare("SELECT COALESCE(json_extract(policy_json,'$.attentionBudget'),0)*60 AS ceiling,COALESCE((SELECT SUM(seconds) FROM intelligence_interruptions WHERE workspace_id=? AND recipient_id=? AND substr(created_at,1,10)=? AND state IN ('reserved','delivered')),0) AS used FROM intelligence_model_policy WHERE workspace_id=?").bind(ctx.actor.workspaceId,ctx.actor.id,ctx.now.slice(0,10),ctx.actor.workspaceId).first<{ceiling:number;used:number}>();
 if(!row||row.used+30>row.ceiling){const {ApiProblem}=await import('../../app/problems');throw new ApiProblem(429,'ATTENTION_BUDGET_EXHAUSTED','The daily interruption allowance is exhausted. Restart after it renews or the owner changes its bound.');}
}
