import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard,requestHash} from '../../app/operations';
import {requirePageLevel} from '../sharing/current-access';
import {resolveEvidence} from '../ai/evidence';
import {id,revision} from '../ai/persistence';
import {ambientScopeSchema,type AmbientScope,type AmbientEvent} from './ambient-contracts';
import type {z} from 'zod';
export async function requireAmbientScope(ctx:FeatureContext,scopeId:string,control=false){
 const row=await ctx.db.prepare('SELECT * FROM intelligence_ambient_scopes WHERE id=? AND workspace_id=?').bind(scopeId,ctx.actor.workspaceId).first<AmbientScope>();
 if(!row||(control&&row.owner_id!==ctx.actor.id)||!JSON.parse(row.audience_json).includes(ctx.actor.id))throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await requirePageLevel(ctx,row.page_id,'view');await resolveEvidence(ctx,JSON.parse(row.refs_json),[ctx.actor.id]);return row;
}
export async function prepareAmbientScope(ctx:FeatureContext,raw:z.input<typeof ambientScopeSchema>){
 const input=ambientScopeSchema.parse(raw);input.audience=[...new Set([ctx.actor.id,...input.audience])].sort();
 return commitOperation(ctx,{operationKey:input.operationKey,action:'inquiries.ambient',request:input,authorize:async()=>{await requirePageLevel(ctx,input.pageId,'view');await resolveEvidence(ctx,input.refs,input.audience,{current:true});},prepare:async({revisionId})=>{const scopeId=id();return {entity:{id:scopeId,kind:'ambient-scope',revisionId},value:{id:scopeId,revisionId,state:'active'},statements:[ctx.db.prepare("INSERT INTO intelligence_ambient_scopes(id,workspace_id,owner_id,page_id,revision_id,refs_json,audience_json,objective,state,sweep_seconds,audit_percent,threshold,next_sweep_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?)").bind(scopeId,ctx.actor.workspaceId,ctx.actor.id,input.pageId,revisionId,JSON.stringify(input.refs),JSON.stringify(input.audience),input.objective,input.sweepSeconds,input.auditPercent,input.threshold,ctx.now,ctx.now,ctx.now),revision(ctx,revisionId,'ambient-scope',scopeId,input)]};}});
}
export async function controlAmbientScope(ctx:FeatureContext,scopeId:string,input:{operationKey:string;expectedRevisionId:string;action:'stop'|'resume'}){
 const scope=await requireAmbientScope(ctx,scopeId,true);
 return commitOperation(ctx,{operationKey:input.operationKey,action:'inquiries.ambient-control',request:{scopeId,...input},authorize:async()=>{await requireAmbientScope(ctx,scopeId,true);if(input.action==='resume')await resolveEvidence(ctx,JSON.parse(scope.refs_json),JSON.parse(scope.audience_json),{current:true});},prepare:async({revisionId})=>({entity:{id:scopeId,kind:'ambient-scope',revisionId},value:{id:scopeId,state:input.action==='stop'?'stopped':'active',revisionId},statements:[mutationGuard(ctx.db,'SELECT revision_id=? FROM intelligence_ambient_scopes WHERE id=?',[input.expectedRevisionId,scopeId]),ctx.db.prepare('UPDATE intelligence_ambient_scopes SET state=?,reason=NULL,revision_id=?,next_sweep_at=?,updated_at=? WHERE id=?').bind(input.action==='stop'?'stopped':'active',revisionId,ctx.now,ctx.now,scopeId),...(input.action==='stop'?[ctx.db.prepare("UPDATE intelligence_budgets SET uncertain_micros=MAX(uncertain_micros,reserved_micros-charged_micros) WHERE released_at IS NULL AND run_id IN (SELECT r.id FROM intelligence_runs r JOIN intelligence_ambient_events e ON e.run_id=r.id WHERE e.scope_id=? AND r.status='running')").bind(scopeId),ctx.db.prepare("UPDATE intelligence_runs SET uncertain_cost_micros=MAX(uncertain_cost_micros,reserved_micros-cost_micros) WHERE status='running' AND id IN (SELECT run_id FROM intelligence_ambient_events WHERE scope_id=?)").bind(scopeId),ctx.db.prepare("UPDATE intelligence_runs SET status='cancelled',lease_id=NULL,settled_at=?,failure_reason='Ambient scope stopped' WHERE id IN (SELECT run_id FROM intelligence_ambient_events WHERE scope_id=?) AND status IN ('queued','running','paused','needs-review')").bind(ctx.now,scopeId),ctx.db.prepare("UPDATE intelligence_budgets SET released_at=? WHERE run_id IN (SELECT run_id FROM intelligence_ambient_events WHERE scope_id=?)").bind(ctx.now,scopeId),ctx.db.prepare("UPDATE intelligence_interruptions SET state='released' WHERE state='reserved' AND run_id IN (SELECT run_id FROM intelligence_ambient_events WHERE scope_id=?)").bind(scopeId)]:[]),revision(ctx,revisionId,'ambient-scope',scopeId,input)]})});
}
export async function ambientView(ctx:FeatureContext,scopeId:string){
 const scope=await requireAmbientScope(ctx,scopeId),events=await ctx.db.prepare('SELECT * FROM intelligence_ambient_events WHERE scope_id=? ORDER BY created_at,id').bind(scopeId).all<AmbientEvent>();
 for(const event of events.results)await resolveEvidence(ctx,JSON.parse(event.refs_json),[ctx.actor.id]);
 const comparisons=events.results.filter(e=>e.comparison_event_id&&e.assessment_json).map(e=>{const ranked=events.results.find(r=>r.id===e.comparison_event_id);return {eventId:e.id,rankedEventId:ranked?.id,missed:ranked?.assessment_json?JSON.parse(e.assessment_json!).consequential&&!JSON.parse(ranked.assessment_json).consequential:null};});
 return {scope,events:events.results,comparisons};
}
export async function prepareAmbientEvent(ctx:FeatureContext,scope:AmbientScope,kind:AmbientEvent['kind'],refs:unknown,eventKey:string,comparisonId?:string){
 const eventId=id();await ctx.db.prepare("INSERT OR IGNORE INTO intelligence_ambient_events(id,scope_id,workspace_id,event_key,kind,refs_json,comparison_event_id,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'prepared',?,?)").bind(eventId,scope.id,scope.workspace_id,eventKey,kind,JSON.stringify(refs),comparisonId??null,ctx.now,ctx.now).run();
 return (await ctx.db.prepare('SELECT * FROM intelligence_ambient_events WHERE scope_id=? AND event_key=? AND kind=?').bind(scope.id,eventKey,kind).first<AmbientEvent>())!;
}
export async function auditSelected(scopeId:string,eventKey:string,percent:number){return Number.parseInt((await requestHash({scopeId,eventKey})).slice(0,8),16)%100<percent;}
