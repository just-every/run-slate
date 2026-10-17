import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember,sessionFor} from '../e2e/setup/fixtures';
import {createUlid} from '../../src/core/shared/ulid';
import {dispatchDueReminders} from '../../src/core/features/reminders/delivery';
import {processNotificationOutbox} from '../../src/core/features/notifications/outbox';
import type {FeatureContext} from '../../src/core/app/feature-context';
/** Extend the existing default-profile public journey without increasing the test count. */
export async function workItemsJourney(api:ReturnType<typeof createApi>,containerId:string,ownerId:string,workspaceId:string,ownerCookie:string){
 const reader=(await seedMember(workspaceId,{role:'member',displayName:'Task reader',email:`${createUlid()}@tasks.test`})).memberId,other=(await seedMember(workspaceId,{role:'member',displayName:'Task other',email:`${createUlid()}@tasks.test`})).memberId;
 const cookies:{[key:string]:string}={[ownerId]:ownerCookie,[reader]:await sessionFor(reader),[other]:await sessionFor(other)};
 const request=async(method:string,path:string,body?:unknown,actor=ownerId)=>{const r=await api.request(`https://slate.example${path}`,{method,headers:{cookie:cookies[actor]!,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},env);return {status:r.status,data:await r.json<any>()};};
 const create=async(title:string)=>{const r=await request('POST','/api/pages',{operationKey:createUlid(),containerId,title});expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data.value as {pageId:string;revisionId:string};};
 const share=async(pageId:string,memberId:string,revoke=false,id?:string)=>{const r=await request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:pageId,principalKind:'member',principalId:memberId,level:'edit',revoke,...(id?{id}:{})});expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data.value.id as string;};
 const p=await create('Actions'),q=await create('More actions'),taskId=createUlid(),due=new Date(Date.now()+86400000).toISOString().slice(0,10),later=new Date(Date.now()+172800000).toISOString().slice(0,10);
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
 const complete=await request('PATCH',`/api/tasks/${p.pageId}/${taskId}`,{operationKey:createUlid(),expectedRevisionId:first.data.items[0].blockRevisionId,done:true},reader);expect(complete.status,JSON.stringify(complete.data)).toBe(200);
 expect((await request('PATCH',`/api/tasks/${p.pageId}/${taskId}`,{operationKey:createUlid(),expectedRevisionId:first.data.items[0].blockRevisionId,done:false},reader)).status).toBe(409);
 const next=await request('GET',`/api/tasks?state=open&sort=due&limit=1&cursor=${encodeURIComponent(first.data.nextCursor)}`,undefined,reader);expect(next.data.items[0].blockId).toBe(write.blocks[1]!.id);
 page=await request('GET',`/api/pages/${p.pageId}`);expect(page.data.blocks[0].content).toMatchObject({done:true,completedByMemberId:reader});
 const block=page.data.blocks[1],reassign=await request('PATCH',`/api/pages/${p.pageId}/blocks/${block.id}`,{operationKey:createUlid(),expectedRevisionId:block.revisionId,content:{...block.content,assigneeMemberId:other}});expect(reassign.status).toBe(200);
 inbox=await request('GET','/api/notifications',undefined,reader);expect(inbox.data.items.filter((x:any)=>x.event==='task-assigned')).toHaveLength(3);expect((await request('GET','/api/notifications',undefined,other)).data.items.filter((x:any)=>x.event==='task-assigned')).toHaveLength(1);
 // Give the open third task a due date, then prove the same automatic due reminder runs once.
 let thirdPage=await request('GET',`/api/pages/${q.pageId}`);const thirdBlock=thirdPage.data.blocks[0];expect((await request('PATCH',`/api/pages/${q.pageId}/blocks/${third.id}`,{operationKey:createUlid(),expectedRevisionId:thirdBlock.revisionId,content:{...thirdBlock.content,dueDate:due}})).status).toBe(200);
 const explicit=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:p.pageId,blockId:taskId,date:due,time:'09:00',timezone:'Australia/Brisbane',offsetMinutes:60});expect(explicit.status,JSON.stringify(explicit.data)).toBe(200);expect(explicit.data.value.dueAt).toBe(new Date(Date.parse(`${due}T09:00:00+10:00`)-3600000).toISOString());
 const second=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:q.pageId,date:due,time:'09:00',timezone:'Pacific/Honolulu'},reader);expect(second.status).toBe(200);expect(second.data.value.dueAt).toBe(`${due}T19:00:00.000Z`);
 const revoked=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:p.pageId,date:due,time:'09:00',timezone:'Pacific/Honolulu'},reader);expect(revoked.status).toBe(200);
 await share(p.pageId,reader,true,grant);expect((await request('GET','/api/tasks',undefined,reader)).data.items.map((t:any)=>t.pageId)).toEqual([q.pageId]);
 const actor={id:ownerId,workspaceId,workspaceName:'Aurora',displayName:'Profile owner',email:'owner@test.invalid',initials:'PO',role:'owner' as const},ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor,now:`${due}T00:00:00.000Z`};
 await dispatchDueReminders(ctx);await processNotificationOutbox(ctx);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='reminder' AND recipient_member_id=?").bind(ownerId).first<number>('n')).toBe(1);
 const late={...ctx,now:`${due}T23:59:00.000Z`};await Promise.all([dispatchDueReminders(late),dispatchDueReminders(late)]);await processNotificationOutbox(late);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='task-due' AND recipient_member_id=?").bind(reader).first<number>('n')).toBe(1);
 expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE event='reminder' AND recipient_member_id=?").bind(reader).first<number>('n')).toBe(1);
 const personal=await request('GET','/api/reminders');expect(personal.data.items.find((r:any)=>r.id===explicit.data.value.id).deliveredAt).not.toBeNull();
 const cancel=await request('POST','/api/reminders',{operationKey:createUlid(),pageId:q.pageId,date:later,time:'12:00',timezone:'UTC'});expect(cancel.status).toBe(200);expect((await request('DELETE',`/api/reminders/${cancel.data.value.id}`,{operationKey:createUlid()})).status).toBe(200);
}
