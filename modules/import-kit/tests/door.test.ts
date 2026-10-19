import test from 'node:test';
import assert from 'node:assert/strict';
import { door, documents } from './door/fixture.ts';
import { createImportDoorHandler, DoorError, enableDoorAtFirstClaim, importDoorApplyFailureMigration, importDoorSchema, readImportDoorHistory, verifyRerGrant, writeImportDoorSettings } from '../src/door/index.ts';
import { d1RequestContext, readD1ImportOriginals, readD1ErasureJournal, retireD1ImportCustody, undoD1Import } from '../src/d1/index.ts';
import { limitStatements } from '../src/d1/budget.ts';
import { canonicalJson, sha256 } from '../src/provenance/identity.ts';
import { sqliteTargets } from './d1/sqlite-runtime.ts';
import type { Json } from '../src/types.ts';

test('HTTP import door is absent until the installation opts in',async t=>{
  const d=await door(t);
  for (const action of ['uploads','plan','apply','status','reconcile','undo'] as const) assert.equal((await d.call(action,{})).status,404);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM ik_door_grants').get()!.n,0);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  const erased=await retireD1ImportCustody({values:['absent@example.test']},[],d.runtime.context(),[]);
  assert.equal(erased.phase,'complete');
  assert.equal((await readD1ErasureJournal(d.runtime.context()))[0].receiptId,erased.receiptId);
  await d.enable();
  delete (d.options.claim.publicKeys as Record<string, JsonWebKey>).test;
  for (const action of ['uploads','plan','apply','status','reconcile','undo'] as const) assert.equal((await d.call(action,{})).status,404);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM ik_door_grants').get()!.n,0);
});

test('A Business install opens its door at the first owner claim and never reopens it after the owner turns it off',async t=>{
  const d=await door(t),native=d.runtime.native(),key=d.options.claim.installationId;
  const closed=async ()=>{for (const action of ['uploads','status'] as const) assert.equal((await d.call(action,{})).status,404,action);};
  // Before any owner exists the claim path cannot enable it, and writes nothing.
  native.exec("UPDATE native_authority SET enabled=0 WHERE id='owner'");
  await assert.rejects(enableDoorAtFirstClaim(d.db,key,d.ownerPredicate),(e:unknown)=>e instanceof DoorError&&e.code==='owner_required');
  assert.equal(native.prepare('SELECT count(*) n FROM ik_door_settings').get()!.n,0);
  await closed();
  // The owner's first claim (RER_IMPORT_DOOR=on) opens the door for RER grants.
  native.exec("UPDATE native_authority SET enabled=1 WHERE id='owner'");
  // The claim committed but the enable batch failed (the claim cannot run twice): the door stays closed ...
  const flaky={prepare:d.db.prepare.bind(d.db),batch:async()=>{throw new Error('D1_ERROR: Network connection lost');}} as unknown as typeof d.db;
  await assert.rejects(enableDoorAtFirstClaim(flaky,key,d.ownerPredicate),/Network connection lost/);
  assert.equal(native.prepare('SELECT count(*) n FROM ik_door_settings').get()!.n,0);
  await closed();
  // ... until the next owner path (sign-in or the claim's already-initialized answer) calls it again.
  await enableDoorAtFirstClaim(d.db,key,d.ownerPredicate);
  const uploadId=await d.upload(documents(2));
  assert.equal((await d.call('uploads',{uploadId})).body.complete,true);
  await enableDoorAtFirstClaim(d.db,key,d.ownerPredicate);
  assert.equal((await d.call('uploads',{uploadId})).status,200,'a repeated claim call is harmless');
  // The owner turns it off; a later claim-path call does not override that.
  await writeImportDoorSettings(d.db,key,{enabled:false,revokedKids:['retired']},d.ownerPredicate);
  await enableDoorAtFirstClaim(d.db,key,d.ownerPredicate);
  await closed();
  assert.deepEqual(native.prepare('SELECT installation_id,enabled FROM ik_door_settings').all().map(r=>({...r})),[{installation_id:key,enabled:0}]);
  assert.equal(native.prepare('SELECT count(*) n FROM ik_door_revoked_keys').get()!.n,1);
  // A self-hosted install never calls it: its door stays closed after the owner exists.
  const selfHosted=await door(t);
  for (const action of ['uploads','status'] as const) assert.equal((await selfHosted.call(action,{})).status,404,action);
  assert.equal(selfHosted.runtime.native().prepare('SELECT count(*) n FROM ik_door_settings').get()!.n,0);
});

