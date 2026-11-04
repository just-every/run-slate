import {expect} from 'vitest';
import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import {createUlid} from '../../../src/core/shared/ulid';
import {seedWorkspace,seedMember,sessionFor} from '../../e2e/setup/fixtures';

/** Native member requests, independent page commits and canonical state after replay. */
export async function bulkPagesCase(){
 const {workspaceId}=await seedWorkspace();
 const owner=(await seedMember(workspaceId,{role:'owner',displayName:'Bulk owner',email:['synthetic-slate-1','test.invalid'].join('@')})).memberId;
 const member=(await seedMember(workspaceId,{role:'member',displayName:'Bulk member',email:['synthetic-slate-2','test.invalid'].join('@')})).memberId;
 const cookies=new Map(await Promise.all([owner,member].map(async id=>[id,await sessionFor(id,{freshProof:true})] as const)));
 const origin=new URL(String(env.APP_URL)).origin,app=createApi();
 const request=async(actor:string,method:string,path:string,input?:unknown)=>{
  const response=await app.request(origin+path,{method,headers:{cookie:cookies.get(actor)!,origin,'content-type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)},env);
  return {status:response.status,data:await response.json<any>()};
 };
 const ok=async(actor:string,method:string,path:string,input?:unknown)=>{const r=await request(actor,method,path,input);expect(r.status,JSON.stringify(r.data)).toBe(200);return r.data;};
 const post=(path:string,input:any)=>ok(owner,'POST',path,{operationKey:createUlid(),...input});
 const source=(await post('/api/containers',{name:'Bulk source',visibility:'private'})).value.id;
 const destination=(await post('/api/containers',{name:'Bulk destination',visibility:'private'})).value.id;
 let destinationGrant='';
 for(const [targetId,level] of [[source,'view'],[destination,'edit']]){const grant=await post('/api/sharing',{targetKind:'container',targetId,principalKind:'member',principalId:member,level});if(targetId===destination)destinationGrant=grant.value.id;}
 await post('/api/status',{key:'bulk-ready',label:'Bulk ready',color:'#228855',requiresVerification:false});
 const snapshot=async(id:string)=>({
  page:await env.DB.prepare('SELECT * FROM pages WHERE id=?').bind(id).first(),
  blocks:(await env.DB.prepare('SELECT * FROM page_blocks WHERE page_id=? ORDER BY id').bind(id).all()).results,
  revisions:(await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id').bind(id).all()).results,
  grants:(await env.DB.prepare('SELECT * FROM page_grants WHERE page_id=? ORDER BY id').bind(id).all()).results,
  activity:(await env.DB.prepare('SELECT * FROM activity_entries WHERE target_id=? ORDER BY id').bind(id).all()).results,
  receipts:(await env.DB.prepare('SELECT * FROM operation_receipts WHERE target_id=? ORDER BY id').bind(id).all()).results,
 });
 let erasedCapture:{input:any;id:string}|undefined;
 for(const action of ['archive','trash','move','owner','status']){
  const pages:any[]=[];
  for(const [index,level] of ['view','full','full'].entries()){
   const id=(await post('/api/pages',{containerId:source,title:`Bulk ${action} ${index}`,blocks:[{id:createUlid(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Retained handover body.'}]}}]})).value.pageId;
   if(level==='full'||action==='owner')await post('/api/sharing',{targetKind:'page',targetId:id,principalKind:'member',principalId:member,level:level==='view'?'edit':level});
   const read=await ok(member,'GET',`/api/pages/${id}`);
   pages.push({id,expectedRevisionId:read.page.revisionId});
  }
  const before=await Promise.all(pages.map(p=>snapshot(p.id))),hashes:Record<string,string>={};
  if(action==='move')for(const [index,p] of pages.entries()){
   const preview=await request(member,'POST',`/api/pages/${p.id}/move-preview`,{containerId:destination,parentPageId:null});
   if(index===0)expect(preview.status).toBe(404);
   else{expect(preview.status).toBe(200);hashes[p.id]=preview.data.accessPreviewHash;}
  }
  const input={operationKey:createUlid(),pages,action,ownerMemberId:member,statusKey:'bulk-ready',containerId:destination,accessPreviewHashes:hashes};
  if(action==='move'){
   const authority={id:destinationGrant,targetKind:'container',targetId:destination,principalKind:'member',principalId:member,level:'edit'};
   await post('/api/sharing',{...authority,revoke:true});
   expect((await ok(member,'POST','/api/pages/bulk',input)).items.every((p:any)=>!p.success)).toBe(true);
   expect(await Promise.all(pages.map(p=>snapshot(p.id)))).toEqual(before);
   await post('/api/sharing',authority);
  }
  const applied=await ok(member,'POST','/api/pages/bulk',input);
  expect(applied.items.map((p:any)=>[p.id,p.success])).toEqual(pages.map((p,index)=>[p.id,index!==0]));
  expect(await snapshot(pages[0].id)).toEqual(before[0]);
  for(const [index,p] of pages.entries()){
   if(!index)continue;
   const after=await snapshot(p.id),result=applied.items[index].result,receipt=result.receipt;
   expect(after.blocks).toEqual(before[index]!.blocks);
   expect(after.grants).toEqual(before[index]!.grants);
   for(const revision of before[index]!.revisions)expect(after.revisions.find((row:any)=>row.id===revision.id)).toEqual(revision);
   const stored=await env.DB.prepare('SELECT response_json FROM operation_receipts WHERE operation_key=? AND actor_member_id=?').bind(receipt.operationKey,member).first<{response_json:string}>();
   expect(JSON.parse(stored!.response_json)).toEqual(result);
   expect(receipt.operationKey).toBe(`${input.operationKey}:${p.id}`);
   const entries=(await ok(owner,'GET','/api/activity?limit=100')).items.filter((e:any)=>e.operationKey===receipt.operationKey);
   expect(entries).toEqual([expect.objectContaining({id:receipt.activityId,actor:expect.objectContaining({id:member}),target:{kind:'page',id:p.id},occurredAt:receipt.committedAt})]);
   expect(result.value.revisionId).toBe((after.page as any).revision_id);
   if(action==='archive')expect((after.page as any).archived_at).toBe(receipt.committedAt);
   if(action==='trash')expect((after.page as any).trashed_at).toBe(receipt.committedAt);
   if(action==='move')expect(after.page).toMatchObject({container_id:destination,parent_page_id:null});
   if(action==='owner')expect((await ok(member,'GET',`/api/pages/${p.id}`)).properties.ownerMemberId).toBe(member);
   if(action==='status')expect((await ok(member,'GET',`/api/pages/${p.id}`)).properties.statusKey).toBe('bulk-ready');
  }
  if(action==='trash')erasedCapture={input,id:pages[1].id};
  const committed=await Promise.all(pages.map(p=>snapshot(p.id)));
  expect(await ok(member,'POST','/api/pages/bulk',input)).toEqual(applied);
  expect(await Promise.all(pages.map(p=>snapshot(p.id)))).toEqual(committed);
  // Previously accepted captures cannot regain authority after the personal grant is revoked.
  if(action==='owner'||action==='status'){
   for(const p of pages.slice(1)){
    const grants=await ok(owner,'GET',`/api/sharing/pages/${p.id}`);
    for(const grant of grants.items.filter((g:any)=>g.principalId===member&&!g.revokedAt))await post('/api/sharing',{id:grant.id,targetKind:'page',targetId:p.id,principalKind:'member',principalId:member,level:grant.level,revoke:true});
   }
   const beforeReplay=await Promise.all(pages.map(p=>snapshot(p.id)));
   const replay=await ok(member,'POST','/api/pages/bulk',input);
   expect(replay.items.every((p:any)=>!p.success)).toBe(true);
   expect(await Promise.all(pages.map(p=>snapshot(p.id)))).toEqual(beforeReplay);
  }
 }
 const erased=erasedCapture!;
 await post(`/api/archive/${erased.id}/permanent-delete`,{confirmedPageIds:[erased.id]});
 const tombstone=await snapshot(erased.id);
 expect(tombstone.blocks).toEqual([]);
 expect((await request(member,'GET',`/api/pages/${erased.id}`)).status).toBe(404);
 const replay=await ok(member,'POST','/api/pages/bulk',erased.input);
 expect(replay.items.find((p:any)=>p.id===erased.id).success).toBe(false);
 expect(await snapshot(erased.id)).toEqual(tombstone);
 expect(await env.DB.prepare('SELECT page_id FROM content_tombstones WHERE page_id=?').bind(erased.id).first()).not.toBeNull();
}
