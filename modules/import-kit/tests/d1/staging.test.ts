import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource, sqliteTargets } from './sqlite-runtime.ts';
import { planD1ImportStream, createD1ImportStream, resumeD1ImportStream, readD1ImportStream, undoD1ImportStream, eraseD1ImportTarget, cancelD1ImportStaging, type D1Database } from '../../src/d1/index.ts';
import { STAGING_BATCH_BYTES, stagingBatchBytes } from '../../src/d1/staging-transport.ts';
import { requestContext } from '../../src/d1/budget.ts';

const privateTables = ['ik_d1_staging','ik_d1_staging_pages','ik_d1_staging_chunks','ik_d1_staging_index','ik_d1_staging_originals'];
const publicTables = ['ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_d1_plan_chunks','ik_d1_plan_index','ik_originals','ik_original_sets','ik_d1_creation_plans','native_records'];
const normalized = (count = 201) => { const source = sqliteSource(count, 'retained Unicode 漢 and controls \n"\\'); source.artifacts.forEach(a => { a.original = { status: 'unavailable', reason: 'not-supplied' }; }); return source; };
function counts(native: any, tables: string[]) { return tables.map(table => [table, Number(native.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)]); }
function empty(native: any, tables = [...privateTables, ...publicTables]) { for (const [table, count] of counts(native, tables)) assert.equal(count, 0, String(table)); }
function observe(database: D1Database, hook: (sql: string[]) => Promise<void> | void, stats: number[] = []): D1Database {
  return { prepare: query => database.prepare(query), async batch(statements: any[]) { const queries = statements.map(s => s.query); stats.push(stagingBatchBytes(statements.map(s => ({ sql: s.query, params: s.values })))); await hook(queries); return database.batch(statements); } };
}

test('private staged custody publishes exact cold pages, replays and undoes with bounded transport', async t => {
  const r = await sqliteRuntime(t), source = normalized(), plan = await planD1ImportStream(source, sqliteMapping, r.context()), bytes: number[] = [];
  let sawPrivatePayload = false;
  const database = observe(r.db(), queries => {
    if (queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_originals'))) { empty(r.native(), publicTables); sawPrivatePayload = Number(r.native().prepare('SELECT count(*) AS n FROM ik_d1_staging_chunks').get()!.n) > 0; }
  }, bytes);
  const input = { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } };
  const job = await createD1ImportStream(plan, input);
  assert.equal(sawPrivatePayload, true); assert.ok(bytes.every(n => n <= STAGING_BATCH_BYTES)); empty(r.native(), privateTables);
  assert.equal(r.native().prepare('SELECT count(*) AS n FROM ik_d1_creation_plans').get()!.n, 0);
  assert.equal((await createD1ImportStream(plan, input)).id, job.id);
  r.reopen(); let status = await readD1ImportStream(job.id, r.context());
  while (status.state !== 'completed') status = await resumeD1ImportStream(job.id, r.context());
  const rows = await sqliteTargets.list(r.db(), 'workspace');
  assert.equal(rows.length, source.records.length);
  for (const record of source.records) assert.deepEqual(rows.find(row => row.targetId === record.sourceId)?.value, record.payload);
  while (status.state !== 'undone') status = await undoD1ImportStream(job.id, r.context());
  assert.equal((await undoD1ImportStream(job.id, r.context())).state, 'undone'); assert.equal((await sqliteTargets.list(r.db(), 'workspace')).length, 0);
});

for (const boundary of ['INSERT INTO ik_d1_staging_index','INSERT INTO ik_d1_staging_pages','INSERT INTO ik_d1_staging_chunks','INSERT INTO ik_d1_staging_originals','UPDATE ik_d1_staging SET sealed_revision','INSERT INTO ik_jobs']) test(`staging failure at ${boundary} leaves no public or private data`, async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context()); let failed = false;
  const database = observe(r.db(), queries => { if (!failed && queries.some(q => q.startsWith(boundary))) { failed = true; throw new Error('injected interruption'); } });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }), /injected interruption/);
  assert.equal(failed, true); empty(r.native());
});

