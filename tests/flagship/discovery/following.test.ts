import {env} from 'cloudflare:test';
import {beforeEach,expect,test} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {seedPage,seedPageGrant} from '../../e2e/setup/fixtures';
import {followingFixture} from './following-support';
beforeEach(resetDeployment);

test('PAGE-016 — authoring watches respect durable unwatch, personal overrides and workspace defaults',async()=>{
 const f=await followingFixture();
 const creator=(await f.create('Created page')).value.pageId,edited=(await f.create('Edited page')).value.pageId;
 await f.edit(edited,'Editor saved this',f.editor);
 expect((await f.ok(f.owner,'GET','/api/navigation')).watches).toContain(creator);
 expect((await f.ok(f.editor,'GET','/api/navigation')).watches).toContain(edited);
 await f.comment(creator);const discussion=await f.comment(edited);
 expect((await f.inbox(f.owner)).filter(n=>n.pageId===creator&&n.event==='comment')).toHaveLength(1);
 expect((await f.inbox(f.editor)).filter(n=>n.event==='comment')).toHaveLength(1);
 expect(await f.inbox(f.commenter)).toEqual([]);
 // PAGE-009: commenting implicitly watches; later replies and publication reach it once.
 expect((await f.ok(f.commenter,'GET','/api/navigation')).watches).toEqual(expect.arrayContaining([creator,edited]));
 await f.comment(edited,f.owner,{threadId:discussion.value.threadId,parentCommentId:discussion.value.id});
 let doc=await f.ok(f.owner,'GET',`/api/pages/${edited}`);
 await f.ok(f.owner,'POST',`/api/pages/${edited}/publish`,{operationKey:f.key(),expectedRevisionId:doc.page.revisionId});
 expect((await f.inbox(f.commenter)).map(n=>n.event).sort()).toEqual(['published','reply']);
 await f.watch(f.editor,edited,false);await f.edit(edited,'Edit after unwatch',f.editor);await f.comment(edited);
 expect((await f.ok(f.editor,'GET','/api/navigation')).watches).not.toContain(edited);
 expect((await f.inbox(f.editor)).filter(n=>n.event==='comment')).toHaveLength(1);
 await f.watch(f.commenter,edited,false);await f.comment(edited); // A later comment cannot undo the explicit stop.
 expect((await f.ok(f.commenter,'GET','/api/navigation')).watches).not.toContain(edited);
 await f.watch(f.editor,edited,true);await f.comment(edited);
 expect((await f.inbox(f.editor)).filter(n=>n.event==='comment')).toHaveLength(2);
 await f.preferences(f.editor,false);
 const unwatched=(await f.create('Personal autowatch off',f.editor)).value.pageId;
 expect((await f.ok(f.editor,'GET','/api/navigation')).watches).not.toContain(unwatched);
 expect((await f.request(f.editor,'PUT','/api/navigation/watch-configuration',{operationKey:f.key(),expectedRevisionId:null,autowatch:false})).status).toBe(403);
 const config=await f.ok(f.owner,'GET','/api/navigation/watch-configuration');
 await f.ok(f.owner,'PUT','/api/navigation/watch-configuration',{operationKey:f.key(),expectedRevisionId:config.revisionId,autowatch:false});
 const inherited=(await f.create('Workspace autowatch off',f.commenter)).value.pageId;
 expect((await f.ok(f.commenter,'GET','/api/navigation')).watches).not.toContain(inherited);
 await f.preferences(f.editor,true);
 const overridden=(await f.create('Personal autowatch on',f.editor)).value.pageId;
 expect((await f.ok(f.editor,'GET','/api/navigation')).watches).toContain(overridden);
});

