import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document} from './fixture';
import {createInquiry,recordAnalysis,recordFinding} from '../../../src/core/features/inquiries/service';
import {prepareTrial,approveTrial,observeTrial,concludeTrial} from '../../../src/core/features/experiments/service';
import {prepareLearnedSkill} from '../../../src/core/features/experiments/learning';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';
import {decodeArchive} from '../../../src/core/features/portability/archive';

beforeEach(reset);
test('FLAG-004 — inquiry analysis observation concluded trial and learned draft retain exact lineage through full archive restore',async()=>{
 const f=await fixture(),host=await document(f,'Portable research evidence'),ctx=f.context();
 const inquiry=await createInquiry(ctx,{operationKey:'portable-inquiry',pageId:host.id,question:'Which explanation remains unresolved?',refs:[host.ref],audience:[f.owner],hypotheses:[{statement:'Initial explanation',disconfirmation:'Rival evidence'},{statement:'Rival explanation',disconfirmation:'Initial evidence'}]});
 await recordAnalysis(ctx,{id:inquiry.value.id,operationKey:'portable-analysis',analysis:{kind:'allocate',items:[{id:'one',cost:1,value:2}],capacity:1},refs:[host.ref]});
 const hypothesis=await env.DB.prepare('SELECT id FROM intelligence_hypotheses WHERE inquiry_id=? LIMIT 1').bind(inquiry.value.id).first<string>('id');
 await recordFinding(ctx,{id:inquiry.value.id,operationKey:'portable-finding',hypothesisId:hypothesis!,status:'inconclusive',finding:'The local fixture does not establish an outcome.',kind:'observation',refs:[host.ref]});
 // Synthetic local times qualify persistence and guards only, never prospective outcome quality.
 const start=new Date(Date.parse(ctx.now)+1000).toISOString(),end=new Date(Date.parse(ctx.now)+2000).toISOString();
 const trial=await prepareTrial(ctx,{operationKey:'portable-trial',inquiryId:inquiry.value.id,plan:{eligibility:'Labelled local subjects',assignment:[0,1,2,3].map(n=>({subjectId:String(n),arm:n<2?'treatment':'comparison'})),assignmentMethod:'observational',seed:'local',confounding:['Local mechanics only'],baseline:'Unmeasured',metric:'Local value',meaningfulEffect:1,maximumHalfWidth:1,startsAt:start,endsAt:end,supportGuardrail:1,contactLimit:0,maximumCostMicros:1,forecast:'Unmeasured',instrumentationRevision:'local',refs:[host.ref],effects:[]}});
 const active=await approveTrial(ctx,{id:trial.value.id,operationKey:'portable-trial-approval',expectedRevisionId:trial.value.revisionId});
 await observeTrial({...ctx,now:start},{id:trial.value.id,operationKey:'portable-control-observation',subjectId:'2',value:1,supportWork:0,observedAt:start,refs:[host.ref]});
 const finalContext={...ctx,now:end},concluded=await concludeTrial(finalContext,{id:trial.value.id,operationKey:'portable-conclusion',expectedRevisionId:active.value.revisionId,instrumentationRevision:'local'});
 expect(concluded.value.outcome.classification).toBe('inconclusive');
 const learned=await prepareLearnedSkill(finalContext,{id:trial.value.id,operationKey:'portable-learned-draft',expectedRevisionId:concluded.value.methodRevision});
 const first=await exportWorkspace(finalContext),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(first.id).first<string>('archive_key'),bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer()),before=(await decodeArchive(bytes)).manifest;
 await reset();const target=await fixture();await restoreWorkspace(target.context(),bytes);
 const second=await exportWorkspace(f.context()),nextKey=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(second.id).first<string>('archive_key'),after=(await decodeArchive(new Uint8Array(await(await env.FILES.get(nextKey!))!.arrayBuffer()))).manifest;
 for(const table of ['intelligence_inquiries','intelligence_hypotheses','intelligence_analyses','intelligence_artifacts','intelligence_observations','intelligence_revisions','intelligence_skills','intelligence_skill_versions']){
  expect(before.tables[table]!.length).toBeGreaterThan(0);expect(after.tables[table]).toEqual(before.tables[table]);
 }
 expect(after.tables.intelligence_experiments!.map(row=>({...row,grant_id:null}))).toEqual(before.tables.intelligence_experiments!.map(row=>({...row,grant_id:null})));
 expect(after.tables.intelligence_experiments![0]!.grant_id).toBeNull();expect(after.tables.intelligence_grants!.every(row=>row.revoked_at)).toBe(true);
 expect(after.tables.intelligence_skill_versions!.find(row=>row.id===learned.value.skillRevisionId)!.state).toBe('draft');
 expect(after.blobs.map(blob=>blob.hash).sort()).toEqual(before.blobs.map(blob=>blob.hash).sort());
});
