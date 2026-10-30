import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { door } from './fixture.ts';
import { fullScale } from '../d1/scale-size.ts';
import { logicalValue } from '../helpers/logical-size.ts';
import { createImportDoorHandler } from '../../src/door/index.ts';
import { PLAN_BYTES_LIMIT, planContentBytes } from '../../src/plan/size.ts';
import type { ImportMapping, ImportPlan } from '../../src/types.ts';

/** Real HTTP admission and completion; the release run reaches the byte cap.
 * One extra source record must fail planning, before any job or native write. */
export async function doorPlanCap(t: TestContext) {
  const sample = await door(t); await sample.enable();
  const record = {id:'synthetic-base-1',title:'synthetic-base-2'};
  let suffix = '';
  const mapping = (width: number): ImportMapping => ({version:'v1',map:source=>({effects:[{targetKind:'record',targetId:source.sourceId+suffix,value:source.payload}],unmapped:[{field:'x'.repeat(width),reason:'synthetic-base-3'}]})});
  sample.mount(createImportDoorHandler({...sample.options,mapping:mapping(1)}));
  let measured = await sample.plan([record]);
  assert.equal(measured.status,200,JSON.stringify(measured.body));
  const saved = (): ImportPlan => JSON.parse(sample.runtime.native().prepare('SELECT body FROM ik_door_plan_chunks WHERE plan_id=? ORDER BY ordinal').all(measured.body.planId).map(row=>row.body).join('')).plan;
  let fixed = planContentBytes(saved()) - 2;
  // The field occurs in both the entry and its diagnostic. A target id byte
  // changes the remaining parity; hashes and kit namespaces have fixed width.
  if ((PLAN_BYTES_LIMIT - fixed) % 2) {
    suffix += 'x';
    const namespace = {namespace:'synthetic-base-4'};
    measured = await sample.call('plan',{uploadId:await sample.upload([record],namespace)},namespace);
    assert.equal(measured.status,200,JSON.stringify(measured.body));
    fixed = planContentBytes(saved()) - 2;
  }
  assert.equal((PLAN_BYTES_LIMIT - fixed) % 2,0);
  const width = fullScale ? (PLAN_BYTES_LIMIT - fixed) / 2 : 200_000;
  const expectedBytes = fixed + width * 2;
  const d = await door(t); await d.enable();
  d.mount(createImportDoorHandler({...d.options,mapping:mapping(width)}));
  if (fullScale) {
    const over = await d.plan([record,{...record,id:record.id+'x'}]);
    assert.deepEqual([over.status,over.body.error],[413,'source_import_plan_too_large']);
    assert.match(over.body.details.reason,new RegExp(`limit is ${PLAN_BYTES_LIMIT}`));
  }
  assert.equal(d.runtime.native().prepare('SELECT count(*) n FROM ik_jobs').get()!.n,0);
  assert.equal(d.runtime.native().prepare('SELECT count(*) n FROM native_records').get()!.n,0);
  // In the ordinary run use a bounded logical graph to exercise the same
  // global refusal without allocating a release-size string.
  if (!fullScale) {
    d.mount(createImportDoorHandler({...d.options,mapping:{version:'v1',map:()=>({effects:[{targetKind:'record',targetId:'synthetic-base-5',value:logicalValue(BigInt(PLAN_BYTES_LIMIT))}]})}}));
    const refused = await d.plan([record]);
    assert.deepEqual([refused.status,refused.body.error],[413,'source_import_plan_too_large']);
    d.mount(createImportDoorHandler({...d.options,mapping:mapping(width)}));
  }
  const planned = await d.plan([record]);
  assert.equal(planned.status,200,planned.body.error);
  const job = await d.apply(planned.body);
  const envelope = JSON.parse(d.runtime.native().prepare('SELECT plan_json FROM ik_jobs WHERE id=?').get(job.id)!.plan_json as string);
  assert.equal(envelope.size,expectedBytes+81,'stored canonical bytes include the fixed fingerprint overhead');
  if (fullScale) assert.equal(expectedBytes,PLAN_BYTES_LIMIT);
  assert.equal(job.state,'completed'); assert.equal(job.total,1); assert.equal(job.checkpoint,1);
  assert.equal(d.runtime.native().prepare('SELECT count(*) n FROM native_records').get()!.n,1);
  assert.deepEqual(JSON.parse(d.runtime.native().prepare('SELECT value_json FROM native_records').get()!.value_json as string),record);
  let nearCapBytes: number | undefined;
  if (fullScale) {
    const namespace = {namespace:'synthetic-base-6'};
    d.mount(createImportDoorHandler({...d.options,mapping:mapping(width-32)}));
    const near = await d.call('plan',{uploadId:await d.upload([{...record,id:record.id+'x'}],namespace)},namespace);
    assert.equal(near.status,200,near.body.error);
    const completed = await d.apply(near.body,namespace);
    assert.equal(completed.state,'completed');
    nearCapBytes = JSON.parse(d.runtime.native().prepare('SELECT plan_json FROM ik_jobs WHERE id=?').get(completed.id)!.plan_json as string).size-81;
    assert.ok(nearCapBytes! < PLAN_BYTES_LIMIT && nearCapBytes! >= PLAN_BYTES_LIMIT-128);
    assert.equal(d.runtime.native().prepare('SELECT count(*) n FROM native_records').get()!.n,2);
  }
  assert.ok(d.requests.every(request=>request.queries<=1000));
  t.diagnostic(JSON.stringify({doorPlanBytes:expectedBytes,nearCapBytes,recordsAtCap:1,recordsOverCap:2,requests:d.requests.map(({action,status,queries,statements})=>({action,status,queries,statements}))}));
}
