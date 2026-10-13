import test from 'node:test';
import { effectCount } from './scale-size.ts';
import assert from 'node:assert/strict';
import { providerScale, scaleMeter } from './preserved-provider-scale-fixture.ts';
import { readD1ImportUndoReport, readD1ImportOriginals, resumeD1Import, undoD1Import } from '../../src/d1/index.ts';

test('real D1: all durable report effects resume, reopen and reject late final-chunk corruption', async t => {
  const r = await providerScale(t), custody = await r.custody();
  assert.equal((await r.meter().request('resume-last-effect', () => resumeD1Import(r.job.id, r.context()))).state, 'undone');
  assert.deepEqual(await r.counts(), { native_records: 0, ik_provenance: effectCount, ik_sources: 0, ik_d1_reversal_reports: effectCount, ik_d1_assertions: 0, ik_d1_creation_plans: 0 });
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance WHERE reversed=1').first())!.n, effectCount);
  await r.reopen();
  const first = await r.meter().request('report-first-page', () => readD1ImportUndoReport(r.job.id, r.context(), { limit: 2 }));
  const last = await r.meter().request('report-last-page', () => readD1ImportUndoReport(r.job.id, r.context(), { offset: effectCount - 2, limit: 2 }));
  assert.equal(first.total, effectCount); assert.equal(first.cursor, effectCount); assert.equal(first.nextOffset, 2);
  assert.deepEqual(first.dispositions, r.dispositions.slice(0, 2));
  assert.equal(last.nextOffset, null); assert.equal(last.dispositions.length, 2); assert.equal(last.dispositions[1].disposition, 'reversed');
  const db = r.db(), before = (await db.prepare('SELECT * FROM ik_jobs').all()).results; let injected = false;
  // Interpose outside the real port so every SQL byte still executes on D1.
  const metered = scaleMeter(db), guarded = { ...metered.database, async batch(statements: any[]) {
    if (!injected && statements.some(s => s.query.includes('ik_d1_reversal_reports'))) {
      await db.prepare("UPDATE ik_d1_reversal_reports SET record_json=replace(record_json,'unchanged','unchangex') WHERE position=?").bind(effectCount - 2).run(); injected = true;
    }
    return metered.database.batch(statements);
  } };
  await assert.rejects(metered.request('late-last-chunk-report', () => readD1ImportUndoReport(r.job.id, { ...r.context(), storage: { ...r.context().storage, database: guarded } })), /IMPORT_ATOMIC_GUARD/);
  assert.equal(injected, true); assert.deepEqual((await db.prepare('SELECT * FROM ik_jobs').all()).results, before);
  assert.equal((await r.counts()).ik_d1_assertions, 0);
  await db.prepare("UPDATE ik_d1_reversal_reports SET record_json=replace(record_json,'unchangex','unchanged') WHERE position=?").bind(effectCount - 2).run();
  assert.equal((await r.meter().request('terminal-repeat', () => undoD1Import(r.job.id, r.context()))).state, 'undone');
  const originals = await r.meter().request('retained-originals', () => readD1ImportOriginals(r.job.id, r.context()));
  assert.deepEqual(originals.map(o => o.original), r.source.artifacts.map(a => ({ ...a.original, status: 'retained' })));
  assert.deepEqual(await r.custody(), custody);
  console.log(JSON.stringify({ reportProviderScale: { effects: effectCount, native: await r.counts(), ...r.summary(), late: metered.snapshots, lateMaxBoundBytes: metered.maxBoundBytes() } }));
});
