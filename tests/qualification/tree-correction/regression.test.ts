import {it,expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {pageRow,revisionStatement,snapshot} from '../../../src/core/features/pages/repository';
import {listPages} from '../../../src/core/features/pages/tree';
import {compareTreePages} from '../../../src/core/app/ui/treePosition';
import {sessionFor} from '../../e2e/setup/fixtures';
import {fixture,ids,input,bystanders,databaseState,beforeBatch,env,seedMember,seedContainer,seedContainerGrant,seedPage,seedPageGrant,movePage,previewMove} from '../tree-order/fixture';

it('SHARE-002: edit cannot disclose a private subtree through the move API; full can',async()=>{
 const f=await fixture(),root=f.pages[0].pageId;
 await env.DB.batch([await revisionStatement(f.ctx,root,f.pages[0].workingRevisionId,await snapshot(f.ctx,await pageRow(f.ctx,root)))]);
 await env.DB.prepare('DELETE FROM container_owners WHERE container_id=?').bind(f.containerId).run();
 await env.DB.prepare("UPDATE members SET role='member' WHERE id=?").bind(f.memberId).run();f.ctx.actor.role='member';
 const viewer=await seedMember(f.workspaceId,{role:'member',email:crypto.randomUUID()+'@test.invalid',displayName:'Viewer'});
 const destination=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'open'});
 await seedContainerGrant(destination.containerId,{principalKind:'workspace',principalId:f.workspaceId,level:'edit'});
 const api=createApi(),editorCookie=await sessionFor(f.memberId),viewerCookie=await sessionFor(viewer.memberId);
 const get=()=>api.request('https://slate.example/api/pages/'+root,{headers:{cookie:viewerCookie}},env);
 const post=(path:string,body:unknown)=>api.request('https://slate.example/api/pages/'+root+'/'+path,{method:'POST',headers:{cookie:editorCookie,'content-type':'application/json'},body:JSON.stringify(body)},env);
 expect((await get()).status).toBe(404);
 const placement={containerId:destination.containerId,atEnd:true};
 const previewResponse=await post('move-preview',placement);
 // A review may be available to editors, but it supplies no access-change authority.
 if(previewResponse.status===200){const preview=await previewResponse.json() as object;expect((await post('move',{...placement,...preview,expectedRevisionId:f.pages[0].revisionId,operationKey:crypto.randomUUID()})).status).toBe(404);}else expect(previewResponse.status).toBe(404);
 expect((await get()).status).toBe(404);
 expect((await env.DB.prepare('SELECT container_id FROM pages WHERE id=?').bind(root).first<{container_id:string}>())!.container_id).toBe(f.containerId);
 await seedPageGrant(root,{principalKind:'member',principalId:f.memberId,level:'full'});
 const reviewed=await post('move-preview',placement);expect(reviewed.status).toBe(200);
 expect((await post('move',{...placement,...await reviewed.json() as object,expectedRevisionId:f.pages[0].revisionId,operationKey:crypto.randomUUID()})).status).toBe(200);
 expect((await get()).status).toBe(200);
});

it('TREE-002: UI comparator exactly matches real SQL BINARY for scalar boundaries and ties',async()=>{
 const keys=[null,'','\u0000','\u007f','\u0080','\u07ff','\u0800','\ud7ff','\ue000','\uffff','\u{10000}','\u{10ffff}','tie','tie'];
 const f=await fixture(keys);const rows=(await env.DB.prepare('SELECT id,tree_position AS treePosition FROM pages WHERE container_id=? ORDER BY tree_position COLLATE BINARY,id COLLATE BINARY').bind(f.containerId).all<{id:string;treePosition:string|null}>()).results;
 expect([...rows].reverse().sort(compareTreePages)).toEqual(rows);
 const tieRows=(await env.DB.prepare("SELECT '\uE000' AS id, 'same' AS treePosition UNION ALL SELECT '\u{10000}', 'same' ORDER BY id COLLATE BINARY").all<{id:string;treePosition:string}>()).results;
 expect([...tieRows].reverse().sort(compareTreePages)).toEqual(tieRows);
});

