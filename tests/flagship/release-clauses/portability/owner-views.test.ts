import {afterAll,beforeAll,expect,test} from 'vitest';
import {env} from 'cloudflare:test';
import {byteHash} from '../../../../src/core/features/portability/archive';
import {sessionFor} from '../../../e2e/setup/fixtures';
import {apiJson,apiRequest,exportNativeArchive,finishPages,grantPageView,makeConnection,makeDecisionSet,makeImport,makeInquirySet,makePageTree,makeSkillTrialSet,makeWorkspace,migrationNames,ownerEmail,originalFileBytes,r2Snapshot,randomOperationKey,resetNative,runRestoreThroughApi,stageRestoreThroughApi,type DecisionSet,type DurableScenario,type InquirySet,type PageSet,type PageTree,type SkillTrialSet,type WorkspaceHarness} from './support';

let source:DurableScenario;
let archive:Awaited<ReturnType<typeof exportNativeArchive>>;
let sourceMigrations:string[];
let workspace:WorkspaceHarness;
let tree:PageTree;
let pages:PageSet;
let inquiryRecords:InquirySet;
let decision:DecisionSet;
let skillTrial:SkillTrialSet;
let connectionId:string;
let imported:{importId:string;importArchiveKey:string};
beforeAll(async()=>{
  await resetNative();
  workspace=await makeWorkspace({email:ownerEmail,withReader:true,withContainer:true});
},10000);
beforeAll(async()=>{tree=await makePageTree(workspace);},10000);
beforeAll(async()=>{pages=await finishPages(workspace,tree);},10000);
beforeAll(async()=>{await grantPageView(workspace,pages.rootId,workspace.readerId!);},10000);
beforeAll(async()=>{inquiryRecords=await makeInquirySet(workspace,pages);},10000);
beforeAll(async()=>{decision=await makeDecisionSet(workspace,pages);},10000);
beforeAll(async()=>{skillTrial=await makeSkillTrialSet(workspace,pages,inquiryRecords.inquiryId,true);},10000);
beforeAll(async()=>{connectionId=await makeConnection(workspace);},10000);
beforeAll(async()=>{imported=await makeImport(workspace);},10000);
beforeAll(async()=>{
  source={...workspace,pages,...inquiryRecords,...decision,...skillTrial,connectionId,...imported};
  sourceMigrations=await migrationNames();
  archive=await exportNativeArchive(source);
},10000);
afterAll(async()=>{await resetNative();},10000);

async function restoreArchiveForFreshOwner(){
  await resetNative();
  const target=await makeWorkspace({email:source.ownerEmail,withReader:false,withContainer:false});
  const beforeR2=await r2Snapshot();
  expect(beforeR2).toEqual([]);
  const staged=await stageRestoreThroughApi(target,archive.bytes);
  expect(staged.response.status,JSON.stringify(staged.body)).toBe(202);
  expect(staged.body.state).toBe('queued');
  const restored=await runRestoreThroughApi(target,staged.body.id);
  expect(restored.response.status).toBe(200);
  expect(restored.body.state).toBe('completed');
  expect(await migrationNames()).toEqual(sourceMigrations);
  return {cookie:await sessionFor(source.ownerId,{freshProof:true}),restored,beforeR2};
}

test('AGENT-002 — an owner-defined page view does not expose its private skill to a page-only member',async()=>{
  const readerCookie=await sessionFor(source.readerId!);
  const readerPage=await apiJson(`/api/pages/${source.pages.rootId}`,readerCookie,'flagship');
  expect(readerPage.status).toBe(200);
  const privateSkill=await apiJson(`/api/skills/${source.skillId}`,readerCookie,'flagship');
  expect(privateSkill.status).toBe(404);
  expect(archive.manifest.tables.pages!.some(row=>row.id===source.pages.rootId)).toBe(true);
});

