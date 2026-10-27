import {runFoldCases} from '../../fold-cases';
import {afterAll,beforeAll,expect,test} from 'vitest';
import {env} from 'cloudflare:test';
import {byteHash} from '../../../../src/core/features/portability/archive';
import {seedMember,sessionFor} from '../../../e2e/setup/fixtures';
import {apiJson,apiRequest,exportNativeArchive,finishPages,grantPageView,makeConnection,makeDecisionSet,makeImport,makeInquirySet,makePageTree,makeSkillTrialSet,makeWorkspace,migrationNames,ownerEmail,originalFileBytes,portableSnapshot,randomOperationKey,resetNative,r2Snapshot,runRestoreThroughApi,setupOwnerCookie,stageRestoreThroughApi,tableCounts,type DecisionSet,type DurableScenario,type InquirySet,type PageSet,type PageTree,type SkillTrialSet,type WorkspaceHarness} from './support';

let source:DurableScenario;
let sourceArchive:Awaited<ReturnType<typeof exportNativeArchive>>;
let migrations:string[];
let workspace:WorkspaceHarness;
let tree:PageTree;
let pages:PageSet;
let inquiryRecords:InquirySet;
let decision:DecisionSet;
let skillTrial:SkillTrialSet;
let connectionId:string;
let staticCopyId:string;
const staticText='Retained archive source content';
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
  migrations=await migrationNames();
  const profileCookie=await setupOwnerCookie(source);const profile=await apiRequest(`/api/people/${source.ownerId}`,profileCookie,'core-wiki');expect(profile.status).toBe(200);const beforeProfile=await profile.json<any>();const saved=await apiRequest(`/api/people/${source.ownerId}`,profileCookie,'core-wiki',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({operationKey:randomOperationKey('directory-archive'),expectedRevisionId:beforeProfile.revisionId,title:'Response coordinator',timezone:'Australia/Brisbane',tags:[{tag:'Private restore choice',hidden:true,custom:true}]})});expect(saved.status,await saved.text()).toBe(200);
  const call=async(method:string,path:string,body?:unknown)=>{const response=await apiRequest(path,profileCookie,'core-wiki',{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json<any>();expect(response.status,JSON.stringify(data)).toBe(200);return data;};
  const privateContainer=(await call('POST','/api/containers',{operationKey:randomOperationKey('static-container'),name:'Static archive source',visibility:'private'})).value.id;
  const blockId=crypto.randomUUID(),sourceId=(await call('POST','/api/pages',{operationKey:randomOperationKey('static-source'),containerId:privateContainer,title:'Restricted archive source',blocks:[{id:blockId,blockType:'synced-source',content:{text:[{text:staticText}]},treePosition:'0'}]})).value.pageId;
  staticCopyId=(await call('POST','/api/pages',{operationKey:randomOperationKey('static-copy'),containerId:privateContainer,title:'Static archive copy',blocks:[{id:crypto.randomUUID(),blockType:'synced-reference',content:{sourcePageId:sourceId,sourceBlockId:blockId},treePosition:'0'}]})).value.pageId;
  await call('POST','/api/sharing',{operationKey:randomOperationKey('static-share'),targetKind:'page',targetId:staticCopyId,principalKind:'member',principalId:source.readerId,level:'view'});
  const document=await call('GET',`/api/pages/${sourceId}`);await call('POST',`/api/archive/${sourceId}`,{operationKey:randomOperationKey('static-trash'),expectedRevisionId:document.page.revisionId,action:'trash'});
  await call('POST',`/api/archive/${sourceId}/permanent-delete`,{operationKey:randomOperationKey('static-delete'),confirmedPageIds:[sourceId]});
  expect((await call('GET',`/api/pages/${staticCopyId}`)).blocks[0].synced).toMatchObject({static:true,text:[{text:staticText}]});
  // Complete native backups must not widen a restricted static copy's frozen audience.
  const readerCookie=await sessionFor(source.readerId!,{freshProof:true});
  const readerCall=async(method:string,path:string,body?:unknown)=>{const response=await apiRequest(path,readerCookie,'core-wiki',{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json<any>();expect(response.status,JSON.stringify(data)).toBe(200);return data;};
  await readerCall('GET','/api/members/current');const personal=(await readerCall('GET','/api/containers')).items.find((c:any)=>c.visibility==='personal');expect(personal).toBeDefined();
  const privateText='Private reader-only retained source',privateBlock=crypto.randomUUID();
  const privateSource=(await readerCall('POST','/api/pages',{operationKey:randomOperationKey('private-static-source'),containerId:personal.id,title:'Private retained source',blocks:[{id:privateBlock,blockType:'synced-source',content:{text:[{text:privateText}]},treePosition:'0'}]})).value.pageId;
  const privateCopy=(await call('POST','/api/pages',{operationKey:randomOperationKey('private-static-copy'),containerId:privateContainer,title:'Restricted retained copy'})).value.pageId;
  await call('POST','/api/sharing',{operationKey:randomOperationKey('private-static-share'),targetKind:'page',targetId:privateCopy,principalKind:'member',principalId:source.readerId,level:'edit'});
  await readerCall('PUT',`/api/pages/${privateCopy}/blocks`,{operationKey:randomOperationKey('private-static-insert'),expectedRevisionId:(await call('GET',`/api/pages/${privateCopy}`)).page.revisionId,blocks:[{id:crypto.randomUUID(),blockType:'synced-reference',content:{sourcePageId:privateSource,sourceBlockId:privateBlock},treePosition:'0'}]});
  const privateDoc=await readerCall('GET',`/api/pages/${privateSource}`);await readerCall('POST',`/api/archive/${privateSource}`,{operationKey:randomOperationKey('private-static-trash'),expectedRevisionId:privateDoc.page.revisionId,action:'trash'});await readerCall('POST',`/api/archive/${privateSource}/permanent-delete`,{operationKey:randomOperationKey('private-static-delete'),confirmedPageIds:[privateSource]});
  const hidden=await call('GET',`/api/pages/${privateCopy}`);expect(hidden.blocks[0].synced).toEqual({state:'access-needed'});expect(JSON.stringify(hidden)).not.toContain(privateText);
  const refused=await apiRequest('/api/exports/workspace',profileCookie,'core-wiki',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationKey:randomOperationKey('private-static-export')})});const refusedBody=await refused.json<any>();expect(refused.status,JSON.stringify(refusedBody)).toBe(403);expect(refusedBody.code).toBe('EXPORT_SCOPE_INCOMPLETE');expect(refusedBody.message).toContain('retained static');expect(JSON.stringify(refusedBody)).not.toContain(privateText);
  // Blind deletion of the copy remains permitted; it removes its retained private payload.
  await call('POST',`/api/archive/${privateCopy}`,{operationKey:randomOperationKey('private-copy-trash'),expectedRevisionId:hidden.page.revisionId,action:'trash'});await call('POST',`/api/archive/${privateCopy}/permanent-delete`,{operationKey:randomOperationKey('private-copy-delete'),confirmedPageIds:[privateCopy]});
  sourceArchive=await exportNativeArchive(source);
  expect(sourceArchive.manifest.tables.synced_static_content!.length).toBeGreaterThan(0);
},10000);
afterAll(async()=>{await resetNative();},10000);