it('REV-001 TREE-002: same-parent reorder preserves every descendant byte and no-op history',async()=>{
 const f=await fixture(),[root,anchor]=await ids(f.containerId);
 const child=await seedPage(f.containerId,{title:'Child',authorMemberId:f.memberId,parentPageId:root});
 const grandchild=await seedPage(f.containerId,{title:'Grandchild',authorMemberId:f.memberId,parentPageId:child.pageId});
 const prior=await bystanders([child.pageId,grandchild.pageId]);
 const keys=(await env.DB.prepare('SELECT id,tree_position FROM pages WHERE parent_page_id IS NOT NULL ORDER BY id').all()).results;
 await movePage(f.ctx,root,await input(f.ctx,root,{containerId:f.containerId,afterId:anchor}));
 expect(await bystanders([child.pageId,grandchild.pageId])).toEqual(prior);
 expect((await env.DB.prepare('SELECT id,tree_position FROM pages WHERE parent_page_id IS NOT NULL ORDER BY id').all()).results).toEqual(keys);
 const allBefore=await bystanders([root,child.pageId,grandchild.pageId]);
 expect((await movePage(f.ctx,root,await input(f.ctx,root,{containerId:f.containerId,afterId:anchor}))).receipt.unchanged).toBe(true);
 expect(await bystanders([root,child.pageId,grandchild.pageId])).toEqual(allBefore);
});

it('TREE-002: anchor revision invalidates review after preview and before batch',async()=>{
 for(const timing of ['after-preview','before-batch']){
 const f=await fixture(),[root,anchor]=await ids(f.containerId),request=await input(f.ctx,root,{containerId:f.containerId,afterId:anchor});let prior:unknown;
 const change=async()=>{await env.DB.prepare('UPDATE pages SET revision_id=? WHERE id=?').bind(crypto.randomUUID(),anchor).run();prior=await databaseState();};
 const ctx=timing==='before-batch'?beforeBatch(f.ctx,change):f.ctx;if(timing==='after-preview')await change();
 await expect(movePage(ctx,root,request)).rejects.toMatchObject({status:409});expect(await databaseState()).toEqual(prior);
 }
});

it('TREE-002 SHARE-002: hidden-only changes do not perturb the external reviewed selection',async()=>{
 const f=await fixture(['a','b','z']),[anchor,hidden,root]=await ids(f.containerId);
 await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(hidden).run();
 const placement={containerId:f.containerId,beforeId:anchor};const first=await previewMove(f.ctx,root,placement);
 await env.DB.prepare('UPDATE pages SET tree_position=?,revision_id=? WHERE id=?').bind('aa',crypto.randomUUID(),hidden).run();
 const second=await previewMove(f.ctx,root,placement);
 expect(second.orderPreviewHash).toBe(first.orderPreviewHash);expect(JSON.stringify(second)).not.toContain(hidden);
 const prior=await bystanders([hidden]);
 await movePage(f.ctx,root,{...placement,...first,expectedRevisionId:f.pages[2].revisionId,operationKey:crypto.randomUUID()});
 expect(await ids(f.containerId)).toEqual([root,anchor,hidden]);expect(await bystanders([hidden])).toEqual(prior);
});

it('TREE-002: hidden revision race is guarded in the same batch without observable hash churn',async()=>{
 const f=await fixture(),[root,anchor,hidden]=await ids(f.containerId);
 await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(hidden).run();
 const request=await input(f.ctx,root,{containerId:f.containerId,afterId:anchor});let prior:unknown;
 const raced=beforeBatch(f.ctx,async()=>{await env.DB.prepare('UPDATE pages SET revision_id=? WHERE id=?').bind(crypto.randomUUID(),hidden).run();prior=await databaseState();});
 await expect(movePage(raced,root,request)).rejects.toMatchObject({status:409});expect(await databaseState()).toEqual(prior);
});

it('SHARE-002: tree DTO supplies current effective move authority and rechecks revocation',async()=>{
 const f=await fixture(),viewer=await seedMember(f.workspaceId,{role:'member',email:crypto.randomUUID()+'@test.invalid',displayName:'Reader'});
 await seedContainerGrant(f.containerId,{principalKind:'member',principalId:viewer.memberId,level:'view'});
 const ctx={...f.ctx,actor:{...f.ctx.actor,id:viewer.memberId}};
 const pages=await listPages(ctx);expect(pages.items).toHaveLength(3);
 for(const page of pages.items)expect(page).toMatchObject({permissions:{canEdit:false,level:'view'}});
 await expect(previewMove(ctx,f.pages[0].pageId,{containerId:f.containerId,atEnd:true})).rejects.toMatchObject({status:404});
 await env.DB.prepare("UPDATE container_grants SET level='edit' WHERE principal_id=?").bind(viewer.memberId).run();
 for(const page of (await listPages(ctx)).items)expect(page).toMatchObject({permissions:{canEdit:true,level:'edit'}});
});

