import {pageLockJourney} from './page-lock-journey';
import {bodyBlocksJourney} from './body-blocks-journey';
import {workItems,tasksJourney,remindersJourney,taskReportsJourney} from './work-items-journey';
import {env} from 'cloudflare:test';
import {afterEach, beforeEach, it, expect, vi} from 'vitest';
import {createApi} from '../../src/core/app/hono';
import {consumeJobs,scheduledJobs} from '../../src/core/app/background';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../e2e/setup/fixtures';
import {resetDeployment} from '../e2e/setup/reset-deployment';

beforeEach(async () => {
  vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
  await resetDeployment();
});
afterEach(() => vi.useRealTimers());

async function workspace() {
  const {workspaceId} = await seedWorkspace();
  const {memberId} = await seedMember(workspaceId, {role:'owner', displayName:'Profile Owner', email:crypto.randomUUID()+'@test.invalid'});
  const {containerId} = await seedContainer(workspaceId, {ownerMemberId:memberId, visibility:'open'});
  await seedContainerGrant(containerId, {principalKind:'member',principalId:memberId,level:'full'});
  return {containerId,memberId,workspaceId, cookie:await sessionFor(memberId)};
}
it("FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in", async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: 'FLAG-001 — default API refuses flagship entry points after native authentication; explicit opt-in retains routes', run: async () => {
  const {cookie} = await workspace(), api = createApi();
  for (const family of ['ai','runs','inquiries','experiments','skills','effects','impact','agent','claims','sources','connectors','suggestions','decisions/from-run/old-run']) {
    for (const method of ['GET','POST']) {
      const response = await api.request('https://slate.example/api/'+family, {method,headers:{cookie}}, env);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({code:'FEATURE_DISABLED'});
    }
  }
  const anon = await api.request('https://slate.example/api/runs', {}, env);
  expect(anon.status).toBe(401);
  expect(await (await api.request('https://slate.example/api/profile',{headers:{cookie}},env)).json()).toEqual({profile:'core-wiki'});
  const enabled = await api.request('https://slate.example/api/ai/availability',{headers:{cookie}},{...env,SLATE_PROFILE:'flagship'});
  expect(enabled.status).toBe(200);
  expect(await enabled.json()).toMatchObject({providerConfigured:false});
} },
    { name: 'FLAG-001 — core wiki creates and revises genuine pages, searches them, and retains portability and publication endpoints', run: async () => {
  const {cookie,containerId,memberId,workspaceId} = await workspace(), api=createApi();
  const request=(path:string,method='GET',body?:unknown)=>api.request('https://slate.example'+path,{method,headers:{cookie,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},env);
  const created=await request('/api/pages','POST',{operationKey:crypto.randomUUID(),containerId,title:'Profile journal'});
  expect(created.status).toBe(200);
  const operation=await created.json() as {value:{pageId:string;revisionId:string}};
  const id=operation.value.pageId;
  const read=await request('/api/pages/'+id);
  expect(read.status).toBe(200);
  const page=await read.json() as {page:{revisionId:string}};
  const title='Profile '+crypto.randomUUID();
  const revised=await request('/api/pages/'+id,'PATCH',{operationKey:crypto.randomUUID(),expectedRevisionId:page.page.revisionId,properties:{title}});
  expect(revised.status).toBe(200);
  const results=await request('/api/search?q='+encodeURIComponent(title));
  expect(results.status).toBe(200);
  expect((await results.json() as {items:{id:string}[]}).items.some(item=>item.id===id)).toBe(true);
  expect((await request('/api/collaboration/'+id)).status).toBe(200);
  const socket=await request('/api/collaboration/'+id+'/socket');
  expect(socket.status).toBe(403);
  expect(await socket.json()).toMatchObject({code:'FEATURE_DISABLED'});
  const current=await (await request('/api/pages/'+id)).json() as {page:{revisionId:string}};
  const publishing=await request('/api/pages/'+id+'/publish-preview','POST',{expectedRevisionId:current.page.revisionId});
  expect(publishing.status).toBe(200);
  const preview=await publishing.json() as {previewFingerprint:string};
  const published=await request('/api/pages/'+id+'/publish','POST',{operationKey:crypto.randomUUID(),expectedRevisionId:current.page.revisionId,previewFingerprint:preview.previewFingerprint});
  expect(published.status).toBe(200);
  const exporting=await request('/api/exports/readable','POST',{scope:'page',id,format:'markdown'});
  expect(exporting.status).toBe(200);
  expect(exporting.headers.get('content-type')).toBe('application/zip');
  const archive=await exporting.arrayBuffer();
  expect(archive.byteLength).toBeGreaterThan(0);
  const form=new FormData();
  form.set('operationKey',crypto.randomUUID());form.set('format','slate-readable');
  form.set('file',new File([archive],'profile-export.zip',{type:'application/zip'}));
  const imports=await api.request('https://slate.example/api/imports',{method:'POST',headers:{cookie},body:form},env);
  expect(imports.status).toBe(200);
  const imported=await imports.json() as {id:string};
  const run=await request('/api/imports/'+imported.id+'/run','POST');
  expect(run.status).toBe(200);
  expect(await run.json()).toMatchObject({state:'completed'});
  await bodyBlocksJourney(api,containerId,cookie);
  await pageLockJourney(api,containerId,workspaceId,cookie);
} },
    { name: 'DEC-005 — default scheduled processing notifies the overdue owner once per review period and respects revoked access', run: async () => {
  const {cookie,containerId,memberId,workspaceId}=await workspace(),api=createApi();
  const reader=(await seedMember(workspaceId,{role:'member',displayName:'Decision reviewer',email:[crypto.randomUUID(),'test.invalid'].join('@')})).memberId;
  const readerCookie=await sessionFor(reader);
  const request=async(path:string,method='GET',body?:unknown,actorCookie=cookie)=>{
    const response=await api.request('https://slate.example'+path,{method,headers:{cookie:actorCookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env);
    expect(response.status,await response.clone().text()).toBe(200);
    return response.json<any>();
  };
  const pageId=(await request('/api/pages','POST',{operationKey:crypto.randomUUID(),containerId,title:'Decision review'})).value.pageId;
  const share={targetKind:'page',targetId:pageId,principalKind:'member',principalId:reader,level:'edit'};
  await request('/api/sharing','POST',{operationKey:crypto.randomUUID(),...share});
  const create=async(ownerId:string,actorCookie=cookie)=>{
    const target=ownerId===memberId?pageId:(await request('/api/pages','POST',{operationKey:crypto.randomUUID(),containerId,title:'Revoked decision review'})).value.pageId;
    if(target!==pageId)await request('/api/sharing','POST',{operationKey:crypto.randomUUID(),...share,targetId:target});
    const proposed=await request('/api/decisions','POST',{operationKey:crypto.randomUUID(),pageId:target,question:'Review the support rota',options:['Retain rota'],outcome:'Retain rota',rationale:'Named review owner',ownerId,decidedAt:null,reviewAt:'2026-10-19T12:00:00.000Z',citations:[]},actorCookie);
    await request('/api/decisions/'+proposed.value.id+'/accept','POST',{operationKey:crypto.randomUUID(),expectedRevisionId:proposed.value.revisionId},actorCookie);
    return proposed.value.id as string;
  };
  const decisionId=await create(memberId),revokedId=await create(reader,readerCookie);
  const revoked=await request('/api/decisions/'+revokedId);
  const revokedGrant=(await env.DB.prepare('SELECT id FROM page_grants WHERE page_id=? AND principal_id=?').bind(revoked.page_id,reader).first<{id:string}>())!;
  await request('/api/sharing','POST',{operationKey:crypto.randomUUID(),...share,targetId:revoked.page_id,id:revokedGrant.id,revoke:true});
  const count=async(id:string,recipient:string)=>(await env.DB.prepare("SELECT count(*) AS n FROM notifications WHERE event='decision-required' AND json_extract(detail_json,'$.decisionId')=? AND recipient_member_id=?").bind(id,recipient).first<{n:number}>())!.n;
  const before=await count(decisionId,memberId),revokedBefore=await count(revokedId,reader);
  await scheduledJobs(env);
  expect(await count(decisionId,memberId)).toBe(before);
  vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
  await scheduledJobs(env);await scheduledJobs(env);
  expect(await count(decisionId,memberId)).toBe(before+1);
  expect(await count(decisionId,reader)).toBe(0);
  expect(await count(revokedId,reader)).toBe(revokedBefore);
  expect(await env.DB.prepare('SELECT overdue_notified_at FROM knowledge_decisions WHERE id=?').bind(revokedId).first()).toEqual({overdue_notified_at:null});
  let decision=await request('/api/decisions/'+decisionId);
  expect(decision).toMatchObject({state:'accepted',overdue:true});
  const acceptedRevision=decision.acceptedRevisionId;
  const today=async()=>((await request('/api/notifications/today')).decisions as {detail:{decisionId:string}}[]).filter(item=>item.detail.decisionId===decisionId);
  expect((await today()).length).toBeGreaterThan(0);
  const review={operationKey:crypto.randomUUID(),expectedRevisionId:decision.revision_id,note:'Rota reviewed and retained',nextReviewAt:'2026-10-21T12:00:00.000Z'};
  await request('/api/decisions/'+decisionId+'/review','POST',review);
  await request('/api/decisions/'+decisionId+'/review','POST',review);
  decision=await request('/api/decisions/'+decisionId);
  expect(decision).toMatchObject({state:'accepted',overdue:false,acceptedRevisionId:acceptedRevision,review_at:review.nextReviewAt});
  expect(await today()).toEqual([]);
  const reviews=(await request('/api/decisions/'+decisionId+'/reviews')).items;
  expect(reviews).toHaveLength(1);
  expect(reviews[0]).toMatchObject({note:review.note,reviewed_by_member_id:memberId,created_at:'2026-10-20T12:00:00.000Z',next_review_at:review.nextReviewAt});
  await scheduledJobs(env);expect(await count(decisionId,memberId)).toBe(before+1);
  vi.setSystemTime(new Date('2026-10-22T12:00:00.000Z'));
  await scheduledJobs(env);await scheduledJobs(env);
  expect(await count(decisionId,memberId)).toBe(before+2);
  expect(await today()).toHaveLength(1);
  const replacementPage=(await request('/api/pages','POST',{operationKey:crypto.randomUUID(),containerId,title:'Replacement decision'})).value.pageId;
  const replacement=await request('/api/decisions','POST',{operationKey:crypto.randomUUID(),pageId:replacementPage,question:'Replacement rota',options:['New rota'],outcome:'New rota',rationale:'Superseded after review',ownerId:memberId,decidedAt:null,reviewAt:null,citations:[]});
  await request('/api/decisions/'+replacement.value.id+'/accept','POST',{operationKey:crypto.randomUUID(),expectedRevisionId:replacement.value.revisionId,supersedesId:decisionId});
  expect(await request('/api/decisions/'+decisionId)).toMatchObject({state:'superseded',overdue:false,superseded_by_decision_id:replacement.value.id});
  expect(await today()).toEqual([]);
  await scheduledJobs(env);expect(await count(decisionId,memberId)).toBe(before+2);
} },
    { name: 'FLAG-001 — old queued flagship work records failure and retries without dispatch or acknowledgement', run: async () => {
  for(const kind of ['intelligence.run','intelligence.finalize','federation.refresh']) {
    const id=crypto.randomUUID();let acknowledged=false,retried=false;
    const message={id,body:{kind,runId:crypto.randomUUID()},attempts:1,timestamp:new Date(),ack(){acknowledged=true;},retry(){retried=true;}};
    await consumeJobs({messages:[message],queue:'profile-test',metadata:{metrics:{backlogCount:1,backlogBytes:0}},ackAll(){throw Error('unexpected batch ack');},retryAll(){throw Error('unexpected batch retry');}},env);
    expect(acknowledged).toBe(false);expect(retried).toBe(true);
    expect(await env.DB.prepare('SELECT state,error_code FROM core_job_failures WHERE id=?').bind(id).first()).toEqual({state:'failed',error_code:'FEATURE_DISABLED'});
  }
} }
  ];
  for (const scenario of cases) {
    try { await (async () => {
  vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
  await resetDeployment();
})(); await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
    finally { await (() => vi.useRealTimers())(); }
  }
});

it('BLOCK-015 — a task assigned to a member without access prompts a share, notifies its assignee once, reassigns without notifying the previous assignee and records completion', async () => {
  const {cookie,containerId,memberId,workspaceId} = await workspace();
  await tasksJourney(await workItems(createApi(),containerId,memberId,workspaceId,cookie));
});
it('NOTIF-004 — page, task and date-mention reminders arrive once at local time in three time zones and not after access is revoked', async () => {
  const {cookie,containerId,memberId,workspaceId} = await workspace(), items = await workItems(createApi(),containerId,memberId,workspaceId,cookie);
  await remindersJourney(items, await tasksJourney(items));
});
it('BLOCK-016 — a task report shows each reader only the tasks they can read and completes a task on its page', async () => {
  const {cookie,containerId,memberId,workspaceId} = await workspace();
  await taskReportsJourney(await workItems(createApi(),containerId,memberId,workspaceId,cookie));
});
