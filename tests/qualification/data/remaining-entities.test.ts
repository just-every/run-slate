beforeEach(resetDeployment);
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {env} from 'cloudflare:test';
import {test,expect,beforeEach} from 'vitest';
import {forgetSource} from '../../../src/core/features/source-memory/service';
import {fixture,insert,canary} from './fixture';
test('BASE-DATA-003 explicit source erasure clears personal source identity and retained ACL',async()=>{
 const {ctx,workspaceId,owner}=await fixture(),now=ctx.now;
 await insert('federation_connections',{id:'forget-connection',workspace_id:workspaceId,member_id:owner,provider:'github',account_id:'test-account',credential_ciphertext:null,config_json:'{}',state:'connected',revision_id:'forget-connection-revision',created_at:now,updated_at:now});
 await insert('federation_sources',{id:'forget-source',workspace_id:workspaceId,connection_id:'forget-connection',remote_id:canary,revision_id:'forget-source-revision',created_at:now,updated_at:now});
 await insert('federation_revisions',{id:'forget-revision',source_id:'forget-source',remote_revision:canary,title:canary,content_hash:'test-hash',acl_json:JSON.stringify({email:canary}),observed_at:now});
 await forgetSource(ctx,{id:'forget-source',operationKey:'forget-source-operation',expectedRevisionId:'forget-source-revision'});
 expect(JSON.stringify(await env.DB.prepare('SELECT remote_id FROM federation_sources WHERE id=?').bind('forget-source').first())).not.toContain(canary);
 expect(JSON.stringify(await env.DB.prepare('SELECT remote_revision,acl_json FROM federation_revisions WHERE source_id=?').bind('forget-source').all())).not.toContain(canary);
});
