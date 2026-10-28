import {env} from 'cloudflare:test';
import {test,expect,beforeEach} from 'vitest';
import {fixture,reset,document,passingEvaluation} from './fixture';
import {createInquiry,recordAnalysis,recordFinding} from '../../../src/core/features/inquiries/service';
import {prepareLearnedSkill} from '../../../src/core/features/experiments/learning';
import {readSkill,requireSkillRevisionDisclosure} from '../../../src/core/features/skills/disclosure';
import {listPageSkills} from '../../../src/core/features/skills/listing';
import {requireActiveSkill} from '../../../src/core/features/skills/admission';
import {transitionSkill} from '../../../src/core/features/skills/service';
import {seedPageGrant,sessionFor} from '../../e2e/setup/fixtures';
import {updatePage} from '../../../src/core/features/pages/service';
import {archivePage} from '../../../src/core/features/archive/service';
beforeEach(reset);
test("INQ-005 \u2014 learned provenance and published inquiry references preserve exact disclosed sources", async () => {
  await scenario("INQ-005 \u2014 learned definitions retain inquiry, observation, analysis, finding and measurement provenance through reuse", async () => {
 const f=await fixture(),host=await document(f,'Method host'),inquirySource=await document(f,'Private inquiry question'),observation=await document(f,'Private observation'),analysis=await document(f,'Private analysis'),finding=await document(f,'Private finding'),measurement=await document(f,'Private measurement');
 const inquiry=await createInquiry(f.context(),{operationKey:'learned-inquiry',pageId:host.id,question:'Confidential inquiry question',refs:[inquirySource.ref],audience:[f.owner,f.reader],hypotheses:[{statement:'Initial explanation',disconfirmation:'Rival evidence'},{statement:'Rival explanation',disconfirmation:'Initial evidence'}]});
 await recordAnalysis(f.context(),{id:inquiry.value.id,operationKey:'retained-analysis',analysis:{kind:'allocate',items:[{id:'one',cost:1,value:2}],capacity:1},refs:[analysis.ref]});
 const hypothesis=await env.DB.prepare('SELECT id FROM intelligence_hypotheses WHERE inquiry_id=? LIMIT 1').bind(inquiry.value.id).first<{id:string}>();
 await recordFinding(f.context(),{id:inquiry.value.id,operationKey:'retained-finding',hypothesisId:hypothesis!.id,status:'disconfirmed',finding:'Evidence disproves the initial explanation',kind:'observation',refs:[finding.ref]});
 // Explicit test-only concluded trial: this regression proves provenance fences, not an elapsed experiment.
 const plan={eligibility:'Test subjects',assignment:[0,1,2,3].map(n=>({subjectId:String(n),arm:n<2?'treatment':'comparison'})),assignmentMethod:'observational',seed:'test',confounding:['Not a live study'],baseline:'Local fixture',metric:'Local value',meaningfulEffect:1,maximumHalfWidth:1,startsAt:'2020-01-01T00:00:00.000Z',endsAt:'2020-01-02T00:00:00.000Z',supportGuardrail:1,contactLimit:0,maximumCostMicros:100,forecast:'Test-only forecast',instrumentationRevision:'test-measurement',measurement:{observeAfter:'2020-01-01T12:00:00.000Z',subjects:[0,1,2,3].map(n=>({subjectId:String(n),pageId:measurement.id,valueFieldId:'value',supportFieldId:'support'}))},refs:[host.ref],effects:[]};
 await env.DB.prepare("INSERT INTO intelligence_experiments(id,workspace_id,inquiry_id,revision_id,plan_json,state,ends_at,outcome_json,created_at) VALUES('test-concluded-trial',?,?,'test-method-revision',?,'completed',?,'{\"classification\":\"inconclusive\"}',?)").bind(f.workspaceId,inquiry.value.id,JSON.stringify(plan),plan.endsAt,f.context().now).run();
 await env.DB.prepare("INSERT INTO intelligence_revisions(id,workspace_id,entity_kind,entity_id,content_json,actor_id,created_at) VALUES('test-method-revision',?,'learned-method','test-concluded-trial','{\"method\":\"test-only retained result\"}',?,?)").bind(f.workspaceId,f.owner,f.context().now).run();
 await env.DB.prepare("INSERT INTO intelligence_observations(id,experiment_id,subject_id,arm,value,support_work,observed_at,refs_json) VALUES('test-observation','test-concluded-trial','2','comparison',1,0,?,?)").bind(plan.endsAt,JSON.stringify([observation.ref])).run();
 const learned=await prepareLearnedSkill(f.context(),{id:'test-concluded-trial',operationKey:'learned-definition',expectedRevisionId:'test-method-revision'}),versionId=learned.value.skillRevisionId;
 const retained=await requireSkillRevisionDisclosure(f.context(f.reader),versionId);
 expect(new Set(retained.refs.map(r=>r.sourceId))).toEqual(new Set([host,inquirySource,observation,analysis,finding,measurement].map(p=>p.id)));
 await passingEvaluation(f.context(),versionId);await transitionSkill(f.context(),{operationKey:'learned-activate',revisionId:versionId,action:'activate'});
 for(const source of [inquirySource,observation,analysis,finding,measurement]){
  await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(source.grantId).run();
  await expect(readSkill(f.context(f.reader),learned.value.skillId)).rejects.toMatchObject({status:404});
  expect((await listPageSkills(f.context(f.reader),host.id)).items).toHaveLength(0);
  await expect(requireActiveSkill(f.context(f.reader),versionId,[host.ref],[f.reader],1)).rejects.toMatchObject({status:404});
  await seedPageGrant(source.id,{principalKind:'member',principalId:f.reader,level:'view'});
 }

  });
  await reset();
  await scenario("inquiry and archive page references show a reader the published title, not an unpublished rename", async () => {
 const {SELF}=await import('cloudflare:test');
 const f=await fixture(),host=await document(f,'Published inquiry host'),source=await document(f,'Inquiry evidence'),ctx=f.context();
 const inquiry=await createInquiry(ctx,{operationKey:'published-title-inquiry',pageId:host.id,question:'Why did the handover slip?',refs:[source.ref],audience:[f.owner,f.reader],hypotheses:[{statement:'Staffing changed',disconfirmation:'Same staffing'},{statement:'Tooling changed',disconfirmation:'Same tooling'}]});
 await env.DB.prepare('INSERT INTO workspace_policies VALUES (?,?,?)').bind(f.workspaceId,JSON.stringify({'page.lifecycle.v1':'draft-then-publish'}),ctx.now).run();
 await updatePage(ctx,host.id,{operationKey:'unpublished-rename',expectedRevisionId:host.ref.revisionId,properties:{title:'Confidential restructuring plan'}});
 const cookie=await sessionFor(f.reader),read=async(path:string)=>{const response=await SELF.fetch(`http://localhost/api${path}`,{headers:{cookie}}),text=await response.text();expect(response.status,text).toBe(200);return text;};
 expect(JSON.parse(await read(`/pages/${host.id}`)).page.title).toBe('Published inquiry host');
 const inquiryText=await read(`/inquiries/${inquiry.value.id}`);
 expect(JSON.parse(inquiryText).pageRef.title).toBe('Published inquiry host');
 expect(inquiryText).not.toContain('Confidential restructuring plan');
 const current=await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(host.id).first<string>('revision_id');
 await archivePage(ctx,host.id,{operationKey:'archive-renamed-host',expectedRevisionId:current!,action:'archive'});
 const archiveText=await read('/archive');
 expect(JSON.parse(archiveText).items.find((item:{id:string})=>item.id===host.id)?.title).toBe('Published inquiry host');
 expect(archiveText).not.toContain('Confidential restructuring plan');

  });
});


// Keep each clause point visible in the failure while sharing one family registration.
async function scenario(name: string, run: () => Promise<void>) {
  try { await run(); }
  catch (cause) { throw new Error(`Scenario ${name} failed`, { cause }); }
}
