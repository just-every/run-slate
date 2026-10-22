import {beforeEach,expect,it,vi} from 'vitest';
import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../setup/fixtures';
import {resetDatabase} from '../setup/reset-database';

const resetCase=async()=>{vi.restoreAllMocks();await resetDatabase(env.DB);};
beforeEach(resetCase);
it('PAGE-015 — staged import classifies a racing lock without masking an intervening edit',async()=>{
 for(const [index,interveningEdit] of [false,true].entries()){
  if(index>0)await resetCase();
 const {workspaceId}=await seedWorkspace();
 const owner=await seedMember(workspaceId,{email:'lock@import.test',displayName:'Import owner',role:'owner',isSetupOwner:true});
 const {containerId}=await seedContainer(workspaceId,{visibility:'private',ownerMemberId:owner.memberId});
 await seedContainerGrant(containerId,{principalKind:'member',principalId:owner.memberId,level:'full'});
 const cookie=await sessionFor(owner.memberId),app=createApi(),nativeEnv={...env,SLATE_PROFILE:undefined};
 const request=(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>app.request('https://slate.example/api'+path,{method,headers:{Cookie:cookie,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},nativeEnv);
 const ok=async(path:string,body?:unknown,method?:string)=>{const response=await request(path,body,method),data=await response.json<any>();expect(response.status,JSON.stringify(data)).toBe(200);return data;};
 const created=await ok('/pages',{operationKey:crypto.randomUUID(),containerId,title:'Import destination'}),pageId=created.value.pageId;
 const initial=await ok('/pages/'+pageId);
 const bytes=await (await (env as typeof env & {TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch('https://fixtures/notion-workspace-export.zip')).arrayBuffer();
 const form=new FormData();form.set('file',new File([bytes],'notion.zip'));form.set('format','notion-workspace');form.set('operationKey',crypto.randomUUID());form.set('destinationPageId',pageId);form.set('expectedRevisionId',initial.page.revisionId);form.set('mode','children');
 const uploaded=await ok('/imports',form),path='/imports/'+uploaded.id;
 const preview=await ok(path+'/preview',{});
 await ok(path+'/apply',{fingerprint:preview.report.fingerprint});
 const stored=await env.DB.prepare('SELECT plan_key FROM federation_imports WHERE id=?').bind(uploaded.id).first<{plan_key:string}>();
 const review=await (await env.FILES.get(stored!.plan_key))!.json<{sourceKey:string;mediaSources:unknown[]}>();
 // Finish media admission so the next R2 read occurs after the real lock check
 // and before the first serialized Kit preparation assertion.
 let progress=await ok(path);
 while((progress.progress.checkpoint??0)<review.mediaSources.length)progress=await ok(path+'/resume',{});
 const get=env.FILES.get.bind(env.FILES);let raced=false;
 const spy=vi.spyOn(env.FILES,'get').mockImplementation((async(...args:Parameters<R2Bucket['get']>)=>{
  const result=await get(...args);
  if(args[0]===review.sourceKey&&!raced){
   raced=true;
   if(interveningEdit)await ok('/pages/'+pageId,{operationKey:crypto.randomUUID(),expectedRevisionId:initial.page.revisionId,properties:{title:'Changed before lock'}},'PATCH');
   const current=await ok('/pages/'+pageId);
   await ok('/pages/'+pageId+'/lock',{operationKey:crypto.randomUUID(),expectedRevisionId:current.page.revisionId});
  }
  return result;
 }) as R2Bucket['get']);
 const response=await request(path+'/resume',{});spy.mockRestore();
 expect(raced).toBe(true);
 const failure=await response.json<any>();
 if(interveningEdit){expect(response.status).toBe(500);expect(failure.code).not.toBe('PAGE_LOCKED');}
 else {expect(response.status,JSON.stringify(failure)).toBe(409);expect(failure.code).toBe('PAGE_LOCKED');}
 const after=await ok('/pages/'+pageId);
 expect(after.lock).not.toBeNull();
 expect((await env.DB.prepare('SELECT count(*) n FROM pages WHERE parent_page_id=? AND deleted_at IS NULL').bind(pageId).first<number>('n'))).toBe(0);
 }
},60_000);
