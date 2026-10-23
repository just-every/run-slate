import {reminderUpgradeCase} from './reminder-upgrade-case';
import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember,sessionFor} from '../e2e/setup/fixtures';
import {createUlid} from '../../src/core/shared/ulid';
import {dispatchDueReminders} from '../../src/core/features/reminders/delivery';
import {processNotificationOutbox} from '../../src/core/features/notifications/outbox';
import type {FeatureContext} from '../../src/core/app/feature-context';
/** Two members beside the owner, and the owner's HTTP helpers, for the task, reminder and report journeys. */
export async function workItems(api:ReturnType<typeof createApi>,containerId:string,ownerId:string,workspaceId:string,ownerCookie:string){
 const reader=(await seedMember(workspaceId,{role:'member',displayName:'Task reader',email:`${createUlid()}@tasks.test`})).memberId,other=(await seedMember(workspaceId,{role:'member',displayName:'Task other',email:`${createUlid()}@tasks.test`})).memberId;
 const cookies:{[key:string]:string}={[ownerId]:ownerCookie,[reader]:await sessionFor(reader),[other]:await sessionFor(other)};
 const request=async(method:string,path:string,body?:unknown,actor=ownerId)=>{const r=await api.request(`https://slate.example${path}`,{method,headers:{cookie:cookies[actor]!,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},env);return {status:r.status,data:await r.json<any>()};};
 const create=async(title:string,options:{containerId?:string;parentPageId?:string;properties?:{labels:string[]}}={})=>{const r=await request('POST','/api/pages',{operationKey:createUlid(),containerId,title,...options});expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data.value as {pageId:string;revisionId:string};};
 const share=async(pageId:string,memberId:string,revoke=false,id?:string,level='edit')=>{const r=await request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:pageId,principalKind:'member',principalId:memberId,level,revoke,...(id?{id}:{})});expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data.value.id as string;};
 // Keep the local morning and its offset future even when the UTC date is nearly over.
 const reference=Date.now(),due=new Date(reference+2*86400000).toISOString().slice(0,10),later=new Date(reference+3*86400000).toISOString().slice(0,10);
 return {ownerId,workspaceId,reader,other,request,create,share,due,later};
}
type WorkItems=Awaited<ReturnType<typeof workItems>>;
/** BLOCK-015: assignment, the share prompt, due dates, reassignment, completion attribution and My tasks. */
export async function tasksJourney({ownerId,reader,other,request,create,share,due,later}:WorkItems){
 const p=await create('Actions'),q=await create('More actions'),taskId=createUlid();
 const task={id:taskId,blockType:'task',treePosition:'1',content:{text:[{text:'Ship it '},{text:'Task reader',mention:{kind:'person',id:reader}}],done:false,assigneeMemberId:reader,dueDate:due,creatorMemberId:other}};
 const denied=await request('PUT',`/api/pages/${p.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:p.revisionId,blocks:[task]});expect(denied.status).toBe(409);expect(denied.data.code).toBe('TASK_ASSIGNEE_ACCESS_NEEDED');
 const people=await request('GET',`/api/tasks/${p.pageId}/assignees`);expect(people.data.items.find((m:any)=>m.id===reader).canRead).toBe(false);
 const grant=await share(p.pageId,reader);await share(p.pageId,other);await share(q.pageId,reader);
 const operationKey=createUlid(),write={operationKey,expectedRevisionId:p.revisionId,blocks:[task,{...task,id:createUlid(),treePosition:'2',content:{...task.content,text:[{text:'Later'}],dueDate:later}}]};
 const saved=await request('PUT',`/api/pages/${p.pageId}/blocks`,write);expect(saved.status,JSON.stringify(saved.data)).toBe(200);expect((await request('PUT',`/api/pages/${p.pageId}/blocks`,write)).status).toBe(200);
 let page=await request('GET',`/api/pages/${p.pageId}`);expect(page.data.blocks[0].content.creatorMemberId).toBe(ownerId);
 let inbox=await request('GET','/api/notifications',undefined,reader);expect(inbox.data.items.filter((x:any)=>x.event==='task-assigned')).toHaveLength(2);
 const third={...task,id:createUlid(),content:{...task.content,text:[{text:'No date'}],dueDate:null}};expect((await request('PUT',`/api/pages/${q.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:q.revisionId,blocks:[third]})).status).toBe(200);
 const list=await request('GET','/api/tasks?state=open&sort=due',undefined,reader);expect(list.data.items.map((t:any)=>t.blockId)).toEqual([taskId,write.blocks[1]!.id,third.id]);expect((await request('GET','/api/tasks?tab=created')).data.items).toHaveLength(3);
 const first=await request('GET','/api/tasks?state=open&sort=due&limit=1',undefined,reader);expect(first.data.items[0].blockId).toBe(taskId);
 // The assignee completing their own task notifies no one, including the creator watching the page.
 const notified=async()=>Promise.all([ownerId,reader,other].map(async member=>(await request('GET','/api/notifications',undefined,member)).data.items.map((x:any)=>x.id)));
 const beforeCompletion=await notified();
 const complete=await request('PATCH',`/api/tasks/${p.pageId}/${taskId}`,{operationKey:createUlid(),expectedRevisionId:first.data.items[0].blockRevisionId,done:true},reader);expect(complete.status,JSON.stringify(complete.data)).toBe(200);
 expect(await notified()).toEqual(beforeCompletion);
 expect((await request('PATCH',`/api/tasks/${p.pageId}/${taskId}`,{operationKey:createUlid(),expectedRevisionId:first.data.items[0].blockRevisionId,done:false},reader)).status).toBe(409);
 const next=await request('GET',`/api/tasks?state=open&sort=due&limit=1&cursor=${encodeURIComponent(first.data.nextCursor)}`,undefined,reader);expect(next.data.items[0].blockId).toBe(write.blocks[1]!.id);
 page=await request('GET',`/api/pages/${p.pageId}`);expect(page.data.blocks[0].content).toMatchObject({done:true,completedByMemberId:reader});
 const block=page.data.blocks[1],reassign=await request('PATCH',`/api/pages/${p.pageId}/blocks/${block.id}`,{operationKey:createUlid(),expectedRevisionId:block.revisionId,content:{...block.content,assigneeMemberId:other}});expect(reassign.status).toBe(200);
 inbox=await request('GET','/api/notifications',undefined,reader);expect(inbox.data.items.filter((x:any)=>x.event==='task-assigned')).toHaveLength(3);expect((await request('GET','/api/notifications',undefined,other)).data.items.filter((x:any)=>x.event==='task-assigned')).toHaveLength(1);
 return {p,q,taskId,third,grant};
}
/** NOTIF-004: page, task and date-mention reminders in their members' time zones, delivered once and rechecked against access. */
export async function remindersJourney({ownerId,workspaceId,reader,other,request,create,share,due,later}:WorkItems,{p,q,taskId,third,grant}:Awaited<ReturnType<typeof tasksJourney>>){
 // Give the open third task a due date, then prove the same automatic due reminder runs once.
 let thirdPage=await request('GET',`/api/pages/${q.pageId}`);const thirdBlock=thirdPage.data.blocks[0];expect((await request('PATCH',`/api/pages/${q.pageId}/blocks/${third.id}`,{operationKey:createUlid(),expectedRevisionId:thirdBlock.revisionId,content:{...thirdBlock.content,dueDate:due}})).status).toBe(200);
 const explicit=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:p.pageId,blockId:taskId,date:due,time:'09:00',timezone:'Australia/Brisbane',offsetMinutes:60});expect(explicit.status,JSON.stringify(explicit.data)).toBe(200);expect(explicit.data.value.dueAt).toBe(new Date(Date.parse(`${due}T09:00:00+10:00`)-3600000).toISOString());
 const second=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:q.pageId,date:due,time:'09:00',timezone:'Pacific/Honolulu'},reader);expect(second.status).toBe(200);expect(second.data.value.dueAt).toBe(`${due}T19:00:00.000Z`);
 const revoked=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:p.pageId,date:due,time:'09:00',timezone:'Pacific/Honolulu'},reader);expect(revoked.status).toBe(200);
 // A date mention carries its own reminder, here a day before the mentioned date in a third time zone.
 const notes=await create('Launch date notes'),mentionBlock=createUlid();
 expect((await request('PUT',`/api/pages/${notes.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:notes.revisionId,blocks:[{id:mentionBlock,blockType:'paragraph',treePosition:'1',content:{text:[{text:'Launch on '},{text:due,mention:{kind:'date',id:due,label:due}}]}}]})).status).toBe(200);
 await share(notes.pageId,other,false,undefined,'view');
 const dated=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:notes.pageId,blockId:mentionBlock,date:due,time:'09:00',timezone:'Asia/Kolkata',offsetMinutes:1440},other);expect(dated.status,JSON.stringify(dated.data)).toBe(200);expect(dated.data.value.dueAt).toBe(new Date(Date.parse(`${due}T09:00:00+05:30`)-86400000).toISOString());
 await share(p.pageId,reader,true,grant);expect((await request('GET','/api/tasks',undefined,reader)).data.items.map((t:any)=>t.pageId)).toEqual([q.pageId]);
 const actor={id:ownerId,workspaceId,workspaceName:'Aurora',displayName:'Profile owner',email:'owner@test.invalid',initials:'PO',role:'owner' as const},ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor,now:`${due}T00:00:00.000Z`};
 await dispatchDueReminders(ctx);await processNotificationOutbox(ctx);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='reminder' AND recipient_member_id=?").bind(ownerId).first<number>('n')).toBe(1);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='reminder' AND recipient_member_id=?").bind(other).first<number>('n')).toBe(1);
 const late={...ctx,now:`${due}T23:59:00.000Z`};await Promise.all([dispatchDueReminders(late),dispatchDueReminders(late)]);await processNotificationOutbox(late);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='task-due' AND recipient_member_id=?").bind(reader).first<number>('n')).toBe(1);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='reminder' AND recipient_member_id=?").bind(reader).first<number>('n')).toBe(1);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='reminder' AND recipient_member_id=?").bind(other).first<number>('n')).toBe(1);
 const personal=await request('GET','/api/reminders');expect(personal.data.items.find((r:any)=>r.id===explicit.data.value.id).deliveredAt).not.toBeNull();
 const cancel=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:q.pageId,date:later,time:'12:00',timezone:'UTC'});expect(cancel.status).toBe(200);expect((await request('DELETE',`/api/reminders/${cancel.data.value.id}`,{operationKey:createUlid()})).status).toBe(200);
 // Accountable reminders: a durable started row survives interruption; failures stay visible until retried or stopped.
 const interrupted=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:q.pageId,date:later,time:'12:00',timezone:'UTC'});
 const failed=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:q.pageId,date:later,time:'12:00',timezone:'UTC'});
 const stopped=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:q.pageId,date:later,time:'12:00',timezone:'UTC'});
 for(const item of [interrupted,failed,stopped])expect(item.status).toBe(200);
 await env.DB.prepare('UPDATE reminders SET attempt_started_at=? WHERE id=?').bind(`${due}T00:00:00.000Z`,interrupted.data.value.id).run();
 await env.DB.exec(`CREATE TRIGGER reminder_delivery_fault BEFORE INSERT ON notification_outbox WHEN json_extract(NEW.detail_json,'$.reminderId')='${failed.data.value.id}' BEGIN SELECT RAISE(FAIL,'synthetic delivery storage fault'); END`);
 const future={...ctx,now:`${later}T23:59:00.000Z`};await dispatchDueReminders(future);
 await env.DB.exec('DROP TRIGGER reminder_delivery_fault');
 const jobs=await request('GET','/api/reminders/jobs');expect(jobs.data.items.find((r:any)=>r.id===failed.data.value.id)).toMatchObject({state:'failed',failure:'DELIVERY_FAILED'});
 expect((await request('GET','/api/reminders/jobs',undefined,other)).data.items.some((r:any)=>r.id===failed.data.value.id)).toBe(false);
 expect((await request('POST',`/api/reminders/${failed.data.value.id}/retry`,{operationKey:createUlid(),expectedRevisionId:failed.data.value.revisionId},other)).status).toBe(404);
 expect((await request('DELETE',`/api/reminders/${stopped.data.value.id}`,{operationKey:createUlid()})).status).toBe(200);
 expect((await request('POST',`/api/reminders/${failed.data.value.id}/retry`,{operationKey:createUlid(),expectedRevisionId:failed.data.value.revisionId})).status).toBe(200);
 await Promise.all([dispatchDueReminders(future),dispatchDueReminders(future)]);await processNotificationOutbox(future);await processNotificationOutbox(future);
 for(const item of [interrupted,failed])expect(await env.DB.prepare("SELECT count(*) AS n FROM notifications WHERE json_extract(detail_json,'$.reminderId')=?").bind(item.data.value.id).first<number>('n')).toBe(1);
 expect(await env.DB.prepare("SELECT count(*) AS n FROM notifications WHERE json_extract(detail_json,'$.reminderId')=?").bind(stopped.data.value.id).first<number>('n')).toBe(0);
 expect((await request('GET','/api/reminders/jobs')).data.items.find((r:any)=>r.id===stopped.data.value.id).state).toBe('stopped');
 await reminderUpgradeCase();

}
/** BLOCK-016: a saved body report executes independently for each reader, including page-only grants. */
export async function taskReportsJourney({ownerId,reader,other,request,create,share,due,later}:WorkItems){
 const space=await request('POST','/api/containers',{operationKey:createUlid(),name:'Report sources',visibility:'private'});
 expect(space.status,JSON.stringify(space.data)).toBe(200);
 const sourceContainer=space.data.value.id as string,root=await create('Report project',{containerId:sourceContainer});
 const sources=await Promise.all(['Alpha action page','Beta action page','Confidential action page'].map((title,index)=>create(title,{containerId:sourceContainer,parentPageId:root.pageId,properties:{labels:[index<2?'launch':'private']}})));
 const taskIds=sources.map(()=>createUlid()),texts=['First report action','Second report action','Confidential report action'],readerGrants:string[]=[];
 for(const [index,source] of sources.entries()){
  readerGrants.push(await share(source.pageId,reader));
  if(index<2)await share(source.pageId,other,false,undefined,index===0?'edit':'view');
  const saved=await request('PUT',`/api/pages/${source.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:source.revisionId,blocks:[{id:taskIds[index],blockType:'task',treePosition:'1',content:{text:[{text:texts[index]}],done:false,assigneeMemberId:reader,dueDate:index===0?due:index===1?later:null,creatorMemberId:other}}]});
  expect(saved.status,JSON.stringify(saved.data)).toBe(200);
 }
 const reportPage=await create('Team task report'),reportBlockId=createUlid();
 await share(reportPage.pageId,reader,false,undefined,'view');await share(reportPage.pageId,other,false,undefined,'view');
 const definition={containerId:sourceContainer,assignee:{kind:'member',memberId:reader},groupBy:'page',orderBy:'due',direction:'asc',limit:20};
 const reportSaved=await request('PUT',`/api/pages/${reportPage.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:reportPage.revisionId,blocks:[{id:reportBlockId,blockType:'task-report',treePosition:'1',content:{definition}}]});
 expect(reportSaved.status,JSON.stringify(reportSaved.data)).toBe(200);
 const report=async(filters:Record<string,unknown>={},actor=ownerId)=>request('POST',`/api/pages/${reportPage.pageId}/task-report`,{...definition,...filters},actor);
 let full=await report();expect(full.status,JSON.stringify(full.data)).toBe(200);expect(full.data.items.map((item:any)=>item.blockId)).toEqual(taskIds);expect(full.data.groups).toHaveLength(3);expect(Number.isFinite(Date.parse(full.data.ranAt))).toBe(true);
 expect((await report({},reader)).data.items.map((item:any)=>item.blockId)).toEqual(taskIds);
 let limited=await report({},other);expect(limited.status,JSON.stringify(limited.data)).toBe(200);expect(limited.data.items.map((item:any)=>item.blockId)).toEqual(taskIds.slice(0,2));expect(limited.data.groups).toHaveLength(2);
 const serialized=JSON.stringify(limited.data);for(const hidden of [sources[2]!.pageId,taskIds[2]!,texts[2]!,'Confidential action page'])expect(serialized).not.toContain(hidden);expect(limited.data).not.toHaveProperty('total');
 expect((await report({assignee:{kind:'current-reader'}},reader)).data.items.map((item:any)=>item.blockId)).toEqual(taskIds);
 expect((await report({assignee:{kind:'current-reader'}})).data.items).toEqual([]);
 expect((await report({creatorMemberId:ownerId})).data.items).toHaveLength(3);expect((await report({creatorMemberId:other})).data.items).toEqual([]);
 expect((await report({label:'LAUNCH',ancestorPageId:root.pageId})).data.items.map((item:any)=>item.blockId)).toEqual(taskIds.slice(0,2));
 expect((await report({dueFrom:due,dueTo:due})).data.items.map((item:any)=>item.blockId)).toEqual([taskIds[0]]);
 const descending=await report({groupBy:'due',direction:'desc',limit:2});expect(descending.data.items.map((item:any)=>item.blockId)).toEqual([taskIds[1],taskIds[0]]);expect(descending.data.groups.map((group:any)=>group.key)).toEqual([later,due]);
 expect((await report({orderBy:'page',direction:'desc',limit:1})).data.items[0].blockId).toBe(taskIds[2]);
 const byAssignee=await report({groupBy:'assignee',orderBy:'assignee'});expect(byAssignee.data.groups.map((group:any)=>group.key)).toEqual([reader]);expect(byAssignee.data.groups[0].items).toHaveLength(3);
 expect((await report({dueFrom:later,dueTo:due})).status).toBe(400);
 // Report edit permission does not grant source editing, or prevent an authorized source editor completing.
 expect((await request('GET',`/api/pages/${reportPage.pageId}`,undefined,other)).data.permissions.canEdit).toBe(false);
 expect(limited.data.items.map((item:any)=>item.canEdit)).toEqual([true,false]);
 const sourceTask=limited.data.items[0];expect((await request('PATCH',`/api/tasks/${sourceTask.pageId}/${sourceTask.blockId}`,{operationKey:createUlid(),expectedRevisionId:sourceTask.blockRevisionId,done:true},other)).status).toBe(200);
 const readonlyTask=limited.data.items[1];expect((await request('PATCH',`/api/tasks/${readonlyTask.pageId}/${readonlyTask.blockId}`,{operationKey:createUlid(),expectedRevisionId:readonlyTask.blockRevisionId,done:true},other)).status).toBe(404);
 expect((await request('GET',`/api/pages/${sources[0]!.pageId}`)).data.blocks[0].content).toMatchObject({done:true,completedByMemberId:other});
 expect((await report({state:'completed'})).data.items.map((item:any)=>item.blockId)).toEqual([taskIds[0]]);expect((await report({state:'open'})).data.items.map((item:any)=>item.blockId)).toEqual(taskIds.slice(1));
 const storedReport=(await request('GET',`/api/pages/${reportPage.pageId}`)).data.blocks[0];expect(storedReport.content).toEqual({definition});

 // Change the real workspace policy through HTTP to exercise drafts and the published reader projection.
 const originalWorkspace=(await request('GET','/api/workspace')).data;
 const policies=async(value:unknown)=>{const current=(await request('GET','/api/workspace')).data;const {id:_id,revisionId,...settings}=current;const updated=await request('PUT','/api/workspace',{...settings,operationKey:createUlid(),expectedRevisionId:revisionId,policies:value});expect(updated.status,JSON.stringify(updated.data)).toBe(200);};
 await policies({...originalWorkspace.policies,'page.lifecycle.v1':'draft-then-publish'});
 try{
  for(const scheduled of [false,true]){
   const draft=await create(scheduled?'Scheduled report secret':'Draft report secret',{containerId:sourceContainer,parentPageId:root.pageId});
   const draftSaved=await request('PUT',`/api/pages/${draft.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:draft.revisionId,blocks:[{id:createUlid(),blockType:'task',treePosition:'1',content:{text:[{text:'Unpublished task secret'}],done:false}}]});expect(draftSaved.status).toBe(200);
   if(scheduled){const draftDoc=(await request('GET',`/api/pages/${draft.pageId}`)).data;const schedule=await request('POST',`/api/pages/${draft.pageId}/publish`,{operationKey:createUlid(),expectedRevisionId:draftDoc.page.revisionId,publishAt:new Date(Date.now()+86400000).toISOString()});expect(schedule.status,JSON.stringify(schedule.data)).toBe(200);}
  }
  full=await report({assignee:undefined});expect(full.data.items.map((item:any)=>item.blockId)).toEqual(taskIds);expect(JSON.stringify(full.data)).not.toContain('Unpublished task secret');
  const before=(await request('GET',`/api/pages/${sources[1]!.pageId}`)).data,sourceBlock=before.blocks[0];
  const unpublished=await request('PATCH',`/api/pages/${sources[1]!.pageId}/blocks/${sourceBlock.id}`,{operationKey:createUlid(),expectedRevisionId:sourceBlock.revisionId,content:{...sourceBlock.content,text:[{text:'Unpublished report task secret'}]}});expect(unpublished.status).toBe(200);
  const changed=(await request('GET',`/api/pages/${sources[1]!.pageId}`)).data;
  expect((await request('PATCH',`/api/pages/${sources[1]!.pageId}`,{operationKey:createUlid(),expectedRevisionId:changed.page.revisionId,properties:{title:'Unpublished report title secret',labels:['private-unpublished']}})).status).toBe(200);
  limited=await report({label:'launch'},other);expect(limited.data.items.map((item:any)=>item.blockId)).toEqual(taskIds.slice(0,2));expect(limited.data.items[1].pageTitle).toBe('Beta action page');expect(limited.data.items[1].text).toEqual([{text:texts[1]}]);expect(JSON.stringify(limited.data)).not.toContain('Unpublished report');
  expect((await report({label:'launch'})).data.items.map((item:any)=>item.blockId)).toEqual([taskIds[0]]);
 }finally{await policies(originalWorkspace.policies);}
 await share(sources[2]!.pageId,reader,true,readerGrants[2]);
 const afterRevocation=await report({assignee:{kind:'current-reader'}},reader);expect(afterRevocation.data.items.map((item:any)=>item.blockId)).toEqual(taskIds.slice(0,2));expect(JSON.stringify(afterRevocation.data)).not.toContain('Confidential');
 // Archiving or trashing an individual source removes its task without removing the report's space.
 for(const action of ['archive','trash']){
  const source=(await request('GET',`/api/pages/${sources[2]!.pageId}`)).data;
  expect((await request('POST',`/api/archive/${sources[2]!.pageId}`,{operationKey:createUlid(),expectedRevisionId:source.page.revisionId,action})).status).toBe(200);
  expect((await report()).data.items.map((item:any)=>item.blockId)).toEqual(taskIds.slice(0,2));
  expect((await request('POST',`/api/archive/${sources[2]!.pageId}`,{operationKey:createUlid(),expectedRevisionId:source.page.revisionId,action:'restore'})).status).toBe(200);
 }
 const sourceSpace=(await request('GET',`/api/containers/${sourceContainer}`)).data;
 expect((await request('POST',`/api/containers/${sourceContainer}/archive`,{operationKey:createUlid(),expectedRevisionId:sourceSpace.revisionId})).status).toBe(200);
 const unavailable=await report();expect(unavailable.status).toBe(404);expect(unavailable.data.code).toBe('TASK_REPORT_SOURCE_UNAVAILABLE');
 const removed=await report({containerId:createUlid()});expect(removed.status).toBe(404);expect(removed.data.code).toBe('TASK_REPORT_SOURCE_UNAVAILABLE');
 const missingAncestor=await report({containerId:undefined,ancestorPageId:createUlid()});expect(missingAncestor.status).toBe(404);expect(missingAncestor.data.code).toBe('TASK_REPORT_SOURCE_UNAVAILABLE');
}
