import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { door, documents } from './door/fixture.ts';
import { createImportOperatorHandler } from '../src/door/operator.ts';
import { createImportDoorHandler } from '../src/door/index.ts';
import type { ImportDoorIntake } from '../src/door/types.ts';
import { intakeCases } from './door/intake-cases.ts';
import { assertZero, forbiddenOccurrences, storedBytes } from './door/intake-storage.ts';

const fields = ['id','title','email','name','blocked','status'];
const intake: ImportDoorIntake = {formats:['csv','ndjson','json'],allow:{csv:fields,
  ndjson:fields.map(key=>'/'+key),json:[...fields.map(key=>'/'+key),'/profile/email','/profile/login','/profile/displayName','/profile/firstName','/profile/lastName','/profile/department']}};

test('declared intake never persists forbidden bytes across boundaries; sanitized custody plans, replays and undoes through both entries',async t=>{
  const d = await door(t), marker = 'synthetic-forbidden-intake-84d9';
  await d.enable();
  const operator = createImportOperatorHandler({...d.options,intake,installationId:d.options.claim.installationId,
    appOrigin:d.origin,ownerEmail:d.options.claim.expectedEmail,namespace:'knowledge',
    authorize:async request=>request.headers.get('Cookie')==='test-owner-session'?d.ownerPredicate:null});
  const grant = createImportDoorHandler({...d.options,parse:undefined,mapping:undefined,
    source:namespace=>namespace==='knowledge'?{parse:d.options.parse,mapping:d.options.mapping,intake}:null});
  const results: unknown[] = [];
  async function upload(format:string, bytes:Buffer, offsets:number[] = [], via:'operator'|'grant'='operator') {
    const boundaries = [0,...offsets,bytes.length];
    let index = 0;
    const body = new ReadableStream<Uint8Array>({pull(controller){
      if (index === boundaries.length-1) {controller.close();return;}
      controller.enqueue(bytes.subarray(boundaries[index],boundaries[++index]));
    }});
    const response = await (via==='operator'?operator:grant)(new Request(d.origin+`/api/${via==='operator'?'operator':'rer'}/import/uploads`,{
      method:'POST',headers:{'Content-Type':'application/octet-stream','X-Import-Format':format,'X-Import-Name':'synthetic-export',
        ...(via==='operator'?{Origin:d.origin,Cookie:'test-owner-session'}:{Authorization:'Bearer '+await d.token('uploads',{maxBytes:20_000_000,maxChunks:400,maxRecords:1_000_000})})},
      body,duplex:'half',
    } as RequestInit));
    assert.ok(response);
    return {status:response.status,body:await response.json() as any};
  }
  async function clean(name:string) {
    const counts = await forbiddenOccurrences(d.runtime.native(),d.db,marker);
    assertZero(counts); results.push({name,...counts});
  }
  for (const sample of intakeCases(marker)) {
    const r = await upload(sample.format,sample.bytes,Array.from({length:Math.max(0,sample.bytes.length-1)},(_,i)=>i+1));
    assert.equal(r.status,sample.status??200,sample.name+': '+JSON.stringify(r.body));
    if (sample.row) assert.equal(r.body.details.row,sample.row,sample.name);
    if (sample.expected) {
      const bytes = await storedBytes(d.db,r.body.uploadId);
      const records = bytes.toString().trim()?bytes.toString().trim().split('\n').map(line=>JSON.parse(line)):[];
      assert.deepEqual(records,sample.expected,sample.name);
      assert.equal(r.body.intake.sanitized,true);
    }
    await clean(sample.name);
  }
  const sample = Buffer.from(`\ufeffid,title,passwordHash\r\na,"Réne 😀, says ""hello""\n次",${marker}\r\n`);
  for (let offset=1;offset<sample.length;offset++) {
    const r = await upload('csv',sample,[offset]);
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.deepEqual(JSON.parse((await storedBytes(d.db,r.body.uploadId)).toString()),{id:'a',title:'Réne 😀, says "hello"\n次'});
    await clean('every-offset CSV '+offset);
  }
  for (const format of ['json','ndjson']) {
    const row = `{"passwordHash":"${marker}","id":"a","title":"次😀\\\"quoted","blocked":false}`;
    const sample = Buffer.from(format==='json'?'['+row+']':row+'\r\n');
    for (let offset=1;offset<sample.length;offset++) {
      const r=await upload(format,sample,[offset]);assert.equal(r.status,200,JSON.stringify(r.body));
      assert.equal(JSON.parse((await storedBytes(d.db,r.body.uploadId)).toString()).blocked,false);
      await clean('every-offset '+format+' '+offset);
    }
  }
  const prefix='{"id":"boundary","title":"'+ 'Historical '.repeat(5950)+'","passwordHash":"';
  const crossing=Buffer.from(prefix+marker+'"}\n'), split=Buffer.byteLength(prefix)+Math.floor(marker.length/2);
  // Put the forbidden value across the exact old chunk-size boundary.
  const aligned=Buffer.concat([Buffer.from(' '.repeat(65_536-split)),crossing]);
  const boundary=await upload('ndjson',aligned,[65_536]);
  assert.equal(boundary.status,200,JSON.stringify(boundary.body));await clean('Forbidden value crosses 64 KiB');
  const precise = await upload('ndjson',Buffer.from(`{"id":"precise","title":900719925474099312345,"credentials":"${marker}"}\n`));
  assert.equal(precise.status,200);assert.ok((await storedBytes(d.db,precise.body.uploadId)).includes('900719925474099312345'));
  await clean('Numeric token preserved');
  const parts=['id,title,passwordHash\n'];let rawSize=Buffer.byteLength(parts[0]),row=0;
  while(rawSize<5*1024*1024) {const next=`large-${row++},${'Synthetic historical name '.repeat(3)},\n`;parts.push(next);rawSize+=Buffer.byteLength(next);}
  parts.push(`last,Last row,${marker}\n`);
  const large=await upload('csv',Buffer.from(parts.join('')),[], 'grant');
  assert.equal(large.status,200,JSON.stringify(large.body));await clean('5 MiB CSV forbidden last row');
  parts[parts.length-1]=`last,Last row,"${marker}`;
  const refusedLarge=await upload('csv',Buffer.from(parts.join('')));
  assert.equal(refusedLarge.status,422,JSON.stringify(refusedLarge.body));await clean('Malformed last row after streamed persistence');
  const viaGrant = await upload('ndjson',Buffer.from(`{"id":"lifecycle","title":"Historical person","passwordHash":"${marker}"}\n`),[17],'grant');
  assert.equal(viaGrant.status,200,JSON.stringify(viaGrant.body));
  d.mount(grant);
  const inventory=await d.call('uploads',{uploadId:viaGrant.body.uploadId});
  assert.equal(inventory.status,200,JSON.stringify(inventory.body));assert.equal(inventory.body.bundleSha256,viaGrant.body.bundleSha256);
  const refusedChunks=await d.call('uploads',{name:'raw',base64:Buffer.from(marker).toString('base64')});
  assert.equal(refusedChunks.status,415);await clean('Declared source refuses raw chunk envelope');
  const archived=await d.call('archive',{uploadId:viaGrant.body.uploadId,tool:'synthetic',takenAt:new Date().toISOString()});
  assert.equal(archived.status,200,JSON.stringify(archived.body));assert.deepEqual(archived.body.intake,viaGrant.body.intake);
  const restored=await d.call('restore-check',{archiveId:archived.body.archiveId});
  assert.equal(restored.status,200,JSON.stringify(restored.body));assert.deepEqual(restored.body.intake,viaGrant.body.intake);
  const plan=await d.call('plan',{uploadId:viaGrant.body.uploadId});assert.equal(plan.status,200,JSON.stringify(plan.body));
  const job=await d.apply(plan.body);assert.equal(job.state,'completed');
  assert.equal((await d.call('reconcile',{planId:plan.body.planId})).body.ok,true);
  assert.equal((await d.apply(plan.body)).id,job.id); // Idempotent apply replay.
  const saved=await d.db.prepare('SELECT plan_json FROM ik_jobs WHERE id=?').bind(job.id).first<{plan_json:string}>();
  const custody=JSON.parse(saved!.plan_json).source.intake;
  assert.deepEqual(custody,viaGrant.body.intake);
  assert.equal((await d.undo(plan.body.planId)).body.job.state,'undone');
  assert.equal((await d.db.prepare("SELECT count(*) n FROM native_records WHERE id='lifecycle'").first())?.n,0);
  const replay=await d.call('plan',{uploadId:viaGrant.body.uploadId});assert.equal(replay.status,200,JSON.stringify(replay.body));
  assert.notEqual(replay.body.planId,plan.body.planId);
  assert.equal((await d.apply(replay.body)).state,'completed');
  assert.equal((await d.call('reconcile',{planId:replay.body.planId})).body.ok,true);
  await clean('Grant plan apply reconcile undo replan replay');
  // Same projected custody through the real HTTP operator entry.
  d.mount(operator);d.state.via='operator';
  const network=await d.request(d.origin+'/api/operator/import/uploads',{method:'POST',headers:{Origin:d.origin,Cookie:'test-owner-session','Content-Type':'application/octet-stream','X-Import-Format':'ndjson','X-Import-Name':'owner-export'},body:`{"id":"network","credentials":"${marker}"}\n`});
  assert.equal(network.status,200,await network.clone().text());await clean('Operator HTTP streaming entry');
  if(process.env.INTAKE_RESULTS) await writeFile(process.env.INTAKE_RESULTS,JSON.stringify({rawLargeBytes:rawSize,propertyOffsets:results.filter((r:any)=>r.name.startsWith('every-offset')).length,results},null,2)+'\n');
});

test('undeclared door retains exact existing bytes and uses its ordinary public lifecycle',async t=>{
  const d=await door(t,'operator');
  const unsupported=await d.request(d.origin+'/api/operator/import/uploads',{method:'POST',headers:{Origin:d.origin,Cookie:'test-owner-session','Content-Type':'application/octet-stream'},body:'[]'});
  assert.equal(unsupported.status,400);
  const bytes=Buffer.from('\ufeff[\r\n {"id":"unchanged","title":"Historical 次😀"}\r\n]\r\n');
  const id=await d.upload(bytes);assert.deepEqual(await storedBytes(d.db,id),bytes);
  const raw=await d.upload(Buffer.from('[{"id":"old","passwordHash":"synthetic-legacy-retained"}]'));
  assert.ok((await storedBytes(d.db,raw)).includes('synthetic-legacy-retained'));
  const plan=await d.plan(documents(1));assert.equal(plan.status,200,JSON.stringify(plan.body));
  assert.equal((await d.apply(plan.body)).state,'completed');
  assert.equal((await d.call('reconcile',{planId:plan.body.planId})).body.ok,true);
  assert.equal((await d.undo(plan.body.planId)).body.job.state,'undone');
});