test('fatal private orphan is invisible, cancellable only by its owner, and recoverable after reopen', async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context()); let stopped = false;
  const database = observe(r.db(), queries => { if (queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_originals'))) stopped = true; if (stopped) throw new Error('runtime stopped'); });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }), /runtime stopped/);
  empty(r.native(), publicTables); assert.ok(Number(r.native().prepare('SELECT count(*) AS n FROM ik_d1_staging_chunks').get()!.n) > 0);
  const stage = r.native().prepare('SELECT id FROM ik_d1_staging').get()!;
  await assert.rejects(readD1ImportStream(String(stage.id), r.context()), /IMPORT_JOB_NOT_FOUND/);
  await cancelD1ImportStaging(plan.fingerprint, { ...r.context(), authorization: { ...r.context().authorization, principalId: 'another-owner' } });
  assert.equal(r.native().prepare('SELECT count(*) AS n FROM ik_d1_staging').get()!.n, 1);
  r.reopen(); const job = await createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
  assert.notEqual(job.id, stage.id); empty(r.native(), privateTables);
  await cancelD1ImportStaging(plan.fingerprint, r.context()); assert.equal((await readD1ImportStream(job.id, r.context())).id, job.id);
});

for (const mutation of ["UPDATE ik_d1_staging_chunks SET body=body||' '", "UPDATE ik_d1_staging_chunks SET body_hash='changed'", 'DELETE FROM ik_d1_staging_index', 'UPDATE ik_d1_staging_pages SET ordinal=ordinal+20', 'UPDATE ik_d1_staging SET sealed_revision=0']) test(`private mutation refuses publication: ${mutation}`, async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context()); let mutated = false;
  const database = observe(r.db(), queries => { if (!mutated && queries.some(q => q.startsWith('INSERT INTO ik_jobs'))) { r.native().exec(mutation); mutated = true; } });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(mutated, true); empty(r.native());
});

test('destination privacy erases another principal private payload and prevents later resurrection', async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context()); let erased = false;
  const database = observe(r.db(), async queries => {
    if (!erased && queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_originals'))) {
      erased = true;
      await eraseD1ImportTarget('record', '0', [], { ...r.context(), authorization: { ...r.context().authorization, principalId: 'privacy-owner' } });
      empty(r.native(), privateTables);
    }
  });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(erased, true); empty(r.native());
  r.reopen(); await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint })); empty(r.native());
});

test('whole request budget is reserved before private writes', async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context());
  const context = requestContext({ ...r.context(), reviewedFingerprint: plan.fingerprint });
  for (let n = 0; n < 940; n++) await context.storage.database.prepare('SELECT 1').first();
  await assert.rejects(createD1ImportStream(plan, context), /IMPORT_D1_REQUEST_LIMIT/); empty(r.native());
});

test('a concurrent exact retry publishes once and stale cleanup cannot delete its custody', async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context());
  let winner: string | undefined;
  const database = observe(r.db(), async queries => {
    if (!winner && queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_chunks'))) {
      winner = (await createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint })).id;
    }
  });
  const stale = await createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } });
  assert.equal(stale.id, winner); empty(r.native(), privateTables);
  assert.equal(r.native().prepare('SELECT count(*) AS n FROM ik_d1_streams').get()!.n, 1);
  assert.equal((await readD1ImportStream(stale.id, r.context())).total, normalized().records.length);
});

test('private cancellation fences stale writers and cannot reach another destination', async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context()); let cancelled = false;
  const database = observe(r.db(), async queries => {
    if (!cancelled && queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_chunks'))) {
      await cancelD1ImportStaging(plan.fingerprint, { ...r.context(), destination: 'other-workspace' });
      assert.equal(r.native().prepare('SELECT count(*) AS n FROM ik_d1_staging').get()!.n, 1);
      await cancelD1ImportStaging(plan.fingerprint, r.context()); cancelled = true; empty(r.native());
    }
  });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(cancelled, true); empty(r.native());
});

