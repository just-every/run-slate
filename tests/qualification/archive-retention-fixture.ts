import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

type Request = (method:string, path:string, body?:unknown) => Promise<{status:number; data:any}>;
export interface RetentionDoor {
  request: Request;
  upload: (pageId:string, bytes:Uint8Array) => Promise<{id:string}>;
  readFile: (id:string) => Promise<Uint8Array>;
  containerId:string;
  memberId:string;
}

/** A populated native tree: history, discussion, authority, status, structure and bytes. */
export async function retentionFixture(door:RetentionDoor) {
  const read=async(path:string)=>{
    const response=await door.request('GET',path);
    assert.equal(response.status,200,JSON.stringify(response.data));
    return response.data;
  };
  const write=async(path:string,body:Record<string,unknown>,method='POST')=>{
    const response=await door.request(method,path,{operationKey:randomUUID(),...body});
    assert.ok(response.status>=200&&response.status<300,`${path}: ${JSON.stringify(response)}`);
    return response.data.value;
  };
  const paragraph=(text:string)=>({id:randomUUID(),blockType:'paragraph',treePosition:'1',content:{text:[{text}]}});
  const root=await write('/api/pages',{containerId:door.containerId,title:'Retained archive tree',blocks:[paragraph('Historical retained body')]});
  const child=await write('/api/pages',{containerId:door.containerId,parentPageId:root.pageId,title:'Retained child',blocks:[paragraph('Child retained body')]});
  const database=await write('/api/databases',{containerId:door.containerId,parentPageId:root.pageId,title:'Retained database'});
  const field={id:randomUUID(),name:'Retention notes',type:'text',config:{},position:0};
  const definition=await write(`/api/databases/${database.id}/fields`,{expectedRevisionId:database.revisionId,field});
  const view={id:randomUUID(),name:'Retained view',layout:'table',filters:[],sorts:[],groups:[],calculations:{},display:{},position:0};
  await write(`/api/databases/${database.id}/views`,{expectedRevisionId:definition.revisionId,view});
  const record=await write(`/api/databases/${database.id}/records`,{title:'Retained record',values:{[field.id]:'Structured retained value'}});
  await write(`/api/pages/${record.pageId}/blocks`,{expectedRevisionId:record.revisionId,blocks:[paragraph('Record retained body')]},'PUT');
  const bytes=new TextEncoder().encode('synthetic-slate-61\nRetained original file bytes\n');
  const file=await door.upload(root.pageId,bytes);
  const blocks=[paragraph('Current retained body'),{id:randomUUID(),blockType:'media',treePosition:'2',content:{kind:'file',source:{url:`/api/media/${file.id}`,fileId:file.id,name:'retained.txt'},caption:'Retained attachment',alt:''}}];
  await write(`/api/pages/${root.pageId}/blocks`,{expectedRevisionId:root.revisionId,blocks},'PUT');
  await write(`/api/comments/page/${root.pageId}`,{body:[{text:'Retained discussion'}]});
  await write('/api/sharing',{targetKind:'page',targetId:root.pageId,principalKind:'member',principalId:door.memberId,level:'full'});
  await write('/api/status',{key:'retention-review',label:'Retention review',color:'#225588',requiresVerification:false});
  await write(`/api/status/page/${root.pageId}`,{expectedRevisionId:(await read(`/api/pages/${root.pageId}`)).page.revisionId,statusKey:'retention-review'});
  const ids=[root.pageId,child.pageId,database.pageId,record.pageId];
  const snapshot=async()=>{
    const pages=[];
    for(const id of ids) {
      const doc=await read(`/api/pages/${id}`),history=await read(`/api/revisions/${id}`);
      const revisions=[];
      for(const revision of history.items)revisions.push(await read(`/api/revisions/${id}/${revision.id}`));
      pages.push({id,containerId:doc.page.containerId,parentPageId:doc.parentPageId,revisionId:doc.page.revisionId,
        workingRevisionId:doc.workingRevisionId,publishedRevisionId:doc.publishedRevisionId,properties:doc.properties,
        blocks:doc.blocks,history,revisions,comments:await read(`/api/comments/page/${id}`),grants:await read(`/api/sharing/pages/${id}`)});
    }
    const structured=await read(`/api/databases/${database.id}`),row=await read(`/api/databases/${database.id}/records/${record.pageId}`);
    return {pages,structured,record:{values:row.values,revisionId:row.revisionId,fields:row.fields.map(({editable,...field}:any)=>field)},bytes:[...await door.readFile(file.id)]};
  };
  const before=await snapshot();
  assert.equal(before.pages[0].blocks[0].content.text[0].text,'Current retained body');
  assert.ok(before.pages[0].revisions.some(revision=>revision.blocks[0]?.content.text[0]?.text==='Historical retained body'));
  assert.ok(JSON.stringify(before.pages[0].comments).includes('Retained discussion'));
  assert.ok(before.pages[0].grants.items.some((grant:any)=>grant.principalId===door.memberId&&grant.level==='full'));
  assert.equal(before.pages[0].properties.statusKey,'retention-review');
  assert.equal(before.structured.fields[0].name,'Retention notes');
  assert.equal(before.record.values[field.id],'Structured retained value');
  assert.deepEqual(before.bytes,[...bytes]);
  return {root,child,database,record,file,ids,before,read,write,snapshot};
}
