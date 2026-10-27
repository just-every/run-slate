import {learnedMethodCase} from './learned-method.case';
import {runFoldCases} from '../fold-cases';
import {resetDeployment as resetFoldDeployment} from '../../e2e/setup/reset-deployment';
import {env} from 'cloudflare:test';import {test,expect} from 'vitest';import {fixture} from './fixture';import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';import {requireActiveSkill} from '../../../src/core/features/skills/admission';import {freezeCases} from '../../../src/core/features/skills/cases';
test("pinned skills, evaluation cutoffs and retained learning preserve admission boundaries", async () => {
  await runFoldCases([
{name:"Pinned skill cannot activate failed/absent evaluation or silently substitute a retired version",before:async()=>{await resetFoldDeployment();},run:async()=>{
try {
const f=await fixture();const definition={instructions:'Use exact source evidence.',refs:f.refs,audience:[f.owner],tools:['read-evidence' as const],effects:[],preconditions:['Readable current source'],successTests:['Cite only issued IDs'],escalations:['Missing authority'],maxCostMicros:1000000};const created=await createSkill(f.context(),{operationKey:'skill-create-001',pageId:f.page.pageId,name:'Launch review',definition});await expect(transitionSkill(f.context(),{operationKey:'skill-activate-fail',revisionId:created.value.revisionId,action:'activate'})).rejects.toMatchObject({code:'EVALUATION_REQUIRED'});await env.DB.prepare("INSERT INTO intelligence_evaluations(id,workspace_id,skill_revision_id,case_hash,result_json,passed,created_at) VALUES('test-only-passing-evaluation',?,?,?,'{}',1,?)").bind(f.workspaceId,created.value.revisionId,'fixture-hash',f.context().now).run();await env.DB.prepare("UPDATE intelligence_skill_versions SET state='evaluated',evaluation_id='test-only-passing-evaluation' WHERE id=?").bind(created.value.revisionId).run();await transitionSkill(f.context(),{operationKey:'skill-activate-pass',revisionId:created.value.revisionId,action:'activate'});expect((await requireActiveSkill(f.context(),created.value.revisionId,f.refs,[f.owner],100)).instructions).toContain('exact');await transitionSkill(f.context(),{operationKey:'skill-retire-pass',revisionId:created.value.revisionId,action:'retire'});await expect(requireActiveSkill(f.context(),created.value.revisionId,f.refs,[f.owner],100)).rejects.toMatchObject({code:'SKILL_CHANGED'});expect((await env.DB.prepare('SELECT definition_json FROM intelligence_skill_versions WHERE id=?').bind(created.value.revisionId).first<{definition_json:string}>())!.definition_json).toContain('exact source');
} finally {}
}},
{name:"Evaluation cases freeze source cutoff; a future timestamp cannot bless future context",before:async()=>{await resetFoldDeployment();},run:async()=>{
try {
const f=await fixture();await expect(freezeCases(f.context(),{operationKey:'case-future-denied',revisionId:'unknown',cutoff:'2099-01-01T00:00:00.000Z',refs:f.refs,cases:[{name:'Case',question:'Launch?',requiredEvidenceIds:['E1'],requiredStatements:['handoff'],forbiddenStatements:['confirmed ready'],maximumOwnerSeconds:30}]})).rejects.toMatchObject({code:'FUTURE_CUTOFF'});
} finally {}
}}
  ,
{name:"Retained trial learning prepares one inactive draft with failed hypotheses, forecast and evaluation boundary",before:async()=>{await resetFoldDeployment();},run:learnedMethodCase}
]);
});
