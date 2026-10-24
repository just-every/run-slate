import {expect} from 'vitest';
import {unzipSync} from 'fflate';
export async function syncedCase(request:(method:string,path:string,body?:unknown,actor?:'owner'|'reader'|'public')=>Response|Promise<Response>,readerId:string,db:D1Database){
 const json=async(method:string,path:string,body?:unknown,actor:'owner'|'reader'='owner')=>{const r=await request(method,path,body,actor),data=await r.json<any>();expect(r.status,JSON.stringify(data)).toBe(200);return data;};
 const key=()=>crypto.randomUUID(),containerId=(await json('POST','/containers',{operationKey:key(),name:'Incident source team',visibility:'private'})).value.id;
 const sourceBlock=key(),initial='Contact the incident coordinator.',changed='Contact the duty lead immediately.',sourceTitle='Incident escalation source';
 const create=async(title:string,blocks:any[]) =>(await json('POST','/pages',{operationKey:key(),containerId,title,blocks})).value.pageId as string;
 const source=await create(sourceTitle,[{id:sourceBlock,blockType:'synced-source',content:{text:[{text:initial}]},treePosition:'0'}]);
 const copies=await Promise.all(['Response plan','Duty guide'].map(title=>create(title,[{id:key(),blockType:'synced-reference',content:{sourcePageId:source,sourceBlockId:sourceBlock},treePosition:'0'}])));
 let one=await json('GET',`/pages/${copies[0]}`),block=one.blocks[0];expect(block.synced).toMatchObject({state:'ready',sourceTitle,canEdit:true});
 const edit={operationKey:key(),expectedCopyRevisionId:block.revisionId,expectedSourceRevisionId:block.synced.sourceRevisionId,text:[{text:changed}]};
 await json('PATCH',`/pages/${copies[0]}/synced/${block.id}`,edit);
 const two=await json('GET',`/pages/${copies[1]}`);expect(two.blocks[0].synced.text).toEqual([{text:changed}]);expect(JSON.stringify(two.blocks[0].content)).not.toContain(changed);
 expect((await request('PATCH',`/pages/${copies[0]}/synced/${block.id}`,{...edit,operationKey:key()})).status).toBe(409);
 const grant=async(targetId:string,level:string,id?:string,revoke=false)=>(await json('POST','/sharing',{operationKey:key(),targetKind:'page',targetId,principalKind:'member',principalId:readerId,level,...(id?{id}:{}),revoke})).value.id;
 const copyGrant=await grant(copies[0],'edit'),sourceGrant=await grant(source,'edit');
 one=await json('GET',`/pages/${copies[0]}`,undefined,'reader');block=one.blocks[0];
 const readerEdit={operationKey:key(),expectedCopyRevisionId:block.revisionId,expectedSourceRevisionId:block.synced.sourceRevisionId,text:[{text:changed}]};
 const receipt=await json('PATCH',`/pages/${copies[0]}/synced/${block.id}`,readerEdit,'reader');expect(receipt.value).not.toHaveProperty('blocks');expect(JSON.stringify(receipt)).not.toContain(changed);
 await grant(source,'view',sourceGrant);
 expect((await request('PATCH',`/pages/${copies[0]}/synced/${block.id}`,readerEdit,'reader')).status).toBe(404);
 one=await json('GET',`/pages/${copies[0]}`,undefined,'reader');block=one.blocks[0];expect(block.synced.canEdit).toBe(false);
 expect((await request('PATCH',`/pages/${copies[0]}/synced/${block.id}`,{...edit,operationKey:key(),expectedSourceRevisionId:block.synced.sourceRevisionId},'reader')).status).toBe(404);
 await grant(source,'view',sourceGrant,true);
 one=await json('GET',`/pages/${copies[0]}`,undefined,'reader');expect(one.blocks[0].synced).toEqual({state:'access-needed'});expect(JSON.stringify(one)).not.toContain(changed);expect(JSON.stringify(one)).not.toContain(sourceTitle);
 const history=await json('GET',`/revisions/${copies[0]}/${one.workingRevisionId}`,undefined,'reader');expect(JSON.stringify(history)).not.toContain(changed);expect(JSON.stringify(history)).not.toContain(sourceTitle);
 const search=await json('GET','/search?q='+encodeURIComponent('duty lead immediately'),undefined,'reader');expect(JSON.stringify(search)).not.toContain(source);
 const publish=async(id:string,slug:string,revoke=false)=>json('POST',`/publishing/${id}`,{operationKey:key(),expectedRevisionId:(await json('GET',`/pages/${id}`)).page.revisionId,host:'slate.test',slug,revoke});
 await publish(copies[1],'synthetic-slate-8');let response=await request('GET','/p/synthetic-slate-8',undefined,'public');let html=await response.text();expect(response.status).toBe(200);expect(html).toContain('Access needed');expect(html).not.toContain(changed);expect(html).not.toContain(sourceTitle);
 await publish(source,'synthetic-slate-9');response=await request('GET','/p/synthetic-slate-8',undefined,'public');html=await response.text();expect(html).toContain(changed);expect(html).toContain(sourceTitle);
 await publish(source,'synthetic-slate-9',true);await publish(copies[1],'synthetic-slate-8',true);
 const exported=await request('POST','/exports/readable',{scope:'page',id:copies[0],format:'html',includeComments:false});expect(exported.status).toBe(200);
 const bytes=new Uint8Array(await exported.arrayBuffer()),archive=JSON.parse(new TextDecoder().decode(unzipSync(bytes)['slate-readable.json']));expect(archive.pages[0].blocks[0].blockType).toBe('paragraph');expect(JSON.stringify(archive.pages[0].blocks)).toContain(sourceTitle);expect(JSON.stringify(archive.pages[0].blocks)).not.toContain('sourcePageId');
 const form=new FormData();form.set('operationKey',key());form.set('format','slate-readable');form.set('file',new File([new Uint8Array(bytes)],'synthetic-slate-10.zip'));
 const imported=await json('POST','/imports',form),job=await json('POST',`/imports/${imported.id}/run`,{});expect(job.state).toBe('completed');
 const importedPage=(await json('GET','/pages')).items.find((p:any)=>p.title==='Response plan'&&p.id!==copies[0]);expect(importedPage).toBeDefined();const importedDoc=await json('GET',`/pages/${importedPage.id}`);expect(importedDoc.blocks.every((b:any)=>b.blockType==='paragraph')).toBe(true);expect(JSON.stringify(importedDoc.blocks)).toContain(changed);
 const word=await request('POST','/exports/readable',{scope:'page',id:copies[0],format:'docx',includeComments:false});expect(word.status).toBe(200);const xml=new TextDecoder().decode(unzipSync(new Uint8Array(await word.arrayBuffer()))['word/document.xml']);expect(xml).toContain(changed);expect(xml).toContain(sourceTitle);
 const duplicated=await json('POST',`/pages/${copies[0]}/duplicate`,{operationKey:key(),containerId}),duplicate=await json('GET',`/pages/${duplicated.value.pageId}`);expect(duplicate.blocks[0].blockType).toBe('paragraph');expect(JSON.stringify(duplicate.blocks)).toContain(changed);expect(JSON.stringify(duplicate.blocks)).toContain(sourceTitle);
 const revisionBytes=await db.prepare('SELECT * FROM page_revisions WHERE page_id=? AND id=?').bind(copies[1],two.workingRevisionId).first();
 const retainedBefore=await json('GET',`/revisions/${copies[1]}/${two.workingRevisionId}`);
 await publish(copies[0],'synthetic-slate-11');
 const current=await json('GET',`/pages/${source}`);await json('POST',`/archive/${source}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,action:'trash'});
 expect((await json('GET',`/pages/${copies[1]}`)).blocks[0].synced).toMatchObject({state:'trashed',sourceTitle});
 expect((await json('GET',`/pages/${copies[0]}`,undefined,'reader')).blocks[0].synced).toEqual({state:'access-needed'});
 await json('POST',`/archive/${source}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,action:'restore'});
 expect((await json('GET',`/pages/${copies[1]}`)).blocks[0].synced).toMatchObject({state:'ready',text:[{text:changed}]});
 await json('POST',`/archive/${source}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,action:'trash'});
 await json('POST',`/archive/${source}/permanent-delete`,{operationKey:key(),confirmedPageIds:[source]});
 const restricted=await json('GET',`/pages/${copies[0]}`);expect(restricted.blocks[0].synced).toMatchObject({state:'ready',static:true,sourceTitle,text:[{text:changed}]});
 const denied=await json('GET',`/pages/${copies[0]}`,undefined,'reader');expect(denied.blocks[0].synced).toEqual({state:'access-needed'});expect(JSON.stringify(denied)).not.toContain(changed);expect(JSON.stringify(denied)).not.toContain(sourceTitle);
response=await request('GET','/p/synthetic-slate-11',undefined,'public');html=await response.text();expect(response.status).toBe(200);expect(html).toContain('Access needed');expect(html).not.toContain(changed);expect(html).not.toContain(sourceTitle);
 const ordinary=await json('GET',`/pages/${copies[1]}`);expect(ordinary.blocks[0].blockType).toBe('paragraph');expect(JSON.stringify(ordinary.blocks[0].content)).toContain(changed);expect(JSON.stringify(ordinary.blocks)).not.toContain('sourcePageId');
 const retained=await json('GET',`/revisions/${copies[1]}/${two.workingRevisionId}`);expect(retained.blocks[0].blockType).toBe('synced-reference');expect(retained.blocks[0].synced).toEqual({state:'deleted'});
 expect(JSON.stringify(await db.prepare('SELECT * FROM page_revisions WHERE page_id=? AND id=?').bind(copies[1],two.workingRevisionId).first())).toBe(JSON.stringify(revisionBytes));
 expect(retainedBefore.newerRevisionExists).toBe(false);expect(retained.newerRevisionExists).toBe(true);
 const stored=(doc:any)=>JSON.stringify({id:doc.id,createdAt:doc.createdAt,properties:doc.properties,blocks:doc.blocks.map(({synced,...b}:any)=>b)});expect(stored(retained)).toBe(stored(retainedBefore));
 await json('POST',`/revisions/${copies[0]}/${one.workingRevisionId}/restore`,{operationKey:key(),expectedRevisionId:restricted.page.revisionId},'reader');
 expect((await json('GET',`/pages/${copies[0]}`,undefined,'reader')).blocks[0].synced).toEqual({state:'deleted'});
 expect((await request('GET',`/pages/${source}`)).status).toBe(404);
 const settings=await json('GET','/workspace');const {id:_wid,revisionId:workspaceRevision,...workspaceSettings}=settings;
 await json('PUT','/workspace',{...workspaceSettings,operationKey:key(),expectedRevisionId:workspaceRevision,policies:{...settings.policies,'page.lifecycle.v1':'draft-then-publish'}});
 // Source block removal, unsync, restore-past and discard share the same atomic planner.
 for(const mode of ['remove','unsync','restore','discard']){
  const b=key(),s=await create('Source '+mode,[]);let empty=await json('GET',`/pages/${s}`);
  await json('POST',`/pages/${s}/publish`,{operationKey:key(),expectedRevisionId:empty.page.revisionId});empty=await json('GET',`/pages/${s}`);
  await json('PUT',`/pages/${s}/blocks`,{operationKey:key(),expectedRevisionId:empty.page.revisionId,blocks:[{id:b,blockType:'synced-source',content:{text:[{text:changed}]},treePosition:'0'}]});
  const selfCopy={id:key(),blockType:'synced-reference',content:{sourcePageId:s,sourceBlockId:b},treePosition:'1'};
  if(['remove','unsync'].includes(mode)){const sourceDoc=await json('GET',`/pages/${s}`);await json('PUT',`/pages/${s}/blocks`,{operationKey:key(),expectedRevisionId:sourceDoc.page.revisionId,blocks:[...sourceDoc.blocks.map(({id,blockType,content,parentBlockId,treePosition}:any)=>({id,blockType,content,parentBlockId,treePosition})),selfCopy]});}
  const c=await create('Copy '+mode,[{id:key(),blockType:'synced-reference',content:{sourcePageId:s,sourceBlockId:b},treePosition:'0'}]);
  await grant(c,'view');
  const live=await json('GET',`/pages/${s}`);
  if(mode==='restore')await json('POST',`/revisions/${s}/${empty.workingRevisionId}/restore`,{operationKey:key(),expectedRevisionId:live.page.revisionId});
  else if(mode==='discard'){
   await json('POST',`/pages/${s}/discard-changes`,{operationKey:key(),expectedRevisionId:live.page.revisionId});
  }else {const saved=await json('PUT',`/pages/${s}/blocks`,{operationKey:key(),expectedRevisionId:live.page.revisionId,blocks:mode==='remove'?[selfCopy]:[{id:b,blockType:'paragraph',content:{text:[{text:changed}]},treePosition:'0'},selfCopy]});expect(saved.value.blocks.find((block:any)=>block.id===selfCopy.id).blockType).toBe('paragraph');}
  if(['remove','unsync'].includes(mode)){const own=(await json('GET',`/pages/${s}`)).blocks.find((block:any)=>block.id===selfCopy.id);expect(own.blockType).toBe('paragraph');expect(JSON.stringify(own.content)).toContain(changed);}
  expect((await json('GET',`/pages/${c}`)).blocks[0].synced).toMatchObject({static:true,text:[{text:changed}]});
  const hidden=await json('GET',`/pages/${c}`,undefined,'reader');expect(hidden.blocks[0].synced).toEqual({state:'access-needed'});expect(JSON.stringify(hidden)).not.toContain(changed);
 }

}
