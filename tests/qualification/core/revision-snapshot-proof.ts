import {expect,vi} from 'vitest';
import type {PageProperties} from '../../../src/core/features/pages/types';
import {auditFixture,env,createUlid} from './audit-support';

/** Ordinary-page snapshots, reconciled from native inputs rather than the hash implementation. */
export async function revisionSnapshotProof(f:Awaited<ReturnType<typeof auditFixture>>) {
 const workspace=(await f.request('GET','/api/workspace')).data;
 await f.profile({'page.lifecycle.v1':'draft-then-publish'});
 const epoch=Date.now(),retained:any[]=[];
 let pageId='';
 let props:PageProperties={cover:{kind:'gallery',id:'ocean'},title:'synthetic-slate-initial',icon:'📘',coverFileId:null,ownerMemberId:f.ownerId,statusKey:null,labels:['alpha','zeta'],typeface:'serif',smallText:true,fullWidth:true};
 let blocks:any[]=[];
 const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.normalize('NFC').replace(/\s+/gu,' ').trim()))),byte=>byte.toString(16).padStart(2,'0')).join('');
 vi.useFakeTimers({toFake:['Date'],now:epoch});
 try {
  const commit=async(method:string,path:string,input:any,expectedText:string,origin='autosave',actor=f.ownerId)=>{
   vi.setSystemTime(epoch+(retained.length+1)*1000);
   const submitted={operationKey:createUlid(),...input};
   const result=await f.request(method,path,submitted,actor);
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
   expect({...row,body_json:JSON.parse(row.body_json),properties_json:JSON.parse(row.properties_json)}).toEqual({id:receipt.revisionId,page_id:pageId,author_member_id:actor,origin,content_hash:await hash(expectedText),body_json:document.blocks,properties_json:props,status_key:null,ordinal:null,label:null,created_at:new Date().toISOString(),deleted_at:null,deleted_by_member_id:null});
   expect(receipt.committedAt).toBe(row.created_at);
   const history=(await f.request('GET',`/api/revisions/${pageId}`)).data.items;
   expect(history.find((item:any)=>item.id===row.id)).toMatchObject({authorMemberId:actor,createdAt:row.created_at,origin});
   const snapshot=await f.request('GET',`/api/revisions/${pageId}/${row.id}`);
   expect(snapshot.status).toBe(200);
   expect(snapshot.data).toEqual({id:row.id,blocks:document.blocks,properties:props,createdAt:row.created_at,newerRevisionExists:false});
   retained.push({row,snapshot:structuredClone(snapshot.data),receipt,value,method,path,input:submitted,actor,expectedText});
  };
  await commit('POST','/api/pages',{containerId:f.containerId,title:props.title,properties:props},'alpha zeta synthetic-slate-initial');
  props={...props,title:'Cafe\u0301\t  snapshot'};
  await commit('PATCH',`/api/pages/${pageId}`,{expectedRevisionId:await f.revision(pageId),properties:{title:props.title}},'alpha zeta Café snapshot');
  const first=createUlid(),second=createUlid();
  blocks=[{id:first,blockType:'paragraph',treePosition:'1',parentBlockId:null,content:{text:[{text:'Cafe\u0301\t  fi',marks:['bold']},{text:'rst'}]}},{id:second,blockType:'paragraph',treePosition:'2',parentBlockId:null,content:{text:[{text:'second\nline'}]}}];
  await commit('PUT',`/api/pages/${pageId}/blocks`,{expectedRevisionId:await f.revision(pageId),blocks:[blocks[1],blocks[0]]},'Café first second line alpha zeta Café snapshot');
  await commit('POST',`/api/pages/${pageId}/publish`,{expectedRevisionId:await f.revision(pageId)},'Café first second line alpha zeta Café snapshot','publish');
  props={...props,cover:null,title:'synthetic-slate-later',icon:'📗',labels:['later'],typeface:'mono',smallText:false,fullWidth:false};
  await commit('PATCH',`/api/pages/${pageId}`,{expectedRevisionId:await f.revision(pageId),properties:{title:props.title,icon:props.icon,cover:props.cover,labels:props.labels,typeface:props.typeface,smallText:props.smallText,fullWidth:props.fullWidth}},'Café first second line later synthetic-slate-later');
  blocks=[{...blocks[0],content:{text:[{text:'synthetic-slate-new-body'}]}},blocks[1]];
  const writerGrant=await f.mutation('revision writer access','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:pageId,principalKind:'member',principalId:f.readerId,level:'edit'});
  const current=(await f.request('GET',`/api/pages/${pageId}`)).data;
  await commit('PATCH',`/api/pages/${pageId}/blocks/${first}`,{expectedRevisionId:current.blocks[0].revisionId,content:blocks[0].content},'synthetic-slate-new-body second line later synthetic-slate-later','autosave',f.readerId);
  blocks=[...blocks,{id:createUlid(),blockType:'link-card',treePosition:'3',parentBlockId:null,content:{url:'https://example.test/revision',display:'card',previewState:'ready',preview:{title:'Cafe\u0301 reference',description:'Stored\t reference details',siteName:'Slate reference'}}}];
  await commit('PUT',`/api/pages/${pageId}/blocks`,{expectedRevisionId:await f.revision(pageId),blocks},'synthetic-slate-new-body second line https://example.test/revision Café reference Stored reference details Slate reference later synthetic-slate-later');
  blocks=[...blocks.slice(0,2),{...blocks[2],content:{...blocks[2].content,preview:{...blocks[2].content.preview,title:'synthetic-slate-later-reference'}}}];
  const latest=(await f.request('GET',`/api/pages/${pageId}`)).data;
  await commit('PATCH',`/api/pages/${pageId}/blocks/${blocks[2].id}`,{expectedRevisionId:latest.blocks[2].revisionId,content:blocks[2].content},'synthetic-slate-new-body second line https://example.test/revision synthetic-slate-later-reference Stored reference details Slate reference later synthetic-slate-later');
  const rows=(await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY created_at,id').bind(pageId).all()).results;
  expect(rows).toEqual(retained.map(item=>item.row));
  const durable=async()=>({
   page:await env.DB.prepare('SELECT * FROM pages WHERE id=?').bind(pageId).first(),
   blocks:(await env.DB.prepare('SELECT * FROM page_blocks WHERE page_id=? ORDER BY id').bind(pageId).all()).results,
   revisions:(await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id').bind(pageId).all()).results,
   activity:(await env.DB.prepare('SELECT * FROM activity_entries WHERE target_id=? ORDER BY id').bind(pageId).all()).results,
   receipts:(await env.DB.prepare('SELECT * FROM operation_receipts WHERE target_id=? ORDER BY id').bind(pageId).all()).results,
  });
  const beforeReplay=await durable();
  for(const item of retained){
   const replay=await f.request(item.method,item.path,item.input,item.actor);
   expect(replay.status).toBe(200);
   expect(replay.data.receipt).toEqual(item.receipt);
   expect(replay.data.value).toEqual(item.value);
   expect(await durable()).toEqual(beforeReplay);
   const reopened=await f.request('GET',`/api/revisions/${pageId}/${item.row.id}`);
   expect(reopened.status).toBe(200);
   expect(reopened.data).toEqual({...item.snapshot,newerRevisionExists:item.row.id!==retained.at(-1).row.id});
   console.info('REVISION_SNAPSHOT_RECEIPT',JSON.stringify({pageId,receipt:item.receipt,row:item.row,expectedText:item.expectedText,independentHash:await hash(item.expectedText),reopened:true}));
  }
  await f.mutation('revoke revision writer','sharing.grant','POST','/api/sharing',{id:writerGrant.value.id,targetKind:'page',targetId:pageId,principalKind:'member',principalId:f.readerId,level:'edit',revoke:true});
  const beforeRefusal=await durable();
  for(const item of retained)expect((await f.request('GET',`/api/revisions/${pageId}/${item.row.id}`,undefined,f.readerId)).status).toBe(404);
  const formerWriter=retained.find(item=>item.actor===f.readerId)!;
  expect((await f.request(formerWriter.method,formerWriter.path,formerWriter.input,f.readerId)).status).toBe(404);
  expect(await durable()).toEqual(beforeRefusal);
  console.info(`PROBE REV-001 1: native ordinary-page writes -> ${retained.length} retained immutable snapshots with independent hashes, complete properties and exact rows; replay leaves durable state unchanged; revoked writer reads and replay refused`);
 } finally {vi.useRealTimers();await f.profile({'page.lifecycle.v1':workspace.policies['page.lifecycle.v1']});}
}