test('verifyRerGrant accepts only an exact RER-signed read for its route and refuses everything else',async t=>{
  const d=await door(t),claim=d.options.claim;
  // A seed route outside the import door, as Uptime mounts POST /api/rer/runner-status.
  const route=async (request:Request,action='runner-status'):Promise<Response|null>=>{
    if (new URL(request.url).pathname!=='/api/rer/runner-status') return null;
    try { const {grant,kid}=await verifyRerGrant(request,claim,action); return Response.json({action:grant.action,installationId:grant.installationId,kid}); }
    catch (error) { if (error instanceof DoorError) return Response.json({error:error.code},{status:error.status}); throw error; }
  };
  d.mount(route,createImportDoorHandler(d.options));
  const now=Math.floor(Date.now()/1000);
  const read=(extra:Record<string,unknown>={})=>({v:1,iss:claim.issuer,aud:d.origin,installationId:claim.installationId,email:claim.expectedEmail,jti:crypto.randomUUID(),iat:now,exp:now+300,action:'runner-status',...extra});
  const post=async (headers:Record<string,string>,path='/api/rer/runner-status')=>{
    const response=await fetch(d.origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'});
    return {status:response.status,body:await response.json() as any};
  };
  const bearer=async (payload:Record<string,unknown>,privateKey?:CryptoKey)=>({Authorization:'Bearer '+await d.sign(payload,privateKey)});
  const accepted=await post(await bearer(read()));
  assert.deepEqual(accepted,{status:200,body:{action:'runner-status',installationId:claim.installationId,kid:'test'}});
  assert.deepEqual(await post({}),{status:401,body:{error:'grant_required'}});
  const forger=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const {exp:_,...noExpiry}=read();
  for (const [why,payload,key] of [
    ['forged signature',read(),forger.privateKey],
    ['another action',read({action:'runner-config'})],
    ['a door grant',{...read({action:'status'}),namespace:'knowledge',maxBytes:1,maxChunks:1,maxRecords:1}],
    ['an unknown member',read({namespace:'knowledge'})],
    ['a missing member',noExpiry],
    ['expired',read({iat:now-400,exp:now-100})],
    ['over 300 seconds',read({exp:now+301})],
    ['another installation',read({installationId:'other-installation'})],
    ['another owner',read({email:'someone@example.test'})],
    ['another audience',read({aud:'https://other.example.test'})],
    ['another issuer',read({iss:'https://rer.example.test'})],
  ] as [string,Record<string,unknown>,CryptoKey?][]) assert.deepEqual(await post(await bearer(payload,key)),{status:403,body:{error:'invalid_grant'}},why);
  // A read grant opens nothing in the import door, even when it is enabled.
  await d.enable();
  assert.equal((await post(await bearer(read({action:'status'})),'/api/rer/import/status')).status,403);
  // Bound to the claim's app origin, whatever host the request reached.
  const elsewhere=await route(new Request('https://elsewhere.example.test/api/rer/runner-status',{method:'POST',headers:await bearer(read())}));
  assert.deepEqual([elsewhere!.status,await elsewhere!.json()],[403,{error:'grant_binding_mismatch'}]);
  // Door actions stay the door's, and a malformed action is a configuration error.
  for (const action of ['status','apply','Runner status','']) {
    const refused=await route(new Request(d.origin+'/api/rer/runner-status',{method:'POST',headers:await bearer(read({action}))}),action);
    assert.deepEqual([refused!.status,await refused!.json()],[503,{error:'invalid_configuration'}],action);
  }
});

test('HTTP door uploads and applied snapshots erase with their destination in the journal batch',async t=>{
  for (const mode of [{bounded:false,legacy:false},{bounded:true,legacy:false},{bounded:false,legacy:true},{bounded:true,legacy:true}]) {
    const {bounded,legacy}=mode;
    const d=await door(t);await d.enable();
    const secret=['test','private','record','value'].join('-'),records=[{id:'private',title:secret,body:'Private imported knowledge'}];
    const planned=await d.plan(records);assert.equal(planned.status,200,JSON.stringify(planned.body));
    const job=await d.apply(planned.body);
    const other=createImportDoorHandler({...d.options,destination:'other-workspace'});
    const wrongDestination=await other(new Request(d.options.claim.appOrigin+'/api/rer/import/status',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await d.token('status')},body:JSON.stringify({planId:planned.body.planId})}));
    assert.equal(wrongDestination!.status,403,'a namespace binding cannot move to another destination');
    const otherCall=async (action:'uploads'|'plan'|'apply',body:unknown,extra:Record<string,string>={})=>{
      const response=await other(new Request(d.options.claim.appOrigin+'/api/rer/import/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await d.token(action,{namespace:'other',...extra})},body:JSON.stringify(body)}));
      assert.equal(response!.status,200);return response!.json() as Promise<any>;
    };
    const keptBytes=Buffer.from(JSON.stringify([{id:'kept',title:'Kept knowledge'}]));
    const kept=await otherCall('uploads',{name:'kept.json',bundleSha256:sha256(keptBytes),totalBytes:keptBytes.length,totalChunks:1,index:0,chunkSha256:sha256(keptBytes),base64:keptBytes.toString('base64')});
    const keptPlan=await otherCall('plan',{uploadId:kept.uploadId});
    await otherCall('apply',{planId:keptPlan.planId,reviewedFingerprint:keptPlan.fingerprint},{fingerprint:keptPlan.fingerprint,...d.approval});
    // Unplanned uploads have content too, including in a previously unused namespace.
    await d.upload(records,{namespace:legacy?'knowledge':'unplanned'});
    if (!bounded) await writeImportDoorSettings(d.db,d.options.claim.installationId,{enabled:false},d.ownerPredicate);
    const native=d.runtime.native();
    if (legacy) {
      native.exec('DROP TABLE ik_door_scopes');
      // Creation can commit before the door's job index update. Its immutable
      // operation key is still a real scope link in the legacy schema.
      native.prepare('UPDATE ik_door_plans SET job_id=NULL WHERE id=?').run(planned.body.planId);
    }
    const doorTables=()=>native.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik_door_%' ORDER BY name").all().map(r=>r.name as string);
    const contentTables=['ik_door_chunks','ik_door_plan_chunks','ik_door_uploads'];
    const before=new Map(doorTables().map(table=>[table,Number(native.prepare(`SELECT count(*) n FROM ${table}`).get()!.n)]));
    const erase=()=>retireD1ImportCustody({target:{kind:'record',id:'private'}},[{sql:"DELETE FROM native_records WHERE destination='workspace' AND id='private'"}],
      d.runtime.context(),[{sql:'UPDATE native_authority SET enabled=enabled'}],bounded?{operationKey:'door-erasure'}:{});
    native.exec("CREATE TRIGGER refuse_door_erasure BEFORE INSERT ON ik_d1_erasure_journal BEGIN SELECT RAISE(ABORT,'test journal failure'); END");
    await assert.rejects(erase());
    for (const table of contentTables) assert.equal(Number(native.prepare(`SELECT count(*) n FROM ${table}`).get()!.n),before.get(table),'a journal failure rolls back door custody');
    native.exec('DROP TRIGGER refuse_door_erasure');
    let erased;do {erased=await erase();} while(erased.phase==='pending');
    assert.equal(erased.phase,'complete');
    assert.equal((await readD1ErasureJournal(d.runtime.context()))[0].receiptId,erased.receiptId);
    for (const table of contentTables) {
      assert.equal(native.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,1,`${table}: other destination survives`);
    }
    for (const table of doorTables()) {
      const removed=before.get(table)!-Number(native.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);
      if (removed) assert.equal(erased.stores.find(row=>row.store===table)?.rows,removed,`${table} journal count`);
    }
    for (const table of doorTables()) {
      for (const row of native.prepare(`SELECT * FROM ${table}`).all()) {
        for (const value of Object.values(records[0])) {
          assert.ok(!JSON.stringify(row).includes(value),table);
          if (typeof row.base64==='string') assert.ok(!Buffer.from(row.base64,'base64').toString().includes(value),table);
        }
      }
    }
    assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE id='private'").get()!.n,0);
    assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE id='kept'").get()!.n,1);
    await assert.rejects(retireD1ImportCustody({target:{kind:'record',id:'private'}},[],d.runtime.context(),[]),/IMPORT_RETIREMENT_CHECKPOINT_REQUIRED/);
    native.exec('CREATE TABLE ik_unknown_unscoped(body TEXT)');
    await assert.rejects(retireD1ImportCustody({target:{kind:'record',id:'private'}},[],d.runtime.context(),[{sql:'UPDATE native_authority SET enabled=enabled'}]),/IMPORT_RETIREMENT_UNSCOPED_STORE:ik_unknown_unscoped/);
    t.diagnostic(JSON.stringify({...mode,jobId:job.id,receiptId:erased.receiptId,stores:erased.stores.filter(row=>row.store.startsWith('ik_door_'))}));
  }
  // The previous Base schema has no ik_door_scopes. An upload no destination
  // ever applied is withdrawn and tallied by any erasure, never refused.
  const d=await door(t);await d.enable();
  await d.upload([{id:'never-planned',title:'test-private-legacy-upload'}],{namespace:'legacy-unplanned'});
  const native=d.runtime.native();native.exec('DROP TABLE ik_door_scopes');
  const erased=await retireD1ImportCustody({target:{kind:'record',id:'never-planned'}},[],{...d.runtime.context(),destination:'other-workspace'},[{sql:'UPDATE native_authority SET enabled=enabled'}]);
  assert.equal(erased.stores.find(row=>row.store==='ik_door_chunks')?.rows,1);
  assert.equal(erased.stores.find(row=>row.store==='ik_door_uploads')?.rows,1);
  assert.equal(native.prepare('SELECT count(*) n FROM ik_door_chunks').get()!.n,0);
  // The additive migration still applies over that schema.
  await d.db.batch(importDoorSchema.map(q=>d.db.prepare(q)));
  assert.equal(native.prepare('SELECT count(*) n FROM ik_door_scopes').get()!.n,0);
});

test('HTTP upload, reviewed plan, bounded apply, reconcile and owner-visible undo preserve original custody',async t=>{
  const d=await door(t);await d.enable();
  const badBytes=Buffer.from('[{"id":"bad","title":"Bad bundle"}]'),badUploadId=crypto.randomUUID();
  assert.equal((await d.call('uploads',{uploadId:badUploadId,name:'bad.json',bundleSha256:'0'.repeat(64),totalBytes:badBytes.length,totalChunks:1,index:0,chunkSha256:sha256(badBytes),base64:badBytes.toString('base64')})).status,409);
  const badStatus=await d.call('uploads',{uploadId:badUploadId});
  assert.notEqual(badStatus.body.complete,true);assert.equal(badStatus.status,409);
  assert.equal((await d.call('plan',{uploadId:badUploadId})).status,409);
  assert.equal((await d.call('uploads',{name:'bad.json',bundleSha256:sha256(badBytes),totalBytes:badBytes.length,totalChunks:1,index:0,chunkSha256:'0'.repeat(64),base64:badBytes.toString('base64')})).status,400);
  assert.equal((await d.call('uploads',{name:'bad.json',bundleSha256:sha256(badBytes),totalBytes:badBytes.length,totalChunks:1,index:0,chunkSha256:sha256(badBytes),base64:badBytes.toString('base64')},{maxBytes:1})).status,400);
  const records=[...documents(50,true),{id:'unsupported',title:'Unsupported',reject:true}];
  const planned=await d.plan(records);assert.equal(planned.status,200,JSON.stringify(planned.body));
  assert.equal(planned.body.rejected.length,1);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  const job=await d.apply(planned.body);
  const status=await d.call('status',{planId:planned.body.planId});assert.equal(status.body.job.state,'completed');assert.ok(status.body.caption.includes(planned.body.fingerprint));
  const history=await readImportDoorHistory(d.db,d.options.claim.installationId,d.ownerPredicate);assert.equal(history[0].jobId,job.id);assert.equal(history[0].reviewer,d.approval.approvalRecordId);
  const reconciled=await d.call('reconcile',{planId:planned.body.planId});assert.equal(reconciled.status,200,JSON.stringify(reconciled.body));
  assert.equal(reconciled.body.ok,true);assert.equal(reconciled.body.counts.present,50);assert.equal(reconciled.body.counts.explained,1);assert.equal(reconciled.body.counts.nativeTargets,50);
  const catchupRecords=[...records.map(r=>r.id==='0'?{...r,title:'Updated at source'}:r),{id:'50',title:'New source article'}];
  const bounded={catchup:'bounded' as const,approvalRecordId:'test-standing-approval',approvedAt:d.approval.approvedAt};
  const catchup=await d.plan(catchupRecords,{catchup:true},bounded);assert.equal(catchup.status,200,JSON.stringify(catchup.body));
  assert.equal(catchup.body.summary.updated,1);assert.equal(catchup.body.summary.created,1);assert.equal(catchup.body.summary.unchanged,50);
  assert.equal(catchup.body.rejected.length,0);assert.equal(catchup.body.differences.conflicts.length,0);
  await d.apply(catchup.body,bounded);
  const caughtUp=await d.call('reconcile',{planId:catchup.body.planId});assert.equal(caughtUp.status,200,JSON.stringify(caughtUp.body));
  assert.equal(caughtUp.body.ok,true);assert.equal(caughtUp.body.counts.present,51);assert.equal(caughtUp.body.counts.explained,1);assert.equal(caughtUp.body.counts.nativeTargets,51);
  assert.equal(caughtUp.body.sourceIds.find((r:any)=>r.sourceId==='unsupported').reason,reconciled.body.sourceIds.find((r:any)=>r.sourceId==='unsupported').reason);
  await d.undo(catchup.body.planId);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,50);
  await d.undo(planned.body.planId);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  // The ordinary seed owner, with the exact existing actor binding, can inspect
  // originals and repeat undo without any Business grant or special kit bypass.
  const context={...d.runtime.context(),namespace:job.namespace};
  assert.equal((await undoD1Import(job.id,context)).state,'undone');
  const originals=await readD1ImportOriginals(job.id,context);
  assert.equal(originals[0].sha256,sha256(JSON.stringify(records)));assert.equal(originals[0].original.status,'retained');
  const returningRecords=documents(10),returningBase=await d.plan(returningRecords);
  assert.equal(returningBase.status,200,JSON.stringify(returningBase.body));await d.apply(returningBase.body);
  const absent=await d.plan(returningRecords.filter(r=>r.id!=='5'),{catchup:true});
  assert.equal(absent.status,200,JSON.stringify(absent.body));
  assert.deepEqual(absent.body.differences.gone,[canonicalJson(['document','5'])]);
  await d.apply(absent.body);
  const whileAbsent=await d.call('reconcile',{planId:absent.body.planId});
  assert.equal(whileAbsent.status,200,JSON.stringify(whileAbsent.body));
  assert.equal(whileAbsent.body.counts.nativeTargets,10);assert.equal(whileAbsent.body.counts.explained,1);
  assert.equal(whileAbsent.body.sourceIds.find((r:any)=>r.sourceId==='5').status,'explained');
  const returnedRecords=[...returningRecords,{id:'10',title:'New source article'}];
  const returned=await d.plan(returnedRecords,{catchup:true});
  assert.equal(returned.status,200,JSON.stringify(returned.body));
  assert.equal(returned.body.summary.created,1);assert.equal(returned.body.summary.unchanged,10);assert.equal(returned.body.summary.gone,0);
  await d.apply(returned.body);
  const present=await d.call('reconcile',{planId:returned.body.planId});
  assert.equal(present.status,200,JSON.stringify(present.body));assert.equal(present.body.ok,true);
  assert.equal(present.body.counts.present,11);assert.equal(present.body.counts.explained,0);assert.equal(present.body.counts.nativeTargets,11);
  assert.deepEqual(present.body.sourceIds.map((r:any)=>r.sourceId).sort(),returnedRecords.map(r=>r.id).sort());
  assert.ok(present.body.sourceIds.every((r:any)=>r.status==='present'));
  await d.undo(returned.body.planId);await d.undo(absent.body.planId);await d.undo(returningBase.body.planId);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
});

