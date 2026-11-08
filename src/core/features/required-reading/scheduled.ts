import type {AppBindings,AuthenticatedMember} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {requirePageLevel} from '../sharing/current-access';
import {recipientContext,processNotificationOutbox} from '../notifications/outbox';
import {notificationStatements} from '../notifications/events';
/** A deterministic outbox identity and atomic acknowledgment fence survive repeated and concurrent ticks. */
export async function scheduledRequiredReading(env:AppBindings,now:string){
 const owners=await env.DB.prepare("SELECT m.id,m.workspace_id AS workspaceId,m.email,m.display_name AS displayName,m.role,w.name AS workspaceName FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.status='active' AND m.role='owner' AND m.member_kind='member' AND m.id=(SELECT id FROM members x WHERE x.workspace_id=m.workspace_id AND x.status='active' AND x.role='owner' AND x.member_kind='member' ORDER BY id LIMIT 1)").all<Omit<AuthenticatedMember,'initials'>>();
 let delivered=0;
 for(const owner of owners.results){
  const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{...owner,initials:owner.displayName.slice(0,2)},now};
  const rows=await env.DB.prepare(`SELECT r.id,r.page_id,m.member_id FROM required_readings r JOIN required_reading_members m ON m.reading_id=r.id WHERE r.workspace_id=? AND r.cancelled_at IS NULL AND r.due_at<=? AND m.eligible=1 AND m.acknowledged_at IS NULL AND m.reminded_at IS NULL ORDER BY r.due_at,r.id,m.member_id LIMIT 100`).bind(owner.workspaceId,now).all<{id:string;page_id:string;member_id:string}>();
  for(const row of rows.results){const recipient=await recipientContext(ctx,row.member_id);if(!recipient)continue;
   try{await requirePageLevel(recipient,row.page_id,'view');}catch(e){if(e instanceof ApiProblem&&[401,404].includes(e.status))continue;throw e;}
   try{await env.DB.batch([
    mutationGuard(env.DB,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[recipient.authorizationEpoch!]),
    mutationGuard(env.DB,'SELECT m.acknowledged_at IS NULL AND m.reminded_at IS NULL AND r.cancelled_at IS NULL FROM required_reading_members m JOIN required_readings r ON r.id=m.reading_id WHERE m.reading_id=? AND m.member_id=?',[row.id,row.member_id]),
    ...notificationStatements(ctx,{id:`required-reading-reminder:${row.id}:${row.member_id}`,event:'required-reading-reminder',actorId:null,pageId:row.page_id,recipientIds:[row.member_id],detail:{requiredReadingId:row.id}}),
    env.DB.prepare('UPDATE required_reading_members SET reminded_at=? WHERE reading_id=? AND member_id=?').bind(now,row.id,row.member_id),
   ]);delivered++;}catch(error){if(!String(error).includes('core_write_guards')&&!String(error).includes('CHECK constraint'))throw error;}
  }
  let drained;do{drained=await processNotificationOutbox(ctx);}while(drained.processed===100);
 }
 return {delivered};
}
