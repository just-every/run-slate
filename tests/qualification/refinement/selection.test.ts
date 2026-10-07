import {env} from 'cloudflare:test';
import {afterEach,test,expect,vi} from 'vitest';
import {fixture,compare} from './fixture';
import {prepareEvaluation,evaluationStatus} from '../../../src/core/features/skills/evaluation-workflow';
import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';
import {startRun} from '../../../src/core/features/runs/service';
import {listPageSkills} from '../../../src/core/features/skills/listing';
import {requireRun} from '../../../src/core/features/runs/repository';
import {createApi} from '../../../src/core/app/hono';
import {sessionFor} from '../../e2e/setup/fixtures';

afterEach(()=>vi.unstubAllGlobals());
const provider={apiKey:'test-only'};
async function counts(workspace:string){return env.DB.prepare('SELECT (SELECT count(*) FROM intelligence_runs WHERE workspace_id=?) runs,(SELECT count(*) FROM intelligence_evaluation_cases WHERE workspace_id=?) cases,(SELECT count(*) FROM intelligence_budgets WHERE workspace_id=?) budgets').bind(workspace,workspace,workspace).first();}

test('SKILL-002 explicit non-newest refinement freezes exact comparisons, failed draft keeps active, passing revision waits for exact owner activation and pins normal reuse',async()=>{
 const f=await fixture();
 const first=await f.refine('first-refinement',{instructions:f.definition.instructions+' First draft.'});
 const second=await f.refine('second-refinement',{instructions:f.definition.instructions+' Later draft.'});
 const old=await env.DB.prepare('SELECT * FROM intelligence_skill_versions WHERE id=?').bind(f.original.value.revisionId).first();
 const unchanged=async()=>{expect(await env.DB.prepare('SELECT current_revision_id FROM intelligence_skills WHERE id=?').bind(f.original.value.id).first<string>('current_revision_id')).toBe(f.original.value.revisionId);expect(await env.DB.prepare('SELECT * FROM intelligence_skill_versions WHERE id=?').bind(f.original.value.revisionId).first()).toEqual(old);};
 await expect(prepareEvaluation(f.context(),f.original.value.id,{operationKey:'omitted-active-selector'},provider)).rejects.toMatchObject({code:'DRAFT_REQUIRED'});
 await expect(startRun(f.context(),{...f.ask,operationKey:'ordinary-draft-denied',audience:[f.owner],skillRevisionId:first.value.revisionId},provider)).rejects.toMatchObject({code:'SKILL_CHANGED'});
 const prepared=await prepareEvaluation(f.context(),f.original.value.id,{operationKey:'explicit-first-draft',revisionId:first.value.revisionId},provider);
 await unchanged();
 expect((await evaluationStatus(f.context(),prepared.id)).skill_revision_id).toBe(first.value.revisionId);
 expect((await requireRun(f.context(),prepared.candidateRunId)).skill_revision_id).toBe(first.value.revisionId);
 expect((await requireRun(f.context(),prepared.genericRunId)).skill_revision_id).toBeNull();
 const snapshot=await counts(f.workspaceId);
 const replay=await prepareEvaluation(f.context(),f.original.value.id,{operationKey:'explicit-first-draft',revisionId:first.value.revisionId},provider);
 expect([replay.id,replay.candidateRunId,replay.genericRunId]).toEqual([prepared.id,prepared.candidateRunId,prepared.genericRunId]);expect(await counts(f.workspaceId)).toEqual(snapshot);
 await expect(prepareEvaluation(f.context(),f.original.value.id,{operationKey:'explicit-first-draft',revisionId:second.value.revisionId},provider)).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
 await expect(prepareEvaluation(f.context(),f.original.value.id,{operationKey:'explicit-first-draft',revisionId:first.value.revisionId,question:'Changed question'},provider)).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
 expect(await counts(f.workspaceId)).toEqual(snapshot);
 await compare(f,prepared,f.definition.successTests,false);await unchanged();
 await expect(transitionSkill(f.context(),{operationKey:'activate-failed-draft',revisionId:first.value.revisionId,action:'activate'})).rejects.toMatchObject({code:'EVALUATION_REQUIRED'});
 const pending=await startRun(f.context(),{...f.ask,operationKey:'old-active-pinned-work',audience:[f.owner],skillRevisionId:f.original.value.revisionId},provider);
 const passing=await prepareEvaluation(f.context(),f.original.value.id,{operationKey:'explicit-second-draft',revisionId:second.value.revisionId},provider);
 await compare(f,passing,f.definition.successTests,true);await unchanged();
 const listed=await listPageSkills(f.context(),f.page.pageId);
 const versions=listed.items[0]!.versions;
 expect(versions.find(v=>v.id===first.value.revisionId)?.evaluations).toContainEqual({id:prepared.id,state:'failed'});
 expect(versions.find(v=>v.id===second.value.revisionId)?.evaluations).toContainEqual({id:passing.id,state:'completed'});
 const activation=await transitionSkill(f.context(),{operationKey:'activate-second-draft',revisionId:second.value.revisionId,action:'activate'});
 expect(await transitionSkill(f.context(),{operationKey:'activate-second-draft',revisionId:second.value.revisionId,action:'activate'})).toEqual(activation);
 expect((await requireRun(f.context(),pending.value.id)).status).toBe('paused');
 expect(await env.DB.prepare('SELECT released_at FROM intelligence_budgets WHERE run_id=?').bind(pending.value.id).first<string>('released_at')).toBeTruthy();
 await expect(startRun(f.context(),{...f.ask,operationKey:'superseded-denied',audience:[f.owner],skillRevisionId:f.original.value.revisionId},provider)).rejects.toMatchObject({code:'SKILL_CHANGED'});
 const reused=await startRun(f.context(),{...f.ask,operationKey:'refined-normal-reuse',audience:[f.owner],skillRevisionId:second.value.revisionId},provider);
 expect((await requireRun(f.context(),reused.value.id)).skill_revision_id).toBe(second.value.revisionId);
 const after=await counts(f.workspaceId);
 expect((await prepareEvaluation(f.context(),f.original.value.id,{operationKey:'explicit-second-draft',revisionId:second.value.revisionId},provider)).id).toBe(passing.id);
 expect(await counts(f.workspaceId)).toEqual(after);
 await expect(prepareEvaluation(f.context(),f.original.value.id,{operationKey:'new-work-on-active',revisionId:second.value.revisionId},provider)).rejects.toMatchObject({code:'DRAFT_REQUIRED'});
},60000);