test('AGENT-002 — a fresh setup owner reads restored inquiry, analysis, decision and trial views with exact lineage',async()=>{
  const {cookie,restored,beforeR2}=await restoreArchiveForFreshOwner();
  const inquiry=await apiJson(`/api/inquiries/${source.inquiryId}`,cookie,'flagship');
  expect(inquiry.status).toBe(200);
  const inquiryView=await inquiry.json() as {id:string;analyses:{id:string;inputs_json:string;input_hash:string;result_json:string;refs_json:string}[]};
  expect(inquiryView.id).toBe(source.inquiryId);
  const analysis=inquiryView.analyses.find(item=>item.id===source.analysisId)!;
  const sourceAnalysis=archive.manifest.tables.intelligence_analyses!.find(row=>row.id===source.analysisId)!;
  expect(analysis).toMatchObject({inputs_json:sourceAnalysis.inputs_json,input_hash:sourceAnalysis.input_hash,result_json:sourceAnalysis.result_json,refs_json:sourceAnalysis.refs_json});
  const decision=await apiJson(`/api/decisions/${source.decisionId}`,cookie,'flagship');
  const decisionBody=await decision.json() as {id:string;state:string;accepted_revision_id:string;content:{citations:{kind:string;sourceId:string;revisionId:string}[]}};
  expect(decisionBody).toMatchObject({id:source.decisionId,state:'accepted',accepted_revision_id:source.decisionRevisionId});
  expect(decisionBody.content.citations).toContainEqual(source.pages.childRef);
  const trial=await apiJson(`/api/experiments/${source.trialId}`,cookie,'flagship');
  expect(trial.status).toBe(200);
  expect((await trial.json() as {id:string;state:string;grant_id:string|null;plan_json:string})).toMatchObject({id:source.trialId,state:'stopped',grant_id:null,plan_json:archive.manifest.tables.intelligence_experiments!.find(row=>row.id===source.trialId)!.plan_json});
  console.log('Release_EVIDENCE '+JSON.stringify({clause:'AGENT-002',branch:'fresh-owner-restored-domain-views',archiveHash:await byteHash(archive.bytes),portableTableCount:Object.keys(archive.manifest.tables).length,migrationNames:sourceMigrations,beforeR2,decisionAcceptanceRevision:source.decisionRevisionId,restoreId:restored.body.restoreId}));
});

test('AGENT-002 — restored page history, comments, skill definition and imported original remain available to the fresh owner',async()=>{
  const {cookie,restored,beforeR2}=await restoreArchiveForFreshOwner();
  const page=await apiJson(`/api/pages/${source.pages.rootId}`,cookie,'flagship');
  expect(page.status).toBe(200);
  const pageView=await page.json() as {id:string;workingRevisionId:string;properties:{title:string}};
  expect(pageView).toMatchObject({workingRevisionId:source.pages.rootRevisionId,properties:{title:'Owner portable root revised'}});
  const pageHistory=await apiJson(`/api/revisions/${source.pages.rootId}`,cookie,'flagship');
  expect((await pageHistory.json() as {items:{id:string}[]}).items.map(item=>item.id)).toContain(source.pages.rootRevisionId);
  const comments=await apiJson(`/api/comments/page/${source.pages.rootId}`,cookie,'flagship');
  expect(JSON.stringify(await comments.json())).toContain(source.pages.commentId);
  const skill=await apiJson(`/api/skills/${source.skillId}`,cookie,'flagship');
  expect(skill.status).toBe(200);
  const skillView=await skill.json() as {id:string;versions:{id:string;definition_json:string;authority_id:string|null}[]};
  const version=skillView.versions.find(item=>item.id===source.skillRevisionId)!;
  const archivedSkill=archive.manifest.tables.intelligence_skill_versions!.find(row=>row.id===source.skillRevisionId)!;
  expect(version).toMatchObject({definition_json:archivedSkill.definition_json,authority_id:null});
  const connection=await env.DB.prepare('SELECT id,state,credential_ciphertext FROM federation_connections WHERE id=?').bind(source.connectionId).first();
  expect(connection).toEqual({id:source.connectionId,state:'needs-attention',credential_ciphertext:null});
  const imported=await env.DB.prepare('SELECT id,archive_key,state FROM federation_imports WHERE id=?').bind(source.importId).first<{id:string;archive_key:string;state:string}>();
  expect(imported).toMatchObject({id:source.importId,state:'completed'});
  expect(imported!.archive_key).not.toBe(source.importArchiveKey);
  const original=await env.FILES.get(imported!.archive_key);
  expect(original).not.toBeNull();
  const originalBytes=new Uint8Array(await original!.arrayBuffer());
  expect(originalBytes).toEqual(originalFileBytes);
  const afterRestoreR2=await r2Snapshot();
  expect(afterRestoreR2).toEqual([{key:imported!.archive_key,size:originalFileBytes.length,hash:await byteHash(originalFileBytes)}]);
  const freshExport=await exportNativeArchive(source);
  const exportedOriginal=freshExport.manifest.blobs.find(blob=>blob.key===imported!.archive_key)!;
  expect(new Uint8Array(freshExport.entries[exportedOriginal.entry]!)).toEqual(originalFileBytes);
  const foreignKeys=await env.DB.prepare('PRAGMA foreign_key_check').all();
  expect(foreignKeys.results).toEqual([]);
  console.log('Release_EVIDENCE '+JSON.stringify({clause:'AGENT-002',branch:'fresh-owner-page-skill-and-original-views',archiveHash:await byteHash(archive.bytes),freshArchiveHash:await byteHash(freshExport.bytes),portableTableCount:Object.keys(archive.manifest.tables).length,migrationNames:sourceMigrations,beforeR2,restoredR2:afterRestoreR2,originalObjectKey:imported!.archive_key,originalBytesHash:await byteHash(originalBytes),foreignKeyViolations:foreignKeys.results.length,restoreId:restored.body.restoreId}));
});
