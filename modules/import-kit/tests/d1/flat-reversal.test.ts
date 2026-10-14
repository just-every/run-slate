import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { meter } from './meter.ts';
import { planD1Import, createD1ImportJob, resumeD1Import, undoD1Import } from '../../src/d1/index.ts';

// Undo of a large import must not cost more per batch than undo of a small one:
// after the first verified batch, each request fences on the custody revision
// and reads only its own batch.
async function undoCosts(r: Awaited<ReturnType<typeof runtime>>, entries: number, tamper?: (id: string) => Promise<void>) {
  await r.reset();
  const m = meter(r.db());
  const context = (batchSize: number) => ({ ...r.context(), batchSize, maxBatches: 1, storage: { database: m.database, targets } });
  const plan = await m.request('plan', () => planD1Import(source(entries), mapping, context(50)));
  let job = await m.request('create', () => createD1ImportJob(plan, { ...context(50), reviewedFingerprint: plan.fingerprint }));
  while (job.state !== 'completed') job = await m.request('apply', () => resumeD1Import(job.id, context(50)));
  const costs: string[] = [];
  while (job.state !== 'undone') {
    if (tamper && costs.length === 3) await tamper(job.id);
    job = await m.request('undo', () => undoD1Import(job.id, context(4)));
    const { count, rows } = m.snapshots.at(-1);
    costs.push(`${count} statements, ${rows} rows`);
  }
  assert.equal((await targets.list(r.db(), 'workspace')).length, 0);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE job_id=? AND reversed=0').bind(job.id).first())?.n, 0);
  return costs;
}

test('undo batches cost the same statements and rows read in a large import as in a small one, and a custody change still forces complete verification', async t => {
  const r = await runtime(t), small = await undoCosts(r, 12), large = await undoCosts(r, 120);
  // Requests after the first verified batch, excluding the final partial one.
  assert.deepEqual(new Set(large.slice(1, -1)), new Set(small.slice(1, -1)));
  assert.notEqual(large[0], large[1], 'the first request verifies the complete inventory');

  let rejected = false;
  await undoCosts(r, 40, async id => {
    const row = await r.db().prepare('SELECT effects_hash FROM ik_d1_entries WHERE job_id=? AND ordinal=0').bind(id).first();
    await r.db().prepare("UPDATE ik_d1_entries SET effects_hash='forged' WHERE job_id=? AND ordinal=0").bind(id).run();
    await assert.rejects(undoD1Import(id, { ...r.context(), batchSize: 4, maxBatches: 1 }), /IMPORT_INVENTORY_MISMATCH/);
    rejected = true;
    await r.db().prepare('UPDATE ik_d1_entries SET effects_hash=? WHERE job_id=? AND ordinal=0').bind(row.effects_hash, id).run();
  });
  assert.ok(rejected);
});