test('SKILL-002 native HTTP selector rejects foreign/missing/invalid and reader before effects; selected refinement and replay are exact',async()=>{
 const f=await fixture(),draft=await f.refine('http-refinement');
 const app=createApi();
 const send=async(actor:string,skillId:string,data:unknown)=>app.request('https://slate.example/api/skills/'+skillId+'/prepare-evaluation',{method:'POST',headers:{Cookie:await sessionFor(actor),Origin:'https://slate.example','Content-Type':'application/json'},body:JSON.stringify(data)},{...env,AI_API_KEY:'test-only'});
 const foreign=await createSkill(f.context(),{operationKey:'foreign-skill-draft',pageId:f.page.pageId,name:'Other skill',definition:f.definition});
 const before=await counts(f.workspaceId);
 const mismatched=await send(f.owner,f.original.value.id,{operationKey:'mismatched-skill-selector',revisionId:foreign.value.revisionId});expect(mismatched.status).toBe(404);
 for(const [id,revisionId,status] of [[f.original.value.id,'missing-version',404],['missing-skill',draft.value.revisionId,404],[f.original.value.id,'',400],[f.original.value.id,42,400]] as const){const response=await send(f.owner,id,{operationKey:'invalid-native-selector',revisionId});expect(response.status).toBe(status);}
 const reader=await send(f.reader,f.original.value.id,{operationKey:'reader-native-selector',revisionId:draft.value.revisionId});expect([403,404]).toContain(reader.status);
 expect(await counts(f.workspaceId)).toEqual(before);
 const input={operationKey:'native-selected-draft',revisionId:draft.value.revisionId};
 const response=await send(f.owner,f.original.value.id,input);expect(response.status).toBe(200);const prepared=await response.json() as {id:string;candidateRunId:string};
 expect((await requireRun(f.context(),prepared.candidateRunId)).skill_revision_id).toBe(draft.value.revisionId);
 const after=await counts(f.workspaceId);expect((await send(f.owner,f.original.value.id,input)).status).toBe(200);expect(await counts(f.workspaceId)).toEqual(after);
 await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(f.owner).run();
 const denied=await send(f.owner,f.original.value.id,input);expect([401,403,404]).toContain(denied.status);expect(await counts(f.workspaceId)).toEqual(after);
},60000);

test('SKILL-002 partially prepared draft resumes same reservation and frozen criteria; exact replay rechecks page/source authority',async()=>{
 const f=await fixture(),draft=await f.refine('partial-refinement');
 let sends=0;
 const interrupted={...f.context(),jobs:{send:async()=>{sends++;throw Error('Controlled queue transport interruption after durable run commit');}} as unknown as ReturnType<typeof f.context>['jobs']};
 const input={operationKey:'partial-preparation',revisionId:draft.value.revisionId};
 await expect(prepareEvaluation(interrupted,f.original.value.id,input,provider)).rejects.toThrow('Controlled queue transport');
 const frozen=await env.DB.prepare('SELECT id,execution_json FROM intelligence_evaluation_cases WHERE skill_revision_id=?').bind(draft.value.revisionId).first<{id:string;execution_json:string}>();
 expect(JSON.parse(frozen!.execution_json)).toMatchObject({criteria:f.definition.successTests,needsJudge:true});
 const candidate=await env.DB.prepare('SELECT id FROM intelligence_runs WHERE skill_revision_id=?').bind(draft.value.revisionId).first<{id:string}>();expect(candidate).toBeTruthy();expect(sends).toBe(1);
 const prepared=await prepareEvaluation(f.context(),f.original.value.id,input,provider);
 expect(prepared.id).toBe(frozen!.id);expect(prepared.candidateRunId).toBe(candidate!.id);
 expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_budgets WHERE run_id=?').bind(candidate!.id).first<number>('n')).toBe(1);
 const before=await counts(f.workspaceId);
 await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(f.ownerGrant).run();
 // Closed container ownership may still grant access; archive the actual source to revoke source usability.
 await env.DB.prepare("UPDATE pages SET archived_at=? WHERE id=?").bind(new Date().toISOString(),f.page.pageId).run();
 await expect(prepareEvaluation(f.context(),f.original.value.id,input,provider)).rejects.toMatchObject({status:404});
 expect(await counts(f.workspaceId)).toEqual(before);
},60000);
