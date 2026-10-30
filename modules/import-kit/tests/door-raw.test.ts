import test from 'node:test';
import assert from 'node:assert/strict';
import { door } from './door/fixture.ts';
import { createImportDoorHandler, createImportOperatorHandler } from '../src/door/index.ts';
import { readD1ImportOriginals, retireD1ImportCustody } from '../src/d1/index.ts';
import { sha256 } from '../src/provenance/identity.ts';
import { checkDoor, rawDoorRecords, rawDoorZip, readRawDoorZip } from '../../../default-seed/tests/e2e/import-door-conformance.mjs';
import type { ImportDoorRawSource, ImportDoorRawUpload } from '../src/door/types.ts';
import type { ReaderLimits } from '../src/types.ts';

// One public journey registration, both real HTTP authorities and unchanged JSON.
test('raw ZIP sources share the public door lifecycle, custody and refusals with JSON',async t=>{
  for (const mode of ['grant','operator'] as const) {
    const d = await door(t,mode); await d.enable();
    let reads = 0, limits: ReaderLimits = {};
    const raw: ImportDoorRawSource = {format:'raw',mapping:d.options.mapping,
      readRaw(upload: ImportDoorRawUpload, bounded) {
        reads++;
        assert.equal(upload.size,upload.bytes.length);
        assert.equal(upload.sha256,sha256(upload.bytes));
        const records = readRawDoorZip(upload,bounded);
        upload.bytes.fill(0); // A reader's working buffer cannot change custody.
        return records;
      }};
    const mount = () => {
      const native = async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (path === '/native') return Response.json(d.runtime.native().prepare('SELECT value_json FROM native_records ORDER BY id').all().map(r=>JSON.parse(r.value_json as string)));
        if (path.startsWith('/originals/')) {
          const id = path.slice('/originals/'.length);
          const job = d.runtime.native().prepare('SELECT namespace FROM ik_jobs WHERE id=?').get(id)!;
          return Response.json(await readD1ImportOriginals(id,{...d.runtime.context(),namespace:job.namespace as string}));
        }
        if (path === '/erase' && request.method === 'POST') {
          let result;
          do {result = await retireD1ImportCustody({target:{kind:'record',id:rawDoorRecords[0].id}},[],d.runtime.context(),[{sql:'SELECT 1'}]);} while (result.phase === 'pending');
          return Response.json(result);
        }
        return null;
      };
      if (mode === 'grant') {
        const {parse,mapping,...runtime} = d.options;
        d.mount(native,createImportDoorHandler({...runtime,limits,source:namespace=>namespace==='knowledge'?raw:namespace==='json'?{parse,mapping}:null}));
      } else {
        const {claim,parse,...runtime} = d.options;
        d.mount(native,createImportOperatorHandler({...runtime,...raw,limits,
          installationId:claim.installationId,appOrigin:d.origin,ownerEmail:claim.expectedEmail,namespace:'knowledge',
          authorize:async request=>request.headers.get('Cookie')==='test-owner-session'?d.ownerPredicate:null}));
      }
    };
    mount();
    const snapshot = async () => (await d.request(d.origin+'/native')).json();
    const request = async (action: any,body: unknown,review?: any) => {
      const result = await d.call(action,body,review);
      return Response.json(result.body,{status:result.status});
    };
    const bytes = rawDoorZip();
    assert.throws(()=>new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    let jobId: string | undefined;
    await checkDoor({request:async (action: any,body: unknown,review?: any)=>{
      const response = await request(action,body,review);
      if (action === 'status') jobId = (await response.clone().json()).job.id;
      return response;
    },bytes,name:'knowledge.zip',nativeSnapshot:snapshot,
    async assertApplied(before: unknown[],after: unknown[],report: any) {
      assert.deepEqual(before,[]); assert.deepEqual(after,rawDoorRecords);
      assert.equal(report.counts.present,rawDoorRecords.length);
      const originals = await (await d.request(d.origin+'/originals/'+jobId)).json();
      assert.equal(originals[0].original.status,'retained');
      assert.deepEqual(Buffer.from(originals[0].original.base64,'base64'),bytes);
    },assertUndone:(before: unknown[],after: unknown[])=>assert.deepEqual(after,before)});
    assert.ok(reads > 0);
    const before = await snapshot();
    const malformedId = await d.upload(Buffer.from('synthetic-base-invalid-archive'));
    const malformed = await d.call('plan',{uploadId:malformedId});
    assert.deepEqual([malformed.status,malformed.body.error],[422,'source_raw_reader_failed']);
    assert.equal(typeof malformed.body.details.reason,'string');
    assert.ok(!JSON.stringify(malformed.body).includes('synthetic-base-invalid-archive'));
    assert.deepEqual(await snapshot(),before);
    let archiveId: string | undefined;
    if (mode === 'grant') {
      const archived = await d.call('archive',{uploadId:await d.upload(bytes),tool:'synthetic-base',takenAt:'2026-10-28T00:00:00.000Z'});
      assert.equal(archived.status,200,JSON.stringify(archived.body)); archiveId = archived.body.archiveId;
      const restored = await d.call('restore-check',{archiveId});
      assert.equal(restored.status,200,JSON.stringify(restored.body));
      assert.equal(restored.body.bundleSha256,sha256(bytes)); assert.equal(restored.body.bytes,bytes.length);
      assert.equal(restored.body.counts.input,rawDoorRecords.length);
      assert.equal((await d.call('archive',{uploadId:malformedId,tool:'synthetic-base',takenAt:'2026-10-28T00:00:00.000Z'})).status,422);
      assert.deepEqual(await snapshot(),before);
    }
    // Raw records use the existing catch-up lineage and newest-first Undo.
    const baseline = await d.plan(bytes); assert.equal(baseline.status,200); await d.apply(baseline.body);
    const replacement = rawDoorZip(rawDoorRecords.map((record: any,index: number)=>index ? {...record,title:'Reviewed service incident'} : record));
    const catchup = await d.plan(replacement,{catchup:true}); assert.equal(catchup.status,200);
    assert.equal(catchup.body.summary.updated,1); await d.apply(catchup.body);
    assert.equal((await d.call('reconcile',{planId:catchup.body.planId})).body.ok,true);
    assert.equal((await d.call('undo',{planId:baseline.body.planId})).status,409);
    await d.undo(catchup.body.planId); await d.undo(baseline.body.planId);
    assert.deepEqual(await snapshot(),before);
    // The same records in different exact archive bytes need a different review.
    const first = await d.plan(bytes); assert.equal(first.status,200);
    assert.equal((await d.call('undo',{planId:first.body.planId})).status,200);
    const changed = await d.plan(rawDoorZip(rawDoorRecords,Buffer.from([0xfe])));
    assert.equal(changed.status,200);
    assert.notEqual(first.body.fingerprint,changed.body.fingerprint);
    assert.equal((await d.call('apply',{planId:changed.body.planId,reviewedFingerprint:first.body.fingerprint},{fingerprint:first.body.fingerprint,...d.approval})).status,403);
    assert.equal((await d.call('undo',{planId:changed.body.planId})).status,200);
    // A lower server byte bound refuses before invoking the raw reader.
    const uploadId = await d.upload(bytes), calls = reads;
    limits = {maxBytes:bytes.length - 1}; mount();
    const oversized = await d.call('plan',{uploadId});
    assert.deepEqual([oversized.status,oversized.body.error],mode === 'grant' ? [413,'source_byte_limit'] : [403,'upload_exceeds_grant_quota']);
    assert.equal(reads,calls);
    limits = {maxRecordBytes:1}; mount();
    assert.equal((await d.call('plan',{uploadId:await d.upload(bytes)})).status,413);
    limits = {}; mount();
    // Hash/size mismatch never reaches a seed reader.
    const bad = await d.call('uploads',{name:'bad.zip',bundleSha256:sha256(bytes),totalBytes:bytes.length,totalChunks:1,index:0,chunkSha256:sha256(bytes.subarray(1)),base64:bytes.toString('base64')});
    assert.deepEqual([bad.status,bad.body.error],[400,'chunk_hash_or_size_mismatch']);
    // Complete, malformed and interrupted binary custody all withdraw on erasure.
    const partial = Buffer.alloc(65_537,0xff), chunk = partial.subarray(0,65_536);
    const opened = await d.call('uploads',{name:'partial.zip',bundleSha256:sha256(partial),totalBytes:partial.length,totalChunks:2,index:0,chunkSha256:sha256(chunk),base64:chunk.toString('base64')});
    assert.equal(opened.status,200); assert.equal(opened.body.complete,false);
    const incomplete = await d.call('plan',{uploadId:opened.body.uploadId});
    assert.deepEqual([incomplete.status,incomplete.body.error],[409,'upload_incomplete']);
    assert.equal((await d.request(d.origin+'/erase',{method:'POST'})).status,200);
    for (const id of [uploadId,malformedId,opened.body.uploadId]) assert.equal((await d.call('uploads',{uploadId:id})).status,404);
    if (archiveId) {
      const withdrawn = await d.call('restore-check',{archiveId});
      assert.deepEqual([withdrawn.status,withdrawn.body.error],[410,'archive_withdrawn']);
    }
    assert.deepEqual(await snapshot(),before);
    // The ordinary JSON adapter still uses the same checkDoor unchanged.
    if (mode === 'grant') {
      const jsonRequest = async (action: any,body: unknown,review?: any) => {
        const result = await d.call(action,body,{...review,namespace:'json'});
        return Response.json(result.body,{status:result.status});
      };
      const jsonRecords = rawDoorRecords.map((record: any,index: number)=>({...record,id:`synthetic-base-json-${index + 1}`}));
      await checkDoor({request:jsonRequest,bytes:Buffer.from(JSON.stringify(jsonRecords)),name:'knowledge.json',nativeSnapshot:snapshot,
        assertApplied:(_before: unknown[],after: unknown[])=>assert.deepEqual(after,jsonRecords),
        assertUndone:(before: unknown[],after: unknown[])=>assert.deepEqual(after,before)});
    }
  }
});
