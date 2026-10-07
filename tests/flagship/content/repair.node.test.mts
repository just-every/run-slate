import {test} from 'node:test';import assert from 'node:assert/strict';
import {database} from './sqlite-harness.mts';
import {createPage,readPage,updatePage} from '../../../src/core/features/pages/service.ts';
import {publishPage,discardChanges} from '../../../src/core/features/lifecycle/service.ts';
import {readRevision,revisionHistory,restorePageRevision} from '../../../src/core/features/versions/service.ts';
import {openPage} from '../../../src/core/features/pages/open.ts';
import {setPageStatus} from '../../../src/core/features/page-status/service.ts';
import {replaceBlocks} from '../../../src/core/features/editor/service.ts';
import {archivePage} from '../../../src/core/features/archive/service.ts';
import {createComment} from '../../../src/core/features/comments/service.ts';
import {collaborationSnapshot,updatePresence,refreshPresence} from '../../../src/core/features/collaboration/service.ts';
import type {FeatureContext} from '../../../src/core/app/feature-context.ts';
const op=()=>crypto.randomUUID();
function fixture(){const{db,sql}=database();const now=new Date().toISOString();sql.exec("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES ('w','w','W','n','n','r'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES ('a','w','a@x.invalid','A','A','owner','n','n'),('b','w','b@x.invalid','B','B','member','n','n'); INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES ('c','w','c','open','n','n','r'); INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES ('ga','c','member','a','full','n','n'),('gb','c','member','b','view','n','n'); INSERT INTO workspace_policies VALUES ('w','{\"page.lifecycle.v1\":\"draft-then-publish\"}','n');");const ctx={db,now,actor:{id:'a',workspaceId:'w',workspaceName:'w',email:'a@x.invalid',displayName:'A',initials:'A',role:'owner'}} as FeatureContext;return{db,sql,ctx,viewer:{...ctx,actor:{...ctx.actor,id:'b'}}};}
const paragraph={id:'block',blockType:'paragraph',treePosition:'1',content:{text:[{text:'Unchanged text'}]}};
test('real SQL service transitions preserve private history and exact delivered opens',async()=>{const f=fixture();try{
 const p=await createPage(f.ctx,{operationKey:op(),containerId:'c',title:'First',blocks:[paragraph]});const id=p.value.pageId;
 const pub=await publishPage(f.ctx,id,{operationKey:op(),expectedRevisionId:p.value.revisionId});const delivered=await readPage(f.ctx,id);
 const change=await updatePage(f.ctx,id,{operationKey:op(),expectedRevisionId:pub.value.revisionId,properties:{title:'Secret'}});
 await assert.rejects(openPage(f.ctx,id,{operationKey:op(),revisionId:delivered.workingRevisionId}),{code:'STALE_REVISION'});
 assert.equal(f.sql.prepare('SELECT count(*) n FROM content_page_opens').get()!.n,0);
 await assert.rejects(readRevision(f.viewer,id,change.value.revisionId),{status:404});
 const discard=await discardChanges(f.ctx,id,{operationKey:op(),expectedRevisionId:change.value.revisionId});await assert.rejects(readRevision(f.viewer,id,change.value.revisionId),{status:404});
 await publishPage(f.ctx,id,{operationKey:op(),expectedRevisionId:discard.value.revisionId});await assert.rejects(readRevision(f.viewer,id,change.value.revisionId),{status:404});
 assert.ok(!(await revisionHistory(f.viewer,id)).some((r:any)=>r.id===change.value.revisionId));assert.equal((await readRevision(f.ctx,id,change.value.revisionId)).properties.title,'Secret');
 const actual=await readPage(f.ctx,id);await openPage(f.ctx,id,{operationKey:op(),revisionId:actual.workingRevisionId});assert.equal(f.sql.prepare('SELECT revision_id FROM content_page_opens').get()!.revision_id,actual.workingRevisionId);
}finally{f.sql.close();}});
test('creation, structural tasks, restored anchors, archive cycles and retained cursors use actual services',async()=>{const f=fixture();try{
 f.sql.exec("INSERT INTO status_entries VALUES ('verified','w','verified','Verified','#228855',1,NULL,'n','n');");
 await assert.rejects(createPage(f.ctx,{operationKey:op(),containerId:'c',title:'Forge',properties:{statusKey:'verified'}}),{code:'STATUS_COMMAND_REQUIRED'});
 const task={id:'task',blockType:'task',treePosition:'2',content:{text:[{text:'Task'}],done:true,completedByMemberId:'b',completedAt:'2000-01-01T00:00:00Z'}};
 const p=await createPage(f.ctx,{operationKey:op(),containerId:'c',title:'Page',lifecycle:'live',blocks:[paragraph,task]});const id=p.value.pageId;let doc=await readPage(f.ctx,id);assert.equal((doc.blocks[1].content as any).completedByMemberId,'a');
 await createComment(f.ctx,id,{operationKey:op(),kind:'inline',blockId:'block',anchor:{anchorId:'anchor',quote:'Unchanged'},anchorRevisionId:p.value.revisionId,body:[{text:'Comment'}]});
 const replace=await replaceBlocks(f.ctx,id,{operationKey:op(),expectedRevisionId:p.value.revisionId,blocks:[paragraph,task]});assert.equal(((await readPage(f.ctx,id)).blocks[1].content as any).completedByMemberId,'a');
 const restored=await restorePageRevision(f.ctx,id,p.value.revisionId,{operationKey:op(),expectedRevisionId:replace.value.revisionId});assert.deepEqual({...f.sql.prepare('SELECT block_id,orphaned FROM comment_threads').get()},{block_id:'block',orphaned:0});
 await archivePage(f.ctx,id,{operationKey:op(),expectedRevisionId:restored.value.revisionId,action:'archive'});await assert.rejects(archivePage(f.ctx,id,{operationKey:op(),expectedRevisionId:restored.value.revisionId,action:'restore',parentPageId:id}),{code:'TREE_CYCLE'});await archivePage(f.ctx,id,{operationKey:op(),expectedRevisionId:restored.value.revisionId,action:'restore',parentPageId:null});
 await updatePresence(f.ctx,id,'session-one',{blockId:'block',offset:4});await refreshPresence(f.ctx,id,'session-one');assert.deepEqual((await collaborationSnapshot(f.ctx,id)).presence[0].cursor,{blockId:'block',offset:4});
}finally{f.sql.close();}});
test('actual anonymous media route returns only files referenced by the published snapshot',async()=>{
 const f=fixture();try{
 const {Hono}=await import('hono');const {createPublicPagesRoutes}=await import('../../../src/core/features/publishing/routes.ts');const {ApiProblem}=await import('../../../src/core/app/problems.ts');
 const media={id:'media',blockType:'media',treePosition:'1',content:{kind:'file',source:{url:'/api/media/visible',fileId:'visible',name:'public.txt'},caption:'',alt:''}};
 const p=await createPage(f.ctx,{operationKey:op(),containerId:'c',title:'Public',lifecycle:'live',blocks:[media]});
 f.sql.prepare("INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES ('exposure',?,'local.test','public','n')").run(p.value.pageId);
 for(const id of ['visible','hidden'])f.sql.prepare('INSERT INTO files(id,workspace_id,page_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,'w',p.value.pageId,id,`${id}.txt`,'text/plain',5,'n');
 let fetched:string[]=[];const files={get:async(key:string)=>{fetched.push(key);return{body:new TextEncoder().encode(key),httpMetadata:{contentType:'text/plain'},writeHttpMetadata(h:Headers){h.set('content-type','text/plain');}};}};
 const app=new Hono();app.onError((e,c)=>e instanceof ApiProblem?c.json({code:e.code},e.status):c.json({error:e.message},500));app.route('/p',createPublicPagesRoutes());
 const hidden=await app.request('https://local.test/p/public/media/hidden',{}, {DB:f.db,FILES:files});assert.equal(hidden.status,404);assert.deepEqual(fetched,[]);
 const visible=await app.request('https://local.test/p/public/media/visible',{}, {DB:f.db,FILES:files});assert.equal(visible.status,200,await visible.clone().text());assert.equal(await visible.text(),'visible');assert.deepEqual(fetched,['visible']);
 }finally{f.sql.close();}
});
test('reader file properties authorize only typed references in the delivered published revision',async()=>{
 const f=fixture();try{
 const {serveMedia}=await import('../../../src/core/features/media/service.ts');
 const p=await createPage(f.ctx,{operationKey:op(),containerId:'c',title:'Template page',lifecycle:'live',properties:{databaseFields:{asset:['visible'],text:'hidden-text'}},blocks:[{...paragraph,content:{text:[{text:'hidden-text'}]}}]});
 const id=p.value.pageId;
 f.sql.prepare('INSERT INTO structured_page_fields VALUES (?,?)').run(id,JSON.stringify([{id:'asset',name:'Asset',type:'file',config:{},position:0},{id:'text',name:'Text',type:'text',config:{},position:1}]));
 for(const fid of ['visible','hidden-text','draft-only'])f.sql.prepare('INSERT INTO files(id,workspace_id,page_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(fid,'w',id,fid,`${fid}.txt`,'text/plain',1,'n');
 const fetched:string[]=[];const files={get:async(key:string)=>{fetched.push(key);return{body:new TextEncoder().encode(key)};}} as unknown as R2Bucket;
 const reader={...f.viewer,files};assert.equal(await(await serveMedia(reader,'visible')).text(),'visible');
 await assert.rejects(serveMedia(reader,'hidden-text'),{status:404});
 await updatePage(f.ctx,id,{operationKey:op(),expectedRevisionId:p.value.revisionId,properties:{databaseFields:{asset:['draft-only']}}});
 assert.equal(await(await serveMedia(reader,'visible')).text(),'visible');await assert.rejects(serveMedia(reader,'draft-only'),{status:404});assert.deepEqual(fetched,['visible','visible']);
 f.sql.prepare("UPDATE container_grants SET revoked_at='now' WHERE id='gb'").run();await assert.rejects(serveMedia(reader,'visible'),{status:404});
 }finally{f.sql.close();}
});
