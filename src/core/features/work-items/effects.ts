import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard,requestHash} from '../../app/operations';
import type {BlockInput} from '../pages/types';
import {requirePageLevel,requireContainerLevel} from '../sharing/current-access';
import {recipientContext} from '../notifications/outbox';
import {notificationStatements} from '../notifications/events';
import {pageReadableSql} from '../notifications/creation-access';
import {preferences} from '../navigation/preferences';
import {scheduleAt} from './time';
type TaskBlock=Pick<BlockInput,'id'|'blockType'|'content'>;
/** BLOCK-015: the assignee completing their own task, with nothing else changed, notifies no one. */
export async function ownTaskCompletion(ctx:FeatureContext,next:Pick<TaskBlock,'blockType'|'content'>,prior:Pick<TaskBlock,'blockType'|'content'>){
 if(next.blockType!=='task'||prior.blockType!=='task')return false;
 const after=next.content as Record<string,unknown>,before=prior.content as Record<string,unknown>;
 if(after.assigneeMemberId!==ctx.actor.id||after.done!==true||before.done===true)return false;
 const rest=({done:_done,completedByMemberId:_by,completedAt:_at,...content}:Record<string,unknown>)=>requestHash(content);
 return await rest(after)===await rest(before);
}
export async function taskEffects(ctx:FeatureContext,pageId:string,next:TaskBlock[],prior:TaskBlock[],revisionId:string,creation?:{containerId:string;parentPageId?:string|null;lifecycle:string}){
 const statements:D1PreparedStatement[]=[];
 for(const block of next.filter(b=>b.blockType==='task')){
  const content=block.content as Record<string,any>,old=prior.find(b=>b.id===block.id&&b.blockType==='task')?.content as Record<string,any>|undefined;
  statements.push(ctx.db.prepare('INSERT OR IGNORE INTO task_origins(block_id,page_id,member_id,created_at) VALUES(?,?,?,?)').bind(block.id,pageId,content.creatorMemberId??null,ctx.now));
  if(content.assigneeMemberId&&content.assigneeMemberId!==old?.assigneeMemberId){
   const recipient=await recipientContext(ctx,content.assigneeMemberId);
   if(!recipient)throw new ApiProblem(400,'INVALID_TASK_ASSIGNEE','Choose an active workspace member.');
   let readable=true;
   try{if(!creation)await requirePageLevel(recipient,pageId,'view');else if(['draft','scheduled'].includes(creation.lifecycle)&&recipient.actor.id!==ctx.actor.id)readable=false;else if(creation.parentPageId)await requirePageLevel(recipient,creation.parentPageId,'view');else await requireContainerLevel(recipient,creation.containerId,'view');}catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;readable=false;}
   if(!readable)throw new ApiProblem(409,'TASK_ASSIGNEE_ACCESS_NEEDED','Share this page with the assignee or cancel the assignment.',{memberId:content.assigneeMemberId,pageId});
   // Repeat against the committed page, including new pages and parent restrictions.
   statements.push(mutationGuard(ctx.db,`SELECT ${pageReadableSql('m','z.page','m.workspace_id','z.at')} FROM members m,(SELECT ? AS at,? AS member,? AS page) z WHERE m.id=z.member`,[ctx.now,content.assigneeMemberId,pageId]));
   statements.push(...notificationStatements(ctx,{id:`${revisionId}:assignment:${block.id}`,event:'task-assigned',pageId,recipientIds:[content.assigneeMemberId],detail:{blockId:block.id}}));
  }
  const changed=!old||content.assigneeMemberId!==old.assigneeMemberId||content.dueDate!==old.dueDate||content.done!==old.done;
  if(!changed)continue;
  statements.push(ctx.db.prepare("UPDATE reminders SET cancelled_at=COALESCE(cancelled_at,?) WHERE page_id=? AND block_id=? AND kind='task-due' AND delivered_at IS NULL").bind(ctx.now,pageId,block.id));
  if(content.assigneeMemberId&&content.dueDate&&!content.done){
   const recipient=await recipientContext(ctx,content.assigneeMemberId);if(!recipient)continue;
   const timezone=(await preferences(recipient)).value.timezone,id=`task:${block.id}:${content.assigneeMemberId}:${content.dueDate}`;
   statements.push(ctx.db.prepare("INSERT INTO reminders(id,workspace_id,member_id,page_id,block_id,kind,date,time,timezone,offset_minutes,due_at,revision_id,created_at) VALUES(?,?,?,?,?,'task-due',?,'09:00',?,0,?,?,?) ON CONFLICT(id) DO UPDATE SET cancelled_at=NULL WHERE reminders.delivered_at IS NULL").bind(id,ctx.actor.workspaceId,content.assigneeMemberId,pageId,block.id,content.dueDate,timezone,scheduleAt(content.dueDate,'09:00',timezone),revisionId,ctx.now));
  }
 }
 for(const old of prior.filter(b=>b.blockType==='task'&&!next.some(n=>n.id===b.id&&n.blockType==='task')))statements.push(ctx.db.prepare("UPDATE reminders SET cancelled_at=COALESCE(cancelled_at,?) WHERE page_id=? AND block_id=? AND delivered_at IS NULL").bind(ctx.now,pageId,old.id));
 return statements;
}
