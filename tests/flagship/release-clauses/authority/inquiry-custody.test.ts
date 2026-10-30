import {runFoldCases} from '../../fold-cases';
import {env} from 'cloudflare:test';
import {beforeEach,test,expect,afterEach,vi} from 'vitest';
import {resetDeployment} from '../../../e2e/setup/reset-deployment';
import {effectFixture,effects,receipts} from './fixture';
import {issueAgentCredential} from '../../../../src/core/features/external-agent/credentials';
import {readPage} from '../../../../src/core/features/pages/service';
afterEach(()=>vi.unstubAllGlobals());
beforeEach(resetDeployment);
test("EFFECT-002 — inquiry custody and article publication preserve separate operational authority", async () => {
  await runFoldCases([
{name:"EFFECT-002 — admitted inquiry and credentialed MCP refuse operational consent and unsupported product sends",before:async()=>{await resetDeployment();},run:async()=>{
try {

 const f=await effectFixture();
 const credential=await issueAgentCredential(f.context(),{operationKey:'custody-agent',subjectId:f.owner,expiresAt:'2099-01-01T00:00:00.000Z',scope:{tools:['prepare_effect'],sourceIds:[f.page.pageId],audience:[f.owner,f.reader],grantIds:[f.grant.value.id]}});
 expect(await env.DB.prepare('SELECT revoked_at FROM intelligence_grants WHERE id=?').bind(f.grant.value.id).first()).toEqual({revoked_at:null});
 const before={page:await readPage(f.context(),f.page.pageId),effects:await effects(f.workspaceId),receipts:await receipts(f.workspaceId),issue:{...f.issue},requests:f.requests.length,grant:await env.DB.prepare('SELECT * FROM intelligence_grants WHERE id=?').bind(f.grant.value.id).first()};
 const rest=await f.request('/api/effects',f.input);expect(rest.status).toBe(403);expect(rest.body.code).toBe('INQUIRY_IS_NOT_AUTHORITY');
 const mcp=await f.mcp(credential.token!,'prepare_effect',f.input);expect(mcp.status).toBe(200);expect(mcp.body.result.isError).toBe(true);expect(mcp.value.code).toBe('INQUIRY_IS_NOT_AUTHORITY');
 for(const operation of ['sso.activate','account.charge','happytohelp.reply.send','orbit.email.send']){
  const bad={...f.input,operation,operationKey:'unsupported-'+operation};
  const browser=await f.request('/api/effects',bad);expect(browser.status).toBe(400);
  // The adopted door validates the legacy schema before native classification or execution.
  const agent=await f.mcp(credential.token!,'prepare_effect',bad);expect(agent.status).toBe(200);expect(agent.body.result.isError).toBe(true);expect(agent.value.code).toBe('invalid_arguments');
  expect(agent.body.result._meta['com.runeditrun/decision']).toBeNull();expect(agent.body.result._meta['com.runeditrun/receipt']).toBeUndefined();
 }
 expect(await env.DB.prepare('SELECT * FROM intelligence_grants WHERE id=?').bind(f.grant.value.id).first()).toEqual(before.grant);
 expect(await effects(f.workspaceId)).toEqual(before.effects);expect(await receipts(f.workspaceId)).toEqual(before.receipts);
 expect(await readPage(f.context(),f.page.pageId)).toEqual(before.page);expect(f.issue).toEqual(before.issue);expect(f.sends).toEqual([]);expect(f.requests).toHaveLength(before.requests);

} finally {{await (vi.unstubAllGlobals());}}
}},
{name:"EFFECT-002 — article publication requires its own current audience and exact grant",before:async()=>{await resetDeployment();},run:async()=>{
try {

 const {articleFixture}=await import('./publication-fixture');
 const {issueGrant}=await import('../../../../src/core/features/effects/grants');
 const {requestHash}=await import('../../../../src/core/app/operations');
 const {publishPublicPage}=await import('../../../../src/core/features/publishing/service');
 const f=await articleFixture(),scope={operations:['happytohelp.article.update'],targets:[f.input.target],accounts:[f.input.accountId],sourceIds:[f.page.pageId],audience:[f.owner,f.reader,'public'],maxCostMicros:0,contentHash:await requestHash(f.input.content),conditions:{expectedRevision:f.input.expectedRevision,expectedAudienceRevision:f.input.expectedAudienceRevision},acceptNonAtomicProvider:false};
 const exact=await issueGrant(f.context(),{operationKey:'article-own-grant',subjectId:f.owner,kind:'effect',expiresAt:'2099-01-01T00:00:00.000Z',scope});
 const privateSource=await f.request('/api/effects',{...f.input,grantId:exact.value.id});expect(privateSource.status).toBe(403);expect(privateSource.body.code).toBe('SOURCE_AUDIENCE_DENIED');
 await publishPublicPage(f.context(),f.page.pageId,{operationKey:'article-source-published',expectedRevisionId:f.page.revisionId,host:'test.invalid',slug:f.page.pageId});
 for(const operation of ['github.issue.update','orbit.handoff.upsert']){
  const other=await issueGrant(f.context(),{operationKey:'other-product-'+operation,subjectId:f.owner,kind:'effect',expiresAt:'2099-01-01T00:00:00.000Z',scope:{...scope,operations:[operation]}});
  const denied=await f.request('/api/effects',{...f.input,grantId:other.value.id});expect(denied.status).toBe(403);expect(denied.body.code).toBe('GRANT_SCOPE_MISMATCH');
 }
 f.setAudience('audience-two');const stale=await f.request('/api/effects',{...f.input,grantId:exact.value.id});expect(stale.status).toBe(409);expect(stale.body.code).toBe('AUDIENCE_CHANGED');
 expect(await effects(f.workspaceId)).toEqual([]);f.setAudience('audience-one');
 const allowed=await f.request('/api/effects',{...f.input,grantId:exact.value.id});expect(allowed.status,JSON.stringify(allowed.body)).toBe(200);expect(allowed.body.value.state).toBe('prepared');
 expect((await effects(f.workspaceId))[0]).toMatchObject({grant_id:exact.value.id,state:'prepared',receipt_json:null,dispatched_at:null});expect(f.sends).toEqual([]);

} finally {{await (vi.unstubAllGlobals());}}
}}
  ]);
});
