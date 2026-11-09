import {automationJourney} from './automation-journey';
import {decisionLogJourney} from './decision-log-journey';
import {pageLockJourney} from './page-lock-journey';
import {bodyBlocksJourney} from './body-blocks-journey';
import {workItems,tasksJourney,remindersJourney,taskReportsJourney} from './work-items-journey';
import {env} from 'cloudflare:test';
import {afterEach, beforeEach, it, expect, vi} from 'vitest';
import {createApi} from '../../src/core/app/hono';
import {consumeJobs} from '../../src/core/app/background';
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
it("FLAG-001 — core wiki public doors retain native content while flagship routes and queued work require opt-in", async ({task}) => {
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
    { name: 'DEC-003 — accepted snapshots survive source edits and owner-authorized supersession in core wiki', run: async () => {
  const {cookie,containerId,memberId,workspaceId}=await workspace(), api=createApi();
  const {memberId:editorId}=await seedMember(workspaceId,{role:'member',displayName:'Citation editor',email:['synthetic-slate-editor','test.invalid'].join('@')});
  const editorCookie=await sessionFor(editorId);
  const request=(path:string,method='GET',body?:unknown,session=cookie)=>api.request('https://slate.example'+path,{method,headers:{cookie:session,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},env);
  const read=async(path:string,session=cookie)=>{const response=await request(path,'GET',undefined,session);expect(response.status,await response.clone().text()).toBe(200);return response.json<any>();};
  const command=async(path:string,body:Record<string,unknown>,session=cookie,method='POST')=>{const response=await request(path,method,{operationKey:crypto.randomUUID(),...body},session);expect(response.status,await response.clone().text()).toBe(200);return response.json<any>();};
  const sources=[];
  for(const title of ['Original support plan','Original fallback plan']){
    const created=await command('/api/pages',{containerId,title});
    const pageId=created.value.pageId;
    await command('/api/sharing',{targetKind:'page',targetId:pageId,principalKind:'member',principalId:editorId,level:'edit'});
    sources.push({kind:'page',sourceId:pageId,revisionId:(await read('/api/pages/'+pageId)).workingRevisionId});
  }
  const pageId=(await command('/api/pages',{containerId,title:'Release decision'})).value.pageId;
  await command('/api/sharing',{targetKind:'page',targetId:pageId,principalKind:'member',principalId:editorId,level:'view'});
  const draft={pageId,question:'Which support plan should ship?',options:['Primary','Fallback'],outcome:'Primary',rationale:'The exact two source revisions support this choice.',ownerId:memberId,decidedAt:null,reviewAt:null,citations:sources};
  const proposed=await command('/api/decisions',draft), id=proposed.value.id;
  const acceptedReceipt=await command(`/api/decisions/${id}/accept`,{expectedRevisionId:proposed.value.revisionId});
  const accepted=await read('/api/decisions/'+id);
  expect(accepted.state).toBe('accepted');expect(accepted.citationsCurrent).toBe(true);
  expect(accepted.content).toMatchObject({question:draft.question,options:draft.options,outcome:draft.outcome,rationale:draft.rationale,citations:sources});
  expect(accepted.acceptedRevisionId).toBe(acceptedReceipt.receipt.revisionId);
  const first=await read('/api/pages/'+sources[0]!.sourceId,editorCookie);
  const editReceipt=await command('/api/pages/'+sources[0]!.sourceId,{expectedRevisionId:first.page.revisionId,properties:{title:'Revised support plan'}},editorCookie,'PATCH');
  expect(editReceipt.receipt.entity.id).toBe(sources[0]!.sourceId);
  const stale=await read('/api/decisions/'+id);
  expect(stale.citationsCurrent).toBe(false);expect(stale.content).toEqual(accepted.content);expect(stale.accepted_snapshot_json).toBe(accepted.accepted_snapshot_json);
  expect((await read('/api/decisions?citationsCurrent=false')).items.find((item:any)=>item.id===id).content).toEqual(accepted.content);
  const inventory=async()=>({history:await read(`/api/decisions/${id}/history`),activity:await read('/api/activity')});
  const unchanged=await inventory();
  const refused=await request('/api/decisions','POST',{...draft,id,operationKey:crypto.randomUUID(),expectedRevisionId:stale.revision_id,question:'Attempted rewrite'});
  expect(refused.status).toBe(409);expect(await refused.json()).toMatchObject({code:'IMMUTABLE_DECISION'});
  expect(await read('/api/decisions/'+id)).toEqual(stale);expect(await inventory()).toEqual(unchanged);
  const unauthorized=await request(`/api/decisions/${id}/propose-successor`,'POST',{operationKey:crypto.randomUUID()},editorCookie);
  expect(unauthorized.status).toBe(403);expect(await read('/api/decisions/'+id)).toEqual(stale);
  const preparation={operationKey:crypto.randomUUID()};
  const prepared=await request(`/api/decisions/${id}/propose-successor`,'POST',preparation);
  expect(prepared.status,await prepared.clone().text()).toBe(200);
  const replacement=await prepared.json<any>();
  expect(await (await request(`/api/decisions/${id}/propose-successor`,'POST',preparation)).json()).toEqual(replacement);
  const next=await read('/api/decisions/'+replacement.value.id);
  const staleProposal=await command('/api/decisions',{...draft,id:next.id,pageId:next.page_id,expectedRevisionId:next.revision_id});
  const beforeStaleAcceptance=await read('/api/decisions/'+next.id);
  const staleAcceptance=await request(`/api/decisions/${next.id}/accept`,'POST',{operationKey:crypto.randomUUID(),expectedRevisionId:staleProposal.value.revisionId});
  expect(staleAcceptance.status).toBe(409);expect(await staleAcceptance.json()).toMatchObject({code:'STALE_EVIDENCE'});
  expect(await read('/api/decisions/'+next.id)).toEqual(beforeStaleAcceptance);
  expect(await read('/api/decisions/'+id)).toEqual(stale);

  const currentSources=await Promise.all(sources.map(async ref=>({...ref,revisionId:(await read('/api/pages/'+ref.sourceId)).workingRevisionId})));
  expect(currentSources[0]!.revisionId).not.toBe(sources[0]!.revisionId);
  const nextDraft={...draft,id:next.id,pageId:next.page_id,expectedRevisionId:staleProposal.value.revisionId,question:'Which revised support plan should ship?',outcome:'Fallback',rationale:'Current evidence changes the choice.',citations:currentSources};
  const saved=await command('/api/decisions',nextDraft);
  const supersessionInput={operationKey:crypto.randomUUID(),expectedRevisionId:saved.value.revisionId};
  const supersessionResponse=await request(`/api/decisions/${next.id}/accept`,'POST',supersessionInput);
  expect(supersessionResponse.status,await supersessionResponse.clone().text()).toBe(200);
  const supersessionReceipt=await supersessionResponse.json<any>();
  const earlier=await read('/api/decisions/'+id),later=await read('/api/decisions/'+next.id);
  expect(earlier.state).toBe('superseded');expect(earlier.superseded_by_decision_id).toBe(next.id);
  expect(earlier.content).toEqual(accepted.content);expect(earlier.accepted_snapshot_json).toBe(accepted.accepted_snapshot_json);
  expect(later.content.supersedesId).toBe(id);expect(later.content.citations).toEqual(currentSources);expect(later.citationsCurrent).toBe(true);
  expect((await read(`/api/decisions/${id}?revision=${accepted.acceptedRevisionId}`)).content).toEqual(accepted.content);
  expect(supersessionReceipt.receipt.entity.id).toBe(next.id);
  const afterSupersession=await inventory();
  expect(await (await request(`/api/decisions/${next.id}/accept`,'POST',supersessionInput)).json()).toEqual(supersessionReceipt);
  expect(await read('/api/decisions/'+id)).toEqual(earlier);
  expect(await read('/api/decisions/'+next.id)).toEqual(later);
  expect(await inventory()).toEqual(afterSupersession);
  await command('/api/sharing',{targetKind:'page',targetId:pageId,principalKind:'member',principalId:editorId,level:'view'});
  const replacementPage=await read('/api/pages/'+next.page_id);
  await command(`/api/sharing/pages/${next.page_id}/inheritance`,{expectedRevisionId:replacementPage.page.revisionId,restricted:true},cookie,'PUT');
  const denied=await request('/api/decisions/'+next.id,'GET',undefined,editorCookie);
  expect(denied.status).toBe(404);expect(await denied.text()).not.toContain(nextDraft.question);
  expect((await read('/api/decisions/'+id,editorCookie)).superseded_by_decision_id).toBe(next.id);
} },
    { name: 'DEC-004 — populated native decision log filters exact memberships and retains accepted revisions under current access', run: async () => {
      const {workspaceId,memberId,cookie} = await workspace();
      await decisionLogJourney(createApi(),workspaceId,memberId,cookie);
    } },
    { name: 'AUTO-001 — native rules execute committed page and record events and scheduled related actions in the default profile', run: async () => {
      const {workspaceId,containerId,cookie} = await workspace();
      Object.assign(task.meta,{automationReceipt:await automationJourney(createApi(),containerId,workspaceId,cookie)});
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
