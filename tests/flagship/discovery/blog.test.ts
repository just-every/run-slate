import {env} from 'cloudflare:test';
import {beforeEach,expect,test} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {seedContainerGrant} from '../../e2e/setup/fixtures';
import {followingFixture} from './following-support';
beforeEach(resetDeployment);

test('CONT-010 — a post is a dated page that reaches followers once and lists only for its readers',async()=>{
 const f=await followingFixture();await f.watchContainer(f.editor,f.containerId,true);
 const post=(input:Record<string,unknown>,actor=f.owner)=>f.request(actor,'POST',`/api/blog/containers/${f.containerId}/posts`,{operationKey:f.key(),...input});
 const feed=async(actor:string,query:string)=>(await f.ok(actor,'GET',`/api/blog?${query}`));
 const first=(await post({title:'Quarterly update',cover:{kind:'gallery',id:'ocean'},body:'Revenue grew.\n\nHiring continues.'})).body.value.pageId;
 // Posts are pages: the same document, body and cover open through the page route.
 const doc=await f.ok(f.editor,'GET',`/api/pages/${first}`);
 expect(doc.page.title).toBe('Quarterly update');expect(doc.blocks.map((b:any)=>b.content.text[0].text)).toEqual(['Revenue grew.','Hiring continues.']);
 expect(doc.properties.cover).toEqual({kind:'gallery',id:'ocean'});
 // The follower hears of a post, once, and not also of a created page.
 expect((await f.inbox(f.editor)).map(n=>n.event)).toEqual(['post-published']);
 expect((await f.ok(f.editor,'GET','/api/navigation/following')).items.map((n:any)=>n.event)).toEqual(['post-published']);
 expect(await f.inbox(f.commenter)).toEqual([]);
 const second=(await post({title:'Office move'},f.editor)).body.value.pageId;
 await f.comment(first);
 const home=await feed(f.editor,'following=1');
 expect(home.items.map((p:any)=>[p.pageId,p.title,p.authorName,p.commentCount])).toEqual([[second,'Office move','editor',0],[first,'Quarterly update','owner',1]]);
 expect(home.items[1].cover).toEqual({kind:'gallery',id:'ocean'});expect(Date.parse(home.items[1].postedAt)).toBeLessThanOrEqual(Date.parse(home.items[0].postedAt));
 expect((await feed(f.commenter,'following=1')).items).toEqual([]);
 const space=await feed(f.commenter,`containerId=${f.containerId}`);expect(space.items.map((p:any)=>p.pageId)).toEqual([second,first]);expect(space.canPost).toBe(true);
 // A viewer reads the blog but cannot post; a member without access sees and posts nothing.
 const commenterGrant=f.grants[2]!.grantId;
 await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE id=?').bind(new Date().toISOString(),commenterGrant).run();
 expect((await feed(f.commenter,`containerId=${f.containerId}`)).items).toEqual([]);
 expect((await post({title:'No access'},f.commenter)).status).toBe(404);
 await seedContainerGrant(f.containerId,{principalKind:'member',principalId:f.commenter,level:'view'});
 const viewer=await feed(f.commenter,`containerId=${f.containerId}`);expect(viewer.items).toHaveLength(2);expect(viewer.canPost).toBe(false);
 expect((await post({title:'Viewer post'},f.commenter)).status).toBe(404);
 expect((await post({title:'  '})).status).toBe(400);
 // Under draft-then-publish a post is private until published, then followers hear of it once, as a post.
 await env.DB.prepare('INSERT INTO workspace_policies VALUES(?,?,?)').bind(f.workspaceId,JSON.stringify({'page.lifecycle.v1':'draft-then-publish'}),new Date().toISOString()).run();
 const draft=(await post({title:'Draft announcement'})).body.value.pageId;
 expect((await feed(f.owner,`containerId=${f.containerId}`)).items.map((p:any)=>p.pageId)).not.toContain(draft);
 expect((await f.inbox(f.editor)).filter(n=>n.pageId===draft)).toEqual([]);
 const draftDoc=await f.ok(f.owner,'GET',`/api/pages/${draft}`);
 await f.ok(f.owner,'POST',`/api/pages/${draft}/publish`,{operationKey:f.key(),expectedRevisionId:draftDoc.page.revisionId});
 expect((await feed(f.editor,'following=1')).items[0].pageId).toBe(draft);
 expect((await f.inbox(f.editor)).filter(n=>n.pageId===draft).map(n=>n.event)).toEqual(['post-published']);
 // Erasing a post removes its blog entry with the page.
 const row=await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(second).first<{revision_id:string}>();
 await f.ok(f.owner,'POST',`/api/archive/${second}`,{operationKey:f.key(),expectedRevisionId:row!.revision_id,action:'trash'});
 expect((await feed(f.editor,'following=1')).items.map((p:any)=>p.pageId)).not.toContain(second);
 await f.ok(f.owner,'POST',`/api/archive/${second}/permanent-delete`,{operationKey:f.key(),confirmedPageIds:[second]});
 expect(await env.DB.prepare('SELECT page_id FROM blog_posts WHERE page_id=?').bind(second).first()).toBeNull();
});
