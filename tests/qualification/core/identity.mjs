import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {api,actor,rows,q,op,pageFixture} from './support.mjs';
export async function identityChecks({r,owner,check,context}){
 const member=await actor(r,'member'),guest=await actor(r,'guest',{kind:'guest'}),otherOwner=await actor(r,'other-owner',{role:'owner'});
 await check(['WORK-001','WORK-013'],'first-run-is-once',async()=>{
 assert.deepEqual((await api(r,'/api/workspace/first-run',owner)).data,{required:false,canComplete:false});
 assert.deepEqual((await api(r,'/api/workspace/first-run',member)).data,{required:false,canComplete:false});
 const repeat=await api(r,'/api/workspace/first-run',owner,{operationKey:op(),workspaceName:'Second workspace',containerName:'Second',pageTitle:'Second'});assert.notEqual(repeat.status,200);assert.equal((await rows(r,'SELECT count(*) AS n FROM workspaces'))[0].n,1);
 assert.equal((await api(r,'/api/workspace',owner,{})).status,404);
 });
 await check(['BASE-ACCESS-002','BASE-ACCESS-004'],'private-session-and-origin-matrix',async()=>{
 const expired=await actor(r,'expired',{expired:true}),revoked=await actor(r,'revoked',{revoked:true});
 for(const cookie of [undefined,expired,revoked])for(const path of ['/api/workspace','/api/members','/api/search?q=qualification']){const res=await api(r,path,cookie);assert.equal(res.status,401);assert.equal(JSON.stringify(res.data).includes('Qualification workspace'),false);}
 const doc=await api(r,'/app');assert.equal(doc.status,302);assert.match(doc.headers.get('location'),/signin/);
 const bad=await fetch(r.origin+'/api/members/current/theme',{method:'PUT',headers:{cookie:member,origin:'https://attacker.invalid','content-type':'application/json'},body:JSON.stringify({operationKey:op(),theme:'dark'})});assert.equal(bad.status,403);
 const spoof=await api(r,'/api/members/current/theme',member,{operationKey:op(),theme:'dark',memberId:'qualification-owner'},'PUT');assert.equal(spoof.status,400);
 });
 await check(['WORK-001','WORK-008','WORK-011'],'workspace-identity-owner-write-and-header',async()=>{
 const current=(await api(r,'/api/workspace',owner)).data;
 const input={operationKey:op(),expectedRevisionId:current.revisionId,name:'Qualified workspace',mark:'Q',description:'Qualification identity',guestAccess:current.guestAccess,publicLinkAccess:current.publicLinkAccess,anonymousAccess:current.anonymousAccess,policies:current.policies};
 assert.equal((await api(r,'/api/workspace',member,input,'PUT')).status,403);assert.equal((await api(r,'/api/workspace',owner,input,'PUT')).status,200);const persisted=(await api(r,'/api/workspace',owner)).data;assert.equal(persisted.name,input.name);assert.equal(persisted.mark,input.mark);
 const page=await context.newPage();try{await page.goto(r.origin+'/app');await page.getByTestId('workspace-name').waitFor();assert.equal(await page.getByTestId('workspace-name').innerText(),'Qualified workspace');}finally{await page.close();}
 });
 await check(['WORK-012'],'themes-persist-and-remain-personal',async()=>{
 for(const theme of ['light','dark','system']){assert.equal((await api(r,'/api/members/current/theme',member,{operationKey:op(),theme},'PUT')).status,200);assert.equal((await api(r,'/api/members/current',member)).data.theme,theme);assert.equal((await api(r,'/api/members/current',owner)).data.theme,'system');}
 });
 await check(['WORK-003','WORK-007','WORK-008','WORK-010'],'member-guest-and-setup-owner-boundaries',async()=>{
 assert.equal((await api(r,'/api/members/remove',member,{operationKey:op(),memberId:'guest'})).status,403);
 assert.equal((await api(r,'/api/members/remove',otherOwner,{operationKey:op(),memberId:'qualification-owner'})).status,403);
 assert.equal((await api(r,'/api/members',guest)).status,403);assert.equal((await api(r,'/api/containers',guest)).status,403);
 assert.equal((await api(r,'/api/members',owner)).data.items.some(x=>x.id==='guest'),false);
 assert.equal((await api(r,'/api/groups',member,{operationKey:op(),name:'Denied',memberIds:[]})).status,403);
 });
 await check(['WORK-009','ACT-001'],'group-membership-and-delete-preserve-personal-grants',async()=>{
 const container=await pageFixture(r,'group-secret',{restricted:true});
 const created=await api(r,'/api/groups',owner,{operationKey:op(),name:'Qualification group',memberIds:['member']});assert.equal(created.status,200);const group=created.data.value;
 assert.equal((await api(r,'/api/sharing',owner,{operationKey:op(),targetKind:'page',targetId:'group-secret',principalKind:'group',principalId:group.id,level:'view'})).status,200);
 assert.equal((await api(r,'/api/pages/group-secret',member)).status,200);
 const changed=await api(r,'/api/groups',owner,{operationKey:op(),id:group.id,expectedRevisionId:group.revisionId,name:group.name,memberIds:[]});assert.equal(changed.status,200);assert.equal((await api(r,'/api/pages/group-secret',member)).status,404);
 assert.equal((await api(r,'/api/sharing',owner,{operationKey:op(),targetKind:'page',targetId:'group-secret',principalKind:'member',principalId:'member',level:'view'})).status,200);
 assert.equal((await api(r,'/api/groups',owner,{operationKey:op(),id:group.id,expectedRevisionId:changed.data.value.revisionId,name:group.name,memberIds:[],remove:true})).status,200);assert.equal((await api(r,'/api/pages/group-secret',member)).status,200);
 assert.equal((await rows(r,`SELECT count(*) n FROM page_grants WHERE principal_kind='group' AND principal_id=${q(group.id)}`))[0].n,0);
 });
 await check(['WORK-006','BASE-ACCESS-001'],'invitation-single-use-expiry-revocation',async()=>{
 for(const state of ['valid','expired','revoked']){
 const token=randomBytes(32).toString('base64url'),digest=createHmac('sha256',r.sessionSecret).update(token).digest('hex'),now=new Date().toISOString();
 await r.sql(`INSERT INTO invitations(id,workspace_id,email,kind,token_digest,invited_by_member_id,expires_at,created_at,revoked_at) VALUES(${q('inv-'+state)},'qualification-workspace',${q(state+'-invite@test.invalid')},'member',${q(digest)},'qualification-owner',${q(state==='expired'?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z')},${q(now)},${state==='revoked'?q(now):'NULL'});`);
 // The link only shows the confirmation page; nothing is accepted and no session is set until its form is posted.
 const shown=await api(r,'/api/auth/invitation/accept?token='+token);assert.equal(shown.status,state==='valid'?200:400);assert.equal(shown.headers.get('set-cookie'),null);
 assert.equal((await rows(r,`SELECT accepted_by_member_id FROM invitations WHERE id=${q('inv-'+state)}`))[0].accepted_by_member_id,null);
 const accept=()=>fetch(r.origin+'/api/auth/invitation/accept',{method:'POST',redirect:'manual',headers:{origin:r.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(15000)});
 const accepted=await accept();assert.equal(accepted.status,state==='valid'?303:400);assert.equal(accepted.headers.getSetCookie().some(c=>c.startsWith('slate_session=')),state==='valid');
 assert.equal((await accept()).status,400);
 assert.equal((await rows(r,`SELECT count(*) n FROM invitations WHERE id=${q('inv-'+state)}`))[0].n,1);
 }
 });
 await check(['WORK-007','BASE-ACCESS-002'],'removal-revokes-session-and-grants',async()=>{
 await api(r,'/api/members/current',member);
 const personal=(await rows(r,"SELECT c.id FROM containers c JOIN container_owners o ON o.container_id=c.id WHERE c.visibility='personal' AND o.member_id='member'"))[0].id;
 const personalPage=await api(r,'/api/pages',member,{operationKey:op(),containerId:personal,title:'Private removed member page'});assert.equal(personalPage.status,200);
 await pageFixture(r,'member-owned',{owner:'member'});
 const removed=await api(r,'/api/members/remove',owner,{operationKey:op(),memberId:'member'});assert.equal(removed.status,200);assert.equal((await api(r,'/api/session',member)).status,401);
 assert.equal((await rows(r,"SELECT count(*) n FROM page_grants WHERE principal_kind='member' AND principal_id='member'"))[0].n,0);assert.equal((await rows(r,"SELECT owner_member_id FROM pages WHERE id='member-owned'"))[0].owner_member_id,null);
 assert.ok((await rows(r,"SELECT archived_at FROM containers c JOIN container_owners o ON o.container_id=c.id WHERE c.visibility='personal' AND o.member_id='member'"))[0].archived_at);
 assert.equal((await rows(r,`SELECT count(*) n FROM pages WHERE container_id=${q(personal)} AND lifecycle='archived' AND deleted_at IS NULL`))[0].n,1);
 assert.equal((await api(r,'/api/auth/logout',otherOwner,{})).status,204);assert.equal((await api(r,'/api/session',otherOwner)).status,401);
 assert.equal((await api(r,'/api/members/remove',owner,{operationKey:op(),memberId:'other-owner'})).status,200);assert.equal((await api(r,'/api/members/remove',owner,{operationKey:op(),memberId:'qualification-owner'})).status,409);
 });
 await check(['WORK-015'],'unconfigured-identity-stays-unavailable',async()=>{const cap=(await api(r,'/api/auth/capabilities')).data;assert.equal(cap.identityProvider,false);for(const path of ['/auth/oidc/identity/start','/api/auth/identity/callback'])assert.equal((await api(r,path)).status,404,`${path} has no provider behind it`);});
 return {guest};
}
