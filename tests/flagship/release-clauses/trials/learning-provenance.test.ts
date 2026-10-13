import {test,expect,afterEach,vi,beforeEach} from 'vitest';
import {env} from 'cloudflare:test';
import {nativeTrial,effects} from './native-trial';
import {reset,fixture} from '../../../qualification/authority/fixture';
import {prepareLearnedSkill} from '../../../../src/core/features/experiments/learning';
import {transitionSkill} from '../../../../src/core/features/skills/service';
import {readSkill} from '../../../../src/core/features/skills/disclosure';
import {requireActiveSkill} from '../../../../src/core/features/skills/admission';
import {exportWorkspace,restoreWorkspace} from '../../../../src/core/features/portability/service';
import {decodeArchive,byteHash} from '../../../../src/core/features/portability/archive';
import {replaceBlocks} from '../../../../src/core/features/editor/service';
import {requireTrial,concludeTrial} from '../../../../src/core/features/experiments/service';
import {requireGrant} from '../../../../src/core/features/effects/grants';
import {createApi} from '../../../../src/core/app/hono';
import {sessionFor} from '../../../e2e/setup/fixtures';
let f:Awaited<ReturnType<typeof nativeTrial>>, conclusion:Awaited<ReturnType<typeof concludeTrial>>;
beforeEach(async()=>{await reset();f=await nativeTrial();const active=await f.approve();f.advance(f.plan.endsAt);conclusion=await concludeTrial(f.context(),{id:f.trialId,operationKey:'u6-learning-conclusion',expectedRevisionId:active.value.revisionId,instrumentationRevision:f.plan.instrumentationRevision});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

test('TRIAL-004 — native restore retains learned forecast and falsification while stale sources and old grants cannot activate it',async()=>{
  expect(conclusion.value.outcome.classification).toBe('inconclusive');
  const before=await requireTrial(f.context(),f.trialId), input={id:f.trialId,operationKey:'u6-learn',expectedRevisionId:conclusion.value.methodRevision};
  const effectRows=await effects(f.trialId),grantsBefore=await env.DB.prepare('SELECT count(*) n FROM intelligence_grants').first<number>('n');
  const learned=await prepareLearnedSkill(f.context(),input);expect((await prepareLearnedSkill(f.context(),input)).value).toEqual(learned.value);
  const version=(await env.DB.prepare('SELECT * FROM intelligence_skill_versions WHERE id=?').bind(learned.value.skillRevisionId).first<{definition_json:string;state:string;authority_id:string|null}>())!;
  const definition=JSON.parse(version.definition_json),instructions=JSON.parse(definition.instructions);
  expect(version.state).toBe('draft');expect(version.authority_id).toBeNull();expect(definition.effects).toEqual([]);expect(definition.tools).toEqual(['read-evidence','calculate','propose']);
  expect(instructions).toMatchObject({originalForecast:f.plan.forecast,trialId:f.trialId,methodRevision:conclusion.value.methodRevision,outcome:conclusion.value.outcome});
  expect(instructions.hypotheses).toEqual((await env.DB.prepare('SELECT statement,disconfirmation,status FROM intelligence_hypotheses WHERE inquiry_id=? ORDER BY id').bind(f.inquiryId).all()).results);
  expect(instructions.hypotheses.some((h:{status:string})=>h.status==='disconfirmed')).toBe(true);
  expect(instructions.method.plan).toEqual(f.plan);expect(instructions.method.activated).toBe(false);
  await expect(transitionSkill(f.context(),{operationKey:'u6-activate-without-evaluation',revisionId:learned.value.skillRevisionId,action:'activate'})).rejects.toMatchObject({code:'EVALUATION_REQUIRED'});
  await replaceBlocks(f.context(),f.page.pageId,{operationKey:'u6-source-revision',expectedRevisionId:f.page.workingRevisionId,blocks:[{id:'u6-new-block',blockType:'paragraph',treePosition:'a0',parentBlockId:null,content:{text:[{text:'Changed applicability after learning.'}]}}]});
  await expect(transitionSkill(f.context(),{operationKey:'u6-activate-stale-source',revisionId:learned.value.skillRevisionId,action:'activate'})).rejects.toMatchObject({code:'STALE_EVIDENCE'});
  const exported=await exportWorkspace(f.context()),key=(await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key'))!;
  const bytes=new Uint8Array(await(await env.FILES.get(key))!.arrayBuffer()),archive=await decodeArchive(bytes);
  expect(archive.manifest.blobs.length).toBeGreaterThan(0);expect(archive.manifest.tables.intelligence_skill_versions!.find(r=>r.id===learned.value.skillRevisionId)!.definition_json).toBe(version.definition_json);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_grants').first<number>('n')).toBe(grantsBefore);expect(await effects(f.trialId)).toEqual(effectRows);expect(f.wire.sends).toHaveLength(0);
  await reset();const target=await fixture({withReader:false});await restoreWorkspace(target.context(),bytes);
  const cookie=await sessionFor(f.owner),response=await createApi().request('/api/skills/'+learned.value.skillId,{headers:{cookie}}, {...env,SLATE_PROFILE:'flagship',CONNECTOR_CREDENTIALS_KEY:f.context().sourceSecret});expect(response.status,await response.clone().text()).toBe(200);
  const restored=await readSkill(f.context(),learned.value.skillId);expect(restored).toBeTruthy();
  const restoredVersion=(await env.DB.prepare('SELECT definition_json,state,authority_id,evaluation_id FROM intelligence_skill_versions WHERE id=?').bind(learned.value.skillRevisionId).first())!;
  expect(restoredVersion).toEqual({definition_json:version.definition_json,state:'draft',authority_id:null,evaluation_id:null});
  const restoredTrial=await requireTrial(f.context(),f.trialId);expect(restoredTrial).toMatchObject({plan_json:before.plan_json,outcome_json:before.outcome_json,revision_id:before.revision_id,state:'completed',grant_id:null});
  expect(await effects(f.trialId)).toEqual(effectRows);expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  await expect(transitionSkill(f.context(),{operationKey:'u6-restored-stale-activation',revisionId:learned.value.skillRevisionId,action:'activate'})).rejects.toMatchObject({code:'STALE_EVIDENCE'});
  await expect(requireActiveSkill(f.context(),learned.value.skillRevisionId,f.refs,[f.owner],1)).rejects.toMatchObject({code:'SKILL_CHANGED'});
  await expect(requireGrant(f.context(),before.grant_id!,{kind:'trial',operation:'trial.execute',target:f.trialId,sourceIds:f.refs.map(r=>r.sourceId),audience:[f.owner],costMicros:0})).rejects.toMatchObject({code:'GRANT_REQUIRED'});
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_grants WHERE revoked_at IS NULL').first<number>('n')).toBe(0);
  for(const original of archive.manifest.tables.federation_imports!) {
    const restoredKey=(await env.DB.prepare('SELECT archive_key FROM federation_imports WHERE id=?').bind(original.id).first<string>('archive_key'))!;
    const originalBlob=archive.manifest.blobs.find(b=>b.key===original.archive_key)!;
    expect(await byteHash(new Uint8Array(await(await env.FILES.get(restoredKey))!.arrayBuffer()))).toBe(originalBlob.hash);
  }
  for(const table of ['intelligence_hypotheses','intelligence_revisions']) {
    const rows=(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results;
    expect(rows).toEqual([...archive.manifest.tables[table]!].sort((a,b)=>String(a.id).localeCompare(String(b.id))));
  }
  expect(f.wire.sends).toHaveLength(0);
});
