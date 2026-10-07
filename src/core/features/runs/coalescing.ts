import type {FeatureContext} from '../../app/feature-context';
import {mutationGuard,requestHash} from '../../app/operations';
import type {AskInput,RunRow} from '../ai/contracts';
import {reauthorizeRun} from './repository';
export async function equivalenceKey(ctx:FeatureContext,input:AskInput,lineage:unknown){
 const {operationKey,...request}=input;
 return requestHash({request,actor:ctx.actor.id,credential:(ctx as FeatureContext&{agentCredentialId?:string}).agentCredentialId??null,lineage});
}
export async function reusableRun(ctx:FeatureContext,key:string){
 const row=await ctx.db.prepare("SELECT r.* FROM intelligence_run_equivalence e JOIN intelligence_runs r ON r.id=e.run_id WHERE e.workspace_id=? AND e.equivalence_key=? AND e.expires_at>? AND r.status IN ('queued','running','needs-review')").bind(ctx.actor.workspaceId,key,ctx.now).first<RunRow>();
 if(row)await reauthorizeRun(ctx,row);
 return row;
}
export function bindEquivalence(ctx:FeatureContext,key:string,runId:string){
 return [ctx.db.prepare("INSERT INTO intelligence_run_equivalence(workspace_id,equivalence_key,run_id,expires_at) VALUES(?,?,?,?) ON CONFLICT(workspace_id,equivalence_key) DO UPDATE SET run_id=excluded.run_id,expires_at=excluded.expires_at WHERE intelligence_run_equivalence.expires_at<=? OR NOT EXISTS(SELECT 1 FROM intelligence_runs r WHERE r.id=intelligence_run_equivalence.run_id AND r.status IN ('queued','running','needs-review'))").bind(ctx.actor.workspaceId,key,runId,new Date(Date.parse(ctx.now)+600000).toISOString(),ctx.now),mutationGuard(ctx.db,'SELECT run_id=? FROM intelligence_run_equivalence WHERE workspace_id=? AND equivalence_key=?',[runId,ctx.actor.workspaceId,key])];
}
