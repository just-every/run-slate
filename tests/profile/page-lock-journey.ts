import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember,seedContainerGrant,sessionFor} from '../e2e/setup/fixtures';
import {scheduledAutomation} from '../../src/core/features/automation/events';

/** Content locks retain independent comments, grants and source visibility. */
export async function pageLockJourney(api:ReturnType<typeof createApi>,containerId:string,workspaceId:string,cookie:string) {
 const editor=await seedMember(workspaceId,{role:'member',displayName:'Release editor',email:crypto.randomUUID()+'@test.invalid'});
 await seedContainerGrant(containerId,{principalKind:'member',principalId:editor.memberId,level:'edit'});
 const editorCookie=await sessionFor(editor.memberId);
 const request=(path:string,method='GET',body?:unknown,as=cookie)=>api.request('https://slate.example'+path,{method,headers:{cookie:as,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},env);
 const command=(path:string,body:Record<string,unknown>,as=cookie)=>request(path,'POST',{operationKey:crypto.randomUUID(),...body},as);
 const created=await command('/api/pages',{containerId,title:'Release safety procedure'});
 expect(created.status).toBe(200);
 const {value:{pageId}}=await created.json<any>();
 const read=async()=>{const response=await request('/api/pages/'+pageId);return response.json<any>();};
 const initial=await read();
 const locked=await command(`/api/pages/${pageId}/lock`,{expectedRevisionId:initial.page.revisionId});
 expect(locked.status,await locked.clone().text()).toBe(200);
 const current=await read();
 expect(current.workingRevisionId).toBe(initial.workingRevisionId);
 expect(current.permissions).toMatchObject({canEdit:false,canUnlock:true});
 const second=await (await request('/api/pages/'+pageId,'GET',undefined,editorCookie)).json<any>();
 expect(second.lock.lockedByMemberId).toBeDefined();
 expect(second.permissions).toMatchObject({canEdit:false,canUnlock:true});
 const refused=await request('/api/pages/'+pageId,'PATCH',{operationKey:crypto.randomUUID(),expectedRevisionId:current.page.revisionId,properties:{title:'Accidental edit'}},editorCookie);
 expect(refused.status).toBe(409);expect(await refused.json()).toMatchObject({code:'PAGE_LOCKED'});
 const body=await request(`/api/pages/${pageId}/blocks`,'PUT',{operationKey:crypto.randomUUID(),expectedRevisionId:current.page.revisionId,blocks:[]},editorCookie);
 expect(body.status).toBe(409);expect(await body.json()).toMatchObject({code:'PAGE_LOCKED'});
 const comment=await command(`/api/comments/page/${pageId}`,{body:[{text:'Please keep the rollback procedure current.'}]},editorCookie);
 expect(comment.status,await comment.clone().text()).toBe(200);
 const rule=await command('/api/automation',{name:'Release follow-up',scope:'container',containerId,trigger:{event:'schedule',startsAt:new Date(Date.now()-60000).toISOString(),intervalMinutes:60},conditions:[],actions:[{type:'create-page',containerId,parentPageId:pageId,title:'Automated follow-up'}]});
 expect(rule.status,await rule.clone().text()).toBe(201);
 const ruleId=(await rule.json<any>()).value.id;
 await scheduledAutomation(env);
 const runs=await (await request(`/api/automation/${ruleId}/runs`)).json<any>();
 expect(runs.items.some((run:any)=>JSON.stringify(run).includes('PAGE_LOCKED'))).toBe(true);
 const importBody=new FormData();importBody.set('file',new File(['# Locked import\nThis must not be appended.'],'locked.md',{type:'text/markdown'}));importBody.set('format','markdown');importBody.set('operationKey',crypto.randomUUID());importBody.set('destinationPageId',pageId);importBody.set('expectedRevisionId',current.page.revisionId);importBody.set('mode','append');
 const uploaded=await api.request('https://slate.example/api/imports',{method:'POST',headers:{cookie:editorCookie},body:importBody},env);
 expect(uploaded.status,await uploaded.clone().text()).toBe(200);
 const importId=(await uploaded.json<any>()).id;
 const imported=await command(`/api/imports/${importId}/run`,{},editorCookie);
 expect(imported.status,await imported.clone().text()).toBe(409);expect(await imported.json()).toMatchObject({code:'PAGE_LOCKED'});
 const unlocked=await command(`/api/pages/${pageId}/unlock`,{expectedRevisionId:(await read()).page.revisionId},editorCookie);
 expect(unlocked.status,await unlocked.clone().text()).toBe(200);
 const open=await read();expect(open.lock).toBeNull();expect(open.permissions.canEdit).toBe(true);
 const edited=await request('/api/pages/'+pageId,'PATCH',{operationKey:crypto.randomUUID(),expectedRevisionId:open.page.revisionId,properties:{title:'Release safety procedure reviewed'}},editorCookie);
 expect(edited.status,await edited.clone().text()).toBe(200);
 // Two real commands compete on one revision; a lock winner keeps its specific refusal.
 const raceBase=await read();
 const [racingLock,racingEdit]=await Promise.all([
  command(`/api/pages/${pageId}/lock`,{expectedRevisionId:raceBase.page.revisionId}),
  request('/api/pages/'+pageId,'PATCH',{operationKey:crypto.randomUUID(),expectedRevisionId:raceBase.page.revisionId,properties:{title:'Concurrent procedure update'}},editorCookie),
 ]);
 expect([racingLock,racingEdit].filter(response=>response.ok)).toHaveLength(1);
 if(racingLock.ok)expect(await racingEdit.json()).toMatchObject({code:'PAGE_LOCKED'});
 else expect(await racingLock.json()).toMatchObject({code:'REVISION_CONFLICT'});
 const activity=await (await request(`/api/activity?pageId=${pageId}`)).json<any>();
 expect(activity.items.some((entry:any)=>entry.action==='pages.lock')).toBe(true);
 expect(activity.items.some((entry:any)=>entry.action==='pages.unlock')).toBe(true);
}
