import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {api} from './runtime.mjs';

/** Populated native archive states, created through the production routes. */
export async function prepareLifecycleArchive(instance,cookie) {
  const send=async(route,body,method='POST')=>(await api(instance,cookie,route,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  const get=async route=>(await api(instance,cookie,route)).json();
  const workspace=await get('/api/workspace');
  const {id,revisionId,...fields}=workspace;
  await send('/api/workspace',{...fields,expectedRevisionId:revisionId,operationKey:randomUUID(),policies:{...fields.policies,'page.lifecycle.v1':'draft-then-publish','page.version.v1':'labelled'}},'PUT');
  const ids={};
  for(const state of ['draft']) {
    const created=await send('/api/pages',{operationKey:randomUUID(),containerId:'archive-container',title:`Portable ${state}`,blocks:[{id:randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text:`Retained ${state} body`}]}}]});
    const pageId=created.value.pageId;ids[state]=pageId;
    assert.equal((await get(`/api/pages/${pageId}`)).page.lifecycle,state);
  }
  // Restore into the default lifecycle value with a real retained draft.
  const latest=await get('/api/workspace');
  await send('/api/workspace',{...fields,expectedRevisionId:latest.revisionId,operationKey:randomUUID(),policies:{...latest.policies,'page.lifecycle.v1':'always-live'}},'PUT');
  return ids;
}

/** Recovered records retain exact states, immutable versions and grants both ways. */
export async function restoredLifecycleProfiles(instance,cookie,ids) {
  const get=async route=>(await api(instance,cookie,route)).json();
  const send=async(route,body,method='POST')=>(await api(instance,cookie,route,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  const arrived=await get(`/api/pages/${ids.draft}`);
  assert.equal(arrived.policyProfile['page.lifecycle.v1'],'always-live');
  assert.equal(arrived.page.lifecycle,'draft');
  assert.equal(arrived.publishedRevisionId,null,'Native restore never publishes a draft on arrival.');
  const workspace=await get('/api/workspace');
  const {id:workspaceId,revisionId,...fields}=workspace;
  await send('/api/workspace',{...fields,expectedRevisionId:revisionId,operationKey:randomUUID(),policies:{...fields.policies,'page.lifecycle.v1':'draft-then-publish'}},'PUT');
  // Recovery cancels pending jobs. Create current-authority schedules after recovery;
  // the restored draft participates in the same populated policy switches.
  for(const state of ['scheduled','live-with-unpublished-changes']) {
    const created=await send('/api/pages',{operationKey:randomUUID(),containerId:'archive-container',title:`Recovered ${state}`});
    const pageId=created.value.pageId;ids[state]=pageId;
    const published=await send(`/api/pages/${pageId}/publish`,{operationKey:randomUUID(),expectedRevisionId:created.value.revisionId,label:'Recovered version',...(state==='scheduled'?{publishAt:'2099-04-10T12:00:00.000Z'}:{})});
    if(state==='live-with-unpublished-changes')await send(`/api/pages/${pageId}`,{operationKey:randomUUID(),expectedRevisionId:published.value.revisionId,properties:{title:'Recovered private working title'}},'PATCH');
  }
  const snapshot=async()=>Promise.all(['archive-root',...Object.values(ids)].map(async id=>{
    const {policyProfile,...document}=await get(`/api/pages/${id}`);
    const revisions=await get(`/api/revisions/${id}`);
    return {document,revisions,bodies:await Promise.all(revisions.items.map(r=>get(`/api/revisions/${id}/${r.id}`))),grants:await get(`/api/sharing/pages/${id}`)};
  }));
  const before=await snapshot();
  assert.equal(before[0].document.page.lifecycle,'live');
  for(const [state,id] of Object.entries(ids)) {
    const doc=before.find(item=>item.document.page.id===id).document;
    assert.equal(doc.page.lifecycle,state);
    if(state==='draft')assert.equal(doc.publishedRevisionId,null,'A native restored draft has no publication on arrival.');
  }
  const states=[];
  for(const lifecycle of ['always-live','draft-then-publish','always-live']) {
    const {id,revisionId,...fields}=await get('/api/workspace');
    await api(instance,cookie,'/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,expectedRevisionId:revisionId,operationKey:randomUUID(),policies:{...fields.policies,'page.lifecycle.v1':lifecycle}})});
    const after=await snapshot();
    assert.deepEqual(after,before,'Restored native states, revisions, schedules and grants survive profile switches byte for byte.');
    states.push(lifecycle);
  }
  console.log('PROBE LIFE-006 3: native ZIP restore into always-live, then both profile switches -> draft stays private and every stored state, revision and grant is unchanged');
  return {ids,states,before,after:await snapshot()};
}
