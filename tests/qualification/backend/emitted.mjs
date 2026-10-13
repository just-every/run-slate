import {signInWithOutbox} from '../../e2e/outbox-auth.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRuntime} from '../local/runtime.mjs';
const root=process.cwd(),evidence=process.env.QUAL_EVIDENCE??await mkdtemp(tmpdir()+'/slate-qualification-');
await mkdir(evidence,{recursive:true});
const runtime=await createRuntime({root,evidence,appPort:8750,inspectorPort:8751});
const checks=[];
try {
  const now=new Date().toISOString();
  // Test-only membership/session fixture replaces mailbox possession; all product records below use native HTTP.
  await runtime.sql(`INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('core-proof-workspace','Before wizard','','${now}','${now}','initial-core-revision'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('core-proof-owner','core-proof-workspace','qualification-owner@test.invalid','Core owner','CO','owner','member','active',1,'${now}','${now}');`);
  const {cookie}=await signInWithOutbox(runtime.origin,'qualification-owner@test.invalid');
  async function request(method,route,body) {
    const response=await fetch(runtime.origin+route,{method,headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.ok(response.ok,`${method} ${route}: ${response.status} ${JSON.stringify(data)}`);return data;
  }
  const first=await request('POST','/api/workspace/first-run',{operationKey:randomUUID(),workspaceName:'Core proof',containerName:'Core container',pageTitle:'First page'});
  const pages=await request('GET','/api/pages'),page=pages.items[0];assert.equal(pages.items.length,1);checks.push('WORK-013 server wizard creates exactly first page');
  const child=(await request('POST','/api/pages',{operationKey:randomUUID(),containerId:page.containerId,parentPageId:page.id,title:'Child'})).value;
  const sharing=await request('GET',`/api/sharing/pages/${child.pageId}`);assert.ok(sharing.inheritedItems.some(item=>item.origin.kind==='container'&&item.origin.name==='Core container'));assert.deepEqual(sharing.levels,['full','edit','comment','view']);checks.push('SHARE-001 current inherited container provenance');
  const appearance=(await request('PATCH',`/api/pages/${page.id}`,{operationKey:randomUUID(),expectedRevisionId:page.revisionId,properties:{cover:{kind:'gallery',id:'ocean'},icon:'🌊'}})).value;
  const reloaded=await request('GET',`/api/pages/${page.id}`);assert.deepEqual(reloaded.properties.cover,{kind:'gallery',id:'ocean'});checks.push('PAGE-006 persisted gallery and emoji');
  const form=new FormData();form.set('operationKey',randomUUID());form.set('pageId',page.id);form.set('file',new File(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10" /></svg>'],'proof.svg',{type:'image/svg+xml'}));
  const upload=await fetch(runtime.origin+'/api/media',{method:'POST',headers:{cookie},body:form});assert.equal(upload.status,200);const file=(await upload.json()).value;
  await request('PATCH',`/api/pages/${page.id}`,{operationKey:randomUUID(),expectedRevisionId:appearance.revisionId,properties:{icon:`file:${file.id}`,coverFileId:file.id}});
  const media=await fetch(`${runtime.origin}/api/media/${file.id}?display=icon`,{headers:{cookie}});assert.equal(media.status,200);assert.match(media.headers.get('content-disposition'),/^inline/);assert.doesNotMatch(await media.text(),/onload/);checks.push('PAGE-006/BLOCK-008 scoped sanitized R2 image');
  const database=(await request('POST','/api/databases',{operationKey:randomUUID(),containerId:page.containerId,title:'Core database'})).value;
  for(const [kind,id,position] of [['database',database.id,0],['container',page.containerId,1],['page',page.id,2]])await request('PUT','/api/navigation/favourites',{operationKey:randomUUID(),kind,id,enabled:true,position});
  const navigation=await request('GET','/api/navigation');assert.deepEqual(navigation.favourites.map(item=>item.kind),['database','container','page']);assert.equal(navigation.favourites[0].href,`/app/databases/${database.id}`);checks.push('NAV-001/003 every favourite kind with correct destination');
  const value={sidebarCollapsed:true,collapsedContainers:[page.containerId],timezone:'Australia/Brisbane',quietRoutine:true,destinationOrder:['search','home']};await request('PUT','/api/navigation/preferences',{operationKey:randomUUID(),expectedRevisionId:null,value});assert.deepEqual((await request('GET','/api/navigation/preferences')).value,value);checks.push('NAV-004 persistent preference order');
  const configuration=await request('GET','/api/navigation/configuration');const destinations=[...configuration.destinations].reverse();await request('PUT','/api/navigation/configuration',{operationKey:randomUUID(),expectedRevisionId:configuration.revisionId,destinations});assert.deepEqual((await request('GET','/api/navigation')).configuration.destinations,destinations);checks.push('NAV-004 workspace-owned configuration round trip');
  const details=await request('GET',`/api/pages/${page.id}/details`);assert.deepEqual(details.owner,{id:'core-proof-owner',displayName:'Core owner'});assert.deepEqual(details.linkedFrom,[]);checks.push('PAGE-007 reader detail contract');
  await request('PUT','/api/sharing/configuration',{operationKey:randomUUID(),expectedRevisionId:null,levels:['full','edit','view']});assert.deepEqual((await request('GET',`/api/sharing/pages/${child.pageId}`)).levels,['full','edit','view']);checks.push('SHARE-005 configured levels persisted');

  await runtime.sql(`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,created_at,updated_at) VALUES('requester-proof','core-proof-workspace','requester@test.invalid','Requester','RQ','member','member','active','${now}','${now}');`);
  const requesterToken=(await signInWithOutbox(runtime.origin,'requester@test.invalid')).cookie.split('=')[1];
  const privatePage=(await request('POST','/api/pages',{operationKey:randomUUID(),containerId:page.containerId,title:'Request target private title'})).value;
  for(const targetId of [privatePage.pageId,privatePage.pageId,'unknown-target']) {
    const response=await fetch(`${runtime.origin}/api/sharing/pages/${targetId}/request-access`,{method:'POST',headers:{cookie:`slate_session=${requesterToken}`,'content-type':'application/json'},body:JSON.stringify({operationKey:randomUUID()})});
    assert.equal(response.status,202);assert.deepEqual(await response.json(),{accepted:true});
  }
  const notices=(await request('GET','/api/notifications')).items.filter(item=>item.event==='access-requested');assert.equal(notices.length,1);assert.equal(notices[0].pageId,privatePage.pageId);assert.deepEqual(notices[0].detail,{requesterMemberId:'requester-proof'});
  assert.equal((await fetch(`${runtime.origin}/api/pages/${privatePage.pageId}`,{headers:{cookie:`slate_session=${requesterToken}`}})).status,404);checks.push('LINK-004/NOTIF-001 content-free deduplicated request reaches current grantor without granting access');
  const proof={outcome:'passed',date:new Date().toISOString(),candidate:runtime.artifact.commit,artifactHash:runtime.artifact.artifactHash,checks,limits:['Initial membership/session is a labelled fixture, not mailbox or empty-database-bootstrap evidence.','No real provider send, inference, deployment or browser/UI acceptance.'],runtimeDirectory:runtime.directory};
  await writeFile(path.join(evidence,'emitted.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
} finally {await runtime.close();}