test('HTTP grants and bounded catch-up fail closed while valid snapshot replacements preserve undo lineage',async t=>{
  const d=await door(t);await d.enable();
  const forged=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  assert.equal((await d.call('plan',{}, {},await d.token('plan',{},forged.privateKey))).status,403);
  assert.equal((await d.call('plan',{}, {installationId:'another-installation'})).status,403);
  const now=Math.floor(Date.now()/1000);
  assert.equal((await d.call('plan',{}, {iat:now-301,exp:now-1})).status,403);
  const baselineRecords=[...documents(50),{id:'unsupported',title:'Unsupported',reject:true}],baseline=await d.plan(baselineRecords);assert.equal(baseline.status,200);await d.apply(baseline.body);
  const replay=await d.token('status');assert.equal((await d.call('status',{planId:baseline.body.planId},{},replay)).status,200);
  assert.equal((await d.call('status',{planId:baseline.body.planId},{},replay)).status,403);
  const changed=[...baselineRecords.map(r=>r.id==='0'?{...r,title:'Updated at source'}:r),{id:'50',title:'New source article',body:'Historical knowledge.'}];
  const bounded={catchup:'bounded' as const,approvalRecordId:'test-standing-approval',approvedAt:d.approval.approvedAt};
  const planned=await d.plan(changed,{catchup:true},bounded);assert.equal(planned.status,200,JSON.stringify(planned.body));
  assert.equal(planned.body.summary.updated,1);assert.equal(planned.body.summary.created,1);
  assert.equal((await d.call('apply',{planId:planned.body.planId,reviewedFingerprint:planned.body.fingerprint},{fingerprint:'0'.repeat(64),...bounded})).status,403);
  await d.apply(planned.body,bounded);
  const reconciliation=await d.call('reconcile',{planId:planned.body.planId});assert.equal(reconciliation.body.ok,true);assert.equal(reconciliation.body.counts.nativeTargets,51);
  assert.equal((await d.call('undo',{planId:baseline.body.planId})).status,409);
  const tooMany=changed.map((r,i)=>i<3?{...r,title:'Another source change '+i}:r);
  const refused=await d.plan(tooMany,{catchup:true},bounded);assert.equal(refused.status,409);assert.match(refused.body.error,/change_must_be_under_five_percent/);
  const gone=await d.plan(changed.slice(1),{catchup:true},bounded);assert.equal(gone.status,409);assert.match(gone.body.error,/source_records_gone/);
  const rejected=await d.plan([...changed,{id:'new-unsupported',title:'New unsupported row',reject:true}],{catchup:true},bounded);
  assert.equal(rejected.status,409);assert.match(rejected.body.error,/native_or_mapping_conflict/);
  // A same-revision native edit is protected, too.
  const native=d.runtime.native().prepare("SELECT value_json FROM native_records WHERE id='0'").get()!;
  d.runtime.native().prepare("UPDATE native_records SET value_json=? WHERE id='0'").run(canonicalJson({local:'owner edit'}));
  const edited=await d.plan(changed.map(r=>r.id==='0'?{...r,title:'Source wants another update'}:r),{catchup:true},bounded);
  assert.equal(edited.status,409);assert.match(edited.body.error,/native_or_mapping_conflict/);
  assert.equal(JSON.parse(d.runtime.native().prepare("SELECT value_json FROM native_records WHERE id='0'").get()!.value_json as string).local,'owner edit');
  d.runtime.native().prepare("UPDATE native_records SET value_json=? WHERE id='0'").run(native.value_json);
  await d.undo(planned.body.planId);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,50);
  await d.undo(baseline.body.planId);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  const uploadId=await d.upload([{id:'guarded',title:'Guarded import'}]);
  d.runtime.native().exec("CREATE TRIGGER interrupt_plan BEFORE INSERT ON ik_door_plan_chunks BEGIN SELECT RAISE(ABORT,'test interruption'); END");
  assert.equal((await d.call('plan',{uploadId})).status,409);
  const interrupted=await d.call('plan',{uploadId});assert.equal(interrupted.status,409);assert.ok(interrupted.body.details.planId);
  assert.equal((await d.call('undo',{planId:interrupted.body.details.planId})).body.state,'cancelled');
  d.runtime.native().exec('DROP TRIGGER interrupt_plan');
  const guarded=await d.call('plan',{uploadId});assert.equal(guarded.status,200);
  d.runtime.native().exec("CREATE TRIGGER interrupt_index BEFORE UPDATE OF job_id ON ik_door_plans BEGIN SELECT RAISE(ABORT,'test interruption'); END");
  const interruptedApply=await d.call('apply',{planId:guarded.body.planId,reviewedFingerprint:guarded.body.fingerprint},{fingerprint:guarded.body.fingerprint,...d.approval});
  assert.equal(interruptedApply.status,409);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  d.runtime.native().exec('DROP TRIGGER interrupt_index');
  const recovered=await d.call('status',{planId:guarded.body.planId});assert.equal(recovered.body.job.state,'queued');
  d.runtime.native().exec("CREATE TRIGGER revoke_door_during_write AFTER INSERT ON native_records BEGIN INSERT INTO ik_door_revoked_keys VALUES('test-installation','test'); END");
  const stopped=await d.call('apply',{planId:guarded.body.planId,reviewedFingerprint:guarded.body.fingerprint},{fingerprint:guarded.body.fingerprint,...d.approval});
  assert.equal(stopped.status,409);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  d.runtime.native().exec('DROP TRIGGER revoke_door_during_write');
  const failed=await d.call('status',{planId:guarded.body.planId});assert.equal(failed.body.job.state,'failed');
  assert.equal((await d.call('apply',{planId:guarded.body.planId,reviewedFingerprint:guarded.body.fingerprint},{fingerprint:guarded.body.fingerprint,...d.approval})).status,409);
  const replacement=await d.call('plan',{uploadId});assert.equal(replacement.status,200);assert.notEqual(replacement.body.planId,guarded.body.planId);
  await d.apply(replacement.body,{approvalRecordId:'test-replacement-approval'});await d.undo(replacement.body.planId);
  await writeImportDoorSettings(d.db,d.options.claim.installationId,{enabled:true,revokedKids:['test']},d.ownerPredicate);
  assert.equal((await d.call('plan',{})).status,403);
});

const checkpoint=[{sql:'UPDATE native_authority SET enabled=enabled'}];
type Native=ReturnType<Awaited<ReturnType<typeof door>>['runtime']['native']>;
const doorCounts=(native:Native)=>Object.fromEntries(native.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik_door_%' ORDER BY name").all()
  .map(r=>[r.name as string,Number(native.prepare(`SELECT count(*) n FROM ${r.name}`).get()!.n)]));
// Every door row, with base64 decoded, holds none of these values.
function assertNoResidue(native:Native,values:string[]) {
  for (const table of Object.keys(doorCounts(native))) for (const row of native.prepare(`SELECT * FROM ${table}`).all()) for (const value of values) {
    assert.ok(!JSON.stringify(row).includes(value),`${table}: ${value}`);
    if (typeof row.base64==='string') assert.ok(!Buffer.from(row.base64,'base64').toString().includes(value),`${table} base64: ${value}`);
  }
}
// The journal counts exactly the rows each door table lost.
function assertJournal(erased:{stores:{store:string;rows:number}[]},before:Record<string,number>,after:Record<string,number>) {
  for (const table of Object.keys(before)) assert.equal(erased.stores.find(row=>row.store===table)?.rows ?? 0,before[table]-after[table],`${table} journal count`);
}

test('Erasure withdraws door rows the previous Base wrote without a destination binding, in any destination',async t=>{
  const d=await door(t);await d.enable();
  const native=d.runtime.native(),other={...d.runtime.context(),destination:'other-workspace'};
  // The previous Base door wrote these same rows without ik_door_scopes; a
  // rolled-back previous Worker keeps doing so on the migrated schema.
  const unbind=()=>native.exec('DELETE FROM ik_door_scopes WHERE destination=\'workspace\'');
  const planIn=async (records:unknown[],namespace:string)=>{
    const planned=await d.call('plan',{uploadId:await d.upload(records,{namespace})},{namespace});assert.equal(planned.status,200,JSON.stringify(planned.body));return planned;
  };
  const applied=await planIn([{id:'legacy-applied',title:'legacy-applied-secret'},{id:'legacy-kept',title:'legacy-kept-secret'}],'applied');
  await d.apply(applied.body,{namespace:'applied'});
  const planned=await planIn([{id:'legacy-planned',title:'legacy-planned-secret'}],'planned');
  await d.upload([{id:'legacy-unplanned',title:'legacy-unplanned-secret'}],{namespace:'unplanned'});
  unbind();
  // An unrelated destination's values-only erasure withdraws what no destination applied.
  await assert.rejects(retireD1ImportCustody({values:['nobody@example.test']},[],other,[]),/IMPORT_RETIREMENT_CHECKPOINT_REQUIRED/);
  let before=doorCounts(native);
  const unrelated=await retireD1ImportCustody({values:['nobody@example.test']},[],other,checkpoint);
  assert.equal(unrelated.phase,'complete');assertJournal(unrelated,before,doorCounts(native));
  assertNoResidue(native,['legacy-planned-secret','legacy-unplanned-secret']);
  assert.equal(native.prepare("SELECT count(*) n FROM ik_door_uploads WHERE namespace='applied'").get()!.n,1,'the applied namespace belongs to its destination');
  assert.equal(native.prepare("SELECT count(*) n FROM ik_door_plans WHERE namespace='planned'").get()!.n,1,'the plan record stays');
  assert.equal((await d.call('status',{planId:planned.body.planId},{namespace:'planned'})).body.error,'snapshot_withdrawn');
  // Another destination's bound rows survive the owning destination's erasures.
  const otherHandler=createImportDoorHandler({...d.options,destination:'other-workspace'});
  const otherBytes=Buffer.from(JSON.stringify([{id:'bound',title:'other-bound-value'}]));
  assert.equal((await otherHandler(new Request(d.options.claim.appOrigin+'/api/rer/import/uploads',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await d.token('uploads',{namespace:'other'})},
    body:JSON.stringify({name:'o.json',bundleSha256:sha256(otherBytes),totalBytes:otherBytes.length,totalChunks:1,index:0,chunkSha256:sha256(otherBytes),base64:otherBytes.toString('base64')})})))!.status,200);
  // The owning destination's target erasure, bounded, with a rolled-back Worker's upload.
  await d.upload([{id:'rollback-1',title:'rollback-secret-1'}],{namespace:'rollback-1'});unbind();
  before=doorCounts(native);
  let owned;do {owned=await retireD1ImportCustody({target:{kind:'record',id:'legacy-applied'}},[{sql:"DELETE FROM native_records WHERE id='legacy-applied'"}],d.runtime.context(),checkpoint,{operationKey:'legacy-door-erasure'});} while(owned.phase==='pending');
  assertJournal(owned,before,doorCounts(native));
  assertNoResidue(native,['legacy-applied-secret','legacy-kept-secret','rollback-secret-1']);
  // The owning destination's values-only erasure.
  await d.upload([{id:'rollback-2',title:'rollback-secret-2'}],{namespace:'rollback-2'});unbind();
  await assert.rejects(retireD1ImportCustody({values:['nobody@example.test']},[],d.runtime.context(),[]),/IMPORT_RETIREMENT_CHECKPOINT_REQUIRED/);
  before=doorCounts(native);
  const values=await retireD1ImportCustody({values:['nobody@example.test']},[],d.runtime.context(),checkpoint);
  assert.equal(values.phase,'complete');assertJournal(values,before,doorCounts(native));
  assertNoResidue(native,['rollback-secret-2']);
  for (const table of ['ik_door_chunks','ik_door_uploads']) assert.equal(native.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,1,`${table}: the other destination's bound upload survives`);
  assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE id='legacy-kept'").get()!.n,1);
  assert.equal((await readD1ErasureJournal(d.runtime.context())).length,2);
});