it('TREE-002: edit-only unchanged-audience nesting and legacy ordering remain available',async()=>{
 const f=await fixture(),[root,parent]=await ids(f.containerId);
 const child=await seedPage(f.containerId,{title:'Child',authorMemberId:f.memberId,parentPageId:root});
 const prior=await bystanders([child.pageId]);
 await movePage(f.ctx,root,await input(f.ctx,root,{containerId:f.containerId,parentPageId:parent,atEnd:true}));
 expect(await ids(f.containerId,parent)).toEqual([root]);expect(await bystanders([child.pageId])).toEqual(prior);
 const legacy={containerId:f.containerId,parentPageId:parent,treePosition:'legacy'};
 await movePage(f.ctx,root,await input(f.ctx,root,legacy));
 expect((await env.DB.prepare('SELECT tree_position FROM pages WHERE id=?').bind(root).first<{tree_position:string}>())!.tree_position).toBe('legacy');
 expect(await bystanders([child.pageId])).toEqual(prior);
});

it('SHARE-002 TREE-002: full-authority cross-container movement changes only the actual subtree and preserves its edges',async()=>{
 const f=await fixture(),root=f.pages[0].pageId,child=await seedPage(f.containerId,{title:'Child',authorMemberId:f.memberId,parentPageId:root});
 for(const id of [root,child.pageId])await seedPageGrant(id,{principalKind:'member',principalId:f.memberId,level:'full'});
 const dest=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'closed'});
 const parent=await seedPage(dest.containerId,{title:'Destination parent',authorMemberId:f.memberId});await seedPageGrant(parent.pageId,{principalKind:'member',principalId:f.memberId,level:'full'});
 const bystanderIds=[parent.pageId,...f.pages.slice(1).map(p=>p.pageId)],prior=await bystanders(bystanderIds);
 await movePage(f.ctx,root,await input(f.ctx,root,{containerId:dest.containerId,parentPageId:parent.pageId,atEnd:true}));
 expect(await ids(dest.containerId,parent.pageId)).toEqual([root]);expect(await ids(dest.containerId,root)).toEqual([child.pageId]);expect(await bystanders(bystanderIds)).toEqual(prior);
 const rows=(await env.DB.prepare("SELECT page_id,kind FROM content_events WHERE kind='moved' AND page_id IN (?,?) ORDER BY page_id").bind(root,child.pageId).all()).results;
 expect(rows).toEqual([root,child.pageId].sort().map(page_id=>({page_id,kind:'moved'})));
});

it('SHARE-002: full authority on the root does not authorize a child audience change',async()=>{
 const f=await fixture(),root=f.pages[0].pageId,child=await seedPage(f.containerId,{title:'Child',authorMemberId:f.memberId,parentPageId:root,accessInheritance:'restricted'});
 await seedPageGrant(root,{principalKind:'member',principalId:f.memberId,level:'full'});
 await seedPageGrant(child.pageId,{principalKind:'member',principalId:f.memberId,level:'edit'});
 // A container-bound direct grant changes audience even when inheritance is restricted.
 const member=await seedMember(f.workspaceId,{role:'member',email:crypto.randomUUID()+'@test.invalid',displayName:'Container member'});
 const dest=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'closed'});
 await seedPageGrant(child.pageId,{principalKind:'container',principalId:dest.containerId,level:'view'});
 await env.DB.prepare('INSERT INTO container_members(container_id,member_id,created_at) VALUES(?,?,?)').bind(dest.containerId,member.memberId,f.ctx.now).run();
 const before=await databaseState();await expect(previewMove(f.ctx,root,{containerId:dest.containerId,atEnd:true})).rejects.toMatchObject({status:404});expect(await databaseState()).toEqual(before);
});

