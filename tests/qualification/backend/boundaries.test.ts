import { expect,test } from 'vitest';
import { fixture,env,createUlid } from './fixture';

test('NAV-004 local: concurrent first navigation configuration has one durable winner, preserves history and rejects stale repeat writes',async()=>{
  const f=await fixture();
  const choices=[[{id:'home',label:'Home',href:'/app',visible:true}],[{id:'search',label:'Find',href:'/app/search',visible:true}]];
  const requests=choices.map(destinations=>({operationKey:createUlid(),expectedRevisionId:null,destinations}));
  const results=await Promise.all(requests.map(input=>f.request('PUT','/api/navigation/configuration',input)));
  expect(results.map(result=>result.status).sort()).toEqual([200,409]);
  const index=results.findIndex(result=>result.status===200),winner=results[index]!;
  // The read is the winner's revision with its saved destinations first, in order;
  // destinations added to Slate since the save follow them.
  const read=(await f.request('GET','/api/navigation/configuration')).data;
  expect(read.revisionId).toBe(winner.data.value.revisionId);
  expect(read.destinations.filter((item:{id:string})=>winner.data.value.destinations.some((saved:{id:string})=>saved.id===item.id))).toEqual(winner.data.value.destinations);
  expect((await f.request('PUT','/api/navigation/configuration',requests[index])).data).toEqual(winner.data);
  expect((await f.request('PUT','/api/navigation/configuration',{...requests[index],operationKey:createUlid()})).status).toBe(409);
  const updated=await f.request('PUT','/api/navigation/configuration',{operationKey:createUlid(),expectedRevisionId:winner.data.value.revisionId,destinations:choices[1-index]});
  expect(updated.status).toBe(200);
  const revisions=(await env.DB.prepare("SELECT id,content_json FROM core_entity_revisions WHERE workspace_id=? AND entity_kind='navigation-configuration' ORDER BY CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER)").bind(f.workspaceId).all<{id:string;content_json:string}>()).results;
  expect(revisions.map(row=>JSON.parse(row.content_json).destinations)).toEqual([choices[index],choices[1-index]]);
  expect(revisions.map(row=>row.id)).toEqual([winner.data.value.revisionId,updated.data.value.revisionId]);
});

test('SHARE-003/007 local: native restriction closes inherited descendant editor sessions before success and restores access without grant copying',async()=>{
  const f=await fixture(),parent=await f.page('Restriction root'),child=await f.page('Inherited descendant',parent.id);
  for(const [principalId,level] of [[f.ownerId,'full'],[f.readerId,'edit']] as const)expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:parent.id,principalKind:'member',principalId,level})).status).toBe(200);
  const rooms=(env as unknown as {CONTENT_COLLABORATION:DurableObjectNamespace}).CONTENT_COLLABORATION;
  const response=await rooms.get(rooms.idFromName(child.id)).fetch(`https://local.test/socket?pageId=${child.id}`,{headers:{Upgrade:'websocket',cookie:f.cookies[f.readerId]!}});
  expect(response.status).toBe(101);const socket=response.webSocket!;socket.accept();
  const closed=new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Inherited editor remained open after restriction')),4500);socket.addEventListener('close',event=>{clearTimeout(timer);resolve(event.code);});});
  try {
    // Restrict child, where reader has no direct grant. Owner retains a deliberate direct grant.
    expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:child.id,principalKind:'member',principalId:f.ownerId,level:'full'})).status).toBe(200);
    const restricted=await f.request('PUT',`/api/sharing/pages/${child.id}/inheritance`,{operationKey:createUlid(),expectedRevisionId:child.revisionId,restricted:true});
    expect(restricted.status).toBe(200);expect(await closed).toBe(1008);
    expect((await f.request('GET','/api/pages',undefined,f.readerId)).data.items.some((page:any)=>page.id===child.id)).toBe(false);
    expect((await f.request('GET',`/api/pages/${child.id}`,undefined,f.readerId)).status).toBe(404);
    expect((await f.request('PUT',`/api/sharing/pages/${child.id}/inheritance`,{operationKey:createUlid(),expectedRevisionId:restricted.data.value.revisionId,restricted:false})).status).toBe(200);
    expect((await f.request('GET',`/api/pages/${child.id}`,undefined,f.readerId)).status).toBe(200);
    expect((await env.DB.prepare('SELECT principal_id FROM page_grants WHERE page_id=?').bind(child.id).all<{principal_id:string}>()).results).toEqual([{principal_id:f.ownerId}]);
  } finally {socket.close();}
});

test('PAGE-006/BLOCK-008 local: authorized original file references retain type-aware downloads and never give target readers source-file authority',async()=>{
  const f=await fixture(),source=await f.page('Original attachment'),target=await f.page('Reference');
  const form=new FormData();form.set('operationKey',createUlid());form.set('pageId',source.id);form.set('file',new File(['Downloadable plain text'],'notes.txt',{type:'text/plain'}));
  const upload=await f.api.request('http://localhost:8787/api/media',{method:'POST',headers:{cookie:f.cookies[f.ownerId]},body:form},env);
  expect(upload.status).toBe(200);const file=(await upload.json<any>()).value;
  expect((await f.request('PATCH',`/api/pages/${target.id}`,{operationKey:createUlid(),expectedRevisionId:target.revisionId,properties:{icon:`file:${file.id}`}})).status).toBe(200);
  const ownerResponse=await f.api.request(`http://localhost:8787/api/media/${file.id}?display=icon`,{headers:{cookie:f.cookies[f.ownerId]}},env);
  expect(ownerResponse.status).toBe(200);expect(ownerResponse.headers.get('content-type')).toBe('text/plain');expect(ownerResponse.headers.get('content-disposition')).toMatch(/^attachment/);expect(ownerResponse.headers.get('x-content-type-options')).toBe('nosniff');expect(await ownerResponse.text()).toBe('Downloadable plain text');
  expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'page',targetId:target.id,principalKind:'member',principalId:f.readerId,level:'view'})).status).toBe(200);
  expect((await f.request('GET',`/api/pages/${target.id}`,undefined,f.readerId)).status).toBe(200);
  expect((await f.api.request(`http://localhost:8787/api/media/${file.id}?display=icon`,{headers:{cookie:f.cookies[f.readerId]}},env)).status).toBe(404);
});
