import {applyD1Migrations,env,reset} from 'cloudflare:test';
import {expect} from 'vitest';
import {seedWorkspace,seedMember,seedContainer,seedPage,sessionFor} from '../e2e/setup/fixtures';
import {createApi} from '../../src/core/app/hono';
export async function reminderUpgradeCase(){
 const index=env.TEST_MIGRATIONS.findIndex(m=>m.name.includes('reminder_follow_through'));
 await reset();await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.slice(0,index));
 const {workspaceId}=await seedWorkspace(),owner=await seedMember(workspaceId,{role:'owner',displayName:'Upgrade owner',email:'owner@upgrade.test'}),reader=await seedMember(workspaceId,{role:'member',displayName:'Upgrade reader',email:'reader@upgrade.test'}),{containerId}=await seedContainer(workspaceId,{ownerMemberId:owner.memberId,visibility:'private'}),{pageId}=await seedPage(containerId,{authorMemberId:owner.memberId,title:'Retained reminder page'});
 const id=crypto.randomUUID(),due='2027-01-01T12:00:00.000Z';
 await env.DB.prepare("INSERT INTO reminders(id,workspace_id,member_id,page_id,kind,date,time,timezone,offset_minutes,due_at,revision_id,created_at) VALUES(?,?,?,?,'personal','2027-01-01','12:00','UTC',0,?,'legacy-reminder',?)").bind(id,workspaceId,reader.memberId,pageId,due,new Date().toISOString()).run();
 await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.slice(index));
 const api=createApi(),cookie=await sessionFor(reader.memberId),response=await api.request('https://slate.test/api/reminders/jobs',{headers:{cookie}},env);
 expect(response.status).toBe(200);const result=await response.json<any>();expect(JSON.stringify(result)).not.toContain('Retained reminder page');expect(result.items.find((r:any)=>r.id===id)).toMatchObject({dueAt:due,state:'queued',failure:null,startedAt:null});
 const ownerCookie=await sessionFor(owner.memberId,{freshProof:true});
 const removed=await api.request('https://slate.test/api/members/remove',{method:'POST',headers:{cookie:ownerCookie,origin:'https://slate.test','content-type':'application/json'},body:JSON.stringify({operationKey:crypto.randomUUID(),memberId:reader.memberId,erase:true})},env);
 expect(removed.status,await removed.text()).toBe(200);expect(await env.DB.prepare('SELECT id FROM reminders WHERE id=?').bind(id).first()).toBeNull();
}
