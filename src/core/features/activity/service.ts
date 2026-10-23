import {activityPageId} from './context';
import type { FeatureContext } from '../../app/feature-context';
import { currentSubject,requireContainerLevel,resolveCurrentAccessMany } from '../sharing/current-access';
import { readableTarget,permitted } from '../search/visibility';
import { encodeCursor,limitValue,timeCursor } from '../search/pagination';
import { ApiProblem } from '../../app/problems';
export interface ActivityInput {actorId?:string;action?:string;kind?:string;containerId?:string;from?:string;to?:string;cursor?:string;limit?:number}
interface Row {id:string;actor_member_id:string|null;feature:string|null;action:string;target_kind:string;target_id:string;detail_json:string;operation_key:string|null;automation_run_id:string|null;ai_run_id:string|null;occurred_at:string}
export type ActivityAccessResolver=(ctx:FeatureContext,id:string)=>Promise<boolean>;
const resolvers=new Map<string,ActivityAccessResolver>();
/** Feature-owned targets register their actual current authorization boundary at app assembly. */
export function registerActivityResolver(kind:string,resolver:ActivityAccessResolver){resolvers.set(kind,resolver);}
export async function activity(ctx:FeatureContext,input:ActivityInput={}){
 await currentSubject(ctx);for(const value of [input.from,input.to])if(value&&!Number.isFinite(Date.parse(value)))throw new ApiProblem(400,'INVALID_DATE','Invalid activity date.');
 const cursor=timeCursor(input.cursor,ctx.now),limit=limitValue(input.limit);
 if(input.containerId&&!await permitted(()=>requireContainerLevel(ctx,input.containerId!,'view')))return {items:[]};
 const rows=await ctx.db.prepare('SELECT * FROM activity_entries WHERE workspace_id=? AND occurred_at<=? AND (occurred_at<? OR (occurred_at=? AND id<?)) AND (? IS NULL OR actor_member_id=?) AND (? IS NULL OR action=?) AND (? IS NULL OR target_kind=?) AND (? IS NULL OR occurred_at>=?) AND (? IS NULL OR occurred_at<=?) ORDER BY occurred_at DESC,id DESC').bind(ctx.actor.workspaceId,cursor.ceiling,cursor.at,cursor.at,cursor.id,input.actorId??null,input.actorId??null,input.action??null,input.action??null,input.kind??null,input.kind??null,input.from??null,input.from??null,input.to??null,input.to??null).all<Row>();
 const contexts=new Map<string,string>();for(const row of rows.results){const id=await activityPageId(ctx,row.target_kind,row.target_id);if(id)contexts.set(row.id,id);}const pageIds=[...contexts.values()];const retained=await resolveCurrentAccessMany(ctx,pageIds,{includeDeleted:true,includeTrashed:true});
 const items=[];
 for(const row of rows.results){
  const pageId=contexts.get(row.id);const allowed=pageId?retained.get(pageId)?.decision.allowed:resolvers.has(row.target_kind)?await resolvers.get(row.target_kind)!(ctx,row.target_id):await readableTarget(ctx,row.target_kind,row.target_id);if(!allowed)continue;
  const page=await ctx.db.prepare('SELECT container_id,deleted_at FROM pages WHERE id=? AND workspace_id=?').bind(pageId??'',ctx.actor.workspaceId).first<{container_id:string;deleted_at:string|null}>();if(input.containerId&&row.target_id!==input.containerId&&page?.container_id!==input.containerId)continue;
  const detail=JSON.parse(row.detail_json) as {commentId?:string;revisionId?:string;grantId?:string;sourcePageIds?:string[];message?:string};let denied=false;for(const id of detail.sourcePageIds??[])if(!await readableTarget(ctx,'page',id))denied=true;if(denied)continue;
  let actor:null|{id:string;displayName:string}=null;if(row.actor_member_id&&!page?.deleted_at){const a=await ctx.db.prepare("SELECT id,display_name AS displayName FROM members WHERE id=? AND workspace_id=? AND (member_kind='member' OR id=?)").bind(row.actor_member_id,ctx.actor.workspaceId,ctx.actor.id).first<{id:string;displayName:string}>();actor=a;}
  items.push({...(!page?.deleted_at&&row.actor_member_id===ctx.actor.id&&row.action==='sharing.message'&&typeof detail.message==='string'?{message:detail.message}:{}),id:row.id,actor,feature:row.feature,action:row.action,target:{kind:row.target_kind,id:row.target_id},occurredAt:row.occurred_at,operationKey:row.operation_key,automationRunId:row.automation_run_id,aiRunId:row.ai_run_id,deleted:!!page?.deleted_at,context:page?.deleted_at?{}:{pageId,commentId:detail.commentId??(row.target_kind==='comment'?row.target_id:undefined),threadId:row.target_kind==='comment-thread'?row.target_id:undefined,revisionId:detail.revisionId??(row.target_kind==='revision'?row.target_id:undefined),grantId:detail.grantId},explanation:page?.deleted_at?'The underlying page was erased; only this activity record remains.':undefined});if(items.length>limit)break;
 }
 const hasMore=items.length>limit;if(hasMore)items.pop();const last=items.at(-1);return {items,nextCursor:hasMore&&last?encodeCursor({at:last.occurredAt,id:last.id,ceiling:cursor.ceiling}):undefined};
}
