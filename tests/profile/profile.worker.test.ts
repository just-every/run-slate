import {bodyBlocksJourney} from './body-blocks-journey';
import {workItemsJourney} from './work-items-journey';
import {env} from 'cloudflare:test';
import {beforeEach, it, expect} from 'vitest';
import {createApi} from '../../src/core/app/hono';
import {consumeJobs} from '../../src/core/app/background';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../e2e/setup/fixtures';
import {resetDeployment} from '../e2e/setup/reset-deployment';

beforeEach(resetDeployment);

async function workspace() {
  const {workspaceId} = await seedWorkspace();
  const {memberId} = await seedMember(workspaceId, {role:'owner', displayName:'Profile Owner', email:crypto.randomUUID()+'@test.invalid'});
  const {containerId} = await seedContainer(workspaceId, {ownerMemberId:memberId, visibility:'open'});
  await seedContainerGrant(containerId, {principalKind:'member',principalId:memberId,level:'full'});
  return {containerId,memberId,workspaceId, cookie:await sessionFor(memberId)};
}
it('FLAG-001 — default API refuses flagship entry points after native authentication; explicit opt-in retains routes', async () => {
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
});
it('FLAG-001 — core wiki creates and revises genuine pages, searches them, and retains portability and publication endpoints', async () => {
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
  await workItemsJourney(api,containerId,memberId,workspaceId,cookie);
});
it('FLAG-001 — old queued flagship work records failure and retries without dispatch or acknowledgement', async () => {
  for(const kind of ['intelligence.run','intelligence.finalize','federation.refresh']) {
    const id=crypto.randomUUID();let acknowledged=false,retried=false;
    const message={id,body:{kind,runId:crypto.randomUUID()},attempts:1,timestamp:new Date(),ack(){acknowledged=true;},retry(){retried=true;}};
    await consumeJobs({messages:[message],queue:'profile-test',metadata:{metrics:{backlogCount:1,backlogBytes:0}},ackAll(){throw Error('unexpected batch ack');},retryAll(){throw Error('unexpected batch retry');}},env);
    expect(acknowledged).toBe(false);expect(retried).toBe(true);
    expect(await env.DB.prepare('SELECT state,error_code FROM core_job_failures WHERE id=?').bind(id).first()).toEqual({state:'failed',error_code:'FEATURE_DISABLED'});
  }
});
