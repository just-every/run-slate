import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { captureD1Baseline } from '../../../tests/support/d1-baseline.mjs';

test('shared D1 reset removes prior-case state and restores seeded schema and protections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-baseline-'));
  let mf: Miniflare | undefined;
  try {
    mf = new Miniflare({ ...convertV4MiniflareOptions({ modules: true, script: 'export default { fetch(){return new Response("ok")} }', compatibilityDate: '2026-09-01', d1Databases: { DB: 'baseline' } }), resourcePersistencePath: directory });
    const db = await mf.getD1Database('DB');
    await db.batch([
      'CREATE TABLE parent(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)',
      'CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE RESTRICT)',
      "INSERT INTO parent(id,value) VALUES(7,'baseline')", 'INSERT INTO child VALUES(1,7)',
      "CREATE TRIGGER preserve_seed BEFORE DELETE ON parent BEGIN SELECT RAISE(ABORT,'seed_protected'); END",
      'CREATE INDEX seed_value ON parent(value)',
    ].map(sql => db.prepare(sql)));
    const restore = await captureD1Baseline(db);

    // A case changes rows, advances a sequence, alters a baseline table and adds
    // protected schema. The next case must use the original state on this binding.
    await db.batch([
      "UPDATE parent SET value='prior-case'", "INSERT INTO parent(value) VALUES('extra')",
      'INSERT INTO child VALUES(2,8)', 'DROP INDEX seed_value',
      'ALTER TABLE child ADD COLUMN prior_case TEXT',
      'CREATE TABLE added(id INTEGER PRIMARY KEY)', 'INSERT INTO added VALUES(1)',
      "CREATE TRIGGER protect_added BEFORE DELETE ON added BEGIN SELECT RAISE(ABORT,'added_protected'); END",
    ].map(sql => db.prepare(sql)));
    assert.equal((await db.prepare("SELECT seq FROM sqlite_sequence WHERE name='parent'").first())?.seq, 8);

    await restore();
    assert.deepEqual((await db.prepare('SELECT * FROM parent').all()).results, [{ id: 7, value: 'baseline' }]);
    assert.deepEqual((await db.prepare('SELECT * FROM child').all()).results, [{ id: 1, parent_id: 7 }]);
    assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name='added'").first(), null);
    assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='seed_value'").first());
    assert.equal((await db.prepare("INSERT INTO parent(value) VALUES('next') RETURNING id").first())?.id, 8);
    await assert.rejects(db.prepare('DELETE FROM parent WHERE id=8').run(), /seed_protected/);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally {
    try { await mf?.dispose(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});
