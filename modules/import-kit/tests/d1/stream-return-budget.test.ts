import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStagingFixture, nativePrivateTables } from './native-staging-fixture.ts';
import { readD1ImportStream, resumeD1ImportStream, undoD1ImportStream } from '../../src/d1/index.ts';
import { requestContext, remaining, limitStatements } from '../../src/d1/budget.ts';
import { streamState, streamReturnQueries } from '../../src/d1/stream-state.ts';

test('the pre-admitted stream tail covers all authority and snapshot statements under a work ceiling',async t=>{
  const r=await nativeStagingFixture(t),context=limitStatements(requestContext(r.context()),1000);
  const current=await streamState(r.job.id,context),reserved=streamReturnQueries(current,context),before=remaining(context);
  await readD1ImportStream(r.job.id,context);
  const actual=before-remaining(context);
  assert.ok(actual>=7);assert.ok(reserved>=actual);assert.ok(reserved<50);
});
for(const action of ['apply','undo'])test(`stream ${action} either pre-admits its complete return or leaves native publication unchanged`,async t=>{
  const measure=await nativeStagingFixture(t),invoke=(id:string,context:any)=>action==='apply'?resumeD1ImportStream(id,context):undoD1ImportStream(id,context);
  if(action==='undo')await resumeD1ImportStream(measure.job.id,measure.context());
  const counted=requestContext(measure.context());await invoke(measure.job.id,counted);const used=1000-remaining(counted);
  const r=await nativeStagingFixture(t);if(action==='undo')await resumeD1ImportStream(r.job.id,r.context());
  const context=requestContext(r.context());
  for(let i=0;i<1001-used;i++)await context.storage.database.prepare('SELECT 1').first();
  const before=r.native().prepare('SELECT * FROM native_records ORDER BY id').all();
  await assert.rejects(invoke(r.job.id,context),/IMPORT_D1_REQUEST_LIMIT/);
  assert.deepEqual(r.native().prepare('SELECT * FROM native_records ORDER BY id').all(),before);
  assert.ok(remaining(context)>=0);
  for(const table of nativePrivateTables)assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
});
