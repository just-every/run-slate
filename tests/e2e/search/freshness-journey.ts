import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {sessionFor} from '../setup/fixtures';
import type {searchFixture} from './route-fixture';

/** Committed changes and erasure are observed through the same HTTP search door. */
export async function freshnessJourney(f:Awaited<ReturnType<typeof searchFixture>>) {
 const app=createApi(),cookie=await sessionFor('owner',{freshProof:true}),origin=new URL(String(env.APP_URL)).origin;
 const request=async(method:string,path:string,body?:unknown)=>{
  const response=await app.request(origin+'/api'+path,{method,headers:{cookie,origin,...(body instanceof FormData?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},{...env,SLATE_PROFILE:undefined});
  const data=await response.json<any>();
  expect(response.status,method+' '+path+' '+JSON.stringify(data)).toBe(200);
  return data;
 };
 const revision=async(id:string)=>(await request('GET','/pages/'+id)).page.revisionId;
 const ids=async(query:string,actor='reader',filters:Record<string,string>={})=>{
  const result=await f.find(query,actor,filters);expect(result.status).toBe(200);
  return result.data.items.map((item:{id:string})=>item.id);
 };
 const observed=async(mutate:()=>Promise<unknown>,check:()=>Promise<void>,deadline=5000)=>{
  await mutate();const start=performance.now();await check();expect(performance.now()-start).toBeLessThan(deadline);
 };
 const created=await request('POST','/pages',{operationKey:crypto.randomUUID(),containerId:'c',title:'Freshness initial guide'});
 const id:string=created.value.pageId,createdAt=performance.now();
 expect(await ids('Freshness initial guide')).toEqual([id]);expect(performance.now()-createdAt).toBeLessThan(5000);
 await observed(async()=>request('PATCH','/pages/'+id,{operationKey:crypto.randomUUID(),expectedRevisionId:await revision(id),properties:{title:'Freshness revised guide'}}),async()=>{
  expect(await ids('Freshness initial guide')).toEqual([]);expect(await ids('Freshness revised guide')).toEqual([id]);
 });
 const destination=(await request('POST','/containers',{operationKey:crypto.randomUUID(),name:'Freshness destination',visibility:'default'})).value.id;
 await observed(async()=>{
  const placement={containerId:destination,treePosition:'a'};
  const preview=await request('POST','/pages/'+id+'/move-preview',placement);
  await request('POST','/pages/'+id+'/move',{...placement,operationKey:crypto.randomUUID(),expectedRevisionId:await revision(id),accessPreviewHash:preview.accessPreviewHash});
 },async()=>{
  expect(await ids('Freshness revised guide','owner',{containerId:'c'})).toEqual([]);
  expect(await ids('Freshness revised guide','owner',{containerId:destination})).toEqual([id]);
 });
 for(const action of ['archive','restore','trash','restore'] as const)await observed(async()=>{
  const expectedRevisionId=action==='restore'?(await request('GET','/archive')).items.find((item:{id:string})=>item.id===id).revisionId:await revision(id);
  await request('POST','/archive/'+id,{operationKey:crypto.randomUUID(),expectedRevisionId,action});
 },async()=>{
  expect(await ids('Freshness revised guide','owner')).toEqual(action==='restore'?[id]:[]);
  expect(await ids('Freshness revised guide','owner',{includeArchived:'true',includeTrashed:'true'})).toEqual([id]);
 });
 // A draft must become readable to the searching member only after publication.
 const workspace=await request('GET','/workspace');
 const configure=async(policies:Record<string,string>)=>{
  const current=await request('GET','/workspace');
  await request('PUT','/workspace',{operationKey:crypto.randomUUID(),expectedRevisionId:current.revisionId,name:current.name,mark:current.mark,description:current.description,guestAccess:current.guestAccess,publicLinkAccess:current.publicLinkAccess,anonymousAccess:current.anonymousAccess,policies});
 };
 await configure({...workspace.policies,'page.lifecycle.v1':'draft-then-publish'});
 const draft=(await request('POST','/pages',{operationKey:crypto.randomUUID(),containerId:'c',title:'Freshness publication guide'})).value.pageId;
 expect(await ids('Freshness publication guide')).toEqual([]);
 await observed(async()=>request('POST','/pages/'+draft+'/publish',{operationKey:crypto.randomUUID(),expectedRevisionId:await revision(draft)}),async()=>{
  expect(await ids('Freshness publication guide')).toEqual([draft]);
 });
 await configure(workspace.policies);
 // An already indexed retained record must stop matching after confirmed erasure.
 await request('POST','/archive/'+id,{operationKey:crypto.randomUUID(),expectedRevisionId:await revision(id),action:'trash'});
 const erase={operationKey:crypto.randomUUID(),confirmedPageIds:[id]};
 await observed(async()=>request('POST','/archive/'+id+'/permanent-delete',erase),async()=>{
  expect(await ids('Freshness revised guide','owner',{includeArchived:'true',includeTrashed:'true'})).toEqual([]);
 });
 await request('POST','/archive/'+id+'/permanent-delete',erase);
 expect(await ids('Freshness revised guide','owner',{includeArchived:'true',includeTrashed:'true'})).toEqual([]);
 // Replay of a completed import may never bring its erased source back.
 const form=new FormData();form.set('file',new File(['Freshness imported body'], 'Freshness import.txt',{type:'text/plain'}));form.set('format','text');form.set('operationKey',crypto.randomUUID());
 const imported=await request('POST','/imports',form);
 const complete=await request('POST','/imports/'+imported.id+'/run',{});expect(complete.state).toBe('completed');
 const mapped=(await f.db.prepare("SELECT target_id FROM federation_import_mappings WHERE import_job_id=? AND target_kind='page'").bind(imported.id).all<{target_id:string}>()).results;
 expect(mapped.length).toBeGreaterThan(0);
 for(const row of mapped){
  expect(await f.db.prepare('SELECT 1 FROM search_text WHERE page_id=?').bind(row.target_id).first()).not.toBeNull();
  expect(await f.db.prepare("SELECT 1 FROM search_dirty WHERE key IN ('page:'||?,'record:'||?)").bind(row.target_id,row.target_id).first()).toBeNull();
 }
 expect(await ids('Freshness imported body','owner')).toEqual(mapped.map(row=>row.target_id));
 await request('POST','/archive/'+mapped[0]!.target_id,{operationKey:crypto.randomUUID(),expectedRevisionId:await revision(mapped[0]!.target_id),action:'trash'});
 await request('POST','/archive/'+mapped[0]!.target_id+'/permanent-delete',{operationKey:crypto.randomUUID(),confirmedPageIds:[mapped[0]!.target_id]});
 const replay=await app.request(origin+'/api/imports/'+imported.id+'/run',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:'{}'},{...env,SLATE_PROFILE:undefined});
 expect(replay.status).toBe(409);
 expect(await ids('Freshness imported body','owner',{includeArchived:'true',includeTrashed:'true'})).toEqual([]);
}


/** A reader's entire authorized corpus, not just records matching a sentinel. */
export async function defaultVisibilityJourney(f:Awaited<ReturnType<typeof searchFixture>>) {
 const app=createApi(),origin=new URL(String(env.APP_URL)).origin;
 const request=async(method:string,path:string,body?:unknown,actor='owner')=>{
  const response=await app.request(origin+'/api'+path,{method,headers:{cookie:f.cookies[actor]!,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},{...env,SLATE_PROFILE:undefined});
  return {status:response.status,data:await response.json<any>()};
 };
 const mutate=async(path:string,body:Record<string,unknown>)=>{
  const result=await request('POST',path,{operationKey:crypto.randomUUID(),...body});
  expect(result.status,path+' '+JSON.stringify(result.data)).toBeGreaterThanOrEqual(200);
  expect(result.status,path+' '+JSON.stringify(result.data)).toBeLessThan(300);
  return result.data;
 };
 const space=(await mutate('/containers',{name:'Visibility collection',visibility:'closed'})).value;
 const grant=await mutate('/sharing',{targetKind:'container',targetId:space.id,principalKind:'member',principalId:'corpus-guest',level:'view'});
 const create=async(title:string,statusKey:string|null=null)=>{
  const body='Retained '+title+' instructions.';
  const value=(await mutate('/pages',{containerId:space.id,title,properties:{statusKey},blocks:[{id:crypto.randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text:body}]}}]})).value;
  return {id:value.pageId as string,revision:value.revisionId as string,title,body};
 };
 for(const key of ['visibility-review','visibility-approved'])await mutate('/status',{key,label:key,color:'#145a3d',requiresVerification:false});
 const live=await create('Current procedure','visibility-review');
 const approved=await create('Accepted handbook','visibility-approved');
 const workspace=(await request('GET','/workspace')).data;
 const configure=async(policies:Record<string,string>)=>{
  const current=(await request('GET','/workspace')).data;
  const result=await request('PUT','/workspace',{operationKey:crypto.randomUUID(),expectedRevisionId:current.revisionId,name:current.name,mark:current.mark,description:current.description,guestAccess:current.guestAccess,publicLinkAccess:current.publicLinkAccess,anonymousAccess:current.anonymousAccess,policies});
  expect(result.status).toBe(200);
 };
 await configure({...workspace.policies,'page.lifecycle.v1':'draft-then-publish'});
 const draft=await create('Readable private draft');
 const hiddenDraft=await create('Unshared private draft');
 await configure(workspace.policies);
 await mutate('/sharing',{targetKind:'page',targetId:draft.id,principalKind:'member',principalId:'corpus-guest',level:'view'});
 const archived=await create('Archived instructions','visibility-approved');
 const trashed=await create('Trashed instructions','visibility-review');
 const both=await create('Archived then trashed instructions');
 const thread=(await mutate('/comments/page/'+live.id,{body:[{text:'A retained discussion with its own search result.'}]})).value;
 const template=(await mutate('/templates',{sourcePageId:approved.id,includeChildren:false,containerId:space.id,title:'Reusable incident template',description:'Reusable response structure.',category:'Operations'})).value;
 // Every reference is stored while its target is live, before default exclusion.
 const host=(await mutate('/pages',{containerId:space.id,title:'Retained reference index',blocks:[{id:crypto.randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[archived,trashed,both].flatMap(target=>[
  {text:'Open '+target.id,link:{href:'/app/pages/'+target.id}},
  {text:target.title,mention:{kind:'page',id:target.id,label:target.title}},
  {text:'Cite '+target.id,link:{href:'/app/pages/'+target.id+'?detail=history&revision='+target.revision}},
 ])}}]})).value.pageId as string;
 await mutate('/sharing',{targetKind:'page',targetId:host,principalKind:'member',principalId:'corpus-guest',level:'view'});
 for(const [target,actions] of [[archived,['archive']],[trashed,['trash']],[both,['archive','trash']]] as const)
  for(const action of actions)await mutate('/archive/'+target.id,{expectedRevisionId:target.revision,action});
 const base=[space.id,space.homePageId,live.id,approved.id,draft.id,thread.threadId,template.id,host];
 expect(base.every(id=>typeof id==='string')).toBe(true);
 const corpus=async(includeArchived:boolean,includeTrashed:boolean,allowed=true)=>{
  // No query, kind, container, contributor, status or date restriction is supplied.
  const result=await f.find('','corpus-guest',{includeArchived:String(includeArchived),includeTrashed:String(includeTrashed),limit:'100'});
  expect(result.status).toBe(200);
  const expected=allowed?[...base,...includeArchived?[archived.id]:[],...includeTrashed?[trashed.id]:[],...includeArchived&&includeTrashed?[both.id]:[]]:[draft.id,host];
  expect(result.data.items.map((item:any)=>item.id).sort()).toEqual(expected.sort());
  expect(result.data.total).toBe(expected.length);
  expect(result.data.nextCursor).toBeUndefined();
  expect(result.data.items.map((item:any)=>item.id)).not.toContain(hiddenDraft.id);
  return result.data;
 };
 // Independently compare neither, either and both against the known complete corpus.
 const unfiltered=await f.find('','corpus-guest',{limit:'100'});
 expect(unfiltered.status).toBe(200);
 expect(unfiltered.data.items.map((item:any)=>item.id).sort()).toEqual([...base].sort());
 expect(unfiltered.data.total).toBe(base.length);
 for(const archive of [false,true])for(const trash of [false,true])await corpus(archive,trash);
 const hostBefore=await request('GET','/pages/'+host,undefined,'corpus-guest');
 expect(hostBefore.status).toBe(200);
 for(const target of [archived,trashed,both]){
  expect(hostBefore.data.mentions[target.id]).toMatchObject({label:target.title,state:target===archived?'archived':'trashed',available:target===archived});
  // Following a retained link or citation must use current access, without restoration.
  for(const path of ['/pages/'+target.id,'/pages/'+target.id+'/link-card','/pages/'+target.id+'/link-card?revision='+target.revision,'/revisions/'+target.id+'/'+target.revision]){
   const result=await request('GET',path,undefined,'corpus-guest');
   expect(result.status,path).toBe(target===archived?200:404);
   if(result.status===200)expect(JSON.stringify(result.data)).toContain(target.title);
   else expect(JSON.stringify(result.data)).not.toContain(target.body);
  }
 }
 expect((await request('GET','/pages/'+archived.id,undefined,'corpus-guest')).data.permissions.canEdit).toBe(false);
 // Reloading the host leaves its retained references and target grants unchanged.
 expect((await request('GET','/pages/'+host,undefined,'corpus-guest')).data.blocks).toEqual(hostBefore.data.blocks);
 const retained=(await f.db.prepare('SELECT id,revoked_at FROM page_grants WHERE page_id IN (?,?,?) ORDER BY id').bind(archived.id,trashed.id,both.id).all()).results;
 await mutate('/sharing',{id:grant.value.id,targetKind:'container',targetId:space.id,principalKind:'member',principalId:'corpus-guest',level:'view',revoke:true});
 // The separately granted draft remains readable: revocation is not blanket denial.
 for(const archive of [false,true])for(const trash of [false,true])await corpus(archive,trash,false);
 for(const target of [archived,trashed,both])for(const path of ['/pages/'+target.id,'/pages/'+target.id+'/link-card','/pages/'+target.id+'/link-card?revision='+target.revision,'/revisions/'+target.id+'/'+target.revision]){
  const result=await request('GET',path,undefined,'corpus-guest');
  expect(result.status,path).toBe(404);
  expect(JSON.stringify(result.data)).not.toContain(target.title);
  expect(JSON.stringify(result.data)).not.toContain(target.body);
 }
 const deniedHost=await request('GET','/pages/'+host,undefined,'corpus-guest');
 expect(deniedHost.status).toBe(200);
 for(const target of [archived,trashed,both]){
  expect(deniedHost.data.mentions[target.id]).toEqual({label:'Restricted page',available:false,state:'restricted'});
  expect(JSON.stringify(deniedHost.data.blocks)).not.toContain(target.title);
 }
 expect((await f.db.prepare('SELECT id,revoked_at FROM page_grants WHERE page_id IN (?,?,?) ORDER BY id').bind(archived.id,trashed.id,both.id).all()).results).toEqual(retained);
}
