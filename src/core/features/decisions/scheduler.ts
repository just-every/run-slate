import {dispatchCommittedNotifications} from '../notifications/dispatch';
import type {AppBindings} from '../../app/types';
import {mutationGuard} from '../../app/operations';
import {audienceContext} from '../ai/evidence';
import {notificationStatements} from '../notifications/events';
import {id} from '../ai/persistence';
import {getDecision} from './service';
export async function notifyOverdueDecisions(env:AppBindings,now:string){
 const rows=await env.DB.prepare("SELECT id,workspace_id,page_id,owner_member_id FROM knowledge_decisions WHERE removed_at IS NULL AND state='accepted' AND julianday(review_at)<=julianday(?) AND overdue_notified_at IS NULL LIMIT 100").bind(now).all<{id:string;workspace_id:string;page_id:string;owner_member_id:string}>();
 for(const row of rows.results){const base={db:env.DB,files:env.FILES,jobs:env.JOBS,now,sourceSecret:env.CONNECTOR_CREDENTIALS_KEY,actor:{id:row.owner_member_id,workspaceId:row.workspace_id,workspaceName:'',displayName:'',email:'',initials:'',role:'member' as const}};let ctx;try{ctx=await audienceContext(base,row.owner_member_id);await getDecision(ctx,row.id);}catch{continue;}
 await env.DB.batch([mutationGuard(env.DB,"SELECT removed_at IS NULL AND state='accepted' AND julianday(review_at)<=julianday(?) AND overdue_notified_at IS NULL FROM knowledge_decisions WHERE id=?",[now,row.id]),env.DB.prepare('UPDATE knowledge_decisions SET overdue_notified_at=? WHERE id=?').bind(now,row.id),...notificationStatements(ctx,{id:id(),event:'decision-required',pageId:row.page_id,recipientIds:[row.owner_member_id],actorId:null,detail:{decisionId:row.id}}),env.DB.prepare("INSERT INTO activity_entries(id,workspace_id,feature,action,target_kind,target_id,detail_json,occurred_at) VALUES(?,?,'decisions','decisions.review-due','decision',?,'{}',?)").bind(id(),row.workspace_id,row.id,now)]);await dispatchCommittedNotifications(ctx);
 }
}