test('A values-only erasure that withdraws door content requires and commits the restore checkpoint',async t=>{
  for (const bounded of [false,true]) {
    const d=await door(t);await d.enable();
    const native=d.runtime.native(),options=bounded?{operationKey:'values-only'}:{};
    await d.upload([{id:'values-only',title:'values-only-secret'}]);
    // Another destination's erasure does not touch this bound upload and needs no checkpoint.
    const elsewhere=await retireD1ImportCustody({values:['absent@example.test']},[],{...d.runtime.context(),destination:'other-workspace'},[],options);
    assert.equal(elsewhere.phase,'complete');assert.equal(native.prepare('SELECT count(*) n FROM ik_door_chunks').get()!.n,1);
    await assert.rejects(retireD1ImportCustody({values:['absent@example.test']},[],d.runtime.context(),[],options),/IMPORT_RETIREMENT_CHECKPOINT_REQUIRED/);
    assert.equal(native.prepare('SELECT count(*) n FROM ik_door_chunks').get()!.n,1);
    native.exec("CREATE TRIGGER count_checkpoint AFTER UPDATE ON native_authority BEGIN INSERT INTO ik_door_revoked_keys VALUES('checkpoint','committed'); END");
    const before=doorCounts(native);
    let erased;do {erased=await retireD1ImportCustody({values:['absent@example.test']},[],d.runtime.context(),checkpoint,options);} while(erased.phase==='pending');
    assert.equal(erased.phase,'complete');
    assert.equal(native.prepare("SELECT count(*) n FROM ik_door_revoked_keys WHERE installation_id='checkpoint'").get()!.n,1,'the checkpoint commits in the erasure batch');
    const after=doorCounts(native);after.ik_door_revoked_keys--;
    assertJournal(erased,before,after);assertNoResidue(native,['values-only-secret']);
    assert.equal(after.ik_door_chunks,0);
  }
});