async function expectCoreBlocks(cookie:string,profile:'core-wiki'|''|undefined){
  const paths=[
    `/api/inquiries/${source.inquiryId}`,
    `/api/%69nquiries/${source.inquiryId}`,
    `/api/experiments/${source.trialId}`,
    `/api/skills/${source.skillId}`,
    '/api/connectors',
  ];
  for(const path of paths){
    const response=await apiRequest(path,cookie,profile);
    expect(response.status,`${profile??'default'} blocked ${path}`).toBe(403);
    expect((await response.json() as {code:string}).code).toBe('FEATURE_DISABLED');
  }
  for(const [path,body] of [
    [`/api/inquiries/${source.inquiryId}/continue`,{}],
    [`/api/experiments/${source.trialId}/execute`,{}],
    [`/api/skills/${source.skillId}/prepare-evaluation`,{}],
  ] as const){
    const response=await apiRequest(path,cookie,profile,{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
    expect(response.status,`${profile??'default'} blocked mutation ${path}`).toBe(403);
    expect((await response.json() as {code:string}).code).toBe('FEATURE_DISABLED');
  }
}

test("FLAG-001 — core profile gates preserve pages, portable history and disabled restored execution", async () => {
  await runFoldCases([
{name:"FLAG-001 — default and empty core profiles block flagship operations without provider effects while preserving page read, edit, export and historical rows",before:async()=>{},run:async()=>{
try {

  const cookie=await setupOwnerCookie(source),beforeCounts=await tableCounts(),beforeD1=await portableSnapshot(),beforeR2=await r2Snapshot();
  const effectBefore=await env.DB.prepare('SELECT count(*) AS n FROM intelligence_effects').first<number>('n');
  const connectionBefore=await env.DB.prepare('SELECT id,state,credential_ciphertext FROM federation_connections WHERE id=?').bind(source.connectionId).first();
  const receiptsBefore=await env.DB.prepare('SELECT count(*) AS n FROM operation_receipts').first<number>('n');
  const originalFetch=globalThis.fetch,providerAttempts:string[]=[];
  globalThis.fetch=(async(input:RequestInfo|URL)=>{providerAttempts.push(input instanceof Request?input.url:String(input));throw new Error(`Unmatched core-profile provider transport request: ${providerAttempts.at(-1)}`);}) as typeof fetch;
  try{
    await expectCoreBlocks(cookie,undefined);
    await expectCoreBlocks(cookie,'');
  }finally{globalThis.fetch=originalFetch;}
  expect(providerAttempts).toEqual([]);
  expect(await tableCounts()).toEqual(beforeCounts);
  const afterBlockedD1=await portableSnapshot(),afterBlockedR2=await r2Snapshot();
  expect(afterBlockedD1.hash).toBe(beforeD1.hash);
  expect(afterBlockedR2).toEqual(beforeR2);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM intelligence_effects').first<number>('n')).toEqual(effectBefore);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM operation_receipts').first<number>('n')).toEqual(receiptsBefore);
  expect(await env.DB.prepare('SELECT id,state,credential_ciphertext FROM federation_connections WHERE id=?').bind(source.connectionId).first()).toEqual(connectionBefore);

  const read=await apiJson(`/api/pages/${source.pages.rootId}`,cookie,undefined);
  expect(read.status).toBe(200);
  const current=await read.json() as {workingRevisionId:string};
  const edited=await apiRequest(`/api/pages/${source.pages.rootId}`,cookie,undefined,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({operationKey:randomOperationKey('core-page-edit'),expectedRevisionId:current.workingRevisionId,properties:{title:'Core profile retained owner history'}})});
  expect(edited.status).toBe(200);
  const readAfterEdit=await apiJson(`/api/pages/${source.pages.rootId}`,cookie,undefined);
  expect((await readAfterEdit.json() as {properties:{title:string}}).properties.title).toBe('Core profile retained owner history');
  const exported=await apiRequest('/api/exports/workspace',cookie,undefined,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationKey:randomOperationKey('core-export')})});
  expect(exported.status).toBe(200);
  const job=await exported.json() as {id:string;state:string;counts:Record<string,number>};
  expect(job.state).toBe('completed');
  const download=await apiRequest(`/api/exports/${job.id}/download`,cookie,undefined);
  expect(download.status).toBe(200);
  const exportedBytes=new Uint8Array(await download.arrayBuffer());
  const {decodeArchive}=await import('../../../../src/core/features/portability/archive');
  const exportedArchive=await decodeArchive(exportedBytes);
  expect(exportedArchive.manifest.tables.pages!.some(row=>row.id===source.pages.rootId)).toBe(true);
  expect(exportedArchive.manifest.tables.knowledge_decisions!.some(row=>row.id===source.decisionId)).toBe(true);
  expect(exportedArchive.manifest.tables.intelligence_analyses!.some(row=>row.id===source.analysisId)).toBe(true);
  expect(exportedArchive.manifest.tables.federation_connections!.find(row=>row.id===source.connectionId)!.credential_ciphertext).toBeNull();
  expect(exportedArchive.manifest.blobs.some(blob=>blob.key===source.importArchiveKey)).toBe(true);
  expect(await byteHash(exportedBytes)).not.toBe(await byteHash(sourceArchive.bytes));
  const counts=await tableCounts();
  const migrationsAfter=await migrationNames();
  expect(migrationsAfter).toEqual(migrations);
  console.log('Release_EVIDENCE '+JSON.stringify({clause:'FLAG-001',profiles:['default','empty'],blockedRequests:16,providerAttempts:providerAttempts.length,portableTableCount:Object.keys(sourceArchive.manifest.tables).length,migrationNames:migrationsAfter,sourceArchiveHash:await byteHash(sourceArchive.bytes),sourceArchiveR2Key:sourceArchive.key,coreExportHash:await byteHash(exportedBytes),coreExportR2Key:(await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(job.id).first<{archive_key:string}>())?.archive_key,blockedBeforeD1:beforeD1,blockedAfterD1:afterBlockedD1,blockedBeforeR2:beforeR2,blockedAfterR2:afterBlockedR2,sourceCounts:beforeCounts,afterCoreEditAndExportCounts:counts,retainedIds:{page:source.pages.rootId,decision:source.decisionId,inquiry:source.inquiryId,analysis:source.analysisId,trial:source.trialId,skill:source.skillId,connection:source.connectionId,import:source.importId},effectRows:effectBefore,blockedRequestReceiptRows:receiptsBefore}));

} finally {}
}},
{name:"FLAG-001 — core-profile restore retains and exports flagship history while restored execution authority remains disabled",before:async()=>{},run:async()=>{
try {

  await resetNative();
  const target=await makeWorkspace({email:source.ownerEmail,withReader:false,withContainer:false});
  const beforeD1=await portableSnapshot();
  const staged=await stageRestoreThroughApi(target,sourceArchive.bytes,'');
  expect(staged.response.status).toBe(202);
  expect(staged.body.state).toBe('queued');
  const beforeR2=await r2Snapshot();
  const restored=await runRestoreThroughApi(staged.cookie,staged.body.id,'');
  expect(restored.response.status).toBe(200);
  expect(restored.body.state).toBe('completed');
  expect(await migrationNames()).toEqual(migrations);
  const counts=await tableCounts();
  const afterD1=await portableSnapshot();
  const archiveCounts=Object.fromEntries(Object.entries(sourceArchive.manifest.tables).map(([name,rows])=>[name,rows.length]));
  expect(counts).toEqual(archiveCounts);
  expect(afterD1.counts).toEqual(archiveCounts);
  const owner=await env.DB.prepare('SELECT id,email,role,status,is_setup_owner FROM members WHERE id=?').bind(source.ownerId).first<{id:string;email:string;role:string;status:string;is_setup_owner:number}>();
  expect(owner).toEqual({id:source.ownerId,email:source.ownerEmail,role:'owner',status:'active',is_setup_owner:1});
  const cookie=await sessionFor(source.ownerId,{freshProof:true});
  const staticRead=await (await apiRequest(`/api/pages/${staticCopyId}`,cookie,'')).json<any>();expect(staticRead.blocks[0].synced).toMatchObject({static:true,text:[{text:staticText}]});
  expect((await env.DB.prepare('SELECT * FROM synced_static_content ORDER BY id').all()).results).toEqual([...sourceArchive.manifest.tables.synced_static_content!].sort((a,b)=>String(a.id).localeCompare(String(b.id))));
  const inactive=await apiRequest(`/api/pages/${staticCopyId}`,await sessionFor(source.readerId!),'' );expect(inactive.status).toBe(401);expect(await inactive.text()).not.toContain(staticText);
  const {memberId:newReader}=await seedMember(source.workspaceId,{role:'member',email:'synthetic-slate-60@example.invalid',displayName:'New archive reader'});
  const grant=await apiRequest('/api/sharing',cookie,'',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationKey:randomOperationKey('restored-static-reader'),targetKind:'page',targetId:staticCopyId,principalKind:'member',principalId:newReader,level:'view'})});expect(grant.status,await grant.text()).toBe(200);
  const deniedResponse=await apiRequest(`/api/pages/${staticCopyId}`,await sessionFor(newReader),'');expect(deniedResponse.status).toBe(200);const staticDenied=await deniedResponse.json<any>();expect(staticDenied.blocks[0].synced).toEqual({state:'access-needed'});expect(JSON.stringify(staticDenied)).not.toContain(staticText);expect(JSON.stringify(staticDenied)).not.toContain('Restricted archive source');
  // Authenticate the profile probe after comparing the untouched restored rows.
  const restoredProfile=await apiRequest(`/api/people/${source.ownerId}`,cookie,'core-wiki');expect(restoredProfile.status).toBe(200);expect(await restoredProfile.json<any>()).toMatchObject({title:'Response coordinator',timezone:'Australia/Brisbane',hiddenTags:[{tag:'Private restore choice',custom:true}]});
  await expectCoreBlocks(cookie,'');
  const page=await apiJson(`/api/pages/${source.pages.rootId}`,cookie,'');
  expect(page.status).toBe(200);
  const pageView=await page.json() as {workingRevisionId:string;properties:{title:string}};
  expect(pageView.workingRevisionId).toBe(source.pages.rootRevisionId);
  const analysis=await env.DB.prepare('SELECT id,input_hash,inputs_json,result_json,refs_json FROM intelligence_analyses WHERE id=?').bind(source.analysisId).first();
  const archivedAnalysis=sourceArchive.manifest.tables.intelligence_analyses!.find(row=>row.id===source.analysisId)!;
  expect(analysis).toEqual({id:archivedAnalysis.id,input_hash:archivedAnalysis.input_hash,inputs_json:archivedAnalysis.inputs_json,result_json:archivedAnalysis.result_json,refs_json:archivedAnalysis.refs_json});
  const decision=await env.DB.prepare('SELECT id,state,accepted_revision_id FROM knowledge_decisions WHERE id=?').bind(source.decisionId).first();
  expect(decision).toEqual({id:source.decisionId,state:'accepted',accepted_revision_id:source.decisionRevisionId});
  const trial=await env.DB.prepare('SELECT id,state,grant_id,plan_json FROM intelligence_experiments WHERE id=?').bind(source.trialId).first<{id:string;state:string;grant_id:string|null;plan_json:string}>();
  expect(trial).toMatchObject({id:source.trialId,state:'stopped',grant_id:null,plan_json:sourceArchive.manifest.tables.intelligence_experiments!.find(row=>row.id===source.trialId)!.plan_json});
  const connection=await env.DB.prepare('SELECT id,state,credential_ciphertext FROM federation_connections WHERE id=?').bind(source.connectionId).first();
  expect(connection).toEqual({id:source.connectionId,state:'needs-attention',credential_ciphertext:null});
  const imported=await env.DB.prepare('SELECT id,archive_key,state FROM federation_imports WHERE id=?').bind(source.importId).first<{id:string;archive_key:string;state:string}>();
  expect(imported?.id).toBe(source.importId);
  expect(imported?.archive_key).not.toBe(source.importArchiveKey);
  const blob=await env.FILES.get(imported!.archive_key);
  expect(blob).not.toBeNull();
  expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(originalFileBytes);
  const exported=await apiRequest('/api/exports/workspace',cookie,'',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operationKey:randomOperationKey('core-restored-export')})});
  expect(exported.status).toBe(200);
  const exportedJob=await exported.json() as {id:string;state:string};
  expect(exportedJob.state).toBe('completed');
  const download=await apiRequest(`/api/exports/${exportedJob.id}/download`,cookie,'');
  expect(download.status).toBe(200);
  const rearchive=await (await import('../../../../src/core/features/portability/archive')).decodeArchive(new Uint8Array(await download.arrayBuffer()));
  expect(rearchive.manifest.tables.knowledge_decisions!.some(row=>row.id===source.decisionId)).toBe(true);
  expect(rearchive.manifest.tables.intelligence_analyses!.some(row=>row.id===source.analysisId)).toBe(true);
  expect(rearchive.manifest.blobs.some(item=>item.key===imported!.archive_key)).toBe(true);
  const foreignKeys=await env.DB.prepare('PRAGMA foreign_key_check').all();
  expect(foreignKeys.results).toEqual([]);
  const afterR2=await r2Snapshot();
  expect(afterR2).toEqual(expect.arrayContaining([{key:imported!.archive_key,size:originalFileBytes.length,hash:await byteHash(originalFileBytes)}]));
  console.log('Release_EVIDENCE '+JSON.stringify({clause:'FLAG-001',restoreId:restored.body.restoreId,archiveHash:await byteHash(sourceArchive.bytes),portableTableCount:Object.keys(sourceArchive.manifest.tables).length,beforeD1,afterD1,restoredCounts:counts,migrationNames:await migrationNames(),beforeR2,afterR2,coreRearchiveHash:await byteHash(new Uint8Array(await (await apiRequest(`/api/exports/${exportedJob.id}/download`,cookie,'')).arrayBuffer())),authority:{trialState:trial!.state,trialGrant:trial!.grant_id,connectionState:(connection as {state:string}).state,credentialCiphertext:(connection as {credential_ciphertext:null}).credential_ciphertext},importedKey:imported!.archive_key,importedOriginalHash:await byteHash(originalFileBytes),foreignKeyViolations:foreignKeys.results.length}));

} finally {}
}}
  ]);
});
