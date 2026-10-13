import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource } from './sqlite-runtime.ts';
import { planD1ImportStream, createD1ImportStream, resumeD1ImportStream, undoD1ImportStream } from '../../src/d1/index.ts';

for (const limited of [false, true]) test(`whole native apply and reverse transport respects explicit policy: ${limited}`, async t => {
  const r = await sqliteRuntime(t), source = sqliteSource(12, '漢'.repeat(49000));
  source.artifacts.forEach(a => { a.original = { status: 'unavailable', reason: 'not-supplied' }; });
  const bytes: number[] = [], original = r.db();
  const database = { prepare: original.prepare, async batch(statements: any[]) {
    // Independent actual JSON array, including every native/guard SQL and value.
    bytes.push(Buffer.byteLength(JSON.stringify(statements.map(s => ({ sql: s.query, params: s.values })))));
    return original.batch(statements);
  } };
  const context = () => ({ ...r.context(), batchSize: 10, maxBatches: 1, ...(limited ? { maxBatchBytes: 2 * 1024 * 1024 } : {}), storage: { ...r.context().storage, database, targets: { ...r.context().storage.targets, planCodec: { id: 'identity-json-v1', encode: plan => plan, decode: plan => plan } } } });
  const plan = await planD1ImportStream(source, sqliteMapping, context());
  assert.equal(plan.pages.length, 1);
  let job = await createD1ImportStream(plan, { ...context(), reviewedFingerprint: plan.fingerprint });
  bytes.length = 0;
  while (job.state !== 'completed') job = await resumeD1ImportStream(job.id, context());
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n, 12);
  const applied = [...bytes]; bytes.length = 0;
  while (job.state !== 'undone') job = await undoD1ImportStream(job.id, context());
  assert.equal(r.native().prepare('SELECT count(*) n FROM native_records').get()!.n, 0);
  if (limited) { assert.ok(applied.every(n => n <= 2 * 1024 * 1024)); assert.ok(bytes.every(n => n <= 2 * 1024 * 1024)); }
  else assert.ok(applied.some(n => n > 2 * 1024 * 1024), 'ordinary omitted policy keeps existing large native batches');
});
