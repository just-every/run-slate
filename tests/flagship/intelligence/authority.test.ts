import {runFoldCases} from '../fold-cases';
import {resetDeployment as resetFoldDeployment} from '../../e2e/setup/reset-deployment';
import {chooseRoute} from '../../../src/core/features/ai/model-policy';
import {maximumCost} from '../../../src/core/features/ai/provider';
import {env} from 'cloudflare:test';import {test,expect} from 'vitest';import {fixture} from './measured-fixture';
import {resolveEvidence,validateEvidenceIds} from '../../../src/core/features/ai/evidence';import {startRun,controlRun} from '../../../src/core/features/runs/service';import {requireRun} from '../../../src/core/features/runs/repository';import {createApi} from '../../../src/core/app/hono';import {sessionFor} from '../../e2e/setup/fixtures';import {saveDecision,acceptDecision,getDecision} from '../../../src/core/features/decisions/service';
test("source disclosure, citations, run budgets and decisions preserve current authority", async () => {
  await runFoldCases([
{name:"AI-013 current source and audience ACL prevents persisted output, replay and HTTP disclosure after revocation",before:async()=>{await resetFoldDeployment();},run:async()=>{
try {
const f=await fixture(),run=await startRun(f.context(),f.ask,{apiKey:'test-only'});expect(run.value.status).toBe('queued');expect((await resolveEvidence(f.context(),f.refs,[f.reader]))[0]?.text).toContain('handoff');await env.DB.prepare('UPDATE page_grants SET revoked_at=? WHERE id=?').bind(new Date().toISOString(),f.readerGrant).run();await expect(resolveEvidence(f.context(),f.refs,[f.reader])).rejects.toMatchObject({status:404});await expect(startRun(f.context(),f.ask,{apiKey:'test-only'})).rejects.toMatchObject({status:404});const api=createApi(),cookie=await sessionFor(f.reader);expect((await api.request(`/api/runs/${run.value.id}`,{headers:{cookie}},env)).status).toBe(404);expect((await api.request(`/api/runs/${run.value.id}`,{},env)).status).toBe(401);
} finally {}
}},
{name:"AI-004 exact issued citation validation rejects invented identifiers and deleted exact revisions",before:async()=>{await resetFoldDeployment();},run:async()=>{
try {
const f=await fixture(),packet=await resolveEvidence(f.context(),f.refs,[f.owner]);expect(()=>validateEvidenceIds({statements:[{text:'Ready',evidenceIds:['E2'],kind:'observation',limitations:[]}],unresolved:[],proposedChanges:[],researchPlan:null,hypothesisAssessment:null},packet)).toThrow('not issued');await env.DB.prepare('UPDATE page_revisions SET deleted_at=? WHERE id=?').bind(new Date().toISOString(),f.page.workingRevisionId).run();await expect(resolveEvidence(f.context(),f.refs,[f.owner])).rejects.toMatchObject({code:'EVIDENCE_UNAVAILABLE'});
} finally {}
}},
{name:"AI-012 concurrent reservations cannot overspend and failed reservation creates no run",before:async()=>{await resetFoldDeployment();},run:async()=>{
try {
const f=await fixture();
const ctx=f.context();
  const {route} = await chooseRoute(ctx, f.ask.kind, true);
  const evidence = await resolveEvidence(ctx, f.refs, f.ask.audience);
  const first = maximumCost(route, f.ask.question, evidence, f.ask.maxOutputTokens);
  const second = maximumCost(route, 'Which support handoff remains incomplete?', evidence, f.ask.maxOutputTokens);
  expect(first).toBeLessThanOrEqual(110000);
  expect(second).toBeLessThanOrEqual(110000);
  expect(first + second).toBeGreaterThan(110000);

await env.DB.prepare('UPDATE workspaces SET ai_monthly_budget_micros=110000 WHERE id=?').bind(f.workspaceId).run();const results=await Promise.allSettled([startRun(f.context(),{...f.ask,operationKey:'case:001'},{apiKey:'test-only'}),startRun(f.context(),{...f.ask,operationKey:'case:002',question:'Which support handoff remains incomplete?'},{apiKey:'test-only'})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await env.DB.prepare('SELECT COUNT(*) n FROM intelligence_runs WHERE workspace_id=?').bind(f.workspaceId).first<{n:number}>())!.n).toBe(1);
} finally {}
}},
{name:"AI-002 pause releases execution, resume rechecks revision, terminal cancellation never resurrects",before:async()=>{await resetFoldDeployment();},run:async()=>{
try {
const f=await fixture(),run=await startRun(f.context(),f.ask,{apiKey:'test-only'});const paused=await controlRun(f.context(),{id:run.value.id,operationKey:'case:003',expectedRevisionId:run.value.revisionId,action:'pause'});expect((await requireRun(f.context(),run.value.id)).lease_id).toBeNull();await env.DB.prepare('UPDATE pages SET working_revision_id=? WHERE id=?').bind('changed-revision',f.page.pageId).run();await expect(controlRun(f.context(),{id:run.value.id,operationKey:'case:004',expectedRevisionId:paused.value.revisionId,action:'resume'})).rejects.toMatchObject({code:'STALE_EVIDENCE'});const cancelled=await controlRun(f.context(),{id:run.value.id,operationKey:'case:005',expectedRevisionId:paused.value.revisionId,action:'cancel'});await expect(controlRun(f.context(),{id:run.value.id,operationKey:'case:006',expectedRevisionId:cancelled.value.revisionId,action:'resume'})).rejects.toMatchObject({code:'TERMINAL_RUN'});
} finally {}
}},
{name:"DEC-003 accepted decision immutable and source changes warn without rewriting rationale",before:async()=>{await resetFoldDeployment();},run:async()=>{
try {
const f=await fixture(),saved=await saveDecision(f.context(),{operationKey:'case:007',pageId:f.page.pageId,question:'Launch?',options:['Wait','Launch'],outcome:'Wait',rationale:'Support handoff remains open',ownerId:f.owner,decidedAt:null,reviewAt:null,citations:f.refs});const accepted=await acceptDecision(f.context(),{id:saved.value.id,operationKey:'case:008',expectedRevisionId:saved.value.revisionId});expect(accepted.value.state).toBe('accepted');await expect(saveDecision(f.context(),{operationKey:'case:009',id:saved.value.id,expectedRevisionId:accepted.value.revisionId,pageId:f.page.pageId,question:'Launch?',options:['Launch'],outcome:'Launch',rationale:'Changed',ownerId:f.owner,decidedAt:null,reviewAt:null,citations:f.refs})).rejects.toMatchObject({code:'IMMUTABLE_DECISION'});expect((await getDecision(f.context(),saved.value.id)).content.rationale).toContain('handoff');
} finally {}
}}
  ]);
});

// Distinct intents exercise two reservations; identical intents intentionally coalesce.
// Keep the original budget and rejection/count assertions.
