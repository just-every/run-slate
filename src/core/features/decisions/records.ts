import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requirePageLevel} from '../sharing/current-access';
import {resolveEvidence} from '../ai/evidence';
import {evidenceSchema} from '../ai/contracts';
const date=z.iso.datetime().nullable();
export const decisionSchema=z.object({operationKey:z.string(),pageId:z.string(),id:z.string().optional(),expectedRevisionId:z.string().optional(),question:z.string().trim().min(1),options:z.array(z.string().trim().min(1)).min(1),outcome:z.string(),rationale:z.string(),ownerId:z.string(),decidedAt:date,reviewAt:date,citations:z.array(evidenceSchema),supersedesId:z.string().optional()}).strict();
export interface DecisionRow {id:string;page_id:string;workspace_id:string;question:string;options_json:string;outcome:string|null;rationale:string|null;owner_member_id:string;decided_at:string|null;review_at:string|null;state:string;accepted_snapshot_json:string|null;superseded_by_decision_id:string|null;revision_id:string;removed_at:string|null;removed_by_member_id:string|null;accepted_revision_id:string|null}
export async function decisionRow(ctx:FeatureContext,decisionId:string){const row=await ctx.db.prepare('SELECT * FROM knowledge_decisions WHERE id=? AND workspace_id=?').bind(decisionId,ctx.actor.workspaceId).first<DecisionRow>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');await requirePageLevel(ctx,row.page_id,'view');return row;}
export function requireAttached(row:DecisionRow){if(row.removed_at)throw new ApiProblem(409,'REMOVED_DECISION','This decision layer was removed. Its history is retained.');}
export async function getDecision(ctx:FeatureContext,decisionId:string,revisionId?:string){
 const row=await decisionRow(ctx,decisionId);
 let exact=revisionId??row.accepted_revision_id??row.revision_id;
 if(!revisionId&&!row.accepted_revision_id&&row.removed_at){const removal=await ctx.db.prepare("SELECT content_json FROM intelligence_revisions WHERE id=? AND entity_id=? AND entity_kind='decision-removal'").bind(row.revision_id,row.id).first<{content_json:string}>();if(removal)exact=JSON.parse(removal.content_json).previousRevisionId;}

 const stored=await ctx.db.prepare("SELECT id,entity_kind,content_json,actor_id,created_at FROM intelligence_revisions WHERE entity_id=? AND workspace_id=? AND id=? AND entity_kind IN ('decision','decision-acceptance','decision-review','decision-supersession','decision-removal')").bind(row.id,ctx.actor.workspaceId,exact).first<{id:string;entity_kind:string;content_json:string;actor_id:string;created_at:string}>();
 if(revisionId&&!stored)throw new ApiProblem(404,'NOT_FOUND','The exact decision revision is unavailable.');
 const content=!revisionId&&!row.accepted_revision_id&&row.accepted_snapshot_json?JSON.parse(row.accepted_snapshot_json):stored?JSON.parse(stored.content_json):null;
 const citationStatus=content?.citations?await resolveEvidence(ctx,content.citations,[ctx.actor.id]):[];
 return {...row,content,viewedRevisionId:stored?.id??null,revision:stored?{id:stored.id,kind:stored.entity_kind,actorId:stored.actor_id,createdAt:stored.created_at}:null,acceptedRevisionId:row.accepted_revision_id,acceptedRevisionHref:row.accepted_revision_id?`/app/decisions/${encodeURIComponent(row.id)}?revision=${encodeURIComponent(row.accepted_revision_id)}`:null,citationsCurrent:!!content?.citations&&citationStatus.every(p=>p.current),overdue:!row.removed_at&&!!row.review_at&&Date.parse(row.review_at)<=Date.parse(ctx.now)&&row.state==='accepted'};
}
export async function decisionHistory(ctx:FeatureContext,decisionId:string){await decisionRow(ctx,decisionId);const rows=await ctx.db.prepare("SELECT id,entity_kind,content_json,actor_id,created_at FROM intelligence_revisions WHERE entity_id=? AND workspace_id=? AND entity_kind IN ('decision','decision-acceptance','decision-review','decision-supersession','decision-removal') ORDER BY created_at DESC,id DESC").bind(decisionId,ctx.actor.workspaceId).all<{id:string;entity_kind:string;content_json:string;actor_id:string;created_at:string}>();const items=[];for(const {content_json,...row} of rows.results){const content=JSON.parse(content_json);if(content.citations)await resolveEvidence(ctx,content.citations,[ctx.actor.id]);items.push({...row,content});}return {items};}
export async function decisionReviews(ctx:FeatureContext,decisionId:string){await getDecision(ctx,decisionId);return {items:(await ctx.db.prepare('SELECT * FROM decision_reviews WHERE decision_id=? ORDER BY created_at DESC,id DESC').bind(decisionId).all()).results};}
const boundary=z.union([z.iso.date(),z.iso.datetime()]);
export const decisionFilterSchema=z.object({state:z.enum(['proposed','accepted','superseded']).optional(),ownerId:z.string().optional(),containerId:z.string().optional(),pageId:z.string().optional(),decidedFrom:boundary.optional(),decidedTo:boundary.optional(),reviewFrom:boundary.optional(),reviewTo:boundary.optional(),citationsCurrent:z.enum(['true','false']).optional()}).strict();
export async function listDecisions(ctx:FeatureContext,raw:z.infer<typeof decisionFilterSchema>={}){
 const filter=decisionFilterSchema.parse(raw),clauses=['d.workspace_id=?','d.removed_at IS NULL'],values:(string|number)[]=[ctx.actor.workspaceId];
 for(const [key,column] of [['state','d.state'],['ownerId','d.owner_member_id'],['containerId','p.container_id'],['pageId','d.page_id']] as const)if(filter[key]!==undefined){clauses.push(`${column}=?`);values.push(filter[key]!);}
 for(const [key,column,upper] of [['decidedFrom','d.decided_at',false],['decidedTo','d.decided_at',true],['reviewFrom','d.review_at',false],['reviewTo','d.review_at',true]] as const){const value=filter[key];if(value){const normalized=value.length===10?value+(upper?'T23:59:59.999Z':'T00:00:00.000Z'):value;clauses.push(`julianday(${column})${upper?'<=':'>='}julianday(?)`);values.push(normalized);}}
 const rows=await ctx.db.prepare(`SELECT d.id FROM knowledge_decisions d JOIN pages p ON p.id=d.page_id WHERE ${clauses.join(' AND ')} ORDER BY d.created_at DESC,d.id DESC`).bind(...values).all<{id:string}>();const items=[];
 for(const row of rows.results){try{const item=await getDecision(ctx,row.id);if(filter.citationsCurrent===undefined||item.citationsCurrent===(filter.citationsCurrent==='true'))items.push(item);}catch(e){if(!(e instanceof ApiProblem)||![403,404].includes(e.status))throw e;}}
 return {items};
}
