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
  const fieldsReceipt=await write(`/api/databases/${database.id}/fields`,{expectedRevisionId:database.revisionId,field});
  const view={id:randomUUID(),name:'Retained view',layout:'table',filters:[],sorts:[],groups:[],calculations:{},display:{},position:0};
  await write(`/api/databases/${database.id}/views`,{expectedRevisionId:fieldsReceipt.revisionId,view});
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
  // Every retained family has actual discussion, history and direct authority.
  for(const id of ids) {
    if(id!==root.pageId) {
      await write(`/api/comments/page/${id}`,{body:[{text:'Retained discussion for '+id}]});
      await write('/api/sharing',{targetKind:'page',targetId:id,principalKind:'member',principalId:door.memberId,level:'full'});
    }
    const doc=await read(`/api/pages/${id}`);
    if(doc.page.lifecycle!=='live')await write(`/api/pages/${id}/publish`,{expectedRevisionId:doc.page.revisionId});
  }
  const references:{id:string;title:string;href:string;citation:any;exact:any}[]=[];
  for(const id of ids) {
    const doc=await read(`/api/pages/${id}`),history=await read(`/api/revisions/${id}`);
    const revisionId=id===root.pageId?root.revisionId:doc.workingRevisionId;
    const citation=await read(`/api/pages/${id}/link-card?revision=${revisionId}`);
    const exact=await read(`/api/revisions/${id}/${revisionId}`);
    assert.ok(history.items.some((item:any)=>item.id===revisionId));
    references.push({id,title:doc.page.title,href:`/app/pages/${id}`,citation,exact});
  }
  const definition={container:door.containerId,orderBy:'title',limit:100};
  const referenceBlocks=references.map((ref,index)=>({id:randomUUID(),blockType:'paragraph',treePosition:String(index+1),content:{text:[
    {text:'Open '+ref.title,link:{href:ref.href}},{text:'\n'},
    {text:ref.title,mention:{kind:'page',id:ref.id,label:ref.title}},{text:'\n'},
    {text:'Cite '+ref.title,link:{href:ref.citation.href}},
  ]}}));
  const report=await write('/api/pages',{containerId:door.containerId,title:'Archive reference report',blocks:[...referenceBlocks,
    {id:randomUUID(),blockType:'content-query',treePosition:'9',content:{definition}},
  ]});
  const reportDoc=await read(`/api/pages/${report.pageId}`);
  if(reportDoc.page.lifecycle!=='live')await write(`/api/pages/${report.pageId}/publish`,{expectedRevisionId:reportDoc.page.revisionId});
  const initialQuery=await door.request('POST',`/api/pages/${report.pageId}/query`,definition);
  assert.equal(initialQuery.status,200,JSON.stringify(initialQuery.data));
  const queryBaseline:{id:string;title:string}[]=initialQuery.data.items.map(({id,title}:any)=>({id,title}));
  assert.deepEqual(queryBaseline.filter(item=>ids.includes(item.id)).map(item=>item.id).sort(),[...ids].sort());
  const assertSurfaces=async(archived:string[]=[])=>{
    const live=ids.filter(id=>!archived.includes(id));
    const targetIds=(items:any[])=>items.filter(item=>ids.includes(item.id)).map(item=>item.id).sort();
    const tree=await read(`/api/pages?containerId=${door.containerId}`);
    // Record-as-row profiles intentionally omit live rows from the page tree.
    assert.deepEqual(targetIds(tree.items).filter(id=>id!==record.pageId),live.filter(id=>id!==record.pageId).sort());
    for(const id of archived)assert.ok(!tree.items.some((item:any)=>item.id===id),'Archived targets are absent even when the profile exposes live records in the tree.');
    for(const kind of ['page','record']) {
      const path=`/api/search?query=Retained&containerId=${door.containerId}&kind=${kind}&limit=100`;
      const expected=ids.filter(id=>kind==='record'?id===record.pageId:id!==record.pageId);
      assert.deepEqual(targetIds((await read(path)).items),expected.filter(id=>!archived.includes(id)).sort());
      assert.deepEqual(targetIds((await read(path+'&includeArchived=true')).items),expected.sort());
    }
    const query=await door.request('POST',`/api/pages/${report.pageId}/query`,definition);
    assert.equal(query.status,200,JSON.stringify(query.data));
    assert.deepEqual(query.data.items.map(({id,title}:any)=>({id,title})).sort((a:any,b:any)=>a.id.localeCompare(b.id)),queryBaseline.filter(item=>!archived.includes(item.id)).sort((a,b)=>a.id.localeCompare(b.id)));
    const source=await read(`/api/pages/${report.pageId}`);
    assert.deepEqual(source.blocks, (await read(`/api/revisions/${report.pageId}/${source.workingRevisionId}`)).blocks);
    for(const ref of references) {
      assert.deepEqual(source.mentions[ref.id],{label:ref.title,available:true,state:archived.includes(ref.id)?'archived':'live'});
      assert.equal((await read(`/api/pages/${ref.id}`)).page.title,ref.title);
      assert.equal((await read(`/api/pages/${ref.id}/link-card?revision=${ref.exact.id}`)).href,ref.citation.href);
      assert.deepEqual(await read(`/api/revisions/${ref.id}/${ref.exact.id}`),ref.exact);
    }
  };
  const refuseWrites=async(archived:string[])=>{
    for(const id of archived) {
      const doc=await read(`/api/pages/${id}`);
      assert.equal(doc.permissions.canEdit,false);
      for(const [method,path,input] of [
        ['PATCH',`/api/pages/${id}`,{properties:{title:'Refused archive rename'}}],
        ['PUT',`/api/pages/${id}/blocks`,{blocks:[paragraph('Refused archive body')]}],
        ['POST',`/api/comments/page/${id}`,{body:[{text:'Refused archive comment'}]}],
        ['POST',`/api/revisions/${id}/${references.find(ref=>ref.id===id)!.exact.id}/restore`,{}],
      ] as const) {
        const result=await door.request(method,path,{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId,...input});
        assert.equal(result.status,409,JSON.stringify(result));
        assert.equal(result.data.code,'PAGE_READ_ONLY');
      }
      if(id===record.pageId) {
        const result=await door.request('PATCH',`/api/databases/${database.id}/records/${id}`,{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId,values:{[field.id]:'Refused archive value'}});
        assert.equal(result.status,409,JSON.stringify(result));
        assert.equal(result.data.code,'PAGE_READ_ONLY');
      }
    }
  };
  const grants=async(id:string)=>{
    const result=await read(`/api/sharing/pages/${id}`);
    // The API does not promise grant ordering; retain every field and compare by stable grant identity.
    for(const key of ['items','inheritedItems','effectiveItems'])result[key].sort((a:any,b:any)=>a.id.localeCompare(b.id));
    return result;
  };
  const snapshot=async()=>{
    const pages=[];
    for(const id of ids) {
      const doc=await read(`/api/pages/${id}`),history=await read(`/api/revisions/${id}`);
      const revisions=[];
      for(const revision of history.items)revisions.push(await read(`/api/revisions/${id}/${revision.id}`));
      pages.push({id,containerId:doc.page.containerId,parentPageId:doc.parentPageId,revisionId:doc.page.revisionId,
        workingRevisionId:doc.workingRevisionId,publishedRevisionId:doc.publishedRevisionId,properties:doc.properties,
        blocks:doc.blocks,history,revisions,comments:await read(`/api/comments/page/${id}`),grants:await grants(id)});
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
  await assertSurfaces();
  return {root,child,database,record,file,ids,before,read,write,snapshot,references,report,definition,queryBaseline,assertSurfaces,refuseWrites};
}
