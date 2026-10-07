import {notificationStatements} from '../notifications/events';
import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard,requestHash} from '../../app/operations';
import {requirePageLevel} from '../sharing/current-access';
import {requireDestinationEvidence} from '../ai/disclosure';
import {id,revision,json} from '../ai/persistence';
import {decisionSchema,getDecision,requireAttached} from './records';
export {decisionSchema,getDecision,listDecisions,decisionHistory,decisionReviews,decisionFilterSchema} from './records';
export {acceptDecision,reviewDecision,removeDecision} from './transitions';
export async function saveDecision(ctx:FeatureContext,raw:z.infer<typeof decisionSchema>){
 const input=decisionSchema.parse(raw);
 if(input.id&&!input.supersedesId){const current=await getDecision(ctx,input.id);if(current.content?.supersedesId)input.supersedesId=current.content.supersedesId;}
 return commitOperation(ctx,{operationKey:input.operationKey,action:'decisions.save',request:input,authorize:async()=>{await requirePageLevel(ctx,input.pageId,'edit');await requireDestinationEvidence(ctx,input.pageId,input.citations,false);},prepare:async({revisionId})=>{
 const decisionId=input.id??id();const guard=input.id?mutationGuard(ctx.db,"SELECT revision_id=? AND state='proposed' AND removed_at IS NULL FROM knowledge_decisions WHERE id=? AND workspace_id=?",[input.expectedRevisionId??'',decisionId,ctx.actor.workspaceId]):null;
 if(input.id){const old=await getDecision(ctx,input.id);requireAttached(old);if(old.page_id!==input.pageId||old.state!=='proposed')throw new ApiProblem(409,'IMMUTABLE_DECISION','Accepted and superseded decisions are immutable.');if(input.expectedRevisionId!==old.revision_id)throw new ApiProblem(409,'REVISION_CONFLICT','The record changed. Reload before saving.');const normalized=(v:Record<string,unknown>)=>{const {operationKey,id,expectedRevisionId,...content}=v;return content;};if(await requestHash(normalized(old.content??{}))===await requestHash(normalized(input)))return {entity:{id:input.id,kind:'decision',revisionId:old.revision_id},value:{id:input.id,revisionId:old.revision_id,state:'proposed'},statements:[guard!],noChange:true};}
 const statements=[mutationGuard(ctx.db,"SELECT status='active' FROM members WHERE id=? AND workspace_id=?",[input.ownerId,ctx.actor.workspaceId])];
 if(input.id){statements.push(guard!,ctx.db.prepare('UPDATE knowledge_decisions SET question=?,options_json=?,outcome=?,rationale=?,owner_member_id=?,decided_at=?,review_at=?,revision_id=?,updated_at=? WHERE id=?').bind(input.question,json(input.options),input.outcome,input.rationale,input.ownerId,input.decidedAt,input.reviewAt,revisionId,ctx.now,decisionId));}
 else statements.push(ctx.db.prepare('INSERT INTO knowledge_decisions(id,page_id,workspace_id,question,options_json,outcome,rationale,owner_member_id,decided_at,review_at,created_at,updated_at,revision_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(decisionId,input.pageId,ctx.actor.workspaceId,input.question,json(input.options),input.outcome,input.rationale,input.ownerId,input.decidedAt,input.reviewAt,ctx.now,ctx.now,revisionId));
 statements.push(revision(ctx,revisionId,'decision',decisionId,input),...notificationStatements(ctx,{id:id(),event:'decision-required',pageId:input.pageId,recipientIds:[input.ownerId],actorId:ctx.actor.id,detail:{decisionId,sourcePageIds:input.citations.filter(r=>r.kind==='page').map(r=>r.sourceId)}}));
 return {entity:{id:decisionId,kind:'decision',revisionId},value:{id:decisionId,revisionId,state:'proposed'},statements};}});
}
