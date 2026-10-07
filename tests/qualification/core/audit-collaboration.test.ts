import {test,expect} from 'vitest';
import {auditFixture,env,createUlid} from './audit-support';
test('ACT-002 BASE-OPS-005 comment create edit resolve delete all retain actor and timestamp',async()=>{
 const f=await auditFixture(),p=await f.page('Comment audit');
 const c=await f.mutation('comment creation','comments.create','POST',`/api/comments/page/${p.id}`,{body:[{text:'Audit comment'}],kind:'page'});
 const edited=await f.mutation('comment editing','comments.edit','PATCH',`/api/comments/${c.value.id}`,{expectedRevisionId:c.value.revisionId,body:[{text:'Edited audit comment'}]});
 await f.mutation('comment resolution','comments.resolve','POST',`/api/comments/thread/${c.value.threadId}/resolve`,{expectedRevisionId:edited.value.revisionId,resolved:true});
 await f.mutation('comment deletion','comments.delete','PATCH',`/api/comments/${c.value.id}`,{expectedRevisionId:edited.value.revisionId,delete:true});
});
test('ACT-002 BASE-OPS-005 grants groups external access and membership removal retain audit',async()=>{
 const f=await auditFixture(),p=await f.page('Access audit');
 const g=await f.mutation('grant creation','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:p.id,principalKind:'member',principalId:f.readerId,level:'view'});
 await f.mutation('grant revocation','sharing.grant','POST','/api/sharing',{id:g.value.id,targetKind:'page',targetId:p.id,principalKind:'member',principalId:f.readerId,level:'view',revoke:true});
 const group=await f.mutation('group creation','group.save','POST','/api/groups',{name:'Audit group',memberIds:[f.readerId]});
 const changed=await f.mutation('group modification','group.save','POST','/api/groups',{id:group.value.id,expectedRevisionId:group.value.revisionId,name:'Changed audit group',memberIds:[]});
 await f.mutation('group deletion','group.delete','POST','/api/groups',{id:group.value.id,expectedRevisionId:changed.value.revisionId,name:'Changed audit group',memberIds:[],remove:true});
 const w=(await f.request('GET','/api/workspace')).data;
 await f.mutation('external access','workspace.update','PUT','/api/workspace',{expectedRevisionId:w.revisionId,name:w.name,mark:w.mark,description:w.description,guestAccess:'forbidden',publicLinkAccess:'forbidden',anonymousAccess:'forbidden',policies:w.policies});
 await f.mutation('member removal','member.remove','POST','/api/members/remove',{memberId:f.readerId});
});
test('ACT-002 BASE-OPS-005 status and exact-revision verification retain audit',async()=>{
 const f=await auditFixture();await f.profile({'page.status.v1':'open-vocabulary'});const p=await f.page('Status audit');
 await f.mutation('status vocabulary','status.vocabulary','POST','/api/status',{key:'audit',label:'Audit',color:'#336699',requiresVerification:false});
 await f.mutation('status change','pages.status','POST',`/api/status/page/${p.id}`,{expectedRevisionId:await f.revision(p.id),statusKey:'audit'});
 await f.mutation('verification vocabulary','status.vocabulary','POST','/api/status',{key:'verified-audit',label:'Verified audit',color:'#336633',requiresVerification:true});
 const working=(await env.DB.prepare('SELECT working_revision_id FROM pages WHERE id=?').bind(p.id).first<{working_revision_id:string}>())!.working_revision_id;
 const opened=await f.request('POST',`/api/pages/${p.id}/open`,{operationKey:createUlid(),revisionId:working});expect(opened.status).toBe(200);
 await f.mutation('verification','pages.status','POST',`/api/status/page/${p.id}`,{expectedRevisionId:await f.revision(p.id),statusKey:'verified-audit',attestRevisionId:working});
});
