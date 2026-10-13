import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteSource, sqliteMapping } from './sqlite-runtime.ts';
import { observeReads, sqliteSnapshot, totalChanges } from './read-only-tools.ts';
import { originalStorage } from '../../src/d1/original-storage.ts';
import { planD1Import, createD1ImportJob, readD1ImportOriginals, readD1ImportJob, sha256 } from '../../src/d1/index.ts';

async function custody(t: any, large = true) {
  const r = await sqliteRuntime(t), bundle = sqliteSource(0);
  bundle.artifacts = ['empty', '🌱\u0000"\\漢', 'unavailable'].map((name, i) => {
    const bytes = i === 0 ? Buffer.alloc(0) : Buffer.from('🌱 Unicode original\n'.repeat(large ? 9000 : 1000));
    return { name, size: bytes.length, sha256: sha256(bytes), original: i === 2 ? { status: 'unavailable' as const, reason: 'not-supplied' as const } : { status: 'available' as const, base64: bytes.toString('base64') } };
  });
  const plan = await planD1Import(bundle, sqliteMapping, r.context());
  const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
  return { ...r, bundle, plan, job };
}
for (const version of [1, 2, 3]) test(`query-only custody version ${version} retains empty, unavailable and Unicode originals`, async t => {
  const r = await custody(t, version !== 1), native = r.native();
  if (version !== 3) {
    const encoded = originalStorage(r.plan, r.job.id, version);
    native.prepare('UPDATE ik_original_sets SET version=?').run(version);
    native.exec('DELETE FROM ik_d1_original_chunks');
    for (const row of encoded.rows) native.prepare('UPDATE ik_originals SET bytes=? WHERE job_id=? AND kind=? AND original_key=?').run(row.bytes === null ? null : Buffer.from(row.bytes, 'hex'), r.job.id, row.kind, row.original_key);
    for (const row of encoded.chunks) native.prepare('INSERT INTO ik_d1_original_chunks VALUES(?,?,?,?,?)').run(r.job.id, row.kind, row.original_key, row.ordinal, Buffer.from(row.bytes, 'hex'));
  }
  const before = sqliteSnapshot(native), count = totalChanges(native);
  native.exec('PRAGMA query_only=ON');
  const originals = await readD1ImportOriginals(r.job.id, r.context());
  assert.deepEqual(originals.map(o => [o.name, o.sha256, o.size, o.original]), r.bundle.artifacts.map(a => [a.name, a.sha256, a.size, a.original!.status === 'available' ? { status: 'retained', base64: a.original!.base64 } : a.original]));
  assert.equal(totalChanges(native), count); assert.deepEqual(sqliteSnapshot(native), before);
});

for (const table of ['ik_d1_plan_chunks', 'ik_d1_original_chunks']) for (const position of ['first', 'last']) test(`read rejects late ${position} ${table} byte edit without writes`, async t => {
  const r = await custody(t), native = r.native();
  const column = table === 'ik_d1_plan_chunks' ? 'body' : 'bytes';
  const row = native.prepare(`SELECT rowid,${column} AS content FROM ${table} ORDER BY ordinal ${position === 'first' ? 'ASC' : 'DESC'} LIMIT 1`).get()!;
  assert.ok(native.prepare(`SELECT MAX(ordinal) AS n FROM ${table}`).get()!.n as number > 0);
  let batches = 0, count = -1, before: any;
  const observed = observeReads(r.db(), () => {
    if (++batches !== 2) return;
    native.prepare(`UPDATE ${table} SET ${column}=? WHERE rowid=?`).run((row.content as string).slice(0, -1) + ((row.content as string).endsWith('x') ? 'y' : 'x'), row.rowid);
    count = totalChanges(native); before = sqliteSnapshot(native); native.exec('PRAGMA query_only=ON');
  });
  const ctx = { ...r.context(), storage: { ...r.context().storage, database: observed.database } };
  await assert.rejects(table === 'ik_d1_plan_chunks' ? readD1ImportJob(r.job.id, ctx) : readD1ImportOriginals(r.job.id, ctx), /IMPORT_ATOMIC_GUARD/);
  assert.equal(batches, 2); assert.equal(totalChanges(native), count); assert.deepEqual(sqliteSnapshot(native), before); observed.assertSelectOnly();
});

for (const version of [1, 2]) test(`legacy version ${version} late inline original byte edit is rejected without read writes`, async t => {
  const r = await custody(t, false), native = r.native(), encoded = originalStorage(r.plan, r.job.id, version);
  native.prepare('UPDATE ik_original_sets SET version=?').run(version); native.exec('DELETE FROM ik_d1_original_chunks');
  for (const row of encoded.rows) native.prepare('UPDATE ik_originals SET bytes=? WHERE job_id=? AND kind=? AND original_key=?').run(row.bytes === null ? null : Buffer.from(row.bytes, 'hex'), r.job.id, row.kind, row.original_key);
  let batches = 0, count = -1, before: any;
  const observed = observeReads(r.db(), () => {
    if (++batches !== 2) return;
    native.exec("UPDATE ik_originals SET bytes=X'00' WHERE bytes IS NOT NULL AND size>0");
    count = totalChanges(native); before = sqliteSnapshot(native); native.exec('PRAGMA query_only=ON');
  });
  const ctx = { ...r.context(), storage: { ...r.context().storage, database: observed.database } };
  await assert.rejects(readD1ImportOriginals(r.job.id, ctx), /IMPORT_ATOMIC_GUARD/);
  assert.equal(batches, 2); assert.equal(totalChanges(native), count); assert.deepEqual(sqliteSnapshot(native), before); observed.assertSelectOnly();
});
