import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportBatches, resumeImport, undoImport, readImportJob } from '../../src/index.ts';
import { nativeSetup, nativeJob, nativeRows, snapshot } from './operation-native-fixtures.ts';

const faults = {
  authority: { sql: 'UPDATE native_authority SET allowed=0;', error: /NOT_AUTHORIZED/ },
  fence: { sql: 'UPDATE ik_jobs SET fence=fence+1 WHERE id=NEW.id;', error: /IMPORT_LEASE_LOST/ },
  custody: { sql: "UPDATE ik_originals SET bytes=X'00' WHERE job_id=NEW.id;", error: /ORIGINAL/ },
};

for (const phase of ['acquire', 'stage']) for (const [fault, detail] of Object.entries(faults)) test(`${phase} claim validates ${fault} after all internal SQL writes`, async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx), db = ctx.storage.database;
  ctx.leaseMs = 200;
  const before = snapshot(ctx);
  const condition = phase === 'acquire' ? 'NEW.fence>OLD.fence AND OLD.lease_token IS NULL' : 'NEW.fence=OLD.fence AND OLD.lease_token IS NOT NULL';
  db.exec(`CREATE TRIGGER internal_fault AFTER UPDATE OF lease_expires ON ik_jobs WHEN ${condition} BEGIN ${detail.sql} END;`);
  await assert.rejects(applyImportBatches(job, ctx), detail.error);
  const after = snapshot(ctx);
  for (const table of ['ik_sources', 'ik_provenance', 'ik_batches', 'ik_stages', 'ik_originals']) assert.deepEqual(after.tables[table], before.tables[table], table);
  assert.deepEqual(after.native, before.native);
  assert.equal(db.prepare('SELECT allowed FROM native_authority').get().allowed, 1);
  assert.equal(readImportJob(job.id, ctx).fence, phase === 'acquire' ? 0 : 1);
  db.exec('DROP TRIGGER internal_fault');
  const lease = db.prepare('SELECT lease_token,lease_expires FROM ik_jobs WHERE id=?').get(job.id);
  if (lease.lease_token) await new Promise(resolve => setTimeout(resolve, Math.max(0, lease.lease_expires - Date.now() + 10)));
  ctx.leaseMs = 30000;
  assert.equal((await resumeImport(job.id, ctx)).state, 'completed');
});

test('successful bounded release rejects a cleanup trigger without damaging the already committed prefix', async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx), db = ctx.storage.database;
  ctx.maxBatches = 1; ctx.leaseMs = 200;
  db.exec("CREATE TRIGGER cleanup_fault AFTER UPDATE OF lease_token ON ik_jobs WHEN NEW.lease_token IS NULL AND NEW.state='applying' BEGIN UPDATE ik_jobs SET fence=fence+1 WHERE id=NEW.id; END;");
  await assert.rejects(applyImportBatches(job, ctx), /IMPORT_LEASE_LOST/);
  const row = db.prepare('SELECT * FROM ik_jobs WHERE id=?').get(job.id);
  assert.equal(row.fence, 1); assert.equal(row.checkpoint, 1); assert.ok(row.lease_token);
  assert.equal(nativeRows(ctx).length, 3); assert.equal(db.prepare('SELECT count(*) n FROM ik_batches').get().n, 1);
  db.exec('DROP TRIGGER cleanup_fault'); delete ctx.maxBatches;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, row.lease_expires - Date.now() + 10)));
  ctx.leaseMs = 30000;
  assert.equal((await resumeImport(job.id, ctx)).state, 'completed');
  assert.equal(readImportJob(job.id, ctx).fence, 2);
});

test('failure cleanup cannot commit trigger corruption, and keeps the original native error visible', async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx), db = ctx.storage.database;
  ctx.maxBatches = 1; await applyImportBatches(job, ctx); delete ctx.maxBatches;
  const before = snapshot(ctx); ctx.leaseMs = 200;
  db.exec(`
    CREATE TRIGGER native_failure BEFORE INSERT ON native_articles WHEN NEW.id='1' BEGIN SELECT RAISE(ABORT,'native publication refused'); END;
    CREATE TRIGGER cleanup_fault AFTER UPDATE OF lease_token ON ik_jobs WHEN NEW.error IS NOT NULL AND NEW.lease_token IS NULL BEGIN
      UPDATE ik_provenance SET record_json=json_set(record_json,'$.jobId','cleanup-corruption') WHERE job_id=NEW.id;
    END;
  `);
  await assert.rejects(resumeImport(job.id, ctx), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /native publication refused/);
    assert.match(error.message, /IMPORT_CLEANUP_CHANGED_DATA/);
    return true;
  });
  const after = snapshot(ctx);
  for (const table of ['ik_sources', 'ik_provenance', 'ik_batches', 'ik_originals']) assert.deepEqual(after.tables[table], before.tables[table], table);
  assert.deepEqual(after.native, before.native);
  const row = db.prepare('SELECT * FROM ik_jobs WHERE id=?').get(job.id);
  assert.ok(row.lease_token); assert.equal(row.state, 'applying'); assert.equal(row.error, null);
  db.exec('DROP TRIGGER native_failure; DROP TRIGGER cleanup_fault');
  await new Promise(resolve => setTimeout(resolve, Math.max(0, row.lease_expires - Date.now() + 10)));
  ctx.leaseMs = 30000;
  assert.equal((await resumeImport(job.id, ctx)).state, 'completed');
  await undoImport(job.id, ctx); assert.equal(nativeRows(ctx).length, 0);
});

test('benign real SQLite audit triggers still run on acquisition, renewal and final release', async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx), db = ctx.storage.database;
  db.exec(`CREATE TABLE native_import_audit(state TEXT,lease_token TEXT);
    CREATE TRIGGER audit_lease AFTER UPDATE OF lease_expires ON ik_jobs BEGIN INSERT INTO native_import_audit VALUES(NEW.state,NEW.lease_token); END;`);
  await applyImportBatches(job, ctx); await undoImport(job.id, ctx);
  const audit = db.prepare('SELECT * FROM native_import_audit').all();
  assert.ok(audit.some(row => row.state === 'applying' && row.lease_token));
  assert.ok(audit.some(row => row.state === 'completed' && row.lease_token === null));
  assert.ok(audit.some(row => row.state === 'undone' && row.lease_token === null));
  assert.equal(nativeRows(ctx).length, 0);
});