test('Erasing one person keeps the surviving door import history, status and undo',async t=>{
  const d=await door(t);await d.enable();
  const native=d.runtime.native();
  const planned=await d.plan([{id:'erased',title:'history-erased-secret'},{id:'kept',title:'history-kept'}]);assert.equal(planned.status,200);
  const job=await d.apply(planned.body);
  const before=doorCounts(native);
  const erased=await retireD1ImportCustody({target:{kind:'record',id:'erased'}},[{sql:"DELETE FROM native_records WHERE id='erased'"}],d.runtime.context(),checkpoint);
  const after=doorCounts(native);
  assertJournal(erased,before,after);assertNoResidue(native,['history-erased-secret','history-kept']);
  assert.deepEqual(erased.stores.filter(row=>row.store.startsWith('ik_door_')).map(row=>row.store),['ik_door_chunks','ik_door_plan_chunks','ik_door_uploads']);
  for (const table of ['ik_door_plans','ik_door_approvals','ik_door_namespaces','ik_door_scopes']) assert.equal(after[table],before[table],`${table} is bookkeeping`);
  const history=await readImportDoorHistory(d.db,d.options.claim.installationId,d.ownerPredicate);
  assert.equal(history.length,1);assert.equal(history[0].jobId,job.id);assert.match(history[0].caption,/^approved via Business by owner@example\.test/);
  const status=await d.call('status',{planId:planned.body.planId});
  assert.equal(status.status,200,JSON.stringify(status.body));assert.equal(status.body.job.state,'completed');assert.match(status.body.caption,/via Business/);
  // Replaying apply after a lost response answers the completed job, still bound to the reviewed plan and approval.
  const replay=await d.call('apply',{planId:planned.body.planId,reviewedFingerprint:planned.body.fingerprint},{fingerprint:planned.body.fingerprint,...d.approval});
  assert.deepEqual([replay.status,replay.body.job?.id,replay.body.job?.state],[200,job.id,'completed'],JSON.stringify(replay.body));
  const reconcile=await d.call('reconcile',{planId:planned.body.planId});
  assert.equal(reconcile.status,410);assert.equal(reconcile.body.error,'snapshot_withdrawn');
  const catchup=await d.call('plan',{uploadId:await d.upload([{id:'kept',title:'history-kept'},{id:'new',title:'New'}]),catchup:true});
  assert.equal(catchup.status,410);assert.equal(catchup.body.error,'snapshot_withdrawn');
  assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE id='kept'").get()!.n,1);
  await d.undo(planned.body.planId);
  assert.equal(native.prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  assert.equal((await readImportDoorHistory(d.db,d.options.claim.installationId,d.ownerPredicate))[0].state,'undone');
  // Undo moved the namespace head back, so a new baseline plans there again.
  const again=await d.plan([{id:'kept',title:'history-kept'}]);assert.equal(again.status,200,JSON.stringify(again.body));
});

test('A person erased while a catch-up plan for their import is being saved never comes back',async t=>{
  for (const when of [1,2]) {
    const d=await door(t);await d.enable();
    const native=d.runtime.native(),secret='catchup-erased-secret';
    // Padding makes the snapshot span several chunk batches, each packing up to ~1.9 MB.
    const base=[{id:'person',title:secret},{id:'kept',title:'catchup-kept'},...Array.from({length:40},(_,i)=>({id:'pad'+i,title:'pad '+i,body:'x'.repeat(40_000)}))];
    const baseline=await d.plan(base);assert.equal(baseline.status,200,JSON.stringify(baseline.body));await d.apply(baseline.body);
    const uploadId=await d.upload([...base,{id:'new',title:'catchup-new'}]);
    // The erasure commits as a separate request between the door's own batches, as D1 allows.
    let batches=0,staged=false,fired=false;
    const database=new Proxy(d.db,{get(target,prop) {
      if (prop==='prepare') return (query:string)=>{if (query.startsWith('INSERT INTO ik_door_plan_chunks')) staged=true;return target.prepare(query);};
      if (prop==='batch') return async (statements:Parameters<typeof target.batch>[0])=>{
        if (staged && ++batches===when && !fired) {
          fired=true;
          let erased;do {erased=await retireD1ImportCustody({target:{kind:'record',id:'person'}},[{sql:"DELETE FROM native_records WHERE id='person'"}],d.runtime.context(),checkpoint);} while(erased.phase==='pending');
        }
        staged=false;return target.batch(statements);
      };
      const value=Reflect.get(target,prop);return typeof value==='function'?value.bind(target):value;
    }});
    const handler=createImportDoorHandler({...d.options,database});
    const response=await handler(new Request(d.options.claim.appOrigin+'/api/rer/import/plan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await d.token('plan')},body:JSON.stringify({uploadId,catchup:true})}));
    const body=await response!.json() as any;
    assert.ok(fired);assert.equal((await readD1ErasureJournal(d.runtime.context())).length,1);
    assert.equal(response!.status,410,JSON.stringify(body));assert.equal(body.error,'snapshot_withdrawn');
    for (const {name} of native.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      for (const row of native.prepare(`SELECT * FROM "${name}"`).all()) assert.ok(!JSON.stringify(row).includes(secret),`${name} holds the erased value`);
    }
    // The interrupted staging cancels, and the surviving import keeps its status.
    assert.equal((await d.call('undo',{planId:body.details.planId})).body.state,'cancelled');
    assert.equal((await d.call('status',{planId:baseline.body.planId})).body.job.state,'completed');
  }
});

// Every row of every table, with base64 text and bytes decoded, holds none of these values.
function assertNowhere(native:Native,values:string[]) {
  for (const {name} of native.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) for (const row of native.prepare(`SELECT * FROM "${name}"`).all()) for (const [column,cell] of Object.entries(row)) {
    const texts=[String(cell)];
    if (typeof cell==='string' && /^[A-Za-z0-9+/=]{8,}$/.test(cell)) texts.push(Buffer.from(cell,'base64').toString('latin1'));
    if (cell instanceof Uint8Array) texts.push(Buffer.from(cell).toString('latin1'));
    for (const value of values) assert.ok(!texts.some(text=>text.includes(value)),`${name}.${column} holds ${value}`);
  }
}

test('Erasing a person unchanged in a door catch-up leaves no copy in the catch-up job, which keeps its status and undo',async t=>{
  // A long lineage: daily catch-ups that keep a copy of the unchanged person in every job, more than one request can sever;
  // the same lineage with the person changed in every daily catch-up, so each earlier import of them is superseded;
  // and 11 jobs of 250 records of 3 KB, whose steps must also fit one D1 request in bytes.
  const days=12,limit=200;
  for (const variant of ['target','seed-shaped','after-undo','bounded','long-lineage','long-lineage-changed','long-lineage-bytes'] as const) {
    const long=variant.startsWith('long-lineage'),bytes=variant==='long-lineage-bytes';
    const d=await door(t);await d.enable();
    const native=d.runtime.native(),secret='catchup-unchanged-'+variant;
    const padding=bytes?Array.from({length:250},(_,i)=>({id:'pad-'+i,title:'catchup-pad-'+i,body:'b'.repeat(3000)})):[];
    let person={id:'person',title:secret};
    const base=()=>[person,{id:'kept',title:'catchup-kept'},...padding];
    const baseline=await d.plan(base());assert.equal(baseline.status,200,JSON.stringify(baseline.body));await d.apply(baseline.body);
    let catchup=await d.plan([...base(),{id:'new',title:'catchup-new'}],{catchup:true});assert.equal(catchup.status,200,JSON.stringify(catchup.body));
    assert.deepEqual(catchup.body.summary,{sourceRecords:3+padding.length,created:1,updated:0,unchanged:2+padding.length,gone:0});
    const job=await d.apply(catchup.body);
    let created='new';
    if (long) for (let day=1;day<=(bytes?9:days);day++) {
      if (variant==='long-lineage-changed') person={id:'person',title:`${secret} day ${day}`};
      catchup=await d.plan([...base(),{id:'new',title:'catchup-new'},{id:created='day-'+day,title:'catchup-day-'+day}],{catchup:true});
      assert.equal(catchup.status,200,JSON.stringify(catchup.body));await d.apply(catchup.body);
      if (variant==='long-lineage-changed') assert.equal(catchup.body.summary.updated,1);
    }
    if (bytes) assert.ok(native.prepare('SELECT count(*) n FROM ik_jobs').get()!.n===11 && native.prepare("SELECT min(coalesce((SELECT sum(length(body)) FROM ik_d1_plan_chunks c WHERE c.job_id=j.id),length(j.plan_json))) n FROM ik_jobs j").get()!.n as number>2_500_000,'11 jobs of more than 2.5 MB of plan each');
    if (variant==='after-undo') await d.undo(catchup.body.planId);
    const remove=[{sql:"DELETE FROM native_records WHERE id='person'"}];
    // The default seed's own call: target, the email as a value, optional reference fields, resumable redaction.
    // Each call is its own request; the 14-job lineages' requests may run at most `limit` statements.
    const resumable=async (who:any,remove:any[],request:()=>ReturnType<typeof d.runtime.context>)=>{
      let erased,continuation:string|undefined,calls=0;
      do {erased=await retireD1ImportCustody(who,remove,request(),checkpoint,{resumable:true,continuation});continuation=erased.continuation;calls++;} while(erased.phase==='redacting');
      return {erased,calls};
    };
    let erased;
    if (variant==='seed-shaped' || long) {
      const who={target:{kind:'record',id:'person'},values:['person@example.test'],related:{fields:[{path:['details','reactions','*','users','*'],value:'person',optional:true}]}};
      const steps=await resumable(who,remove,()=>long&&!bytes?limitStatements(d1RequestContext(d.runtime.context()),limit):d.runtime.context());
      erased=steps.erased;
      if (long) assert.ok(steps.calls>2,`the lineage of ${bytes?11:days+2} jobs is severed in bounded steps (${steps.calls} calls)`);
    } else do {erased=await retireD1ImportCustody({target:{kind:'record',id:'person'}},remove,d.runtime.context(),checkpoint,variant==='bounded'?{operationKey:'catchup-erasure'}:{});} while(erased.phase==='pending');
    assert.equal(erased.phase,'complete',variant);
    assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE id='person'").get()!.n,0);
    assertNowhere(native,[secret]);
    const namespace=native.prepare('SELECT namespace FROM ik_jobs WHERE id=?').get(job.id)!.namespace as string;
    const originals=await readD1ImportOriginals(job.id,{...d.runtime.context(),namespace});
    assert.ok(!originals.some(o=>o.original?.status==='retained' && Buffer.from(o.original.base64,'base64').toString().includes(secret)),`${variant}: the catch-up keeps the erased person's original`);
    const status=await d.call('status',{planId:catchup.body.planId});
    assert.equal(status.status,200,JSON.stringify(status.body));assert.equal(status.body.job.state,variant==='after-undo'?'undone':'completed');
    if (variant!=='after-undo') {
      await d.undo(catchup.body.planId);
      assert.equal(native.prepare('SELECT count(*) n FROM native_records WHERE id=?').get(created)!.n,0,'the catch-up undoes');
    }
    assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE id='kept'").get()!.n,1);
    // Every job stays indexed, so the next person's erasure needs no index upgrade. Eleven 3 MB plans are more
    // than one D1 request carries, so that lineage's next erasure goes in resumable steps too.
    const keep=[{sql:"DELETE FROM native_records WHERE id='kept'"}];
    const next=bytes?(await resumable({target:{kind:'record',id:'kept'},related:{fields:[{path:['details','reactions','*','users','*'],value:'kept',optional:true}]}},keep,()=>d.runtime.context())).erased
      :await retireD1ImportCustody({target:{kind:'record',id:'kept'}},keep,d.runtime.context(),checkpoint);
    assert.equal(next.phase,'complete');assertNowhere(native,['catchup-kept']);
  }
});

test('A door upload in flight across an erasure, or holding an erased person, leaves nothing of them behind',async t=>{
  for (const when of ['continuation','opening','after'] as const) {
    const d=await door(t);await d.enable();
    const native=d.runtime.native(),secret='upload-erased-'+when;
    const baseline=await d.plan([{id:'person',title:secret},{id:'kept',title:'upload-kept'}]);assert.equal(baseline.status,200);await d.apply(baseline.body);
    const erase=async ()=>{let erased;do {erased=await retireD1ImportCustody({target:{kind:'record',id:'person'}},[{sql:"DELETE FROM native_records WHERE id='person'"}],d.runtime.context(),checkpoint);} while(erased.phase==='pending');};
    // A second bundle holding the person, in another namespace; a continuation's record is in its last chunk.
    const records=[...(when==='continuation'?documents(12).map(r=>({...r,body:'x'.repeat(7000)})):[]),{id:'person',title:secret},{id:'other',title:'upload-other'}];
    const bytes=Buffer.from(JSON.stringify(records)),totalChunks=Math.ceil(bytes.length/65_536),bundleSha256=sha256(bytes);
    const chunk=(index:number)=>{const part=bytes.subarray(index*65_536,Math.min((index+1)*65_536,bytes.length));return {name:'again.json',bundleSha256,totalBytes:bytes.length,totalChunks,index,chunkSha256:sha256(part),base64:part.toString('base64')};};
    const fresh={namespace:'fresh'};
    if (when==='after') {
      await erase();
      let uploadId:string|undefined;
      for (let index=0;index<totalChunks;index++) {const r=await d.call('uploads',{...(uploadId?{uploadId}:{}),...chunk(index)},fresh);assert.equal(r.status,200);uploadId=r.body.uploadId;}
      const planned=await d.call('plan',{uploadId},fresh);
      assert.deepEqual([planned.status,planned.body.error],[409,'source_erased'],JSON.stringify(planned.body));
      assert.equal((await d.call('uploads',{uploadId},fresh)).status,404,'the upload holding the erased person goes');
    } else {
      let uploadId:string|undefined;
      if (when==='continuation') {
        assert.equal(totalChunks,2);assert.ok(Buffer.from(chunk(1).base64,'base64').toString().includes(secret));
        const opened=await d.call('uploads',chunk(0),fresh);assert.equal(opened.status,200);uploadId=opened.body.uploadId;
      }
      // The chunk is admitted, then the erasure commits before its batch, as D1 allows.
      let armed=false,fired=false;
      const database=new Proxy(d.db,{get(target,prop) {
        if (prop==='prepare') return (query:string)=>{if (query.startsWith('INSERT OR IGNORE INTO ik_door_chunks')) armed=true;return target.prepare(query);};
        if (prop==='batch') return async (statements:Parameters<typeof target.batch>[0])=>{if (armed && !fired) {fired=true;await erase();} return target.batch(statements);};
        const value=Reflect.get(target,prop);return typeof value==='function'?value.bind(target):value;
      }});
      const handler=createImportDoorHandler({...d.options,database});
      const late=await handler(new Request(d.options.claim.appOrigin+'/api/rer/import/uploads',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await d.token('uploads',fresh)},
        body:JSON.stringify({...(uploadId?{uploadId}:{}),...chunk(totalChunks-1)})}));
      const body=await late!.json() as any;
      assert.ok(fired);assert.deepEqual([late!.status,body.error],[410,'erased_during_request'],JSON.stringify(body));
      if (uploadId) assert.equal((await d.call('uploads',{uploadId},fresh)).status,404,'the withdrawn upload does not come back');
    }
    assert.equal((await readD1ErasureJournal(d.runtime.context())).length,1);
    assertNowhere(native,[secret]);
    assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE id='kept'").get()!.n,1);
  }
});

test('The default seed\'s resumable erasure severs a door catch-up that an earlier redaction step read, on a destination with many jobs',async t=>{
  // A redaction step reads 25 jobs; the catch-up job must sort among the first step's jobs, which random job ids give most of the time.
  for (let attempt=0;attempt<12;attempt++) {
    const d=await door(t);await d.enable();
    const native=d.runtime.native(),secret=['many','jobs','secret',attempt].join('-');
    const base=[{id:'person',title:secret},{id:'kept',title:'many-jobs-kept'}];
    const baseline=await d.plan(base);assert.equal(baseline.status,200,JSON.stringify(baseline.body));await d.apply(baseline.body);
    const catchup=await d.plan([...base,{id:'new',title:'many-jobs-new'}],{catchup:true});assert.equal(catchup.status,200,JSON.stringify(catchup.body));
    const job=await d.apply(catchup.body);
    // Other door imports in this destination, as daily catch-ups and other namespaces produce within a month.
    for (let i=0;i<26;i++) {
      const other=await d.call('plan',{uploadId:await d.upload([{id:'other-'+i,title:'other-'+i}],{namespace:'other-'+i})},{namespace:'other-'+i});
      assert.equal(other.status,200,JSON.stringify(other.body));await d.apply(other.body,{namespace:'other-'+i});
    }
    const jobs=native.prepare("SELECT id FROM ik_jobs WHERE destination='workspace' ORDER BY id").all().map(r=>r.id as string);
    assert.equal(jobs.length,28);
    if (jobs.indexOf(job.id)>=25) continue;
    const person={target:{kind:'record',id:'person'},values:['person@example.test'],related:{fields:[{path:['details','reactions','*','users','*'],value:'person',optional:true}]}};
    let erased,continuation:string|undefined,redacting=0;
    do {erased=await retireD1ImportCustody(person,[{sql:"DELETE FROM native_records WHERE id='person'"}],d.runtime.context(),checkpoint,{resumable:true,continuation});continuation=erased.continuation;if (erased.phase==='redacting') redacting++;} while(erased.phase==='redacting');
    assert.equal(erased.phase,'complete');assert.ok(redacting>0,'an earlier step read the catch-up job');
    assertNowhere(native,[secret]);
    const namespace=native.prepare('SELECT namespace FROM ik_jobs WHERE id=?').get(job.id)!.namespace as string;
    assert.ok(!(await readD1ImportOriginals(job.id,{...d.runtime.context(),namespace})).some(o=>o.original?.status==='retained' && Buffer.from(o.original.base64,'base64').toString().includes(secret)));
    const status=await d.call('status',{planId:catchup.body.planId});
    assert.equal(status.status,200,JSON.stringify(status.body));assert.equal(status.body.job.state,'completed');
    return;
  }
  assert.fail('no attempt placed the catch-up job in the first redaction step');
});

test('After an erasure, a plan of an upload holding the erased person deletes it even where the namespace snapshot is withdrawn',async t=>{
  const d=await door(t);await d.enable();
  const native=d.runtime.native(),secret=['withdrawn','namespace','secret'].join('-');
  const base=[{id:'person',title:secret},{id:'kept',title:'withdrawn-kept'}];
  const baseline=await d.plan(base);assert.equal(baseline.status,200,JSON.stringify(baseline.body));await d.apply(baseline.body);
  const erased=await retireD1ImportCustody({target:{kind:'record',id:'person'}},[{sql:"DELETE FROM native_records WHERE id='person'"}],d.runtime.context(),checkpoint);
  assert.equal(erased.phase,'complete');
  // A catch-up, a plain plan, and the baseline's own bundle uploaded again: each holds the person.
  for (const [records,input] of [[[...base,{id:'new',title:'withdrawn-new'}],{catchup:true}],[[...base,{id:'new',title:'withdrawn-new'}],{}],[base,{}]] as const) {
    const uploadId=await d.upload(records as unknown[]);
    const planned=await d.call('plan',{uploadId,...input});
    assert.deepEqual([planned.status,planned.body.error],[409,'source_erased'],JSON.stringify(planned.body));
    assert.equal((await d.call('uploads',{uploadId})).status,404,'the upload holding the erased person goes');
  }
  assertNowhere(native,[secret]);
  // A bundle without the person is refused for the withdrawn snapshot and kept.
  const uploadId=await d.upload([{id:'kept',title:'withdrawn-kept'},{id:'new',title:'withdrawn-new'}]);
  const withdrawn=await d.call('plan',{uploadId,catchup:true});
  assert.deepEqual([withdrawn.status,withdrawn.body.error],[410,'snapshot_withdrawn'],JSON.stringify(withdrawn.body));
  assert.equal((await d.call('uploads',{uploadId})).status,200);
});

test('After an erasure withdraws a pending catch-up, a plan of an upload holding the erased person deletes it; a clean upload keeps the refusal',async t=>{
  const d=await door(t);await d.enable();
  const native=d.runtime.native(),secret=['pending','catchup','secret'].join('-');
  const base=[{id:'person',title:secret},{id:'kept',title:'pending-kept'}];
  const baseline=await d.plan(base);assert.equal(baseline.status,200,JSON.stringify(baseline.body));await d.apply(baseline.body);
  // Business plans the next catch-up; the owner has not approved it when the person is erased.
  const pending=await d.plan([...base,{id:'new',title:'pending-new'}],{catchup:true});assert.equal(pending.status,200,JSON.stringify(pending.body));
  const erased=await retireD1ImportCustody({target:{kind:'record',id:'person'}},[{sql:"DELETE FROM native_records WHERE id='person'"}],d.runtime.context(),checkpoint);
  assert.equal(erased.phase,'complete');
  // Each day's catch-up bundle still holds the person, under a plain and a bounded grant.
  const bounded={catchup:'bounded' as const,approvalRecordId:'test-standing-approval',approvedAt:d.approval.approvedAt};
  for (const [day,grant] of [[1,{}],[2,bounded]] as const) {
    const uploadId=await d.upload([...base,{id:'new',title:'pending-new'},{id:'day-'+day,title:'pending-day-'+day}]);
    const planned=await d.call('plan',{uploadId,catchup:true},grant);
    assert.deepEqual([planned.status,planned.body.error],[409,'source_erased'],JSON.stringify(planned.body));
    assert.equal((await d.call('uploads',{uploadId})).status,404,'the upload holding the erased person goes');
  }
  assertNowhere(native,[secret]);
  assert.equal(native.prepare('SELECT count(*) n FROM ik_door_chunks').get()!.n,0);
  // A bundle without the person keeps the pending-import refusal and stays.
  const uploadId=await d.upload([{id:'kept',title:'pending-kept'},{id:'new',title:'pending-new'}]);
  const refused=await d.call('plan',{uploadId,catchup:true});
  assert.deepEqual([refused.status,refused.body.error],[409,'namespace_has_pending_import'],JSON.stringify(refused.body));
  assert.equal((await d.call('uploads',{uploadId})).status,200);
});

test('After an erasure, a catch-up plan that a size limit would refuse deletes an upload holding the erased person; a clean upload keeps its 413',async t=>{
  const d=await door(t);await d.enable();
  const native=d.runtime.native(),secret='size-limit-erased-secret';
  const first=await d.plan([{id:'person',title:secret},{id:'kept',title:'size-limit-kept'}]);assert.equal(first.status,200,JSON.stringify(first.body));await d.apply(first.body);
  const erased=await retireD1ImportCustody({target:{kind:'record',id:'person'}},[{sql:"DELETE FROM native_records WHERE id='person'"}],d.runtime.context(),checkpoint);
  assert.equal(erased.phase,'complete');assertNowhere(native,[secret]);
  // A later namespace imports a destination too large for one 2 MiB native read, so its catch-up plan is refused 413 before it reaches the upload's records.
  const big={namespace:'big',maxBytes:8_000_000,maxChunks:200};
  const records=Array.from({length:60},(_,i)=>({id:'big'+i,title:'big '+i,body:'z'.repeat(40_000)}));
  const baseline=await d.call('plan',{uploadId:await d.upload(records,big)},big);assert.equal(baseline.status,200,JSON.stringify(baseline.body));await d.apply(baseline.body,big);
  // A clean catch-up upload in this situation still answers 413 and stays.
  const cleanId=await d.upload([...records,{id:'new',title:'size-limit-new'}],big);
  const clean=await d.call('plan',{uploadId:cleanId,catchup:true},big);
  assert.deepEqual([clean.status,clean.body.error],[413,'import_door_too_large'],JSON.stringify(clean.body).slice(0,300));
  assert.equal((await d.call('uploads',{uploadId:cleanId},big)).status,200,'a clean upload is kept');
  // An upload holding the erased person is refused for that first, and goes.
  const uploadId=await d.upload([...records,{id:'person',title:secret}],big);
  const planned=await d.call('plan',{uploadId,catchup:true},big);
  assert.deepEqual([planned.status,planned.body.error],[409,'source_erased'],JSON.stringify(planned.body).slice(0,300));
  assert.equal((await d.call('uploads',{uploadId},big)).status,404,'the upload holding the erased person goes');
  assertNowhere(native,[secret]);
});

test('HTTP failed target writes keep approval evidence, roll back the batch and require a fresh plan and approval',async t=>{
  const d1=(message:string)=>new Error('D1_ERROR: '+message);
  // null is a real insert-only constraint failure; the rest are provider errors.
  const failures:[Error|null,string][]=[
    [null,'import_door_apply_constraint'],
    [new Error('test provider error',{cause:Object.assign(new Error('database is locked'),{code:'SQLITE_BUSY'})}),'import_door_apply_transient'],
    [Object.assign(new Error('database table is locked'),{code:'SQLITE_LOCKED'}),'import_door_apply_transient'],
    [d1('Network connection lost.'),'import_door_apply_transient'],
    [d1('D1 DB reset because its code was updated.'),'import_door_apply_transient'],
    [d1('Internal error in D1 DB storage caused object to be reset.'),'import_door_apply_transient'],
    [d1('Cannot resolve D1 DB due to transient issue on remote node.'),'import_door_apply_transient'],
    [d1('D1 DB is overloaded. Requests queued for too long.'),'import_door_apply_transient'],
    [d1('D1 DB is overloaded. Too many requests queued.'),'import_door_apply_transient'],
    [d1('D1 DB storage operation exceeded timeout which caused object to be reset.'),'import_door_apply_transient'],
    [d1('UNIQUE constraint failed: native_records.id: SQLITE_CONSTRAINT'),'import_door_apply_constraint'],
    [d1('no such column: legacy_title: SQLITE_ERROR'),'import_door_apply_failed'],
  ];
  for (const [providerError,reason] of failures) {
    const d=await door(t);await d.enable();
    const records=documents(2),baseline=await d.plan(records);assert.equal(baseline.status,200);await d.apply(baseline.body);
    // Exercise the upgrade with populated plans, chunks, approvals and enabled
    // foreign keys. The original schema's bundle uniqueness must be removed.
    d.runtime.native().exec('DROP TABLE ik_door_apply_failures; CREATE UNIQUE INDEX legacy_bundle ON ik_door_plans(installation_id,namespace,bundle_sha256)');
    // An outdated schema fails loudly: the door refuses every route, and
    // re-applying importDoorSchema instead of the migration is refused whole.
    assert.deepEqual(await d.call('status',{planId:baseline.body.planId}),{status:503,body:{error:'import_door_schema_outdated'}});
    await assert.rejects(d.db.batch(importDoorSchema.map(q=>d.db.prepare(q))),/IMPORT_ATOMIC_GUARD/);
    assert.equal(d.runtime.native().prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='ik_door_apply_failures'").get()!.n,0);
    await d.db.batch(importDoorApplyFailureMigration.map(q=>d.db.prepare(q)));
    await d.db.batch(importDoorSchema.map(q=>d.db.prepare(q)));
    assert.deepEqual(d.runtime.native().prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal((await d.call('status',{planId:baseline.body.planId})).body.job.state,'completed');
    const before=d.runtime.native().prepare('SELECT * FROM native_records ORDER BY id').all();
    const changed=[{id:'2',title:'New article'},...records.map(r=>r.id==='0'?{...r,title:'Updated source article'}:r)];
    const planned=await d.plan(changed,{catchup:true});assert.equal(planned.status,200,JSON.stringify(planned.body));
    let writes=0;
    d.options.targets={...sqliteTargets,write(row) {
      writes++;
      if(row.targetId!=='0') return sqliteTargets.write(row);
      if(providerError) throw providerError;
      // An insert-only adopter cannot replace this existing native id. SQLite
      // must roll back the addition earlier in the same real apply batch too.
      return [{sql:'INSERT INTO native_records VALUES(?,?,?,?,?)',params:[row.destination,row.targetKind,row.targetId,row.revision,canonicalJson(row.value)]}];
    }};
    const input={planId:planned.body.planId,reviewedFingerprint:planned.body.fingerprint};
    const grant={fingerprint:planned.body.fingerprint,...d.approval},signed=await d.token('apply',grant);
    const failed=await d.call('apply',input,{},signed);
    assert.equal(failed.status,reason==='import_door_apply_transient'?503:409,JSON.stringify(failed.body));assert.equal(failed.body.error,reason);
    assert.deepEqual(d.runtime.native().prepare('SELECT * FROM native_records ORDER BY id').all(),before);
    const status=await d.call('status',{planId:planned.body.planId});assert.equal(status.status,200);
    assert.equal(status.body.job.state,'failed');assert.equal(status.body.job.error,reason);assert.equal(status.body.job.checkpoint,0);
    assert.equal(status.body.failureCode,reason);assert.equal(status.body.approval.approval_id,d.approval.approvalRecordId);
    assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM ik_provenance WHERE job_id=?').get(status.body.job.id)!.n,0);
    assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM ik_batches WHERE job_id=?').get(status.body.job.id)!.n,0);
    const history=await readImportDoorHistory(d.db,d.options.claim.installationId,d.ownerPredicate),entry=history.find(r=>r.planId===planned.body.planId)!;
    assert.equal(entry.state,'failed');assert.equal(entry.error,reason);assert.equal(entry.failureCode,reason);
    assert.equal(entry.approvalRecordId,d.approval.approvalRecordId);assert.equal(entry.reviewer,d.approval.approvalRecordId);
    assert.equal((await d.call('apply',input,{},signed)).status,403);
    const writesAtFailure=writes;
    assert.equal((await d.call('apply',input,grant)).body.error,'import_door_plan_failed');
    assert.equal((await d.call('apply',input,{...grant,approvalRecordId:'test-new-approval-for-old-plan'})).body.error,'import_door_plan_failed');
    assert.equal(writes,writesAtFailure);
    // Retry the exact same bytes in the same logical namespace. Both the plan
    // and its reviewed fingerprint are new; the old approval cannot apply it.
    d.options.targets=sqliteTargets;
    const retry=await d.plan(changed,{catchup:true});assert.equal(retry.status,200,JSON.stringify(retry.body));
    assert.notEqual(retry.body.planId,planned.body.planId);assert.notEqual(retry.body.fingerprint,planned.body.fingerprint);
    const retryInput={planId:retry.body.planId,reviewedFingerprint:retry.body.fingerprint};
    const oldApproval=await d.call('apply',retryInput,{fingerprint:retry.body.fingerprint,...d.approval});
    assert.equal(oldApproval.status,409);assert.equal(oldApproval.body.error,'failed_approval_requires_new_approval');
    assert.equal((await d.call('apply',retryInput,{fingerprint:retry.body.fingerprint})).status,403);
    assert.deepEqual(d.runtime.native().prepare('SELECT * FROM native_records ORDER BY id').all(),before);
    await d.apply(retry.body,{approvalRecordId:'test-retry-owner-approval'});
    const reconciled=await d.call('reconcile',{planId:retry.body.planId});assert.equal(reconciled.body.ok,true);assert.equal(reconciled.body.counts.nativeTargets,3);
    assert.equal((await d.call('status',{planId:planned.body.planId})).body.job.state,'failed');
    assert.equal((await d.call('apply',input,grant)).body.error,'import_door_plan_failed');
    await d.undo(retry.body.planId);await d.undo(baseline.body.planId);
    assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  }
  // A later failed batch preserves earlier progress until the owner rolls it
  // back. That rollback must retain the failure audit and terminal plan fence.
  const d=await door(t);await d.enable();
  const records=documents(30),planned=await d.plan(records);assert.equal(planned.status,200);
  const input={planId:planned.body.planId,reviewedFingerprint:planned.body.fingerprint},grant={fingerprint:planned.body.fingerprint,...d.approval};
  const first=await d.call('apply',input,grant);assert.equal(first.status,200);assert.equal(first.body.job.state,'applying');
  const checkpoint=first.body.job.checkpoint;assert.ok(checkpoint>0 && checkpoint<records.length);
  d.options.targets={...sqliteTargets,write(){throw new Error('test unsupported native write');}};
  const failed=await d.call('apply',input,grant);assert.equal(failed.status,409);assert.equal(failed.body.error,'import_door_apply_failed');
  const status=await d.call('status',{planId:planned.body.planId});assert.equal(status.body.job.state,'failed');assert.equal(status.body.job.checkpoint,checkpoint);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,checkpoint);
  assert.equal((await d.plan(records)).status,409);
  d.options.targets=sqliteTargets;
  await d.undo(planned.body.planId);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  const rolledBack=await d.call('status',{planId:planned.body.planId});assert.equal(rolledBack.body.job.state,'rolled_back');assert.equal(rolledBack.body.failureCode,'import_door_apply_failed');
  const history=await readImportDoorHistory(d.db,d.options.claim.installationId,d.ownerPredicate);
  assert.equal(history[0].failureCode,'import_door_apply_failed');assert.equal(history[0].approvalRecordId,d.approval.approvalRecordId);
  assert.equal((await d.call('apply',input,grant)).body.error,'import_door_plan_failed');
  const retry=await d.plan(records);assert.equal(retry.status,200);assert.notEqual(retry.body.planId,planned.body.planId);
  await d.apply(retry.body,{approvalRecordId:'test-retry-after-rollback'});await d.undo(retry.body.planId);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
});

test('HTTP catch-ups keep planning and reconciling however long the chain grows',async t=>{
  const d=await door(t);await d.enable();
  let records=documents(50,true);
  const base=await d.plan(records);assert.equal(base.status,200,JSON.stringify(base.body));await d.apply(base.body);
  const bounded={catchup:'bounded' as const,approvalRecordId:'test-standing-approval',approvedAt:d.approval.approvedAt};
  // A first catch-up revises every record, so each live row already holds its
  // before image and the bytes measured below grow only with the chain.
  records=records.map(r=>({...r,body:`${r.body} Revised.`}));
  const revised=await d.plan(records,{catchup:true});assert.equal(revised.status,200,JSON.stringify(revised.body));
  assert.equal(revised.body.summary.updated,50);await d.apply(revised.body);
  // Each catch-up owns two live records, so every job stays in the persisted read.
  const cost:Record<'plan'|'reconcile',{statements:number;bytes:number}[]>={plan:[],reconcile:[]};
  const last=(action:'plan'|'reconcile')=>{const {statements,bytes}=d.requests.findLast(r=>r.action===action)!;cost[action].push({statements,bytes});};
  for (let step=1;step<=10;step++) {
    const changed=[String(2*step-2),String(2*step-1)],grant=step>7?bounded:{};
    records=records.map(r=>changed.includes(r.id)?{...r,title:`${r.title}, revision ${step}`}:r);
    const planned=await d.plan(records,{catchup:true},grant);assert.equal(planned.status,200,`step ${step}: ${JSON.stringify(planned.body)}`);last('plan');
    assert.equal(planned.body.summary.updated,2);assert.equal(planned.body.summary.unchanged,48);
    await d.apply(planned.body,grant);
    const reconciled=await d.call('reconcile',{planId:planned.body.planId});assert.equal(reconciled.status,200,`step ${step}: ${JSON.stringify(reconciled.body)}`);last('reconcile');
    assert.equal(reconciled.body.ok,true);assert.equal(reconciled.body.counts.present,50);assert.equal(reconciled.body.counts.nativeTargets,50);
  }
  // Per request, catch-up planning and reconcile cost the same statements at every
  // step, and read only each job's fixed custody rows more: never another plan.
  t.diagnostic(JSON.stringify(cost));
  for (const [action,series] of Object.entries(cost)) {
    assert.deepEqual(series.map(c=>c.statements),series.map(()=>series[0].statements),`${action} statements per catch-up`);
    for (let step=1;step<series.length;step++) assert.ok(series[step].bytes-series[step-1].bytes<2048,`${action} reads ${series[step].bytes-series[step-1].bytes} more bytes at catch-up ${step+1}`);
  }
  const titles=d.runtime.native().prepare("SELECT id,json_extract(value_json,'$.title') AS title FROM native_records WHERE id IN ('0','19','20')").all();
  assert.deepEqual(Object.fromEntries(titles.map(r=>[r.id,r.title])),{'0':'Knowledge article 0, revision 1','19':'Knowledge article 19, revision 10','20':'Knowledge article 20'});
});

test('HTTP door names a native snapshot too large for one read instead of a bare conflict',async t=>{
  const d=await door(t);await d.enable();
  const quota={maxBytes:3_000_000,maxChunks:64};
  // Each record fits the reader's 1 MiB record limit; their exact row guards together exceed one read.
  const records=[0,1,2].map(i=>({id:String(i),title:`Large article ${i}`,body:'Archived knowledge. '.repeat(45_000)}));
  const planned=await d.call('plan',{uploadId:await d.upload(records,quota)},quota);assert.equal(planned.status,200,JSON.stringify(planned.body));
  await d.apply(planned.body);
  const changed=records.map(r=>r.id==='0'?{...r,title:'Large article, updated'}:r);
  for (const response of [await d.call('reconcile',{planId:planned.body.planId}),await d.call('plan',{uploadId:await d.upload(changed,quota),catchup:true},quota)]) {
    assert.equal(response.status,413,JSON.stringify(response.body).slice(0,300));
    assert.equal(response.body.error,'import_door_too_large');
    assert.deepEqual(response.body.details.targetKinds,['record']);assert.match(response.body.details.reason,/target kind "record"/);
    assert.doesNotMatch(JSON.stringify(response.body),/Archived knowledge/);
  }
  await d.undo(planned.body.planId);assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
});

test('HTTP reconcile and catch-up planning cost fewer statements than the records imported, and fail closed on a native edit between reads',async t=>{
  const d=await door(t);await d.enable();
  // Before, each imported target cost its own plan and native reads: about 1,200 statements here.
  const records=documents(600),base=await d.plan(records);assert.equal(base.status,200,JSON.stringify(base.body));await d.apply(base.body);
  const statements=()=>d.requests.at(-1)!.statements;
  const reconciled=await d.call('reconcile',{planId:base.body.planId});assert.equal(reconciled.status,200,JSON.stringify(reconciled.body));
  assert.equal(reconciled.body.ok,true);assert.equal(reconciled.body.counts.present,600);
  const reconcile=statements();
  // The native rows reconcile and planning report are the ones the atomic read fenced.
  const original=d.runtime.native().prepare("SELECT value_json FROM native_records WHERE id='1'").get()!.value_json;
  let edits=0;
  d.options.targets={...sqliteTargets,async list(db,destination){
    const rows=await sqliteTargets.list(db,destination);
    d.runtime.native().prepare("UPDATE native_records SET value_json=? WHERE id='1'").run(canonicalJson({local:`owner edit ${++edits} between reads`}));
    return rows;
  }};
  const changed=[...records.map(r=>r.id==='0'?{...r,title:'Updated at source'}:r),{id:'600',title:'New source article'}];
  for (const raced of [await d.call('reconcile',{planId:base.body.planId}),await d.plan(changed,{catchup:true})]) {
    assert.equal(raced.status,409,JSON.stringify(raced.body));assert.equal(raced.body.error,'import_door_conflict');
  }
  d.options.targets=sqliteTargets;
  d.runtime.native().prepare("UPDATE native_records SET value_json=? WHERE id='1'").run(original);
  const planned=await d.plan(changed,{catchup:true});assert.equal(planned.status,200,JSON.stringify(planned.body));
  assert.equal(planned.body.summary.updated,1);assert.equal(planned.body.summary.created,1);assert.equal(planned.body.differences.conflicts.length,0);
  const catchup=statements();
  for (const count of [reconcile,catchup]) assert.ok(count<records.length,`${count} statements for ${records.length} imported records`);
  await d.apply(planned.body);
  const caughtUp=await d.call('reconcile',{planId:planned.body.planId});assert.equal(caughtUp.body.ok,true);assert.equal(caughtUp.body.counts.present,601);
  assert.ok(statements()<records.length);
});

test('owner-session HTTP pipeline works in a seed with no owner-claim module or grant key ring',async t=>{
  const d=await door(t,'operator');
  for (const action of ['uploads','plan','apply','status','reconcile','undo']) {
    assert.equal((await fetch(d.origin+'/api/rer/import/'+action,{method:'POST'})).status,404);
  }
  const post=(body:unknown,headers:Record<string,string>)=>fetch(d.origin+'/api/operator/import/apply',{
    method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post({}, {Origin:d.origin,Authorization:'Bearer test-not-an-owner-session'})).status,401);
  assert.equal((await post({}, {Origin:'https://other.example.test',Cookie:'test-owner-session'})).status,403);
  const planned=await d.plan(documents(25,true));
  assert.equal(planned.status,200,JSON.stringify(planned.body));
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  assert.equal((await d.call('apply',{planId:planned.body.planId})).status,400);
  assert.equal((await d.call('apply',{planId:planned.body.planId,reviewedFingerprint:'0'.repeat(64)})).status,403);
  d.runtime.native().exec("CREATE TRIGGER revoke_owner_during_write AFTER INSERT ON native_records BEGIN UPDATE native_authority SET enabled=0 WHERE id='owner'; END");
  assert.equal((await d.call('apply',{planId:planned.body.planId,reviewedFingerprint:planned.body.fingerprint})).status,409);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  d.runtime.native().exec('DROP TRIGGER revoke_owner_during_write');
  // As with a grant revoked during a write, the interrupted apply fails its plan for good; a fresh plan applies.
  assert.equal((await d.call('status',{planId:planned.body.planId})).body.job.state,'failed');
  assert.equal((await d.call('apply',{planId:planned.body.planId,reviewedFingerprint:planned.body.fingerprint})).body.error,'import_door_plan_failed');
  const replanned=await d.plan(documents(25,true));
  assert.equal(replanned.status,200,JSON.stringify(replanned.body));assert.notEqual(replanned.body.planId,planned.body.planId);
  const job=await d.apply(replanned.body);
  const status=await d.call('status',{planId:replanned.body.planId});
  assert.equal(status.status,200);assert.equal(status.body.job.state,'completed');
  assert.match(status.body.caption,/^approved by /);
  const history=await readImportDoorHistory(d.db,d.options.claim.installationId,d.ownerPredicate);
  assert.equal(history[0].jobId,job.id);assert.notEqual(history[0].reviewer,history[0].approvalRecordId);
  const report=await d.call('reconcile',{planId:replanned.body.planId});
  assert.equal(report.status,200,JSON.stringify(report.body));assert.equal(report.body.ok,true);
  assert.equal(report.body.counts.present,25);assert.equal(report.body.counts.nativeTargets,25);
  d.runtime.native().exec("UPDATE native_authority SET enabled=0 WHERE id='owner'");
  assert.equal((await d.call('undo',{planId:replanned.body.planId})).status,403);
  d.runtime.native().exec("UPDATE native_authority SET enabled=1 WHERE id='owner'");
  await d.undo(replanned.body.planId);
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n,0);
  const originals=await readD1ImportOriginals(job.id,{...d.runtime.context(),namespace:job.namespace});
  assert.equal(originals[0].original.status,'retained');
  assert.equal(d.runtime.native().prepare('SELECT COUNT(*) n FROM ik_door_grants').get()!.n,0);
  assert.equal(d.runtime.native().prepare('SELECT enabled FROM ik_door_settings').get()!.enabled,0);
});

test('Business added later under a different RER claim id keeps the door key, owner history and catch-up lineage',async t=>{
  const d=await door(t,'operator'),key=d.options.claim.installationId,count=()=>d.runtime.native().prepare('SELECT COUNT(*) n FROM native_records').get()!.n;
  const kept=await d.plan(documents(5));assert.equal(kept.status,200,JSON.stringify(kept.body));await d.apply(kept.body);
  // RER supplies its own claim installation id later; the grant mount keeps the operator's door key.
  d.addGrants('rer-assigned');
  await writeImportDoorSettings(d.db,key,{enabled:true},d.ownerPredicate);
  assert.equal((await d.call('plan',{},{installationId:key})).status,403,'grants are still verified against the claim id');
  const history=await readImportDoorHistory(d.db,key,d.ownerPredicate);
  assert.equal(history.length,1);assert.equal(history[0].planId,kept.body.planId);assert.match(history[0].caption,/^approved by /);
  assert.equal((await readImportDoorHistory(d.db,'rer-assigned',d.ownerPredicate)).length,0);
  const records=documents(6),uploadId=await d.upload(records);
  const plain=await d.call('plan',{uploadId});assert.equal(plain.status,409);assert.equal(plain.body.error,'catchup_required');
  const catchup=await d.call('plan',{uploadId,catchup:true});assert.equal(catchup.status,200,JSON.stringify(catchup.body));
  assert.equal(catchup.body.summary.created,1);assert.equal(catchup.body.summary.unchanged,5);assert.equal(catchup.body.summary.updated,0);
  await d.apply(catchup.body);assert.equal(count(),6);
  const both=await readImportDoorHistory(d.db,key,d.ownerPredicate);
  assert.deepEqual(both.map(h=>[h.planId,h.caption.split(' by ')[0]]).sort(),[[kept.body.planId,'approved'],[catchup.body.planId,'approved via Business']].sort());
  assert.equal(d.runtime.native().prepare("SELECT COUNT(*) n FROM ik_door_grants WHERE installation_id<>?").get(key)!.n,0);
  assert.equal(d.runtime.native().prepare("SELECT COUNT(*) n FROM ik_door_namespaces").get()!.n,1);
  // The owner's own mount still undoes the newest snapshot, then the original.
  d.state.via='operator';
  await d.undo(catchup.body.planId);assert.equal(count(),5);await d.undo(kept.body.planId);assert.equal(count(),0);
});

test('one owner-session mount serves several import sources chosen per request from a server-side allow-list',async t=>{
  const d=await door(t,'operator'),count=(table:string)=>d.runtime.native().prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n;
  // ADOPTING.md steps 3 and 4: one server-owned allow-list picks namespace, parser and mapping for both mounts.
  const sources:Record<string,{parse(value:Json):{kind:string;sourceId:string;payload:Json}}>={
    wiki:{parse:value=>({kind:'document',sourceId:(value as {id:string}).id,payload:value})},
    tickets:{parse:value=>({kind:'ticket',sourceId:'t'+(value as {id:string}).id,payload:value})},
  };
  const importSource=(name:string)=>Object.hasOwn(sources,name)?{...sources[name],mapping:d.options.mapping}:null;
  const importDoor=async (request:Request)=>{
    const path=new URL(request.url).pathname;
    if (path.startsWith('/api/rer/import/')) return Response.json({error:'not_found'},{status:404});
    if (!path.startsWith('/api/operator/import/')) return null;
    const name=request.headers.get('X-Import-Source') ?? '',source=importSource(name);
    if (!source) return Response.json({error:'unknown_import_source'},{status:400});
    return d.operator({...source,namespace:name})(request);
  };
  d.mount(importDoor);
  // Until a grant mount with a key ring runs first, the door's grant routes answer 404, not the seed router.
  for (const action of ['uploads','plan','apply','status','reconcile','undo']) {
    const response=await fetch(d.origin+'/api/rer/import/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await d.token(action as 'plan',{namespace:'wiki'})},body:'{}'});
    assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'not_found'});
  }
  for (const headers of [{},{'X-Import-Source':'other'},{'X-Import-Source':'__proto__'}] as Record<string,string>[]) {
    d.state.headers=headers;
    assert.equal((await d.call('uploads',{name:'x.json'})).status,400);assert.equal((await d.call('plan',{uploadId:'x'})).body.error,'unknown_import_source');
  }
  assert.equal(count('ik_door_uploads'),0);
  d.state.headers={'X-Import-Source':'wiki'};
  const wiki=await d.plan(documents(5));assert.equal(wiki.status,200,JSON.stringify(wiki.body));await d.apply(wiki.body);
  d.state.headers={'X-Import-Source':'tickets'};
  assert.equal((await d.call('status',{planId:wiki.body.planId})).status,404,'a plan is reachable only through its own source');
  assert.equal((await d.call('undo',{planId:wiki.body.planId})).status,404);
  const ticketUpload=await d.upload(documents(3));
  const tickets=await d.call('plan',{uploadId:ticketUpload});assert.equal(tickets.status,200,'a first import per source needs no catch-up');
  assert.equal(tickets.body.summary.created,3);await d.apply(tickets.body);
  assert.deepEqual(d.runtime.native().prepare("SELECT id FROM native_records ORDER BY id").all().map(r=>r.id),['0','1','2','3','4','t0','t1','t2']);
  d.state.headers={'X-Import-Source':'wiki'};
  assert.equal((await d.call('plan',{uploadId:ticketUpload})).status,404,'an upload is planned only in its own source');
  assert.deepEqual(d.runtime.native().prepare('SELECT namespace FROM ik_door_namespaces ORDER BY namespace').all().map(r=>r.namespace),['tickets','wiki']);
  const history=await readImportDoorHistory(d.db,d.options.claim.installationId,d.ownerPredicate);
  assert.deepEqual(history.map(h=>h.namespace).sort(),['tickets','wiki']);
  // Business arrives: the grant mount runs first and resolves each verified grant's namespace through the same allow-list.
  const {parse:_parse,mapping:_mapping,...mount}=d.options;
  d.mount(createImportDoorHandler({...mount,installationId:d.options.claim.installationId,source:importSource}),importDoor);
  await d.enable();d.state.via='grant';d.state.headers={};
  const rows=()=>['ik_door_grants','ik_door_uploads','ik_door_chunks','ik_door_plans','ik_door_namespaces','ik_jobs','native_records'].map(count);
  const before=rows();
  for (const namespace of ['other','knowledge','__proto__','toString','Tickets']) {
    const refused=await d.call('uploads',{name:'x.json'},{namespace});
    assert.equal(refused.status,403,namespace);assert.equal(refused.body.error,'unknown_import_source');
    assert.equal((await d.call('plan',{uploadId:ticketUpload},{namespace})).body.error,'unknown_import_source');
    assert.equal((await d.call('status',{planId:tickets.body.planId},{namespace})).status,403);
  }
  assert.deepEqual(rows(),before,'an unlisted namespace writes no grant, upload, plan, lineage, job or native row');
  // A tickets grant is parsed with the tickets parser: it catches up on the owner's tickets lineage.
  const ticketsGrant=await d.upload(documents(4),{namespace:'tickets'});
  assert.equal((await d.call('plan',{uploadId:ticketsGrant},{namespace:'tickets'})).body.error,'catchup_required');
  const businessTickets=await d.call('plan',{uploadId:ticketsGrant,catchup:true},{namespace:'tickets'});
  assert.equal(businessTickets.status,200,JSON.stringify(businessTickets.body));
  assert.deepEqual(businessTickets.body.summary,{sourceRecords:4,created:1,updated:0,unchanged:3,gone:0});
  assert.deepEqual(businessTickets.body.differences.additions,[canonicalJson(['ticket','t3'])]);
  await d.apply(businessTickets.body,{namespace:'tickets'});
  const wikiGrant=await d.upload(documents(6),{namespace:'wiki'});
  const businessWiki=await d.call('plan',{uploadId:wikiGrant,catchup:true},{namespace:'wiki'});
  assert.deepEqual(businessWiki.body.summary,{sourceRecords:6,created:1,updated:0,unchanged:5,gone:0});
  await d.apply(businessWiki.body,{namespace:'wiki'});
  assert.deepEqual(d.runtime.native().prepare("SELECT id FROM native_records ORDER BY id").all().map(r=>r.id),['0','1','2','3','4','5','t0','t1','t2','t3']);
  assert.deepEqual(d.runtime.native().prepare('SELECT DISTINCT namespace FROM ik_door_grants ORDER BY namespace').all().map(r=>r.namespace),['tickets','wiki']);
  // Each owner mount adopts only the plan its own source parsed.
  d.state.via='operator';d.state.headers={'X-Import-Source':'tickets'};
  const adopted=await d.call('status',{planId:businessTickets.body.planId});
  assert.equal(adopted.body.job.state,'completed');assert.match(adopted.body.caption,/^approved via Business by /);
  assert.equal((await d.call('status',{planId:businessWiki.body.planId})).status,404);
  d.state.headers={'X-Import-Source':'wiki'};
  assert.equal((await d.call('status',{planId:businessTickets.body.planId})).status,404);
  await d.undo(businessWiki.body.planId);await d.undo(wiki.body.planId);assert.equal(count('native_records'),4);
  d.state.headers={'X-Import-Source':'tickets'};await d.undo(businessTickets.body.planId);await d.undo(tickets.body.planId);assert.equal(count('native_records'),0);
});
