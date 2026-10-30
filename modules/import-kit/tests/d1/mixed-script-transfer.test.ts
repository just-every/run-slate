import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from '../../../container/adapters/d1-sqlite.mjs';
import { readFile } from 'node:fs/promises';
import { sqliteRows } from './sqlite-text.ts';
import { sqliteTargets, sqliteMapping, sqliteSource } from './sqlite-runtime.ts';
import { initializeD1ImportStorage, planD1Import, createD1ImportJob, resumeD1Import, readD1ImportOriginals, readD1ImportJob } from '../../src/d1/index.ts';
import { createPortability, readArchive } from '../../../portability/index.mjs';

// Model only the hosted network edge. Every statement, JSON decode, constraint
// and transaction below executes on real SQLite. This independent measurement
// reproduces workerd's whole-RPC string widening (local D1 omits that ceiling).
function binding(native: DatabaseSync) {
  let maximum = 0;
  const measure = (value: unknown) => {
    const text = JSON.stringify(value);
    const size = /[^\u0000-\u00ff]/.test(text) ? 2 * text.length : text.length;
    maximum = Math.max(maximum, size);
    assert.ok(size < 32 * 1024 * 1024, `hosted D1 RPC exceeds 32 MiB: ${size} bytes (JSON UTF-8: ${Buffer.byteLength(text)})`);
  };
  const prepare = (sql: string, params: any[] = []): any => ({
    sql, params, bind: (...values: any[]) => prepare(sql, values),
    async all() { measure([{ sql, params }]); const results = sqliteRows(native, sql, params); measure(results); return { results }; },
    async first() { return (await this.all()).results[0] ?? null; },
    async run() { return this.all(); },
  });
  return { prepare, async batch(statements: any[]) {
    measure(statements.map(({ sql, params }) => ({ sql, params })));
    native.exec('BEGIN');
    try {
      const results = statements.map(({ sql, params }) => ({ results: sqliteRows(native, sql, params) }));
      measure(results); native.exec('COMMIT'); return results;
    } catch (error) { native.exec('ROLLBACK'); throw error; }
  }, get maximum() { return maximum; } };
}

test('mixed-script import custody, publication and archive restore fit hosted D1 calls without changing bytes', async t => {
  const native = new DatabaseSync(':memory:'); t.after(() => native.close());
  native.exec('PRAGMA foreign_keys=ON');
  const db = binding(native);
  await initializeD1ImportStorage(db);
  native.exec("CREATE TABLE native_records(destination TEXT,kind TEXT,id TEXT,revision TEXT,value_json TEXT,PRIMARY KEY(destination,kind,id)); CREATE TABLE native_authority(id TEXT PRIMARY KEY,enabled INTEGER); INSERT INTO native_authority VALUES('owner',1)");
  const label = 'a'.repeat(330_000) + '—日本語😀é';
  const source = sqliteSource(12, label);
  const context = { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', batchSize: 1, maxBatches: 1,
    storage: { database: db, targets: sqliteTargets },
    authorization: { principalId: 'owner', predicate: () => ({ sql: "EXISTS(SELECT 1 FROM native_authority WHERE id='owner' AND enabled=1)" }) } };
  const plan = await planD1Import(source, sqliteMapping, context);
  let job = await createD1ImportJob(plan, { ...context, reviewedFingerprint: plan.fingerprint });
  t.diagnostic(`Largest creation RPC: ${db.maximum} bytes`);
  assert.equal((await readD1ImportJob(job.id, context)).state, 'queued');
  while (job.state !== 'completed') job = await resumeD1Import(job.id, context);
  const originals = await readD1ImportOriginals(job.id, context);
  assert.ok(originals[0].original.base64 === source.artifacts[0].original.base64, 'retained original bytes match');
  assert.equal(originals[0].sha256, source.artifacts[0].sha256);
  const before = native.prepare('SELECT * FROM native_records ORDER BY id').all();
  assert.equal(before.length, 12);
  for (const row of before) assert.equal(JSON.parse(row.value_json as string).label, label);

  // A full default-size archive part with only sparse wide characters used to
  // widen every segment in the single atomic export/upload batch.
  for (let copy = 1; copy <= 4; copy++) native.prepare("INSERT INTO native_records SELECT destination,kind,id||?,revision,value_json FROM native_records WHERE id NOT LIKE '%copy%'").run('copy' + copy);
  const expected = native.prepare('SELECT * FROM native_records ORDER BY id').all();
  native.exec(await readFile(new URL('../../../portability/schema/portability.sql', import.meta.url), 'utf8'));
  const excluded = native.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'native_records'").all().map(row => row.name as string);
  const service = await createPortability({ db, policy: { product: 'mixed-script', excludeTables: excluded } });
  const id = await service.exports.create();
  while ((await service.exports.advance(id, { maxParts: 10 })).phase === 'building') {}
  const records: any[] = [];
  for await (const record of readArchive(await service.exports.download(id))) records.push(record);
  native.exec('DELETE FROM native_records');
  const restore = await service.imports.create(records[0]);
  for (const part of records.filter(row => row.kind === 'part')) await service.imports.uploadPart(restore, part.index, part);
  const closing = records.at(-1);
  assert.equal((await service.imports.finalize(restore, { archiveHash: closing.archiveHash, contentHash: closing.contentHash })).phase, 'complete');
  assert.deepEqual(native.prepare('SELECT * FROM native_records ORDER BY id').all(), expected);
  t.diagnostic(`Largest independently measured hosted D1 call: ${db.maximum} bytes`);
});
