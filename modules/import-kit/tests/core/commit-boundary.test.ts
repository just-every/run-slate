import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportBatches, undoImport, rollbackImport, resumeImport, readImportJob, readImportOriginals } from '../../src/index.ts';
import { nativeSetup, nativeJob, nativeRows, nativeMapping, nativeTargets, snapshot } from './operation-native-fixtures.ts';

const operations = { apply: applyImportBatches, undo: undoImport, rollback: rollbackImport };
const states = { apply: 'completed', undo: 'undone', rollback: 'rolled_back' };
const faults = {
  provenance: { sql: "UPDATE ik_provenance SET record_json=json_set(record_json,'$.jobId','changed-in-final-write') WHERE job_id=NEW.id;", error: /PROVENANCE_/ },
  authority: { sql: 'UPDATE native_authority SET allowed=0;', error: /NOT_AUTHORIZED/ },
  fence: { sql: 'UPDATE ik_jobs SET fence=fence+1 WHERE id=NEW.id;', error: /IMPORT_LEASE_LOST/ },
};

async function prepare(t, action, phase) {
  const { ctx } = nativeSetup(t), db = ctx.storage.database;
  // A real replacement makes the reversal assertions cover full before-images.
  const original = { destination: ctx.destination, targetKind: 'article', targetId: '0', revision: 'before-import', value: { title: 'Native title', body: 'Native body' } };
  nativeTargets.write(db, original);
  const { job } = await nativeJob(ctx, { version: 'v1', map: source => {
    const mapped = nativeMapping.map(source);
    if (source.sourceId === '0') mapped.effects[0].expectedRevision = original.revision;
    return mapped;
  } });
  if (action !== 'apply') await applyImportBatches(job, ctx);
  else if (phase === 'final') { ctx.maxBatches = 1; await applyImportBatches(job, ctx); delete ctx.maxBatches; }
  ctx.batchSize = phase === 'final' ? 100 : 1;
  const before = snapshot(ctx), originals = readImportOriginals(job.id, ctx);
  const count = db.prepare('SELECT count(*) n FROM ik_batches WHERE job_id=? AND action=?').get(job.id, action).n;
  const leaseColumn = 'lease_token';
  const event = phase === 'final' ? leaseColumn : 'lease_expires';
  const condition = phase === 'final'
    ? `NEW.${leaseColumn} IS NULL AND OLD.${leaseColumn} IS NOT NULL AND NEW.state='${states[action]}'`
    : `NEW.${leaseColumn} IS NOT NULL AND NEW.fence=OLD.fence AND (SELECT count(*) FROM ik_batches WHERE job_id=NEW.id AND action='${action}')>${count}`;
  return { ctx, db, job, before, originals, original, event, condition };
}

function unchangedBatch(fixture) {
  const { ctx, db, job, before, originals } = fixture;
  const after = snapshot(ctx);
  assert.deepEqual(after.native, before.native);
  for (const table of ['ik_sources', 'ik_provenance', 'ik_batches', 'ik_originals']) assert.deepEqual(after.tables[table], before.tables[table], table);
  assert.equal(readImportJob(job.id, ctx).checkpoint, before.tables.ik_jobs[0].checkpoint);
  assert.equal(readImportJob(job.id, ctx).fence, before.tables.ik_jobs[0].fence + 1, 'trigger fence increment rolled back');
  assert.equal(db.prepare('SELECT allowed FROM native_authority').get().allowed, 1);
  assert.deepEqual(readImportOriginals(job.id, ctx), originals);
}

async function recover(fixture, action) {
  const { ctx, db, job, originals, original } = fixture;
  db.exec('DROP TRIGGER last_write_fault');
  assert.equal((await resumeImport(job.id, ctx)).state, states[action]);
  assert.equal((await resumeImport(job.id, ctx)).state, states[action]);
  if (action === 'apply') await undoImport(job.id, ctx);
  assert.deepEqual(nativeRows(ctx), [original]);
  assert.deepEqual(readImportOriginals(job.id, ctx), originals);
  assert.equal(db.prepare('SELECT count(*) n FROM ik_stages').get().n, 0);
  const lease = db.prepare('SELECT lease_token,lease_expires FROM ik_jobs WHERE id=?').get(job.id);
  assert.deepEqual({ ...lease }, { lease_token: null, lease_expires: null });
}

for (const action of Object.keys(operations)) for (const phase of ['final', 'prefix']) for (const [fault, detail] of Object.entries(faults)) {
  test(`${action} ${phase} rejects ${fault} changed by the last lease write and atomically preserves native state`, async t => {
    const fixture = await prepare(t, action, phase), { ctx, db, job, event, condition } = fixture;
    db.exec(`CREATE TRIGGER last_write_fault AFTER UPDATE OF ${event} ON ik_jobs WHEN ${condition} BEGIN ${detail.sql} END;`);
    await assert.rejects(operations[action](job.id, ctx), detail.error);
    unchangedBatch(fixture);
    await recover(fixture, action);
  });
}

for (const action of Object.keys(operations)) for (const phase of ['final', 'prefix']) {
  test(`${action} ${phase} cannot commit when a real last-write SQLite function outlasts its 200ms lease`, async t => {
    const fixture = await prepare(t, action, phase), { ctx, db, job, event, condition } = fixture;
    ctx.leaseMs = 200;
    (db as any).function('slow_final_write', () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); return 1; });
    db.exec(`CREATE TRIGGER last_write_fault AFTER UPDATE OF ${event} ON ik_jobs WHEN ${condition} BEGIN SELECT slow_final_write(); END;`);
    const start = Date.now();
    await assert.rejects(operations[action](job.id, ctx), /IMPORT_LEASE_LOST/);
    assert.ok(Date.now() - start >= 300);
    unchangedBatch(fixture);
    ctx.leaseMs = 30000;
    await recover(fixture, action);
  });
}
