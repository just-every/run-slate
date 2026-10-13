import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createImportJob, applyImportBatches, readPersistedImport, reconcileImport, readImportOriginals, sha256, canonicalJson } from '../../src/index.ts';
import { createTarget, contextFor } from './runtime.ts';
import { prepareZendeskPort, LILY_COMMIT } from './port.ts';
import { snapshot, quote } from './sqlite.ts';
import { verifyLilySource } from './source.ts';
import { normalizeTables, outcomeCounts, differences } from './compare.ts';
/** Requires an unchanged local materialization of the pinned Lily source and its pinned runtime. */
export async function runProof(lilyRoot:string,outputRoot:string) {
  await verifyLilySource(lilyRoot);
  await mkdir(outputRoot,{recursive:true});
  const work=await mkdtemp(join(outputRoot,'state-'));
  const wrangler=await import(pathToFileURL(resolve(lilyRoot,'node_modules/wrangler/wrangler-dist/cli.js')).href);
  const {getPlatformProxy}=wrangler;
  const fixtureModule=await import(pathToFileURL(resolve(lilyRoot,'tests/harness/zendesk-fixture.mjs')).href);
  const bytes=Buffer.from(fixtureModule.zendeskFixture.map((r:any)=>JSON.stringify(r)).join('\n'));
  const attachment=Buffer.from([0,128,255]);
  const file=join(work,'export.ndjson');await writeFile(file,bytes);await writeFile(join(work,'original.bin'),attachment);
  const options={namespace:'original-zendesk',actor:'admin',files:[file],root:work,attachments:{300:'original.bin'}};
  const mapping=join(work,'mapping.json');await writeFile(mapping,JSON.stringify(options));
  const config=join(work,'wrangler.json');
  await writeFile(config,JSON.stringify({name:'lily-kit-proof',compatibility_date:'2026-09-08',d1_databases:[{binding:'DB',database_name:'proof',database_id:'local',migrations_dir:resolve(lilyRoot,'migrations/core')}],r2_buckets:[{binding:'FILES',bucket_name:'proof'}]}));
  const env={...process.env,PLAYWRIGHT_SKIP_BROWSER_GC:'1',WRANGLER_SEND_METRICS:'false'};
  const wranglerBin=resolve(lilyRoot,'node_modules/wrangler/bin/wrangler.js');
  execFileSync(process.execPath,[wranglerBin,'d1','migrations','apply','DB','--local','--config',config,'--persist-to',join(work,'original')],{cwd:lilyRoot,env,stdio:'pipe',maxBuffer:20*1024*1024});
  const filename=join(work,'port.sqlite');const storage=await createTarget(filename,lilyRoot);
  let proxy=await getPlatformProxy({configPath:config,envFiles:[],persist:{path:join(work,'original/v3')}});
  const originalBaseline:any={};
  try {
    await proxy.env.DB.prepare("UPDATE ticket_service_queue_enforcement SET enabled=1 WHERE id=1").run();
    await proxy.env.DB.prepare("INSERT INTO operators(id,display_name,email,role,active,created_at,updated_at) VALUES ('admin','Administrator','admin@example.test','owner',1,'2026-01-01','2026-01-01')").run();
    for(const name of Object.keys(snapshot(storage.database))) originalBaseline[name]=(await proxy.env.DB.prepare(`SELECT * FROM ${quote(name)}`).all()).results.map((row:any)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Array.isArray(v)?{base64:Buffer.from(v).toString('base64')}:v])));
  }finally{await proxy.dispose();}
  const dryReport=join(work,'original-dry.json'),applyReport=join(work,'original-apply.json');
  const cli=resolve(lilyRoot,'scripts/import-zendesk.mjs');
  const args=[cli,'--mapping',mapping,'--config',config,'--offline','--persist',join(work,'original/v3')];
  const dryOutput=execFileSync(process.execPath,[...args,'--report',dryReport],{cwd:lilyRoot,env,encoding:'utf8'});
  const applyOutput=execFileSync(process.execPath,[...args,'--report',applyReport,'--apply'],{cwd:lilyRoot,env,encoding:'utf8'});
  const originalReport=JSON.parse(await readFile(applyReport,'utf8'));
  proxy=await getPlatformProxy({configPath:config,envFiles:[],persist:{path:join(work,'original/v3')}});
  const originals:any={};const originalAttachments:any=[];
  try {
    for(const name of Object.keys(snapshot(storage.database))) originals[name]=(await proxy.env.DB.prepare(`SELECT * FROM ${quote(name)}`).all()).results.map((row:any)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Array.isArray(v)?{base64:Buffer.from(v).toString('base64')}:v])));
    for(const a of originalReport.attachments) {
      const data=Buffer.from(await (await proxy.env.FILES.get(a.object_key)).arrayBuffer());
      originalAttachments.push({object_key:a.object_key,sha256:sha256(data),base64:data.toString('base64')});
    }
  }finally{await proxy.dispose();}
  const context:any=contextFor(storage);
  let result:any;
  try {
    const baseline=snapshot(storage.database);
    const prepared=await prepareZendeskPort(lilyRoot,options,context);
    assert.deepEqual(snapshot(storage.database),baseline,'plan is nonmutating');
    context.reviewedFingerprint=prepared.plan.fingerprint;
    const job=await createImportJob(prepared.plan,context);
    const worker=fileURLToPath(new URL('./worker.ts',import.meta.url));
    const killed=spawnSync(process.execPath,[worker,filename,job.id,'kill'],{env,encoding:'utf8'});
    assert.equal(killed.signal,'SIGKILL',killed.stderr);
    const checkpoint=JSON.parse(killed.stdout.trim());assert.ok(checkpoint.checkpoint>0&&checkpoint.checkpoint<checkpoint.total);
    // A real new process reopens durable state after the killed worker's short lease expires.
    await new Promise(r=>setTimeout(r,1100));
    const resumed=JSON.parse(execFileSync(process.execPath,[worker,filename,job.id,'resume'],{env,encoding:'utf8'}).trim());
    assert.equal(resumed.state,'completed');
    const reconciliation=reconcileImport(prepared.plan,readPersistedImport(context),context);
    assert.equal(reconciliation.ok,true,JSON.stringify(reconciliation));
    const portTables=snapshot(storage.database);
    const originalTime=originals.data_import_runs[0].created_at;
    const deltas=(after:any,before:any)=>Object.fromEntries(Object.entries(after).map(([t,rows]:any)=>[t,{added:rows.filter((r:any)=>!before[t].some((b:any)=>canonicalJson(b)===canonicalJson(r))),removed:before[t].filter((r:any)=>!rows.some((b:any)=>canonicalJson(b)===canonicalJson(r)))}]));
    const originalDelta=deltas(normalizeTables(originals,originalTime),normalizeTables(originalBaseline,originalTime));
    const portDelta=deltas(normalizeTables(portTables,prepared.original.now),normalizeTables(baseline,prepared.original.now));
    const mismatchedTables=differences(originalDelta,portDelta);
    assert.deepEqual(mismatchedTables,[],'independent unchanged CLI vs kit target rows');
    const portOutcomes=portTables.data_import_source_records.map((r:any)=>({type:r.source_type,sourceId:r.source_id,lilyId:r.lily_id,sourceNumber:r.source_number,lilyNumber:r.lily_number,outcome:r.outcome}));
    assert.deepEqual(outcomeCounts(portOutcomes),outcomeCounts(originalReport.outcomes));
    const persisted=readPersistedImport(context);
    const portAttachments=persisted.rows.filter(r=>r.attachment).map(r=>({object_key:(r.value as any).row.object_key,sha256:r.attachment!.sha256,base64:r.attachment!.base64}));
    assert.deepEqual(portAttachments,originalAttachments);
    const retained=readImportOriginals(job.id,context);
    assert.ok(retained.some(r=>r.kind==='artifact'&&r.sha256===sha256(bytes)&&r.original.status==='retained'&&r.original.base64===bytes.toString('base64')));
    const beforeReplay=canonicalJson(portTables);await applyImportBatches(job.id,context);assert.equal(canonicalJson(snapshot(storage.database)),beforeReplay);
    const undo=JSON.parse(execFileSync(process.execPath,[worker,filename,job.id,'undo'],{env,encoding:'utf8'}).trim());assert.equal(undo.state,'undone');
    assert.deepEqual(snapshot(storage.database),baseline,'native undo restores entire baseline');
    assert.equal(storage.database.prepare('PRAGMA foreign_key_check').all().length,0);
    result={originalNativeDelta:originalDelta,portNativeDelta:portDelta,label:'Synthetic documented-format fixture; no authorized real export supplied',lilyCommit:LILY_COMMIT,source:{fixtureModuleSha256:sha256(await readFile(resolve(lilyRoot,'tests/harness/zendesk-fixture.mjs'))),ndjsonSha256:sha256(bytes),ndjsonSize:bytes.length,attachmentSha256:sha256(attachment),attachmentSize:attachment.length},wrapperInputs:prepared.wrapperInputCount,kitInputs:prepared.plan.counts.input,outcomes:outcomeCounts(originalReport.outcomes),kitPlan:prepared.plan.counts,nativeTables:Object.fromEntries(Object.entries(portTables).filter(([t,rows]:any)=>canonicalJson(rows)!==canonicalJson(baseline[t])).map(([t,rows]:any)=>[t,{before:baseline[t].length,after:rows.length,rows}])),sourceIdentities:portOutcomes,attachments:portAttachments,unmapped:prepared.plan.entries.filter(e=>e.unmapped.length).map(e=>({kind:e.source.kind,id:e.source.sourceId,unmapped:e.unmapped})),reconciliation,provenanceCount:persisted.provenance.length,kill:{signal:killed.signal,checkpoint:checkpoint.checkpoint,total:checkpoint.total},resume:resumed.state,undo:undo.state,originalCli:{dryOutput,applyOutput,command:[process.execPath,...args,'--report','REPORT.json','--apply']},limitations:['Synthetic fixture only; real-export status remains documented format','Original CLI uses D1/R2; branch port uses native Lily tables and SQLite BLOB custody','Import timestamps normalized; comparison includes exact full affected-row deltas against each independently migrated baseline','FTS virtual/shadow tables are excluded; owning indexed rows are compared']};
    await writeFile(join(outputRoot,'comparison.json'),JSON.stringify(result,null,2));
    await writeFile(join(outputRoot,'original-dry-run.json'),await readFile(dryReport));
    await writeFile(join(outputRoot,'original-apply.json'),await readFile(applyReport));
    await rm(join(outputRoot,'failure.txt'),{force:true});
  }finally{storage.close();await rm(work,{recursive:true,force:true});}
  return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [lilyRoot,outputRoot]=process.argv.slice(2);
  if(!lilyRoot||!outputRoot)throw new Error('Usage: node run.ts PINNED_LILY_MATERIALIZATION OUTPUT_DIRECTORY');
  try { console.log(JSON.stringify(await runProof(resolve(lilyRoot),resolve(outputRoot)),null,2)); } catch(error) { await writeFile(resolve(outputRoot,'failure.txt'),String((error as any)?.stack??error)); process.exitCode=1; }
}
