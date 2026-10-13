import { writeSync } from 'node:fs';
import { context, mapping } from './fixtures.ts';
import { exactSource } from './originals-fixtures.ts';
import { sqliteTargets } from '../../src/storage/sqlite.ts';
import { readImportOriginals } from '../../src/journal/originals.ts';
import { planImport } from '../../src/plan/index.ts';
import { createImportJob, applyImportBatches, undoImport, resumeImport } from '../../src/engine/index.ts';
const [path, mode, id] = process.argv.slice(2);
const stop = () => { writeSync(1, 'KILL_NOW\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000); throw new Error('Parent did not kill child'); };
const targets = { ...sqliteTargets,
  write(db, row) { sqliteTargets.write(db, row); if (mode === 'apply' && row.targetId === '1') stop(); },
  remove(db, destination, kind, key) { sqliteTargets.remove(db, destination, kind, key); if (mode === 'undo' && key === '1') stop(); }
};
const ctx = context(path, targets); ctx.leaseMs = 500;
try {
  if (mode === 'apply') {
    const plan = planImport(exactSource().source, mapping, ctx); ctx.reviewedFingerprint = plan.fingerprint;
    const job = await createImportJob(plan, ctx); writeSync(1, 'JOB ' + job.id + '\n');
    writeSync(1, 'ORIGINALS ' + JSON.stringify(readImportOriginals(job.id, ctx)) + '\n');
    await applyImportBatches(job, ctx);
  } else if (mode === 'resume') writeSync(1, JSON.stringify({ job: await resumeImport(id, ctx), originals: readImportOriginals(id, ctx) }) + '\n');
  else await undoImport(id, ctx);
} finally { ctx.storage.close(); }
