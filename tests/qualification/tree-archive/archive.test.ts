import {it,expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {sessionFor} from '../../e2e/setup/fixtures';
import {treeFixture,rows,env,input,previewMove,movePage,beforeBatch,databaseState} from './fixture';

for(const target of ['root','child'] as const)for(const timing of ['before-preview','after-preview','before-batch'] as const)it(`ARCH-002 ARCH-003: actual ${target} archive ${timing} refuses cross-container tree writes atomically`,async()=>{
 const f=await treeFixture(),placement={containerId:f.destination,atEnd:true as const};
 const request=await input(f.ctx,f.root,placement),beforeRows=await rows([f.root,f.child]);let winner:unknown;
 const archive=async()=>{await f.archive(f[target]);winner=await databaseState();};
 if(timing!=='before-batch')await archive();
 if(timing==='before-preview')await expect(previewMove(f.ctx,f.root,placement)).rejects.toMatchObject({status:409,code:'PAGE_READ_ONLY'});
 await expect(movePage(timing==='before-batch'?beforeBatch(f.ctx,archive):f.ctx,f.root,request)).rejects.toMatchObject({status:409,...(timing==='before-batch'?{code:'REVISION_CONFLICT'}:{code:'PAGE_READ_ONLY'})});
 expect(await databaseState()).toEqual(winner);
 const after=await rows([f.root,f.child]);
 for(let i=0;i<after.length;i++){expect(after[i].revisions).toEqual(beforeRows[i].revisions);expect(after[i].page).toMatchObject({container_id:f.containerId,revision_id:(beforeRows[i].page as any).revision_id});expect(after[i].events.filter((e:any)=>e.kind==='moved')).toEqual([]);}
});

for(const target of ['root','child'] as const)it(`ARCH-002: same-container root reorder with archived ${target} obeys write scope`,async()=>{
 const f=await treeFixture();await f.archive(f[target]);const prior=await rows([f.child]),placement={containerId:f.containerId,atEnd:true as const};
 if(target==='root'){const state=await databaseState();await expect(previewMove(f.ctx,f.root,placement)).rejects.toMatchObject({code:'PAGE_READ_ONLY'});expect(await databaseState()).toEqual(state);}
 else {await movePage(f.ctx,f.root,await input(f.ctx,f.root,placement));expect(await rows([f.child])).toEqual(prior);}
});

it('ARCH-002 TREE-002: archived descendant remains byte-identical through same-container reparent and no-op',async()=>{
 const f=await treeFixture();await f.archive(f.child);const prior=await rows([f.child]);
 const placement={containerId:f.containerId,parentPageId:f.pages[1].pageId,atEnd:true as const};
 await movePage(f.ctx,f.root,await input(f.ctx,f.root,placement));
 const root=await rows([f.root]);expect((await movePage(f.ctx,f.root,await input(f.ctx,f.root,placement))).receipt.unchanged).toBe(true);
 expect(await rows([f.root])).toEqual(root);expect(await rows([f.child])).toEqual(prior);
});

it('ARCH-002: receipt replay after root archive rechecks liveness, then restore allows replay without mutation',async()=>{
 const f=await treeFixture(),request=await input(f.ctx,f.root,{containerId:f.destination,atEnd:true});
 const result=await movePage(f.ctx,f.root,request);await f.archive(f.root);const archived=await databaseState();
 await expect(movePage(f.ctx,f.root,request)).rejects.toMatchObject({code:'PAGE_READ_ONLY'});expect(await databaseState()).toEqual(archived);
 await f.archive(f.root,'restore');const restored=await databaseState();expect(await movePage(f.ctx,f.root,request)).toEqual(result);expect(await databaseState()).toEqual(restored);
});

it('ARCH-002: replay with unchanged archived child returns receipt without rewriting it',async()=>{
 const f=await treeFixture(),request=await input(f.ctx,f.root,{containerId:f.destination,atEnd:true});const result=await movePage(f.ctx,f.root,request);
 await f.archive(f.child);const archived=await databaseState();expect(await movePage(f.ctx,f.root,request)).toEqual(result);expect(await databaseState()).toEqual(archived);
});

it('ARCH-003 TREE-002: restored subtree supports unchanged-audience edit-only cross-container move',async()=>{
 const f=await treeFixture();await f.archive(f.root);await f.archive(f.root,'restore');
 await env.DB.prepare('DELETE FROM container_owners WHERE member_id=?').bind(f.memberId).run();
 await env.DB.prepare("UPDATE members SET role='member' WHERE id=?").bind(f.memberId).run();f.ctx.actor.role='member';
 const request=await input(f.ctx,f.root,{containerId:f.destination,atEnd:true});expect(request.changes).toEqual([]);
 await movePage(f.ctx,f.root,request);for(const row of await rows([f.root,f.child]))expect(row.page).toMatchObject({container_id:f.destination,archived_at:null});
});

for(const target of ['root','child'] as const)for(const timing of ['after-preview','before-batch'] as const)it(`ARCH-003: actual ${target} trash ${timing} preserves concurrent winner`,async()=>{
 const f=await treeFixture(),request=await input(f.ctx,f.root,{containerId:f.destination,atEnd:true});let winner:unknown;
 const trash=async()=>{await f.archive(f[target],'trash');winner=await databaseState();};
 if(timing==='after-preview')await trash();
 await expect(movePage(timing==='before-batch'?beforeBatch(f.ctx,trash):f.ctx,f.root,request)).rejects.toMatchObject({status:timing==='before-batch'?409:404});expect(await databaseState()).toEqual(winner);
});

for(const target of ['root','child'] as const)it(`TREE-002 ARCH-003: ${target} deletion before batch cannot be overwritten`,async()=>{
 const f=await treeFixture(),request=await input(f.ctx,f.root,{containerId:f.destination,atEnd:true});let winner:unknown;
 const ctx=beforeBatch(f.ctx,async()=>{await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(f.ctx.now,f[target]).run();winner=await databaseState();});
 await expect(movePage(ctx,f.root,request)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await databaseState()).toEqual(winner);
});

for(const lifecycle of ['draft','scheduled','live-with-unpublished-changes'])it(`ARCH-002 TREE-002: writable ${lifecycle} follows existing liveness semantics`,async()=>{
 const f=await treeFixture();await env.DB.prepare('UPDATE pages SET lifecycle=? WHERE id IN (?,?)').bind(lifecycle,f.root,f.child).run();
 await movePage(f.ctx,f.root,await input(f.ctx,f.root,{containerId:f.destination,atEnd:true}));for(const row of await rows([f.root,f.child]))expect(row.page).toMatchObject({container_id:f.destination,lifecycle});
});

it('ARCH-002: ordering maintenance cannot renormalize archived siblings',async()=>{
 const f=await treeFixture(),anchor=f.pages[1].pageId;
 await f.archive(f.pages[2].pageId);await env.DB.prepare("UPDATE pages SET tree_position='' WHERE id IN (?,?)").bind(anchor,f.pages[2].pageId).run();
 const before=await databaseState();await expect(previewMove(f.ctx,f.root,{containerId:f.containerId,beforeId:anchor})).rejects.toMatchObject({code:'PAGE_READ_ONLY'});expect(await databaseState()).toEqual(before);
});

for(const target of ['root','child'] as const)it(`ARCH-002 ARCH-003: actual HTTP ${target} archive rejects preview and stale confirmation without state changes`,async()=>{
 const f=await treeFixture(),api=createApi(),cookie=await sessionFor(f.memberId),placement={containerId:f.destination,atEnd:true};
 const post=(path:string,body:unknown)=>api.request('https://slate.example/api/'+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)},env);
 const preview=await post(`pages/${f.root}/move-preview`,placement);expect(preview.status).toBe(200);
 const reviewed=await preview.json() as object;
 const archived=await post(`archive/${f[target]}`,{action:'archive',operationKey:crypto.randomUUID(),expectedRevisionId:(await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(f[target]).first<any>()).revision_id});expect(archived.status).toBe(200);
 const before=await databaseState();expect((await post(`pages/${f.root}/move-preview`,placement)).status).toBe(409);
 expect((await post(`pages/${f.root}/move`,{...placement,...reviewed,operationKey:crypto.randomUUID(),expectedRevisionId:f.pages[0].revisionId})).status).toBe(409);
 const after=await databaseState();
 // HTTP admission counts each attempted write, including refused requests.
 expect(after.request_limits).not.toEqual(before.request_limits);
 delete before.request_limits;delete after.request_limits;expect(after).toEqual(before);
});

