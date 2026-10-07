import { test,expect } from 'vitest';
import { fixture,createUlid } from './fixture';

test('DB-010/012 local: record tree presence follows profile while identity, record route and retained body survive both switches',async()=>{
  const f=await fixture();
  const database=await f.request('POST','/api/databases',{operationKey:createUlid(),containerId:f.containerId,title:'Parity'});
  expect(database.status).toBe(201);const databaseId=database.data.value.id;
  const record=await f.request('POST',`/api/databases/${databaseId}/records`,{operationKey:createUlid(),title:'Row with body',values:{}});
  expect(record.status).toBe(201);const pageId=record.data.value.pageId;
  expect((await f.request('PUT',`/api/pages/${pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:record.data.value.revisionId,blocks:[{id:createUlid(),blockType:'paragraph',treePosition:'1',content:{text:[{text:'Retain this body'}]}}]})).status).toBe(200);
  for(const parity of ['record-is-row','record-is-page']) {
    const workspace=(await f.request('GET','/api/workspace')).data;
    expect((await f.request('PUT','/api/workspace',{operationKey:createUlid(),expectedRevisionId:workspace.revisionId,name:workspace.name,mark:workspace.mark,description:workspace.description,guestAccess:workspace.guestAccess,publicLinkAccess:workspace.publicLinkAccess,anonymousAccess:workspace.anonymousAccess,policies:{...workspace.policies,'record.page-parity.v1':parity}})).status).toBe(200);
    expect((await f.request('GET','/api/pages')).data.items.some((page:any)=>page.id===pageId)).toBe(parity==='record-is-page');
    const opened=await f.request('GET',`/api/databases/${databaseId}/records/${pageId}`);
    expect(opened.status).toBe(200);expect(opened.data.page.page.id).toBe(pageId);expect(opened.data.presentation.tree).toBe(parity==='record-is-page');
    expect(opened.data.page.blocks[0].content.text[0].text).toBe('Retain this body');
  }
});

test('PAGE-006/TPL-001 local: immutable template snapshots retain gallery appearance through materialization',async()=>{
  const f=await fixture(),page=await f.page('Cover template');
  expect((await f.request('PATCH',`/api/pages/${page.id}`,{operationKey:createUlid(),expectedRevisionId:page.revisionId,properties:{cover:{kind:'gallery',id:'forest'}}})).status).toBe(200);
  const template=await f.request('POST','/api/templates',{operationKey:createUlid(),sourcePageId:page.id,includeChildren:false,containerId:null,title:'Forest template',description:'',category:''});
  expect(template.status).toBe(201);
  const created=await f.request('POST',`/api/templates/${template.data.value.id}/apply`,{operationKey:createUlid(),containerId:f.containerId,expectedRevisionId:template.data.value.revisionId});
  expect(created.status).toBe(201);
  expect((await f.request('GET',`/api/pages/${created.data.value.pageId}`)).data.properties.cover).toEqual({kind:'gallery',id:'forest'});
});
