import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard,requestHash} from '../../app/operations';
import type {Answer,RunRow} from '../ai/contracts';
import {ambientAssessmentSchema,type AmbientEvent} from './ambient-contracts';
import {requireAmbientScope,prepareAmbientEvent,auditSelected} from './ambient';
import {launchAmbientEvent} from './ambient-scheduler';
import {notificationStatements} from '../notifications/events';
import {releaseAttention} from '../runs/attention';
import {dispatchCommittedNotifications} from '../notifications/dispatch';
export async function completeAmbientEvent(ctx:FeatureContext,run:RunRow,answer:Answer,config:{apiKey?:string;localUrl?:string;localToken?:string}){
 const eventId=JSON.parse(run.input_json).ambientEventId;if(!eventId)return;
 const event=await ctx.db.prepare('SELECT * FROM intelligence_ambient_events WHERE id=? AND workspace_id=?').bind(eventId,ctx.actor.workspaceId).first<AmbientEvent>();
 if(!event)throw new ApiProblem(409,'AMBIENT_EVENT_MISSING','The durable event is unavailable.');
 const scope=await requireAmbientScope(ctx,event.scope_id,true);
 if(scope.state!=='active')throw new ApiProblem(409,'AMBIENT_STOPPED','The ambient scope was stopped.');
 const parsed=ambientAssessmentSchema.safeParse(answer.ambientAssessment);
 if(!parsed.success||answer.proposedChanges.length||answer.researchPlan||answer.procedurePlan)throw new ApiProblem(409,'INVALID_AMBIENT_OUTPUT','Expected a typed semantic assessment with no operational effects.');
 const a=parsed.data;
 if(a.evidenceIds.some(e=>!/^E[1-9]\d*$/.test(e)||!JSON.parse(run.refs_json)[Number(e.slice(1))-1])||(a.consequential&&(!a.question||a.nextStep!=='investigate')))throw new ApiProblem(409,'INVALID_AMBIENT_OUTPUT','The assessment must cite issued evidence and prepare its consequential question.');
 if(event.state==='assessed')return;
 const important=a.consequential&&(event.kind!=='change'||Math.max(a.novelty,a.contradiction,a.impact)*a.relevance>=scope.threshold);
 const noticeKey=await requestHash({workspace:scope.workspace_id,owner:scope.owner_id,audience:JSON.parse(scope.audience_json),refs:JSON.parse(event.refs_json),question:a.question});
 await ctx.db.batch([mutationGuard(ctx.db,"SELECT state='active' FROM intelligence_ambient_scopes WHERE id=?",[scope.id]),ctx.db.prepare("UPDATE intelligence_ambient_events SET state='assessed',assessment_json=?,failure_reason=NULL,updated_at=? WHERE id=?").bind(JSON.stringify(a),ctx.now,event.id),releaseAttention(ctx,run.id),...(important?[ctx.db.prepare("INSERT OR IGNORE INTO intelligence_interruptions(id,workspace_id,recipient_id,equivalence_key,run_id,seconds,state,mandatory,created_at,updated_at) VALUES(?,?,?,?,?,30,'delivered',0,?,?)").bind(`ambient-${noticeKey}`,scope.workspace_id,scope.owner_id,noticeKey,run.id,ctx.now,ctx.now),...notificationStatements(ctx,{id:`ambient-${noticeKey}`,event:'contradiction',pageId:scope.page_id,recipientIds:[scope.owner_id],actorId:null,detail:{runId:run.id,sourcePageIds:JSON.parse(event.refs_json).filter((r:{kind:string})=>r.kind==='page').map((r:{sourceId:string})=>r.sourceId)}})]:[])]);
 if(important)await dispatchCommittedNotifications(ctx);
 if(event.kind==='change'){
 const shadow=await prepareAmbientEvent(ctx,scope,'shadow',JSON.parse(event.refs_json),event.event_key,event.id);await launchAmbientEvent(ctx,scope,shadow,config);
 if(!important&&await auditSelected(scope.id,event.event_key,scope.audit_percent)){const audit=await prepareAmbientEvent(ctx,scope,'low-score-audit',JSON.parse(event.refs_json),event.event_key,event.id);await launchAmbientEvent(ctx,scope,audit,config);}
 }
}
