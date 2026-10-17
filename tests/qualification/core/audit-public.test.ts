import {test,expect,vi,afterEach} from 'vitest';
import {auditFixture,assertAudit,createUlid} from './audit-support';
import {invite} from '../../../src/core/features/workspace/invitations';
afterEach(()=>vi.unstubAllGlobals());
test('ACT-002 BASE-OPS-005 public publishing and unpublishing retain attributed audit',async()=>{
 const f=await auditFixture(),p=await f.page('Public audit');
 await f.mutation('public publication','publishing.publish','POST',`/api/publishing/${p.id}`,{expectedRevisionId:await f.revision(p.id),host:'localhost:8787',slug:'audit-page'});
 await f.mutation('unpublish','publishing.revoke','POST',`/api/publishing/${p.id}`,{expectedRevisionId:await f.revision(p.id),host:'localhost:8787',slug:'audit-page',revoke:true});
});
test('ACT-002 BASE-OPS-005 invitation retains attributed audit with explicitly controlled mail transport',async()=>{
 const f=await auditFixture(),key=createUlid();let deliveries=0;
 vi.stubGlobal('fetch',async()=>{deliveries++;return Response.json({id:'test-only-mail-receipt'});});
 const config={localDevelopment:false,mailProvider:'resend' as const,sessionSecret:'test-only-qualification-secret-at-least-32-characters',appUrl:'http://localhost:8746',mailApiKey:'TEST-ONLY-NO-SEND',appName:'Slate',mailFrom:'audit@test.invalid'};
 const input={operationKey:key,email:'invited-audit@test.invalid',kind:'member' as const};await invite(f.ctx,config,input);await invite(f.ctx,config,input);
 expect(deliveries).toBe(1);await assertAudit(f.workspaceId,key,'member.invite',f.ownerId,'member invitation');
});
