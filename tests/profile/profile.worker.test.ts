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
  const {memberId} = await seedMember(workspaceId, {role:'owner', displayName:'Profile Owner', email:[crypto.randomUUID(),'test.invalid'].join('@')});
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
    { name: 'DEC-002 — native decision transitions replay once and terminal refusals preserve all rows', run: async () => {
  const {cookie,containerId,memberId,workspaceId}=await workspace(), api=createApi();
  const editor=await seedMember(workspaceId,{role:'member',displayName:'Decision Editor',email:[crypto.randomUUID(),'test.invalid'].join('@')});
  await seedContainerGrant(containerId,{principalKind:'member',principalId:editor.memberId,level:'edit'});
  const editorCookie=await sessionFor(editor.memberId);
  const send=(path:string,data?:unknown,as=cookie)=>api.request('https://slate.example'+path,{method:data?'POST':'GET',headers:{cookie:as,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})},env);
  const read=async(path:string)=>{const response=await send(path);expect(response.status).toBe(200);return await response.json() as any;};
  const writes:{path:string;input:any;as:string;result:any}[]=[];
  const write=async(path:string,data:Record<string,unknown>,as=cookie)=>{
    const input={operationKey:crypto.randomUUID(),...data};
    const response=await send(path,input,as);expect(response.status,await response.clone().text()).toBe(200);
    const result=await response.json() as any;
    const replay=await send(path,input,as);expect(replay.status).toBe(200);expect(await replay.json()).toEqual(result);
    if(path.startsWith('/api/decisions'))writes.push({path,input,as,result});
    vi.setSystemTime(new Date(Date.now()+1000));
    return result;
  };
  const page=await write('/api/pages',{containerId,title:'Native decision state desk'});
  const pageId=page.value.pageId, document=await read('/api/pages/'+pageId);
  const draft={pageId,question:'Proceed with the change?',options:['Wait','Proceed'],outcome:'Wait',rationale:'Current evidence supports waiting.',ownerId:memberId,decidedAt:null,reviewAt:null,citations:[{kind:'page',sourceId:pageId,revisionId:document.workingRevisionId}]};
  const snapshot=async()=>({
    decisions:(await env.DB.prepare('SELECT * FROM knowledge_decisions ORDER BY id').all()).results,
    revisions:(await env.DB.prepare('SELECT * FROM intelligence_revisions ORDER BY id').all()).results,
    reviews:(await env.DB.prepare('SELECT * FROM decision_reviews ORDER BY id').all()).results,
    receipts:(await env.DB.prepare('SELECT * FROM operation_receipts ORDER BY id').all()).results,
    activity:(await env.DB.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results,
    pages:(await env.DB.prepare('SELECT * FROM pages ORDER BY id').all()).results,
    pageRevisions:(await env.DB.prepare('SELECT * FROM page_revisions ORDER BY id').all()).results,
  });
  const refuse=async(path:string,data:Record<string,unknown>,code:string,as=cookie)=>{
    const before=await snapshot(), response=await send(path,{operationKey:crypto.randomUUID(),...data},as);
    expect([403,409]).toContain(response.status);expect(await response.json()).toMatchObject({code});expect(await snapshot()).toEqual(before);
  };
  const first=await write('/api/decisions',draft,editorCookie), firstId=first.value.id;
  await refuse('/api/decisions/'+firstId+'/accept',{expectedRevisionId:first.value.revisionId},'DECISION_OWNER_REQUIRED',editorCookie);
  const accepted=await write('/api/decisions/'+firstId+'/accept',{expectedRevisionId:first.value.revisionId});
  await write('/api/decisions/'+firstId+'/review',{expectedRevisionId:accepted.value.revisionId,note:'The outcome still applies.',nextReviewAt:null},editorCookie);
  const successor=await write('/api/decisions/'+firstId+'/propose-successor',{}), secondId=successor.value.id;
  expect((await read('/api/decisions/'+firstId)).state).toBe('accepted');
  const second=await write('/api/decisions',{...draft,pageId:successor.value.pageId,id:secondId,expectedRevisionId:successor.value.revisionId,outcome:'Proceed in stages',supersedesId:firstId});
  await write('/api/decisions/'+secondId+'/accept',{expectedRevisionId:second.value.revisionId});
  const thirdPage=await write('/api/pages',{containerId,title:'Selected replacement'});
  const third=await write('/api/decisions',{...draft,pageId:thirdPage.value.pageId,question:'What follows the staged change?'},editorCookie), thirdId=third.value.id;
  await write('/api/decisions/'+thirdId+'/accept',{expectedRevisionId:third.value.revisionId,supersedesId:secondId});
  const probePage=await write('/api/pages',{containerId,title:'Terminal refusal probe'});
  const probe=await write('/api/decisions',{...draft,pageId:probePage.value.pageId,question:'Can a terminal decision be reused?'});
  for(const [id,replacement] of [[firstId,secondId],[secondId,thirdId]]){
    const terminal=await read('/api/decisions/'+id);
    expect(terminal.state).toBe('superseded');expect(terminal.superseded_by_decision_id).toBe(replacement);
    expect((await read('/api/decisions/'+replacement)).content.supersedesId).toBe(id);
    await refuse('/api/decisions/'+id+'/accept',{expectedRevisionId:terminal.revision_id},'IMMUTABLE_DECISION');
    await refuse('/api/decisions',{...draft,pageId:terminal.page_id,id,expectedRevisionId:terminal.revision_id,outcome:'Rewritten'},'IMMUTABLE_DECISION');
    await refuse('/api/decisions/'+id+'/review',{expectedRevisionId:terminal.revision_id,note:'Reopen',nextReviewAt:null},'IMMUTABLE_DECISION');
    await refuse('/api/decisions/'+id+'/propose-successor',{},'DECISION_OWNER_REQUIRED');
    await refuse('/api/decisions/'+probe.value.id+'/accept',{expectedRevisionId:probe.value.revisionId,supersedesId:id},'SUPERSESSION_AUTHORITY');
  }
  const beforeReplay=await snapshot();
  for(const {path,input,as,result} of writes){const replay=await send(path,input,as);expect(replay.status,await replay.clone().text()).toBe(200);expect(await replay.json()).toEqual(result);}
  expect(await snapshot()).toEqual(beforeReplay);
  const audit=(await read('/api/activity?kind=decision&limit=100')).items;
  expect(audit).toHaveLength(writes.length+2);
  for(const {path,result,as} of writes){
    const actor=as===cookie?memberId:editor.memberId, receipt=result.receipt;
    const history=(await read('/api/decisions/'+result.value.id+'/history')).items;
    const revision=history.find((row:any)=>row.id===receipt.revisionId);
    expect(revision).toMatchObject({entity_kind:path.endsWith('/accept')?'decision-acceptance':path.endsWith('/review')?'decision-review':'decision',actor_id:actor,created_at:receipt.committedAt});
    expect(audit.filter((row:any)=>row.id===receipt.activityId)).toEqual([expect.objectContaining({actor:expect.objectContaining({id:actor}),occurredAt:receipt.committedAt,operationKey:receipt.operationKey,target:{kind:'decision',id:result.value.id}})]);
  }
  for(const id of [firstId,secondId]){
    const history=(await read('/api/decisions/'+id+'/history')).items, supersession=history.filter((row:any)=>row.entity_kind==='decision-supersession');
    expect(supersession).toHaveLength(1);
    const entries=audit.filter((row:any)=>row.target.id===id&&row.action==='decisions.supersede');
    expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({actor:expect.objectContaining({id:supersession[0].actor_id}),occurredAt:supersession[0].created_at});
  }
  await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE member_id=?').bind(new Date().toISOString(),memberId).run();
  const revokedSnapshot=await snapshot(), prepared=writes.find(write=>write.path.endsWith('/propose-successor'))!;
  const revokedReplay=await send(prepared.path,prepared.input);
  expect(revokedReplay.status).toBe(401);
  expect((await send('/api/decisions/'+secondId)).status).toBe(401);
  expect(await snapshot()).toEqual(revokedSnapshot);
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
