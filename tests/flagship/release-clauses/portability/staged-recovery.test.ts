import {afterAll,beforeAll,expect,test} from 'vitest';
import {env} from 'cloudflare:test';
import {byteHash} from '../../../../src/core/features/portability/archive';
import {createApi} from '../../../../src/core/app/hono';
import {sessionFor} from '../../../e2e/setup/fixtures';
import {apiBindings,apiJson,exportNativeArchive,finishPages,grantPageView,makeImport,makeInquirySet,makePageTree,makeSkillTrialSet,makeWorkspace,migrationNames,ownerEmail,originalFileBytes,portableSnapshot,resetNative,r2Keys,r2Snapshot,runRestoreThroughApi,stageRestoreThroughApi,tableCounts,type DurableScenario,type InquirySet,type PageSet,type PageTree,type SkillTrialSet,type WorkspaceHarness} from './support';

let source:DurableScenario;
let sourceArchive:Awaited<ReturnType<typeof exportNativeArchive>>;
let migrations:string[];
let workspace:WorkspaceHarness;
let tree:PageTree;
let pages:PageSet;
let inquiryRecords:InquirySet;
let skillTrial:SkillTrialSet;
let imported:{importId:string;importArchiveKey:string};
beforeAll(async()=>{
  await resetNative();
  workspace=await makeWorkspace({email:ownerEmail,withReader:true,withContainer:true});
},10000);
beforeAll(async()=>{tree=await makePageTree(workspace);},10000);
beforeAll(async()=>{pages=await finishPages(workspace,tree);},10000);
beforeAll(async()=>{await grantPageView(workspace,pages.rootId,workspace.readerId!);},10000);
beforeAll(async()=>{inquiryRecords=await makeInquirySet(workspace,pages);},10000);
beforeAll(async()=>{skillTrial=await makeSkillTrialSet(workspace,pages,inquiryRecords.inquiryId,true);},10000);
beforeAll(async()=>{imported=await makeImport(workspace);},10000);
beforeAll(async()=>{
  source={...workspace,pages,...inquiryRecords,...skillTrial,...imported,decisionId:'',decisionRevisionId:'',connectionId:''};
  migrations=await migrationNames();
  sourceArchive=await exportNativeArchive(source);
},10000);
afterAll(async()=>{await resetNative();},10000);

async function target(){return makeWorkspace({email:source.ownerEmail,withReader:false,withContainer:false});}

test('FLAG-002 — staged restore refuses a target that gains a product row and leaves all canonical rows and R2 originals unchanged',async()=>{
  await resetNative();
  const empty=await target(),staged=await stageRestoreThroughApi(empty,sourceArchive.bytes);
  expect(staged.response.status).toBe(202);
  expect(staged.body.state).toBe('queued');
  // The import fence counter advances on every native write, including the injected group.
  const before=await tableCounts(),beforeSnapshot=await portableSnapshot({omitTables:['groups','import_native_epoch']}),beforeObjects=await r2Snapshot(),importEpochBefore=await env.DB.prepare('SELECT revision FROM import_native_epoch WHERE id=1').first<number>('revision');
  expect(beforeObjects.map(object=>object.key)).toEqual([`federation/staging/${staged.body.id}/source.zip`]);
  const lateGroupId='release-late-target-group';
  await env.DB.prepare(`CREATE TRIGGER release_portability_add_group_after_admission AFTER UPDATE OF cleanup_json ON portability_jobs WHEN NEW.id='${staged.body.id}' AND OLD.cleanup_json='[]' AND NEW.cleanup_json<>'[]' BEGIN INSERT INTO groups(id,workspace_id,name,created_at,updated_at,revision_id) VALUES('${lateGroupId}','${empty.workspaceId}','Added after restore admission','2026-10-06T00:00:00.000Z','2026-10-06T00:00:00.000Z','release-late-target-revision'); END`).run();
  const refused=await runRestoreThroughApi(staged.cookie,staged.body.id);
  expect(refused.response.status).toBe(200);
  expect(refused.body.state).toBe('failed');
  expect(refused.body.report.code).toBe('RESTORE_NOT_EMPTY');
  const afterCounts=await tableCounts();
  expect(afterCounts).toEqual({...before,groups:before.groups+1});
  const afterSnapshot=await portableSnapshot({omitTables:['groups','import_native_epoch']});
  expect(afterSnapshot.hash).toBe(beforeSnapshot.hash);
  expect(await env.DB.prepare('SELECT revision FROM import_native_epoch WHERE id=1').first<number>('revision')).toBe(importEpochBefore!+1);
  expect(await migrationNames()).toEqual(migrations);
  const retained=await env.DB.prepare('SELECT id,workspace_id,name,revision_id FROM groups WHERE id=?').bind(lateGroupId).first<{id:string;workspace_id:string;name:string;revision_id:string}>();
  expect(retained).toEqual({id:lateGroupId,workspace_id:empty.workspaceId,name:'Added after restore admission',revision_id:'release-late-target-revision'});
  expect(await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(empty.ownerId).first()).not.toBeNull();
  const remainingObjects=await r2Snapshot();
  expect(remainingObjects).toEqual([]);
  const jobRow=await env.DB.prepare('SELECT state,report_json,cleanup_json FROM portability_jobs WHERE id=?').bind(staged.body.id).first<{state:string;report_json:string;cleanup_json:string}>();
  expect(jobRow?.state).toBe('failed');
  expect(JSON.parse(jobRow!.report_json).code).toBe('RESTORE_NOT_EMPTY');
  expect(JSON.parse(jobRow!.cleanup_json)).toEqual([]);
  console.log('Release_EVIDENCE '+JSON.stringify({clause:'FLAG-002',control:'target-product-row-created-after-run-prepare-before-atomic-empty-guard',archiveHash:await byteHash(sourceArchive.bytes),beforeD1:beforeSnapshot,afterD1:afterSnapshot,beforeCounts:before,afterCounts,lateProductGroup:retained,beforeR2:beforeObjects,afterR2:remainingObjects,refusal:refused.body.report,receiptState:jobRow!.state}));
});