it('WEB-001 SHARE-002: moving an existing exposure across anonymous vetoes also requires full access',async()=>{
 const f=await fixture(),root=f.pages[0].pageId;
 await env.DB.batch([await revisionStatement(f.ctx,root,f.pages[0].workingRevisionId,await snapshot(f.ctx,await pageRow(f.ctx,root)))]);
 await env.DB.prepare('UPDATE pages SET published_revision_id=working_revision_id WHERE id=?').bind(root).run();
 await env.DB.prepare("UPDATE containers SET anonymous_access='forbidden' WHERE id=?").bind(f.containerId).run();
 await env.DB.prepare('INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),root,'test.invalid','page',f.ctx.now).run();
 const dest=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'open'});
 await seedContainerGrant(dest.containerId,{principalKind:'member',principalId:f.memberId,level:'edit'});
 const placement={containerId:dest.containerId,atEnd:true as const},before=await databaseState();
 await expect(previewMove(f.ctx,root,placement)).rejects.toMatchObject({status:404});expect(await databaseState()).toEqual(before);
 await seedPageGrant(root,{principalKind:'member',principalId:f.memberId,level:'full'});
 const reviewed=await input(f.ctx,root,placement);expect(reviewed.changes).toContainEqual({pageId:root,memberId:null,before:null,after:'view'});
 await movePage(f.ctx,root,reviewed);expect(await ids(dest.containerId)).toEqual([root]);
});

it('SHARE-002: full authority is rechecked after preview and before batch against exact reviewed disclosure',async()=>{
 for(const timing of ['after-preview','before-batch']){
 const f=await fixture(),root=f.pages[0].pageId;
 await seedMember(f.workspaceId,{role:'member',email:crypto.randomUUID()+'@test.invalid',displayName:'New audience'});
 await seedPageGrant(root,{principalKind:'member',principalId:f.memberId,level:'full'});
 const dest=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'open'});
 await seedContainerGrant(dest.containerId,{principalKind:'workspace',principalId:f.workspaceId,level:'view'});
 const request=await input(f.ctx,root,{containerId:dest.containerId,atEnd:true});let prior:unknown;
 const revoke=async()=>{await env.DB.prepare('UPDATE page_grants SET revoked_at=? WHERE page_id=?').bind(f.ctx.now,root).run();prior=await databaseState();};
 const ctx=timing==='before-batch'?beforeBatch(f.ctx,revoke):f.ctx;if(timing==='after-preview')await revoke();
 await expect(movePage(ctx,root,request)).rejects.toMatchObject({status:timing==='before-batch'?409:404});expect(await databaseState()).toEqual(prior);
 }
});

it('WEB-001 SHARE-002: signed-in public links changing in either direction require full while anonymous is forbidden',async()=>{
 for(const linkAccess of ['allowed','forbidden']){
 const f=await fixture(),root=f.pages[0].pageId;
 await env.DB.batch([await revisionStatement(f.ctx,root,f.pages[0].workingRevisionId,await snapshot(f.ctx,await pageRow(f.ctx,root)))]);
 await env.DB.prepare('UPDATE pages SET published_revision_id=working_revision_id WHERE id=?').bind(root).run();
 await env.DB.prepare("UPDATE containers SET public_link_access=?,anonymous_access='forbidden' WHERE id=?").bind(linkAccess,f.containerId).run();
 await env.DB.prepare('INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),root,'test.invalid',crypto.randomUUID(),f.ctx.now).run();
 const dest=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'open'});
 const next=linkAccess==='allowed'?'forbidden':'allowed';
 await env.DB.prepare("UPDATE containers SET public_link_access=?,anonymous_access='forbidden' WHERE id=?").bind(next,dest.containerId).run();
 await seedContainerGrant(dest.containerId,{principalKind:'member',principalId:f.memberId,level:'edit'});
 const placement={containerId:dest.containerId,atEnd:true as const},before=await databaseState();
 await expect(previewMove(f.ctx,root,placement)).rejects.toMatchObject({status:404});expect(await databaseState()).toEqual(before);
 await seedPageGrant(root,{principalKind:'member',principalId:f.memberId,level:'full'});
 const reviewed=await input(f.ctx,root,placement);
 expect(reviewed.changes).toEqual([{pageId:root,memberId:null,audience:'public-link',before:linkAccess==='allowed'?'view':null,after:next==='allowed'?'view':null}]);
 await movePage(f.ctx,root,reviewed);expect(await ids(dest.containerId)).toEqual([root]);
 }
});
