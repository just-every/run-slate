import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {scheduledJobs} from '../../src/core/app/background';
import {seedMember,seedWorkspace,sessionFor} from '../e2e/setup/fixtures';
import {resetDeployment} from '../e2e/setup/reset-deployment';
import {decodeArchive} from '../../src/core/features/portability/archive';

/** Native core routes exercise authority, acknowledgment, schedule races, erasure and archive restoration together. */
export async function requiredReadingJourney(api:ReturnType<typeof createApi>,workspaceId:string,ownerId:string,containerId:string,initialCookie:string){
 const origin=new URL(String(env.APP_URL)).origin;
 const cookies:Record<string,string>={[ownerId]:initialCookie};
 const people:Record<string,string>={};
 for(const [index,name] of ['First reader','Second reader','Pending reader','Revoked reader','Excluded reader','Erased reader','Other owner'].entries()){
  const m=await seedMember(workspaceId,{role:name==='Other owner'?'owner':'member',displayName:name,email:[`synthetic-slate-${index+10}`,'test.invalid'].join('@')});people[name]=m.memberId;cookies[m.memberId]=await sessionFor(m.memberId,{freshProof:true});
 }
 const raw=(actor:string,method:string,path:string,body?:unknown)=>api.request(origin+path,{method,headers:{cookie:cookies[actor]!,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},env);
 const call=async(actor:string,method:string,path:string,body?:unknown,status=200)=>{const r=await raw(actor,method,path,body),data=await r.json<any>();expect(r.status,JSON.stringify(data)).toBe(status);return data;};
 const op=()=>crypto.randomUUID();
 const page=(await call(ownerId,'POST','/api/pages',{operationKey:op(),containerId,title:'Required launch checklist',blocks:[{id:op(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Read the launch checklist and explicitly acknowledge.'}]}}]})).value.pageId;
 const grants:Record<string,string>={};
 for(const name of ['First reader','Second reader','Pending reader','Revoked reader','Erased reader','Other owner'])grants[name]=(await call(ownerId,'POST','/api/sharing',{operationKey:op(),targetKind:'page',targetId:page,principalKind:'member',principalId:people[name],level:'view'})).value.id;
 const memberIds=Object.entries(people).filter(([name])=>name!=='Other owner').map(([,id])=>id);
 const group=(await call(ownerId,'POST','/api/groups',{operationKey:op(),name:'Required launch team',memberIds})).value.id;
 const input={operationKey:op(),pageId:page,groupId:group,reminderDays:2};
 const counts=()=>env.DB.prepare('SELECT (SELECT count(*) FROM required_readings) AS readings,(SELECT count(*) FROM required_reading_members) AS members,(SELECT count(*) FROM notifications) AS notices,(SELECT count(*) FROM activity_entries) AS activity').first();
 const before=await counts();await call(people['First reader']!,'POST','/api/required-reading',input,403);expect(await counts()).toEqual(before);
 const preview=await call(ownerId,'GET',`/api/required-reading/preview?pageId=${page}&groupId=${group}`);expect(preview.excluded.map((x:any)=>x.memberId)).toEqual([people['Excluded reader']]);expect(preview.readers).toHaveLength(5);
 const sent=await call(ownerId,'POST','/api/required-reading',input),id=sent.value.id;
 expect(sent.receipt.activityId).toBeTruthy();expect(sent.value.excluded).toEqual(preview.excluded);
 expect(await call(ownerId,'POST','/api/required-reading',input)).toEqual(sent);
 const noticeCount=async(member:string,event:string)=>{const inbox=await call(member,'GET','/api/notifications?limit=100');return inbox.items.filter((n:any)=>n.detail.requiredReadingId===id&&n.event===event).length;};
 for(const name of ['First reader','Second reader','Pending reader','Revoked reader','Erased reader'])expect(await noticeCount(people[name]!,'required-reading')).toBe(1);
 expect(await noticeCount(people['Excluded reader']!,'required-reading')).toBe(0);
 for(const name of ['First reader','Second reader']){
  const ack={operationKey:op()},result=await call(people[name]!,'POST',`/api/required-reading/${id}/acknowledge`,ack);
  expect(result.value).toEqual({id,memberId:people[name],acknowledgedAt:new Date().toISOString()});
  expect(await call(people[name]!,'POST',`/api/required-reading/${id}/acknowledge`,ack)).toEqual(result);
  expect((await call(people[name]!,'GET',`/api/required-reading/${id}`)).acknowledgedAt).toBe(result.value.acknowledgedAt);
 }
 const afterAcks=await counts();
 await call(people['Excluded reader']!,'POST',`/api/required-reading/${id}/acknowledge`,{operationKey:op()},404);
 await call(people['First reader']!,'GET',`/api/required-reading/${id}/report`,undefined,404);
 expect(await counts()).toEqual(afterAcks);
 expect((await call(people['First reader']!,'GET','/api/activity?action=required-reading.acknowledge')).items).toEqual([]);
 const report=()=>call(ownerId,'GET',`/api/required-reading/${id}/report`);
 expect((await report()).members.find((m:any)=>m.memberId===people['Pending reader']).state).toBe('pending');
 // No reminder before the controlled interval, even under replayed scheduled processing.
 await scheduledJobs(env,new Date(Date.now()+86400000).toISOString());
 expect(await noticeCount(people['Pending reader']!,'required-reading-reminder')).toBe(0);
 await call(ownerId,'POST','/api/sharing',{operationKey:op(),id:grants['Revoked reader'],targetKind:'page',targetId:page,principalKind:'member',principalId:people['Revoked reader'],level:'view',revoke:true});
 cookies[ownerId]=await sessionFor(ownerId,{freshProof:true});
 const erase={operationKey:op(),memberId:people['Erased reader'],erase:true};
 await call(ownerId,'POST','/api/members/remove',erase);
 expect(await env.DB.prepare('SELECT count(*) AS n FROM required_reading_members WHERE member_id=?').bind(people['Erased reader']).first<number>('n')).toBe(0);
 const due=sent.value.dueAt;vi.setSystemTime(new Date(due));
 await Promise.all([scheduledJobs(env,due),scheduledJobs(env,due)]);await scheduledJobs(env,due);
 expect(await noticeCount(people['Pending reader']!,'required-reading-reminder')).toBe(1);
 for(const name of ['First reader','Second reader','Revoked reader','Excluded reader'])expect(await noticeCount(people[name]!,'required-reading-reminder')).toBe(0);
 const states=await report();expect(states.members.map((m:any)=>[m.displayName,m.state])).toEqual([['Excluded reader','cannot-read'],['First reader','acknowledged'],['Pending reader','reminded'],['Revoked reader','pending'],['Second reader','acknowledged']]);
 expect(await call(people['Other owner']!,'GET',`/api/required-reading/${id}/report`)).toEqual(states);
 expect(JSON.stringify(states)).not.toMatch(/readingTime|scrollDepth|viewCount|viewedAt/);
 const activity=await call(ownerId,'GET','/api/activity?action=required-reading.acknowledge');expect(activity.items).toHaveLength(2);expect(new Set(activity.items.map((r:any)=>r.actor.id))).toEqual(new Set([people['First reader'],people['Second reader']]));
 expect((await call(ownerId,'GET','/api/activity?action=required-reading.send')).items).toHaveLength(1);
 // Fresh proof and complete native export. Open the archive; restore it into a fresh bootstrap.
 cookies[ownerId]=await sessionFor(ownerId,{freshProof:true});
 const exported=await call(ownerId,'POST','/api/exports/workspace',{operationKey:op()});
 const download=await raw(ownerId,'GET',`/api/exports/${exported.id}/download`);expect(download.status).toBe(200);
 const bytes=new Uint8Array(await download.arrayBuffer()),{manifest}=await decodeArchive(bytes);
 expect(manifest.tables.required_readings).toHaveLength(1);expect(manifest.tables.required_reading_members).toHaveLength(5);
 expect(manifest.tables.required_reading_members!.some(r=>r.member_id===people['Erased reader'])).toBe(false);
 const sourceEmail=String(manifest.tables.members!.find(m=>m.id===ownerId)!.email);
 await resetDeployment();
 const destination=await seedWorkspace(),bootstrap=(await seedMember(destination.workspaceId,{role:'owner',displayName:'Restore owner',email:sourceEmail,isSetupOwner:true})).memberId;
 const bootstrapCookie=await sessionFor(bootstrap,{freshProof:true}),form=new FormData();form.set('file',new File([bytes as Uint8Array<ArrayBuffer>],'required-reading.zip',{type:'application/zip'}));
 const restored=await api.request(origin+'/api/exports/restore',{method:'POST',headers:{cookie:bootstrapCookie,origin},body:form},env);expect(restored.status,await restored.clone().text()).toBe(200);
 cookies[ownerId]=await sessionFor(ownerId,{freshProof:true});
 const readback=await report();expect(readback.members).toEqual(states.members);expect(readback.cancelledAt).toBeTruthy();
 await scheduledJobs(env,new Date(Date.now()+10*86400000).toISOString());
 expect(await env.DB.prepare("SELECT count(*) AS n FROM notifications WHERE event='required-reading-reminder'").first<number>('n')).toBe(1);
 await call(people['Erased reader']!,'POST',`/api/required-reading/${id}/acknowledge`,{operationKey:op()},401);
}