it('ARCH-002 TREE-002: ordinary placement leaves an archived sibling untouched',async()=>{
 const f=await treeFixture();await f.archive(f.pages[2].pageId);const archived=await rows([f.pages[2].pageId]);
 await movePage(f.ctx,f.root,await input(f.ctx,f.root,{containerId:f.containerId,afterId:f.pages[1].pageId}));
 expect(await rows([f.pages[2].pageId])).toEqual(archived);
});

it('ARCH-002 TREE-002: archive during order maintenance rolls back all tree effects',async()=>{
 const f=await treeFixture();await env.DB.prepare("UPDATE pages SET tree_position='' WHERE id IN (?,?)").bind(f.pages[1].pageId,f.pages[2].pageId).run();
 const request=await input(f.ctx,f.root,{containerId:f.containerId,beforeId:f.pages[1].pageId});let winner:unknown;
 const ctx=beforeBatch(f.ctx,async()=>{await f.archive(f.pages[2].pageId);winner=await databaseState();});
 await expect(movePage(ctx,f.root,request)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await databaseState()).toEqual(winner);
});

it('ARCH-002 TREE-002: legacy placement obeys actual archive without relying on order hash',async()=>{
 const f=await treeFixture(),placement={containerId:f.destination,treePosition:'legacy-move'},request=await input(f.ctx,f.root,placement);
 await f.archive(f.child);const winner=await databaseState();
 await expect(previewMove(f.ctx,f.root,placement)).rejects.toMatchObject({code:'PAGE_READ_ONLY'});
 await expect(movePage(f.ctx,f.root,request)).rejects.toMatchObject({code:'PAGE_READ_ONLY'});expect(await databaseState()).toEqual(winner);
});
