import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document,definition} from './fixture';
import {createSkill} from '../../../src/core/features/skills/service';
import {requireEvaluationSkill} from '../../../src/core/features/skills/admission';
import {evaluateSkill} from '../../../src/core/features/skills/evaluations';
import {freezeCases} from '../../../src/core/features/skills/cases';
import {completeEvaluation} from '../../../src/core/features/skills/evaluation-workflow';
import {createInquiry} from '../../../src/core/features/inquiries/service';
import {prepareTrial,approveTrial,observeTrial} from '../../../src/core/features/experiments/service';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';
import {reauthorizeRun,requireRun} from '../../../src/core/features/runs/repository';

beforeEach(reset);
test('FLAG-004 — restored evaluation, active trial and nonterminal run cannot resume with retained authority',async()=>{
 const f=await fixture(),host=await document(f,'Recovery execution input'),ctx=f.context();
 const method=await createSkill(ctx,{operationKey:'recovery-draft',pageId:host.id,name:'Unfinished evaluation',definition:{...definition(f,[host.ref]),audience:[f.owner]}});
 const cases=await freezeCases(ctx,{operationKey:'recovery-cases',revisionId:method.value.revisionId,cutoff:ctx.now,refs:[host.ref],cases:[{name:'Retained case',question:'Original question',requiredEvidenceIds:['E1'],requiredStatements:[],forbiddenStatements:[],maximumOwnerSeconds:60}]});
 // Explicit interrupted-execution fixture; no provider result or quality attestation is fabricated.
 await env.DB.prepare('UPDATE intelligence_evaluation_cases SET execution_json=? WHERE id=?').bind(JSON.stringify({candidateRunId:'recovery-run',candidateOwnerSeconds:4,genericOwnerSeconds:8}),cases.value.id).run();
 await env.DB.prepare("INSERT INTO intelligence_runs(id,workspace_id,requester_id,page_id,kind,status,revision_id,input_json,refs_json,audience_json,created_at,updated_at) VALUES('recovery-run',?,?,?,'answer','paused','run-recovery','{\"question\":\"Original question\"}',?,?,?,?)").bind(f.workspaceId,f.owner,host.id,JSON.stringify([host.ref]),JSON.stringify([f.owner]),ctx.now,ctx.now).run();
 const inquiry=await createInquiry(ctx,{operationKey:'trial-inquiry',pageId:host.id,question:'Recovery trial',refs:[host.ref],audience:[f.owner],hypotheses:[{statement:'Initial explanation',disconfirmation:'Alternative evidence'},{statement:'Alternative explanation',disconfirmation:'Initial evidence'}]});
 const start=new Date(Date.now()+1000).toISOString(),end=new Date(Date.now()+3600000).toISOString();
 const trial=await prepareTrial(ctx,{operationKey:'recovery-trial',inquiryId:inquiry.value.id,plan:{eligibility:'Labelled local subjects',assignment:[0,1,2,3].map(n=>({subjectId:String(n),arm:n<2?'treatment':'comparison'})),assignmentMethod:'observational',seed:'local',confounding:['Local mechanics only'],baseline:'Unmeasured',metric:'Local value',meaningfulEffect:1,maximumHalfWidth:1,startsAt:start,endsAt:end,supportGuardrail:1,contactLimit:0,maximumCostMicros:1,forecast:'Unmeasured',instrumentationRevision:'local',refs:[host.ref],effects:[]}});
 await approveTrial(ctx,{id:trial.value.id,operationKey:'recovery-approve',expectedRevisionId:trial.value.revisionId});
 const exported=await exportWorkspace(ctx),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key'),bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());
 await reset();const target=await fixture();await restoreWorkspace(target.context(),bytes);
 const execution=JSON.parse((await env.DB.prepare('SELECT execution_json FROM intelligence_evaluation_cases WHERE id=?').bind(cases.value.id).first<string>('execution_json'))!);
 expect(execution).toMatchObject({candidateRunId:'recovery-run',candidateOwnerSeconds:4,genericOwnerSeconds:8});expect(execution.recoveryPausedAt).toBeTruthy();
 await expect(completeEvaluation(f.context(),cases.value.id)).rejects.toMatchObject({code:'RESTORED_AUTHORITY_REQUIRED'});
 await expect(requireEvaluationSkill(f.context(),method.value.revisionId,cases.value.id,'Original question',[host.ref])).rejects.toMatchObject({code:'RESTORED_AUTHORITY_REQUIRED'});
 await expect(evaluateSkill(f.context(),{operationKey:'direct-restored-evaluation',revisionId:method.value.revisionId,caseSetId:cases.value.id,cutoff:ctx.now,cases:[{name:'Retained case',candidateRunId:'recovery-run',genericRunId:'absent-generic',expertRunId:'absent-expert',requiredEvidenceIds:['E1'],requiredStatements:[],forbiddenStatements:[],maximumOwnerSeconds:60,candidateOwnerSeconds:4,genericOwnerSeconds:8,expertOwnerSeconds:10}]})).rejects.toMatchObject({code:'RESTORED_AUTHORITY_REQUIRED'});
 expect(await env.DB.prepare('SELECT state,grant_id FROM intelligence_experiments WHERE id=?').bind(trial.value.id).first()).toEqual({state:'stopped',grant_id:null});
 expect(await env.DB.prepare('SELECT count(*) AS n FROM intelligence_grants WHERE revoked_at IS NULL').first<number>('n')).toBe(0);
 await expect(observeTrial({...f.context(),now:start},{id:trial.value.id,operationKey:'restored-observe',subjectId:'2',value:1,supportWork:0,observedAt:start,refs:[host.ref]})).rejects.toMatchObject({code:'INVALID_OBSERVATION'});
 const run=await env.DB.prepare('SELECT status,failure_reason,input_json FROM intelligence_runs WHERE id=?').bind('recovery-run').first<{status:string;failure_reason:string;input_json:string}>();
 expect(run).toMatchObject({status:'paused',failure_reason:'RESTORED_AUTHORITY_REQUIRED'});expect(JSON.parse(run!.input_json).recoveryPausedAt).toBeTruthy();
 await expect(reauthorizeRun(f.context(),await requireRun(f.context(),'recovery-run'))).rejects.toMatchObject({code:'RESTORED_AUTHORITY_REQUIRED'});
 // A later diagnostic update must not erase the persistent restore fence.
 await env.DB.prepare("UPDATE intelligence_runs SET failure_reason='LATER_DIAGNOSTIC' WHERE id='recovery-run'").run();
 await expect(reauthorizeRun(f.context(),await requireRun(f.context(),'recovery-run'))).rejects.toMatchObject({code:'RESTORED_AUTHORITY_REQUIRED'});
});
