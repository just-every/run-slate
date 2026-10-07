import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document,definition} from './fixture';
import {createSkill} from '../../../src/core/features/skills/service';
import {freezeCases} from '../../../src/core/features/skills/cases';
import {resolveEvidence} from '../../../src/core/features/ai/evidence';
import {evaluateSkill} from '../../../src/core/features/skills/evaluations';
import {createApi} from '../../../src/core/app/hono';
import {sessionFor} from '../../e2e/setup/fixtures';

beforeEach(reset);
test('SKILL-002 — direct evaluation cannot bypass a prepared independent semantic assessment or replace its run tuple',async()=>{
 const f=await fixture(),host=await document(f,'Semantic criteria input'),ctx=f.context();
 const method=await createSkill(ctx,{operationKey:'semantic-direct-method',pageId:host.id,name:'Semantic method',definition:definition(f,[host.ref])});
 const testCase={name:'Semantic case',question:'Original question',requiredEvidenceIds:['E1'],requiredStatements:[],forbiddenStatements:[],maximumOwnerSeconds:60};
 const cases=await freezeCases(ctx,{operationKey:'semantic-direct-cases',revisionId:method.value.revisionId,cutoff:ctx.now,refs:[host.ref],cases:[testCase]});
 const execution={candidateRunId:'labelled-candidate',genericRunId:'labelled-generic',expertRunId:'labelled-expert',candidateOwnerSeconds:5,genericOwnerSeconds:10,expertOwnerSeconds:15,needsJudge:true,criteria:['Preserve full provenance']};
 await env.DB.prepare('UPDATE intelligence_evaluation_cases SET execution_json=? WHERE id=?').bind(JSON.stringify(execution),cases.value.id).run();
 const comparison={...testCase,candidateRunId:execution.candidateRunId,genericRunId:execution.genericRunId,expertRunId:execution.expertRunId,candidateOwnerSeconds:5,genericOwnerSeconds:10,expertOwnerSeconds:15};
 const input={operationKey:'bypass-semantic-judge',revisionId:method.value.revisionId,caseSetId:cases.value.id,cutoff:ctx.now,cases:[comparison]};
 await expect(evaluateSkill(ctx,input)).rejects.toMatchObject({code:'OUTCOME_ASSESSMENT_REQUIRED'});
 await expect(evaluateSkill(ctx,{...input,cases:[{...comparison,candidateRunId:'replacement-candidate'}]})).rejects.toMatchObject({code:'EVALUATION_EXECUTION_CHANGED'});
 expect(await env.DB.prepare('SELECT count(*) AS n FROM intelligence_evaluations').first<number>('n')).toBe(0);
 expect(await env.DB.prepare('SELECT state FROM intelligence_skill_versions WHERE id=?').bind(method.value.revisionId).first<string>('state')).toBe('draft');
});
test('SOURCE-005 — a generic evidence packet cannot bypass an owner-only Skill audience',async()=>{
 const f=await fixture(),host=await document(f,'Readable method source');
 const method=await createSkill(f.context(),{operationKey:'audience-closure',pageId:host.id,name:'Owner-only instructions',definition:{...definition(f,[host.ref]),audience:[f.owner]}});
 const ref={kind:'skill' as const,sourceId:method.value.id,revisionId:method.value.revisionId};
 expect((await resolveEvidence(f.context(),[ref],[f.owner]))[0]!.text).toContain('Confidential exact method');
 await expect(resolveEvidence(f.context(f.reader),[ref],[f.reader])).rejects.toMatchObject({status:404});
 await expect(resolveEvidence(f.context(),[ref],[f.owner,f.reader])).rejects.toMatchObject({status:404});
 await expect(createSkill(f.context(),{operationKey:'nested-audience-expansion',pageId:host.id,name:'Overbroad wrapper',definition:{...definition(f,[host.ref]),refs:[ref]}})).rejects.toMatchObject({status:404});
});
test('SKILL-002 — actual evaluation attention endpoint records explicit values and rechecks edit authority',async()=>{
 const f=await fixture(),host=await document(f,'Evaluation attention input'),ctx=f.context();
 const method=await createSkill(ctx,{operationKey:'attention-method',pageId:host.id,name:'Measured effort',definition:definition(f,[host.ref])});
 const cases=await freezeCases(ctx,{operationKey:'attention-cases',revisionId:method.value.revisionId,cutoff:ctx.now,refs:[host.ref],cases:[{name:'Original case',question:'Question',requiredEvidenceIds:['E1'],requiredStatements:[],forbiddenStatements:[],maximumOwnerSeconds:60}]});
 const app=createApi(),send=async(member:string,data:unknown)=>app.request('https://slate.example/api/skills/evaluations/'+cases.value.id+'/attention',{method:'POST',headers:{Cookie:await sessionFor(member),Origin:'https://slate.example','Content-Type':'application/json'},body:JSON.stringify(data)},env);
 const request={operationKey:'record-owner-effort',candidateOwnerSeconds:17,genericOwnerSeconds:31};
 const denied=await send(f.reader,request);expect([403,404]).toContain(denied.status);
 expect((await send(f.owner,{...request,candidateOwnerSeconds:-1})).status).toBe(400);
 const result=await send(f.owner,request);expect(result.status).toBe(200);
 const execution=JSON.parse((await env.DB.prepare('SELECT execution_json FROM intelligence_evaluation_cases WHERE id=?').bind(cases.value.id).first<string>('execution_json'))!);
 expect(execution).toMatchObject({candidateOwnerSeconds:17,genericOwnerSeconds:31});
 expect((await send(f.owner,request)).status).toBe(200);
});
