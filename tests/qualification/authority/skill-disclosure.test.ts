import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {reset,fixture,document,definition,passingEvaluation} from './fixture';
import {sessionFor} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';
import {listPageSkills} from '../../../src/core/features/skills/listing';
import {requirePinnedSkillContinuation,requireEvaluationSkill,requireActiveSkill} from '../../../src/core/features/skills/admission';
import {freezeCases} from '../../../src/core/features/skills/cases';
import {issueGrant} from '../../../src/core/features/effects/grants';
import {exportWorkspace} from '../../../src/core/features/portability/service';
beforeEach(reset);
test('SKILL-001 — revoking an older definition source denies the all-version HTTP read without revealing instructions',async()=>{
 const f=await fixture(),host=await document(f,'Method host'),source=await document(f,'Secret separate source'),def=definition(f,[host.ref,source.ref]);
 const skill=await createSkill(f.context(),{operationKey:'method-create',pageId:host.id,name:'Sensitive method',definition:def});
 const next=await createSkill(f.context(),{operationKey:'method-next',pageId:host.id,name:'Sensitive method',skillId:skill.value.id,expectedRevisionId:skill.value.revisionId,definition:definition(f,[host.ref])});
 await passingEvaluation(f.context(),next.value.revisionId);await transitionSkill(f.context(),{operationKey:'method-activate',revisionId:next.value.revisionId,action:'activate'});
 const app=createApi(),cookie=await sessionFor(f.reader),read=()=>app.request('https://slate.example/api/skills/'+skill.value.id,{headers:{Cookie:cookie}},env);
 expect((await read()).status).toBe(200);
 await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(source.grantId).run();
 const response=await read();expect([403,404]).toContain(response.status);expect(await response.text()).not.toContain(def.instructions);
 expect((await listPageSkills(f.context(f.reader),host.id)).items).toHaveLength(0);
});
test('SKILL-003 — exact continuation authority cannot disclose revoked dependencies outside the run subset',async()=>{
 const f=await fixture(),host=await document(f,'Allowed subset'),secret=await document(f,'Other confidential dependency'),def=definition(f,[host.ref,secret.ref]);
 const skill=await createSkill(f.context(),{operationKey:'pinned-create',pageId:host.id,name:'Pinned method',definition:def});
 await env.DB.prepare("UPDATE intelligence_skill_versions SET state='superseded' WHERE id=?").bind(skill.value.revisionId).run();
 const run={id:'labelled-local-run',skill_revision_id:skill.value.revisionId,refs_json:JSON.stringify([host.ref]),audience_json:JSON.stringify([f.reader]),reserved_micros:10};
 const grant=await issueGrant(f.context(),{operationKey:'continuation-authority',subjectId:f.reader,kind:'continuation',expiresAt:'2099-01-01T00:00:00.000Z',scope:{operations:['run.continue'],targets:[run.id],accounts:[],sourceIds:def.refs.map(r=>r.sourceId),audience:[f.reader],maxCostMicros:100,conditions:{skillRevisionId:skill.value.revisionId},acceptNonAtomicProvider:false}});
 expect((await requirePinnedSkillContinuation(f.context(f.reader),run,grant.value.id)).instructions).toBe(def.instructions);
 await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(secret.grantId).run();
 await expect(requirePinnedSkillContinuation(f.context(f.reader),run,grant.value.id)).rejects.toMatchObject({status:404});
});
test('SKILL-002 — held-out evaluation admission rechecks full draft definition beyond frozen case refs',async()=>{
 const f=await fixture(),host=await document(f,'Case source'),secret=await document(f,'Skill-only confidential source');
 const skill=await createSkill(f.context(),{operationKey:'evaluation-draft',pageId:host.id,name:'Evaluation method',definition:definition(f,[host.ref,secret.ref])});
 const cutoff=new Date(Date.now()+10).toISOString(),ctx={...f.context(),now:cutoff};
 const cases=await freezeCases(ctx,{operationKey:'freeze-cases',revisionId:skill.value.revisionId,cutoff,refs:[host.ref],cases:[{name:'One',question:'Exact question',requiredEvidenceIds:['E1'],requiredStatements:['result'],forbiddenStatements:[],maximumOwnerSeconds:60}]});
 await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(ctx.now,secret.id).run();
 await expect(requireEvaluationSkill(ctx,skill.value.revisionId,cases.value.id,'Exact question',[host.ref])).rejects.toMatchObject({status:404});
});
test('SOURCE-005 — complete archive refuses retained skill prose when its source authority has been erased',async()=>{
 const f=await fixture(),host=await document(f,'Host'),secret=await document(f,'Erased confidential evidence');
 await createSkill(f.context(),{operationKey:'export-skill',pageId:host.id,name:'Private skill',definition:definition(f,[host.ref,secret.ref])});
 await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(f.context().now,secret.id).run();
 await expect(exportWorkspace(f.context())).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});
});
test('SKILL-001 — a readable host and source cannot widen the exact method audience',async()=>{
 const f=await fixture(),host=await document(f,'Readable source outside skill audience'),def={...definition(f,[host.ref]),audience:[f.owner]};
 const skill=await createSkill(f.context(),{operationKey:'private-method-audience',pageId:host.id,name:'Owner audience method',definition:def});
 expect((await listPageSkills(f.context(f.reader),host.id)).items).toHaveLength(0);
 const response=await createApi().request('https://slate.example/api/skills/'+skill.value.id,{headers:{Cookie:await sessionFor(f.reader)}},env);
 expect(response.status).toBe(404);expect(await response.text()).not.toContain(def.instructions);
});