test('container following delivers personal coalesced events once and rechecks lifecycle and access',async()=>{
 const f=await followingFixture();await f.watchContainer(f.editor,f.containerId,true);
 expect((await f.ok(f.owner,'GET',`/api/navigation/container-watches/${f.containerId}`)).items.map((m:any)=>m.id)).toEqual([f.editor]);
 expect((await f.request(f.commenter,'GET',`/api/navigation/container-watches/${f.containerId}`)).status).toBe(403);
 const created=await f.create('Followed page'),pageId=created.value.pageId;
 await f.edit(pageId,'First edit');await f.edit(pageId,'Same editing session');
 // Elapsed idle time is fixture clock state, rather than a delay or a second product path.
 await env.DB.prepare('UPDATE watch_edit_sessions SET last_edit_at=? WHERE page_id=?').bind(new Date(Date.now()-86400000).toISOString(),pageId).run();
 await f.edit(pageId,'New editing session');await f.watch(f.editor,pageId,true);await f.comment(pageId);
 const expected=['comment','page-created','page-edited','page-edited'];
 expect((await f.inbox(f.editor)).map(n=>n.event).sort()).toEqual(expected);
 expect((await f.ok(f.editor,'GET','/api/navigation/following')).items.map((n:any)=>n.event).sort()).toEqual(expected);
 expect((await f.ok(f.commenter,'GET','/api/navigation/following')).items).toEqual([]);
 const parent=await seedPage(f.containerId,{title:'Restricted parent',authorMemberId:f.owner,accessInheritance:'restricted'});
 await seedPageGrant(parent.pageId,{principalKind:'member',principalId:f.owner,level:'full'});
 await f.create('Unseen restricted page',f.owner,{parentPageId:parent.pageId});
 await env.DB.prepare('INSERT INTO workspace_policies VALUES(?,?,?)').bind(f.workspaceId,JSON.stringify({'page.lifecycle.v1':'draft-then-publish'}),new Date().toISOString()).run();
 const draft=(await f.create('Unseen draft')).value.pageId;
 await seedPageGrant(draft,{principalKind:'member',principalId:f.editor,level:'edit'});await f.watch(f.editor,draft,true);await f.edit(draft,'Still a draft');
 expect((await f.inbox(f.editor)).map(n=>n.event).sort()).toEqual(expected);
 expect((await env.DB.prepare("SELECT id FROM notification_outbox WHERE page_id=? AND event IN ('page-created','page-edited')").bind(draft).all()).results).toEqual([]);
 // Both the previous and the destination container are watched; the move remains one event.
 const target=(await f.ok(f.owner,'POST','/api/containers',{operationKey:f.key(),name:'Another space'})).value.id;
 await f.watch(f.editor,pageId,false);
 const move=async(containerId:string)=>{const doc=await f.ok(f.owner,'GET',`/api/pages/${pageId}`),destination={containerId,parentPageId:null};const preview=await f.ok(f.owner,'POST',`/api/pages/${pageId}/move-preview`,destination);return f.ok(f.owner,'POST',`/api/pages/${pageId}/move`,{operationKey:f.key(),expectedRevisionId:doc.page.revisionId,...destination,treePosition:'a',accessPreviewHash:preview.accessPreviewHash});};
 await move(target);expect((await f.inbox(f.editor)).filter(n=>n.event==='page-moved')).toHaveLength(1);
 await f.watchContainer(f.editor,target,true);await move(f.containerId);
 expect((await f.inbox(f.editor)).filter(n=>n.event==='page-moved')).toHaveLength(2);
 const lifecycle=async(action:string)=>{const row=await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(pageId).first<{revision_id:string}>();return f.ok(f.owner,'POST',`/api/archive/${pageId}`,{operationKey:f.key(),expectedRevisionId:row!.revision_id,action});};
 await lifecycle('archive');expect((await f.inbox(f.editor)).filter(n=>n.event==='page-archived')).toHaveLength(1);
 await lifecycle('restore');await lifecycle('trash');
 const trash=(await f.inbox(f.editor)).filter(n=>n.event==='page-trashed');expect(trash).toHaveLength(1);expect(trash[0]!.href).toBe('/app/archive');
 await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE id=?').bind(new Date().toISOString(),f.grants[1]!.grantId).run();
 expect((await f.inbox(f.editor)).filter(n=>n.pageId===pageId)).toEqual([]);
 expect((await f.ok(f.editor,'GET','/api/navigation/following')).items).toEqual([]);
 // Erasure removes the durable opt-out and edit-session state alongside the content.
 await f.ok(f.owner,'POST',`/api/archive/${pageId}/permanent-delete`,{operationKey:f.key(),confirmedPageIds:[pageId]});
 expect((await env.DB.prepare('SELECT page_id FROM watch_edit_sessions WHERE page_id=? UNION SELECT page_id FROM page_watches WHERE page_id=?').bind(pageId,pageId).all()).results).toEqual([]);
});
