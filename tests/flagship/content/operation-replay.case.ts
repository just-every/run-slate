import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import {auditFixture,nativeReplayInventory,holdOperationRead} from '../../qualification/core/audit-support';
import {createUlid} from '../../../src/core/shared/ulid';

/** Native cookie sessions and independent canonical inventories; no successful response is faked. */
export async function operationReplayCase() {
 const start=Date.parse('2031-01-15T12:00:00.000Z');
 vi.useFakeTimers({toFake:['Date'],now:start});
 try {
  const f=await auditFixture(),writer=f.readerId;
  const origin=new URL(String(env.APP_URL)).origin;
  const request=async(method:string,path:string,input?:unknown,actor=writer,db=env.DB)=>{
   const response=await f.api.request(origin+path,{method,headers:{cookie:f.cookies[actor]!,origin,'content-type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)},{...env,DB:db});
   const body=await response.text();
   return {status:response.status,data:JSON.parse(body),body};
  };
  await f.profile({'page.lifecycle.v1':'always-live'});
  const ok=async(method:string,path:string,input?:unknown,actor=writer)=>{
   const result=await request(method,path,input,actor);
   expect(result.status,JSON.stringify({method,path,...result})).toBe(200);
   return result;
  };
  const grantInput={targetKind:'container',targetId:f.containerId,principalKind:'member',principalId:writer,level:'full'};
  const authority=await ok('POST','/api/sharing',{operationKey:createUlid(),...grantInput},f.ownerId);
  await ok('PUT','/api/navigation/container-watches',{operationKey:createUlid(),containerId:f.containerId,enabled:true},f.ownerId);
  const initial=await nativeReplayInventory(f.workspaceId);
  const records:{family:string;method:string;path:string;input:any;changed:any;response:any;createdAt:number}[]=[];
  let pageId='';
  const blockId=createUlid();
  const snapshot=async()=>({
   canonical:await nativeReplayInventory(f.workspaceId),
   document:pageId?(await ok('GET',`/api/pages/${pageId}`,undefined,f.ownerId)).data:null,
   comments:pageId?(await ok('GET',`/api/comments/page/${pageId}`,undefined,f.ownerId)).data:null,
   grants:pageId?(await ok('GET',`/api/sharing/pages/${pageId}`,undefined,f.ownerId)).data:null,
   inbox:(await ok('GET','/api/notifications?limit=100',undefined,f.ownerId)).data,
   activity:(await ok('GET','/api/activity?limit=100',undefined,f.ownerId)).data,
  });
  const commit=async(family:string,method:string,path:string,body:any,changed:any)=>{
   // Separate editing sessions make each title and body notification independently observable.
   vi.setSystemTime(start+records.length*6*60*1000);
   const input={operationKey:createUlid(),...body},before=await nativeReplayInventory(f.workspaceId);
   const responses=await Promise.all([ok(method,path,input),ok(method,path,input)]);
   const response=responses[0];
   expect(responses[1],`${family}: identical concurrent HTTP responses`).toEqual(response);
   expect(response.data.receipt).toMatchObject({operationKey:input.operationKey,committedAt:new Date().toISOString()});
   if(family==='page creation')pageId=response.data.value.pageId;
   const after=await nativeReplayInventory(f.workspaceId);
   expect(after.receipts.length-before.receipts.length,`${family}: one receipt`).toBe(1);
   expect(after.activity.length-before.activity.length,`${family}: one activity`).toBe(1);
   const stored=after.receipts.find((row:any)=>row.operation_key===input.operationKey)!;
   expect(JSON.parse(String(stored.response_json)),`${family}: exact stored response`).toEqual(response.data);
   expect(stored.response_json,`${family}: exact HTTP response bytes`).toBe(response.body);
   expect(Date.parse(String(stored.expires_at))-Date.parse(String(stored.created_at))).toBe(24*60*60*1000);
   const activity=after.activity.filter((row:any)=>row.operation_key===input.operationKey);
   expect(activity).toHaveLength(1);
   expect(activity[0]).toMatchObject({id:response.data.receipt.activityId,actor_member_id:writer,occurred_at:response.data.receipt.committedAt});
   const delivered=after.notifications.filter(row=>!before.notifications.some(old=>old.id===row.id));
   expect(delivered,`${family}: exactly one delivery to the real watcher`).toHaveLength(1);
   expect(delivered[0]).toMatchObject({recipient_member_id:f.ownerId});
   expect(after.outbox.length-before.outbox.length,`${family}: one notification origin`).toBe(1);
   expect(after.pageRevisions.length-before.pageRevisions.length,`${family}: page revision inventory`).toBe(['page creation','title changes','body changes'].includes(family)?1:0);
   expect(after.recordRevisions.length-before.recordRevisions.length,`${family}: comment revision inventory`).toBe(family==='comment creation'?1:0);
   expect(after.identityRevisions.length-before.identityRevisions.length,`${family}: grant revision inventory`).toBe(family==='page grants'?1:0);
   const retained=await snapshot();
   expect(await ok(method,path,input),`${family}: immediate exact replay`).toEqual(response);
   expect(await snapshot(),`${family}: immediate replay changes nothing`).toEqual(retained);
   const conflict=await request(method,path,{...input,...changed},writer);
   expect(conflict.status,JSON.stringify(conflict.data)).toBe(409);
   expect(conflict.data.code).toBe('OPERATION_KEY_CONFLICT');
   expect(await snapshot(),`${family}: changed body changes nothing`).toEqual(retained);
   records.push({family,method,path,input,changed,response,createdAt:Date.now()});
   return response.data;
  };
  const created=await commit('page creation','POST','/api/pages',{
   containerId:f.containerId,title:'synthetic-slate-original',
   blocks:[{id:blockId,blockType:'paragraph',treePosition:'1',content:{text:[{text:'synthetic-slate-original-body'}]}}],
  },{title:'synthetic-slate-conflicting-create'});
  await commit('title changes','PATCH',`/api/pages/${pageId}`,{
   expectedRevisionId:created.value.revisionId,properties:{title:'synthetic-slate-renamed'},
  },{properties:{title:'synthetic-slate-conflicting-title'}});
  const document=(await ok('GET',`/api/pages/${pageId}`)).data;
  await commit('body changes','PATCH',`/api/pages/${pageId}/blocks/${blockId}`,{
   expectedRevisionId:document.blocks[0].revisionId,content:{text:[{text:'synthetic-slate-edited-body'}]},
  },{content:{text:[{text:'synthetic-slate-conflicting-body'}]}});
  await commit('comment creation','POST',`/api/comments/page/${pageId}`,{
   body:[{text:'synthetic-slate-comment'}],
  },{body:[{text:'synthetic-slate-conflicting-comment'}]});
  const granted=await commit('page grants','POST','/api/sharing',{
   targetKind:'page',targetId:pageId,principalKind:'member',principalId:f.ownerId,level:'view',
  },{level:'comment'});
  const inventory=await nativeReplayInventory(f.workspaceId);
  expect(inventory.pages.length-initial.pages.length).toBe(1);expect(inventory.blocks.length-initial.blocks.length).toBe(1);
  expect(inventory.pageRevisions.length-initial.pageRevisions.length).toBe(3);expect(inventory.comments.length-initial.comments.length).toBe(1);
  expect(inventory.threads.length-initial.threads.length).toBe(1);expect(inventory.grants.length-initial.grants.length).toBe(1);
  expect(inventory.grants.find(row=>row.id===granted.value.id)).toMatchObject({id:granted.value.id,principal_kind:'member',principal_id:f.ownerId,level:'view'});
  expect(JSON.parse(String(inventory.comments.find(row=>row.author_member_id===writer)!.body_json))).toEqual([{text:'synthetic-slate-comment'}]);
  expect(inventory.pages.find(row=>row.id===pageId)).toMatchObject({id:pageId,title:'synthetic-slate-renamed'});
  expect(JSON.parse(String(inventory.blocks.find(row=>row.id===blockId)!.content_json))).toEqual({text:[{text:'synthetic-slate-edited-body'}]});
  const canonical=await nativeReplayInventory(f.workspaceId);
  // Later writes changed the page. Older responses must still be the exact originals.
  for(const record of records){
   expect(await ok(record.method,record.path,record.input),`${record.family}: replay after later writes`).toEqual(record.response);
   expect(await nativeReplayInventory(f.workspaceId)).toEqual(canonical);
  }
  // A retry may observe no receipt, then resume preparation after the first write commits.
  // Delay only the actual D1 read delivery; both requests still use native sessions and writes.
  for(const scenario of ['identical','changed body','lost authority'] as const){
   vi.setSystemTime(start+(records.length+1)*6*60*1000);
   const current=(await ok('GET',`/api/pages/${pageId}`)).data;
   const overlapInput={operationKey:createUlid(),expectedRevisionId:current.blocks[0].revisionId,content:{text:[{text:`synthetic-slate-overlap-${scenario}`}]}};
   const retryInput=scenario==='changed body'?{...overlapInput,content:{text:[{text:'synthetic-slate-conflicting-overlap'}]}}:overlapInput;
   const gate=holdOperationRead(env.DB,overlapInput.operationKey,scenario==='identical'?undefined:pageId);
   const pending=request('PATCH',`/api/pages/${pageId}/blocks/${blockId}`,retryInput,writer,gate.db);
   let winner:any,retained:any,resumed:any;
   const before=await nativeReplayInventory(f.workspaceId);
   try {
    await gate.reached;
    winner=await ok('PATCH',`/api/pages/${pageId}/blocks/${blockId}`,overlapInput);
    const committed=await nativeReplayInventory(f.workspaceId);
    expect(committed.pageRevisions.length-before.pageRevisions.length).toBe(1);
    expect(committed.receipts.length-before.receipts.length).toBe(1);
    expect(committed.activity.length-before.activity.length).toBe(1);
    if(scenario==='lost authority')await ok('POST','/api/sharing',{operationKey:createUlid(),...grantInput,id:authority.data.value.id,level:'view'},f.ownerId);
    retained=await snapshot();
   } finally {gate.release();resumed=await pending;}
   if(scenario==='identical')expect(resumed,'overlapping retry after the first commit returns the original response').toEqual(winner);
   else expect(resumed).toMatchObject({status:scenario==='changed body'?409:404,data:{code:scenario==='changed body'?'OPERATION_KEY_CONFLICT':'NOT_FOUND'}});
   expect(await snapshot(),`${scenario}: overlapping retry changes nothing`).toEqual(retained);
   if(scenario==='lost authority')await ok('POST','/api/sharing',{operationKey:createUlid(),...grantInput,id:authority.data.value.id},f.ownerId);
   console.info(`PROBE SAVE-005 overlapping ${scenario}: native HTTP retry resumes after a competing commit -> ${resumed.status}; exact committed inventories unchanged`);
  }
  for(const record of records){
   vi.setSystemTime(record.createdAt+24*60*60*1000-1);
   const retained=await snapshot();
   expect(await ok(record.method,record.path,record.input),`${record.family}: last millisecond of original window`).toEqual(record.response);
   expect((await request(record.method,record.path,{...record.input,...record.changed},writer)).status).toBe(409);
   expect(await snapshot(),`${record.family}: original expiry and inventories unchanged`).toEqual(retained);
   console.info(`PROBE SAVE-005 ${record.family}: native cookie HTTP, two concurrent requests, immediate and original-expiry-minus-1ms replay -> exact first response; changed body 409; populated canonical, revision, inbox and activity inventories unchanged`);
  }
  // The last replay must not extend the original window.
  const last=records.at(-1)!;
  vi.setSystemTime(last.createdAt+24*60*60*1000);
  const expired=await snapshot();
  expect((await request(last.method,last.path,last.input,writer)).status).toBe(409);
  expect(await snapshot()).toEqual(expired);
  // Current authorization precedes every stored response, including its sensitive body.
  await ok('POST','/api/sharing',{operationKey:createUlid(),...grantInput,id:authority.data.value.id,revoke:true},f.ownerId);
  const revoked=await nativeReplayInventory(f.workspaceId);
  for(const record of records){
   expect((await request(record.method,record.path,record.input,writer)).status).toBe(404);
   expect(await nativeReplayInventory(f.workspaceId)).toEqual(revoked);
  }
  const signout=await f.api.request(origin+'/api/auth/logout',{method:'POST',headers:{cookie:f.cookies[writer]!,origin}},env);
  expect(signout.status).toBe(204);
  for(const record of records)expect((await request(record.method,record.path,record.input,writer)).status).toBe(401);
  expect(await nativeReplayInventory(f.workspaceId)).toEqual(revoked);
  console.info('PROBE SAVE-005 authority: revoke native container grant then sign out -> every old mutation refuses 404 then 401, no canonical or notification changes');
 } finally {vi.useRealTimers();}
}