for (const boundary of ['index', 'pages', 'chunks', 'originals']) test(`authority revoked within ${boundary} transaction rolls the transaction back`, async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context());
  r.native().exec(`CREATE TRIGGER revoke_stage AFTER INSERT ON ik_d1_staging_${boundary} BEGIN UPDATE native_authority SET enabled=0; END`);
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint }), /IMPORT_ATOMIC_GUARD/);
  assert.equal(r.native().prepare('SELECT enabled FROM native_authority').get()!.enabled, 1); empty(r.native());
});

test('revoked orphan cancellation retains custody until authority is restored', async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context()); let stopped = false;
  const database = observe(r.db(), queries => { if (queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_originals'))) stopped = true; if (stopped) throw new Error('runtime stopped'); });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }));
  r.native().exec('UPDATE native_authority SET enabled=0');
  await assert.rejects(cancelD1ImportStaging(plan.fingerprint, r.context()), /IMPORT_ATOMIC_GUARD/);
  assert.ok(Number(r.native().prepare('SELECT count(*) AS n FROM ik_d1_staging_chunks').get()!.n) > 0);
  r.native().exec('UPDATE native_authority SET enabled=1');
  await cancelD1ImportStaging(plan.fingerprint, r.context()); empty(r.native());
});

test('serialized transport accounting includes escaped bindings and SQL, not only raw bytes', () => {
  const statements = [{ sql: 'SELECT ? AS "quoted\\column"', params: ['"\\\n\u0000漢'.repeat(12000)] }];
  const serialized = Buffer.byteLength(JSON.stringify(statements));
  assert.ok(stagingBatchBytes(statements) >= serialized);
  assert.ok(stagingBatchBytes(statements) > Buffer.byteLength(String(statements[0].params[0])));
});

test('current owner can cancel old mapping custody with the exact reviewed fingerprint', async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context()); let stopped = false;
  const database = observe(r.db(), queries => { if (queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_originals'))) stopped = true; if (stopped) throw new Error('runtime stopped'); });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }));
  await assert.rejects(cancelD1ImportStaging(plan.fingerprint, { ...r.context(), mappingVersion: 'v2', reviewedFingerprint: 'changed' }), /REVIEW_FINGERPRINT_MISMATCH/);
  assert.ok(Number(r.native().prepare('SELECT count(*) AS n FROM ik_d1_staging_chunks').get()!.n) > 0);
  await cancelD1ImportStaging(plan.fingerprint, { ...r.context(), mappingVersion: 'v2', reviewedFingerprint: plan.fingerprint }); empty(r.native());
});

for (const mutation of ["DELETE FROM ik_d1_staging_index", "UPDATE ik_d1_staging_index SET target_identity='changed'"]) test(`private index invalidation cannot leave undiscoverable payload: ${mutation}`, async t => {
  const r = await sqliteRuntime(t), plan = await planD1ImportStream(normalized(), sqliteMapping, r.context());
  let stopped = false;
  const database = observe(r.db(), queries => {
    if (queries.some(q => q.startsWith('INSERT INTO ik_d1_staging_originals'))) {
      assert.ok((r.native().prepare('SELECT count(*) n FROM ik_d1_staging_chunks').get()!.n as number) > 0);
      r.native().exec(mutation); stopped = true;
    }
    if (stopped) throw new Error('private runtime interrupted');
  });
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint, storage: { ...r.context().storage, database } }), /private runtime interrupted/);
  empty(r.native(), ['ik_d1_staging_chunks', 'ik_d1_staging_originals']);
  assert.equal(r.native().prepare('SELECT registered_revision FROM ik_d1_staging').get()!.registered_revision, null);
  r.reopen(); await cancelD1ImportStaging(plan.fingerprint, r.context()); empty(r.native());
});
