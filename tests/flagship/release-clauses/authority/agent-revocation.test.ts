import {env} from 'cloudflare:test';
import {test,expect,afterEach,vi} from 'vitest';
import {fixture,transport,refuseNetwork,effectFixture,effects,receipts} from './fixture';
import {startRun} from '../../../../src/core/features/runs/service';
import {issueAgentCredential,revokeAgentCredential} from '../../../../src/core/features/external-agent/credentials';
import {saveGrant} from '../../../../src/core/features/sharing/grants';
import {revokeGrant} from '../../../../src/core/features/effects/grants';
import {prepareEffect} from '../../../../src/core/features/effects/service';
afterEach(()=>vi.unstubAllGlobals());
test('AGENT-001 — exact credential scope gates REST and MCP control replay and current revocation',async()=>{
 const calls=refuseNetwork(),f=await fixture(),api=await transport(f),run=await startRun(f.context(),f.ask,{apiKey:'test-only'});
 const credential=await issueAgentCredential(f.context(),{operationKey:'control-agent',subjectId:f.owner,expiresAt:'2099-01-01T00:00:00.000Z',scope:{tools:['run_status','pause_run','resume_run','cancel_run'],sourceIds:[f.page.pageId],audience:[f.owner,f.reader],grantIds:[]}}),token=credential.token!;
 expect((await api.mcp(token,'run_status',{id:run.value.id})).value.id).toBe(run.value.id);
 for(const [label,sourceIds,audience] of [['source', ['ungranted-source'],[f.owner,f.reader]],['audience',[f.page.pageId],[f.owner]]] as const){
  const restricted=await issueAgentCredential(f.context(),{operationKey:'control-'+label+'-scope',subjectId:f.owner,expiresAt:'2099-01-01T00:00:00.000Z',scope:{tools:['run_status'],sourceIds:[...sourceIds],audience:[...audience],grantIds:[]}});
  const denied=await api.mcp(restricted.token!,'run_status',{id:run.value.id});expect(denied.value.code).toBe('AGENT_SCOPE');expect(JSON.stringify(denied.value)).not.toContain(f.ask.question);
 }
 const pause={operationKey:'pause-exact',expectedRevisionId:run.value.revisionId};
 const rest=await api.request(`/api/runs/${run.value.id}/control`,{...pause,action:'pause'});expect(rest.status).toBe(200);
 const replay=await api.mcp(token,'pause_run',{...pause,id:run.value.id});expect(replay.value).toEqual(rest.body);
 expect(await env.DB.prepare("SELECT count(*) n FROM operation_receipts WHERE workspace_id=? AND operation_key='pause-exact'").bind(f.workspaceId).first<number>('n')).toBe(1);
 const wrong=await api.mcp(token,'pause_run',{...pause,id:run.value.id,reason:'Changed body'});expect(wrong.value.code).toBe('OPERATION_KEY_CONFLICT');
 const resumed=await api.mcp(token,'resume_run',{id:run.value.id,operationKey:'resume-exact',expectedRevisionId:rest.body.value.revisionId});expect(resumed.body.result.isError).not.toBe(true);expect(resumed.value.value.status).toBe('queued');
 const narrow=await issueAgentCredential(f.context(),{operationKey:'control-narrow',subjectId:f.owner,expiresAt:'2099-01-01T00:00:00.000Z',scope:{tools:['run_status'],sourceIds:[f.page.pageId],audience:[f.owner,f.reader],grantIds:[]}});
 expect((await api.mcp(narrow.token!,'cancel_run',{id:run.value.id,operationKey:'forbidden-stop',expectedRevisionId:resumed.value.value.revisionId})).value.code).toBe('AGENT_SCOPE');
 expect((await api.request('/api/pages/'+f.page.pageId,undefined,token)).status).toBe(401);
 expect((await api.mcp(token,'send_customer_email',{})).value.code).toBe('UNKNOWN_TOOL');
 const stopped=await api.mcp(token,'cancel_run',{id:run.value.id,operationKey:'stop-exact',expectedRevisionId:resumed.value.value.revisionId});expect(stopped.value.value.status).toBe('cancelled');
 await revokeAgentCredential(f.context(),{id:credential.value.id,operationKey:'revoke-control-agent'});
 const before=await receipts(f.workspaceId),row=await env.DB.prepare('SELECT * FROM intelligence_runs WHERE id=?').bind(run.value.id).first();
 for(const name of ['run_status','pause_run']){const denied=await api.mcp(token,name,name==='run_status'?{id:run.value.id}:{id:run.value.id,operationKey:'after-revoke',expectedRevisionId:stopped.value.value.revisionId});expect(denied.status).toBe(401);expect(JSON.stringify(denied.body)).not.toContain(f.ask.question);}
 expect(await receipts(f.workspaceId)).toEqual(before);expect(await env.DB.prepare('SELECT * FROM intelligence_runs WHERE id=?').bind(run.value.id).first()).toEqual(row);expect(calls).toEqual([]);
});
test('AGENT-001 — a valid credential loses status and mutation disclosure when the source audience loses access',async()=>{
 const calls=refuseNetwork(),f=await fixture(),api=await transport(f),run=await startRun(f.context(),f.ask,{apiKey:'test-only'});
 const credential=await issueAgentCredential(f.context(),{operationKey:'source-agent',subjectId:f.owner,expiresAt:'2099-01-01T00:00:00.000Z',scope:{tools:['run_status','pause_run'],sourceIds:[f.page.pageId],audience:[f.owner,f.reader],grantIds:[]}});
 expect((await api.mcp(credential.token!,'run_status',{id:run.value.id})).value.id).toBe(run.value.id);
 await saveGrant(f.context(),{operationKey:'source-reader-revoked',id:f.readerGrant,targetKind:'page',targetId:f.page.pageId,principalKind:'member',principalId:f.reader,level:'view',revoke:true});
 const before=await receipts(f.workspaceId),row=await env.DB.prepare('SELECT * FROM intelligence_runs WHERE id=?').bind(run.value.id).first();
 for(const name of ['run_status','pause_run']){const r=await api.mcp(credential.token!,name,name==='run_status'?{id:run.value.id}:{id:run.value.id,operationKey:'revoked-source-control',expectedRevisionId:run.value.revisionId});expect(r.body.result.isError).toBe(true);expect(r.value.code).toBe('NOT_FOUND');expect(JSON.stringify(r.value)).not.toContain(f.ask.question);}
 expect(await receipts(f.workspaceId)).toEqual(before);expect(await env.DB.prepare('SELECT * FROM intelligence_runs WHERE id=?').bind(run.value.id).first()).toEqual(row);expect(calls).toEqual([]);
});
test('AGENT-001 — revoking the exact effect grant fences an admitted procedure despite a current credential',async()=>{
 const f=await effectFixture('procedure'),prepared=await prepareEffect(f.context(),f.input);
 expect((await effects(f.workspaceId))[0]).toMatchObject({id:prepared.value.id,state:'prepared'});
 const credential=await issueAgentCredential(f.context(),{operationKey:'dispatch-agent',subjectId:f.owner,expiresAt:'2099-01-01T00:00:00.000Z',scope:{tools:['dispatch_effect','run_status'],sourceIds:[f.page.pageId],audience:[f.owner,f.reader],grantIds:[f.grant.value.id]}});
 await revokeGrant(f.context(),{id:f.grant.value.id,operationKey:'revoke-exact-effect'});
 expect((await f.mcp(credential.token!,'run_status',{id:f.run.value.id})).body.result.isError).not.toBe(true);
 const before=await effects(f.workspaceId),result=await f.mcp(credential.token!,'dispatch_effect',{id:prepared.value.id});expect(result.value.code).toBe('GRANT_REQUIRED');expect(await effects(f.workspaceId)).toEqual(before);expect(before[0]).toMatchObject({state:'cancelled',receipt_json:null,dispatched_at:null});expect(f.issue.body).toBe('Unchanged target');expect(f.sends).toEqual([]);
});
