import {expect,vi} from 'vitest';
import {auditFixture,env,createUlid} from './audit-support';

/** Ordinary-page snapshots, reconciled from native inputs rather than the hash implementation. */
export async function revisionSnapshotProof(f:Awaited<ReturnType<typeof auditFixture>>) {
 const workspace=(await f.request('GET','/api/workspace')).data;
 await f.profile({'page.lifecycle.v1':'draft-then-publish'});
 const epoch=Date.now(),retained:any[]=[];
 let pageId='';
 let props={title:'synthetic-slate-initial',icon:'📘',coverFileId:null,ownerMemberId:f.ownerId,statusKey:null,labels:['alpha','zeta'],typeface:'serif',smallText:true,fullWidth:true};
 let blocks:any[]=[];
 const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.normalize('NFC').replace(/\s+/gu,' ').trim()))),byte=>byte.toString(16).padStart(2,'0')).join('');
 vi.useFakeTimers({toFake:['Date'],now:epoch});
 try {
  const commit=async(method:string,path:string,input:any,expectedText:string,origin='autosave',actor=f.ownerId)=>{
   vi.setSystemTime(epoch+(retained.length+1)*1000);
   const result=await f.request(method,path,{operationKey:createUlid(),...input},actor);
   expect(result.status,JSON.stringify(result)).toBe(200);
   const {receipt,value}=result.data;
   if(!pageId)pageId=value.pageId;
   expect(value.revisionId).toBe(receipt.revisionId);
   expect(retained.map(item=>item.row.id)).not.toContain(receipt.revisionId);
   const document=(await f.request('GET',`/api/pages/${pageId}`)).data;
   expect(document.page.revisionId).toBe(receipt.revisionId);
   expect(document.properties).toEqual(props);
   expect(document.blocks.map((b:any)=>({id:b.id,blockType:b.blockType,treePosition:b.treePosition,parentBlockId:b.parentBlockId,content:b.content}))).toEqual(blocks);
   const row=await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? AND id=?').bind(pageId,receipt.revisionId).first<any>();
   expect(row).toEqual({id:receipt.revisionId,page_id:pageId,author_member_id:actor,origin,content_hash:await hash(expectedText),body_json:JSON.stringify(document.blocks),properties_json:JSON.stringify(props),status_key:null,ordinal:null,label:null,created_at:new Date().toISOString(),deleted_at:null,deleted_by_member_id:null});
   expect(receipt.committedAt).toBe(row.created_at);
   const history=(await f.request('GET',`/api/revisions/${pageId}`)).data.items;
   expect(history.find((item:any)=>item.id===row.id)).toMatchObject({authorMemberId:actor,createdAt:row.created_at,origin});
   const snapshot=await f.request('GET',`/api/revisions/${pageId}/${row.id}`);
   expect(snapshot.status).toBe(200);
   expect(snapshot.data).toEqual({id:row.id,blocks:document.blocks,properties:props,createdAt:row.created_at,newerRevisionExists:false});
   retained.push({row,snapshot:structuredClone(snapshot.data),receipt,expectedText});
  };
  await commit('POST','/api/pages',{containerId:f.containerId,title:props.title,properties:props},'alpha zeta synthetic-slate-initial');
  props={...props,title:'Cafe\u0301\t  snapshot'};
  await commit('PATCH',`/api/pages/${pageId}`,{expectedRevisionId:await f.revision(pageId),properties:{title:props.title}},'alpha zeta Café snapshot');
  const first=createUlid(),second=createUlid();
  blocks=[{id:first,blockType:'paragraph',treePosition:'1',parentBlockId:null,content:{text:[{text:'Cafe\u0301\t  fi',marks:['bold']},{text:'rst'}]}},{id:second,blockType:'paragraph',treePosition:'2',parentBlockId:null,content:{text:[{text:'second\nline'}]}}];
  await commit('PUT',`/api/pages/${pageId}/blocks`,{expectedRevisionId:await f.revision(pageId),blocks:[blocks[1],blocks[0]]},'Café first second line alpha zeta Café snapshot');
  await commit('POST',`/api/pages/${pageId}/publish`,{expectedRevisionId:await f.revision(pageId)},'Café first second line alpha zeta Café snapshot','publish');
  props={...props,title:'synthetic-slate-later',icon:'📗',labels:['later'],typeface:'mono',smallText:false,fullWidth:false};
  await commit('PATCH',`/api/pages/${pageId}`,{expectedRevisionId:await f.revision(pageId),properties:{title:props.title,icon:props.icon,labels:props.labels,typeface:props.typeface,smallText:props.smallText,fullWidth:props.fullWidth}},'Café first second line later synthetic-slate-later');
  blocks=[{...blocks[0],content:{text:[{text:'synthetic-slate-new-body'}]}},blocks[1]];
  await f.mutation('revision writer access','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:pageId,principalKind:'member',principalId:f.readerId,level:'edit'});
  const current=(await f.request('GET',`/api/pages/${pageId}`)).data;
  await commit('PATCH',`/api/pages/${pageId}/blocks/${first}`,{expectedRevisionId:current.blocks[0].revisionId,content:blocks[0].content},'synthetic-slate-new-body second line later synthetic-slate-later','autosave',f.readerId);
  const rows=(await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY created_at,id').bind(pageId).all()).results;
  expect(rows).toEqual(retained.map(item=>item.row));
  for(const item of retained){
   const reopened=await f.request('GET',`/api/revisions/${pageId}/${item.row.id}`);
   expect(reopened.status).toBe(200);
   expect(reopened.data).toEqual({...item.snapshot,newerRevisionExists:item.row.id!==retained.at(-1).row.id});
   console.info('REVISION_SNAPSHOT_RECEIPT',JSON.stringify({pageId,receipt:item.receipt,row:item.row,expectedText:item.expectedText,independentHash:await hash(item.expectedText),reopened:true}));
  }
 } finally {vi.useRealTimers();await f.profile({'page.lifecycle.v1':workspace.policies['page.lifecycle.v1']});}
}
