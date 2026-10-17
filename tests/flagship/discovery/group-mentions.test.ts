import {env} from 'cloudflare:test';
import {beforeEach,expect,test} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import seed from '../../../seed.json';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../../e2e/setup/fixtures';
beforeEach(resetDeployment);

test('BLOCK-020 — group mentions preview and notify only readers once, with owner-controlled administrator bounds',async()=>{
 const api=createApi(),origin='https://slate.test',key=()=>crypto.randomUUID();
 const {workspaceId}=await seedWorkspace();
 const owner=await seedMember(workspaceId,{role:'owner',email:'owner@example.test',displayName:'Owner'});
 const members=await Promise.all(Array.from({length:4},(_,index)=>seedMember(workspaceId,{role:'member',email:`member-${index}@example.test`,displayName:`Member ${index}`})));
 const cookies=new Map(await Promise.all([owner,...members].map(async m=>[m.memberId,await sessionFor(m.memberId,{freshProof:true})] as const)));
 async function request(actor:string,method:string,path:string,body?:unknown){const r=await api.request(origin+path,{method,headers:{cookie:cookies.get(actor)!,'content-type':'application/json',origin},body:body===undefined?undefined:JSON.stringify(body)},env);return {status:r.status,body:await r.json<any>()};}
 async function ok(actor:string,method:string,path:string,body?:unknown){const r=await request(actor,method,path,body);expect(r.status,`${method} ${path}: ${JSON.stringify(r.body)}`).toBe(200);return r.body;}
 const actor=owner.memberId,editor=members[0]!.memberId;
 const {containerId}=await seedContainer(workspaceId,{ownerMemberId:actor,visibility:'closed'});
 await seedContainerGrant(containerId,{principalKind:'member',principalId:actor,level:'full'});
 for(const member of members.slice(0,3))await seedContainerGrant(containerId,{principalKind:'member',principalId:member.memberId,level:'edit'});
 const group=(await ok(actor,'POST','/api/groups',{operationKey:key(),name:'Launch team',memberIds:members.map(m=>m.memberId)})).value.id;
 const span={text:'Launch team',mention:{kind:'group',id:group,label:'Wrong submitted label'}};
 const page=(await ok(actor,'POST','/api/pages',{operationKey:key(),containerId,title:'Launch readiness'})).value.pageId;
 const preview=await ok(actor,'POST',`/api/pages/${page}/mention-preview`,{content:[span,span]});
 expect(preview).toEqual({count:3,excludedCount:1});
 const commentInput={operationKey:key(),body:[span,span]};
 const comment=await ok(actor,'POST',`/api/comments/page/${page}`,commentInput);
 expect((await ok(actor,'GET',`/api/comments/page/${page}`)).comments[0].body[0].mention.label).toBe('Launch team');
 await ok(actor,'POST',`/api/comments/page/${page}`,commentInput);
 const groupRow=(await ok(actor,'GET','/api/groups')).items.find((item:any)=>item.id===group);
 await ok(actor,'POST','/api/groups',{operationKey:key(),id:group,expectedRevisionId:groupRow.revisionId,name:'Release team',memberIds:members.map(m=>m.memberId)});
 expect((await ok(actor,'GET',`/api/comments/page/${page}`)).comments[0].body[0].mention.label).toBe('Release team');
 for(const [index,member] of members.entries()){
   const notices=(await ok(member.memberId,'GET','/api/notifications')).items.filter((n:any)=>n.event==='mention');
   expect(notices).toHaveLength(index<3?1:0);
 }
 await ok(actor,'PATCH',`/api/comments/${comment.value.id}`,{operationKey:key(),expectedRevisionId:comment.value.revisionId,body:[span,{text:'Please review.'}]});
 expect((await ok(editor,'GET','/api/notifications')).items.filter((n:any)=>n.event==='mention')).toHaveLength(1);
 // Page structure insertion and single-block autosave have the same group semantics.
 let doc=await ok(actor,'GET',`/api/pages/${page}`);
 const blockId=key();
 await ok(actor,'PUT',`/api/pages/${page}/blocks`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,blocks:[{id:blockId,blockType:'paragraph',content:{text:[span]},treePosition:'a'}]});
 expect((await ok(editor,'GET','/api/notifications')).items.filter((n:any)=>n.event==='mention')).toHaveLength(2);
 doc=await ok(actor,'GET',`/api/pages/${page}`);
 await ok(actor,'PATCH',`/api/pages/${page}/blocks/${blockId}`,{operationKey:key(),expectedRevisionId:doc.blocks[0].revisionId,content:{text:[span,{text:'Updated wording'}]}});
 expect((await ok(editor,'GET','/api/notifications')).items.filter((n:any)=>n.event==='mention')).toHaveLength(2);
 // Bounds use the whole active group, including members without page access.
 const extra=await Promise.all(Array.from({length:seed.limits.groupMentionSize+1},(_,index)=>seedMember(workspaceId,{role:'member',email:`large-${index}@example.test`,displayName:`Large ${index}`})));
 const large=(await ok(actor,'POST','/api/groups',{operationKey:key(),name:'Everyone',memberIds:extra.map(m=>m.memberId)})).value.id;
 const content=[{text:'Everyone',mention:{kind:'group',id:large,label:'Everyone'}}];
 expect((await request(editor,'POST',`/api/pages/${page}/mention-preview`,{content})).body.code).toBe('GROUP_MENTION_LIMIT');
 expect((await request(editor,'POST',`/api/comments/page/${page}`,{operationKey:key(),body:content})).status).toBe(403);
 doc=await ok(editor,'GET',`/api/pages/${page}`);
 expect((await request(editor,'PATCH',`/api/pages/${page}/blocks/${blockId}`,{operationKey:key(),expectedRevisionId:doc.blocks[0].revisionId,content:{text:content}})).status).toBe(403);
 expect((await request(editor,'PUT',`/api/pages/${page}/blocks`,{operationKey:key(),expectedRevisionId:doc.page.revisionId,blocks:[{id:blockId,blockType:'paragraph',treePosition:'a',content:{text:content}}]})).status).toBe(403);
 expect((await request(editor,'POST','/api/pages',{operationKey:key(),containerId,title:'Bypass',blocks:[{id:key(),blockType:'paragraph',treePosition:'a',content:{text:content}}]})).status).toBe(403);
 expect((await ok(actor,'POST',`/api/pages/${page}/mention-preview`,{content})).count).toBe(0);
 const config=await ok(actor,'GET','/api/workspace/mention-configuration');
 expect((await request(editor,'PUT','/api/workspace/mention-configuration',{operationKey:key(),expectedRevisionId:config.revisionId,restrictLargeGroups:false})).status).toBe(403);
 await ok(actor,'PUT','/api/workspace/mention-configuration',{operationKey:key(),expectedRevisionId:config.revisionId,restrictLargeGroups:false});
 await ok(editor,'POST',`/api/comments/page/${page}`,{operationKey:key(),body:content});
 // Removed access is reflected in the next preview and delivery, even after the group was selected.
 await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE container_id=? AND principal_id=?').bind(new Date().toISOString(),containerId,members[2]!.memberId).run();
 expect(await ok(actor,'POST',`/api/pages/${page}/mention-preview`,{content:[span]})).toEqual({count:2,excludedCount:2});
 await ok(actor,'POST',`/api/comments/page/${page}`,{operationKey:key(),body:[span]});
 expect((await ok(members[2]!.memberId,'GET','/api/notifications')).items).toEqual([]);
 expect((await request(actor,'POST',`/api/comments/page/${page}`,{operationKey:key(),body:[{text:'Missing',mention:{kind:'group',id:'missing',label:'Missing'}}]})).body.code).toBe('UNKNOWN_MENTION_GROUP');
});