test('FLAG-002 — restore rechecks current setup-owner authority inside the canonical D1 commit after archive admission',async()=>{
  await resetNative();
  const empty=await target(),staged=await stageRestoreThroughApi(empty,sourceArchive.bytes);
  expect(staged.response.status).toBe(202);
  // The import fence counter advances once for the injected setup-owner revocation.
  const before=await tableCounts(),beforeSnapshot=await portableSnapshot({omitSetupOwner:true,omitTables:['import_native_epoch']}),beforeObjects=await r2Snapshot(),importEpochBefore=await env.DB.prepare('SELECT revision FROM import_native_epoch WHERE id=1').first<number>('revision'),epochBefore=await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<number>('epoch');
  const restoreId=await env.DB.prepare('SELECT planned_restore_id FROM portability_jobs WHERE id=?').bind(staged.body.id).first<string>('planned_restore_id');
  const remainingKeys=new Set(sourceArchive.manifest.blobs.map(blob=>`federation/restore/${restoreId}/${blob.entry}`));
  // Labelled race only: every byte is written to native R2 before revocation.
  // Inject after the last put so the unchanged atomic setup-owner guard is exercised.
  const files=new Proxy(env.FILES,{get(bucket,property){
    if(property==='put')return async(...args:Parameters<R2Bucket['put']>)=>{
      const result=await bucket.put(...args);
      if(result&&remainingKeys.delete(args[0])&&remainingKeys.size===0){
        await env.DB.batch([
          env.DB.prepare('UPDATE members SET is_setup_owner=0 WHERE id=?').bind(empty.ownerId),
          env.DB.prepare('UPDATE core_acl_epoch SET epoch=epoch-1 WHERE id=1'),
        ]);
      }
      return result;
    };
    const value=Reflect.get(bucket,property);return typeof value==='function'?value.bind(bucket):value;
  }});
  const response=await createApi().request(`https://slate.example/api/exports/jobs/${staged.body.id}/run`,{
    method:'POST',headers:{cookie:staged.cookie,origin:'https://slate.example'},
  },{...apiBindings('flagship'),FILES:files} as never);
  const refused={response,body:await response.json() as Awaited<ReturnType<typeof runRestoreThroughApi>>['body']};
  expect(refused.response.status).toBe(200);
  expect(refused.body.state).toBe('failed');
  expect(refused.body.report.code).toBe('RESTORE_FAILED');
  expect(await tableCounts()).toEqual(before);
  const afterSnapshot=await portableSnapshot({omitSetupOwner:true,omitTables:['import_native_epoch']});
  expect(afterSnapshot.hash).toBe(beforeSnapshot.hash);
  expect(await env.DB.prepare('SELECT revision FROM import_native_epoch WHERE id=1').first<number>('revision')).toBe(importEpochBefore!+1);
  const owner=await env.DB.prepare('SELECT id,email,role,status,is_setup_owner FROM members WHERE id=?').bind(empty.ownerId).first<{id:string;email:string;role:string;status:string;is_setup_owner:number}>();
  expect(owner).toEqual({id:empty.ownerId,email:source.ownerEmail,role:'owner',status:'active',is_setup_owner:0});
  expect(await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<number>('epoch')).toBe(epochBefore);
  expect(await migrationNames()).toEqual(migrations);
  const remainingObjects=await r2Snapshot();
  expect(remainingObjects).toEqual([]);
  const row=await env.DB.prepare('SELECT state,report_json,cleanup_json FROM portability_jobs WHERE id=?').bind(staged.body.id).first<{state:string;report_json:string;cleanup_json:string}>();
  expect(row?.state).toBe('failed');
  const cleanupKeys=JSON.parse(row!.cleanup_json) as string[];
  expect(cleanupKeys).toHaveLength(1);
  expect(cleanupKeys[0]).toMatch(/^federation\/restore\//);
  expect(await env.FILES.head(cleanupKeys[0]!)).toBeNull();
  const foreignKeys=await env.DB.prepare('PRAGMA foreign_key_check').all();
  expect(foreignKeys.results).toEqual([]);
  console.log('Release_EVIDENCE '+JSON.stringify({clause:'FLAG-002',control:'setup-owner-revoked-after-admission-before-atomic-guard',archiveHash:await byteHash(sourceArchive.bytes),beforeD1:beforeSnapshot,afterD1:afterSnapshot,beforeR2:beforeObjects,afterR2:remainingObjects,beforeAclEpoch:epochBefore,afterAclEpoch:await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<number>('epoch'),owner,cleanupTombstones:cleanupKeys,refusal:refused.body.report,receiptState:row!.state,foreignKeyViolations:foreignKeys.results.length}));
});

test('FLAG-002 — a second empty target restores the complete archive, imported originals, foreign keys and fresh owner authority',async()=>{
  await resetNative();
  const clean=await target(),beforeD1=await portableSnapshot(),staged=await stageRestoreThroughApi(clean,sourceArchive.bytes);
  expect(staged.response.status).toBe(202);
  expect(staged.body.state).toBe('queued');
  const beforeR2=await r2Snapshot(),restored=await runRestoreThroughApi(staged.cookie,staged.body.id);
  expect(restored.response.status).toBe(200);
  expect(restored.body.state).toBe('completed');
  expect(await migrationNames()).toEqual(migrations);
  const expectedCounts=Object.fromEntries(Object.entries(sourceArchive.manifest.tables).map(([name,rows])=>[name,rows.length]));
  const actualCounts=await tableCounts();
  expect(actualCounts).toEqual(expectedCounts);
  const afterD1=await portableSnapshot();
  expect(afterD1.counts).toEqual(expectedCounts);
  const cookie=await sessionFor(source.ownerId,{freshProof:true});
  const page=await apiJson(`/api/pages/${source.pages.rootId}`,cookie,'flagship');
  expect(page.status).toBe(200);
  const inquiry=await apiJson(`/api/inquiries/${source.inquiryId}`,cookie,'flagship');
  expect(inquiry.status).toBe(200);
  const experiment=await apiJson(`/api/experiments/${source.trialId}`,cookie,'flagship');
  expect(experiment.status).toBe(200);
  expect((await experiment.json() as {state:string;grant_id:string|null}).state).toBe('stopped');
  const skill=await apiJson(`/api/skills/${source.skillId}`,cookie,'flagship');
  expect(skill.status).toBe(200);
  const imported=await env.DB.prepare('SELECT id,archive_key,state FROM federation_imports WHERE id=?').bind(source.importId).first<{id:string;archive_key:string;state:string}>();
  expect(imported).toMatchObject({id:source.importId,state:'completed'});
  expect(imported!.archive_key).not.toBe(source.importArchiveKey);
  const object=await env.FILES.get(imported!.archive_key);
  expect(object).not.toBeNull();
  const bytes=new Uint8Array(await object!.arrayBuffer());
  expect(bytes).toEqual(originalFileBytes);
  expect(await byteHash(bytes)).toBe(await byteHash(originalFileBytes));
  const afterR2=await r2Snapshot();
  expect(afterR2.map(entry=>entry.key)).toEqual([imported!.archive_key]);
  expect(afterR2).toEqual([{key:imported!.archive_key,size:originalFileBytes.length,hash:await byteHash(originalFileBytes)}]);
  const foreignKeys=await env.DB.prepare('PRAGMA foreign_key_check').all();
  expect(foreignKeys.results).toEqual([]);
  const owner=await env.DB.prepare('SELECT id,email,role,status,is_setup_owner FROM members WHERE id=?').bind(source.ownerId).first();
  expect(owner).toEqual({id:source.ownerId,email:source.ownerEmail,role:'owner',status:'active',is_setup_owner:1});
  console.log('Release_EVIDENCE '+JSON.stringify({clause:'FLAG-002',control:'separate-empty-target-positive-recovery',restoreId:restored.body.restoreId,archiveHash:await byteHash(sourceArchive.bytes),beforeD1,afterD1,restoredCounts:actualCounts,migrationNames:await migrationNames(),beforeR2,afterR2,originalObjectKey:imported!.archive_key,originalBytesHash:await byteHash(bytes),foreignKeyViolations:foreignKeys.results.length,owner}));
});
