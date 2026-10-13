import { effectCount } from './scale-size.ts';
import { runtime } from './fixtures.ts';
import { meter } from './meter.ts';
import { nativeSetTargets } from './preserved-native-set.ts';
import { scaleSource, scaleMapping, seedReversal } from './preserved-scale-fixture.ts';
import { canonicalJson, sha256, planD1Import, createD1ImportJob } from '../../src/d1/index.ts';
import { valueBytes } from '../../src/d1/budget.ts';

/** Measures the executed D1 calls through the established meter. Additionally
 * record the aggregate bytes of each binding list, including prepared guards. */
export function scaleMeter(db: any) {
  let maxBoundBytes = 0;
  const inspect = (statement: any): any => ({ ...statement, bind(...params: any[]) {
    maxBoundBytes = Math.max(maxBoundBytes, params.reduce((n, p) => n + valueBytes(p), 0));
    return inspect(statement.bind(...params));
  } });
  const measured = meter(db);
  return { ...measured, database: { ...measured.database, prepare(query: string) { return inspect(measured.database.prepare(query)); } }, maxBoundBytes: () => maxBoundBytes };
}

export async function providerScale(t: any, reversed = effectCount - 1) {
  const r = await runtime(t);
  await r.db().prepare('CREATE TABLE native_records(destination TEXT,kind TEXT,id TEXT,revision TEXT,value_json TEXT,PRIMARY KEY(destination,kind,id))').run();
  let m = scaleMeter(r.db()); const meters = [m];
  const context = () => ({ ...r.context(), batchSize: 1, maxBatches: 1, reversalPolicy: 'preserve-conflicts' as const, storage: { database: m.database, targets: nativeSetTargets } });
  const source = scaleSource(effectCount), plan = await m.request('plan', () => planD1Import(source, scaleMapping, context()));
  const job = await m.request('create', () => createD1ImportJob(plan, { ...context(), reviewedFingerprint: plan.fingerprint }));
  const seeded = await seedReversal(plan, job, { ...context(), storage: { database: r.db(), targets: nativeSetTargets } }, reversed);
  return { ...r, source, plan, job, ...seeded, context, meter: () => m, meters,
    async reopen() { await r.reopen(); m = scaleMeter(r.db()); meters.push(m); },
    async counts() { const result: Record<string, number> = {}; for (const table of ['native_records','ik_provenance','ik_sources','ik_d1_reversal_reports','ik_d1_assertions','ik_d1_creation_plans']) result[table] = Number((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())!.n); return result; },
    async custody() {
      const result: Record<string, string> = {};
      for (const table of ['ik_d1_plan_chunks','ik_originals','ik_original_sets','ik_d1_original_chunks']) result[table] = sha256(canonicalJson((await r.db().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
      return result;
    },
    summary() { const requests = meters.flatMap(m => m.snapshots); return { requests, maxBoundBytes: Math.max(...meters.map(m => m.maxBoundBytes())) }; },
  };
}
