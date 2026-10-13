import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { nativeContext, nativeTargets, nativeJob } from './operation-native-fixtures.ts';
import { applyImportBatches, undoImport, resumeImport } from '../../src/index.ts';
const [path, mode, id, now, delayed] = process.argv.slice(2);
assert.ok(Number.isSafeInteger(Number(now)));
mock.timers.enable({ apis: ['Date'], now: Number(now) });
function stop() { writeSync(1, 'KILL_NOW\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000); throw new Error('parent did not kill child'); }
const targets = { ...nativeTargets,
  write(db, row) { nativeTargets.write(db, row); if (mode === 'apply' && row.targetKind === 'article' && row.targetId === '1') stop(); },
  remove(db, destination, kind, id) { nativeTargets.remove(db, destination, kind, id); if (mode === 'undo' && kind === 'link' && id === '1') stop(); }
};
const ctx = nativeContext(path, targets);
// The original 500ms lease is retained; parent/child advance Date explicitly.
if (mode !== 'resume') ctx.leaseMs = 500;
if (delayed === 'true') {
  const authorize = ctx.authorization.assertAuthorized; let paused = false;
  ctx.authorization.assertAuthorized = (action, destination, db) => {
    authorize(action, destination, db);
    if (!paused && db.prepare('SELECT 1 FROM ik_jobs WHERE lease_token IS NOT NULL').get()) {
      paused = true; const before = Date.now();
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
      assert.equal(Date.now(), before);
    }
  };
}
try {
  if (mode === 'apply') { const { job } = await nativeJob(ctx); writeSync(1, 'JOB ' + job.id + '\n'); await applyImportBatches(job, ctx); }
  else if (mode === 'undo') await undoImport(id, ctx);
  else writeSync(1, JSON.stringify(await resumeImport(id, ctx)) + '\n');
} finally { ctx.storage.close(); }
