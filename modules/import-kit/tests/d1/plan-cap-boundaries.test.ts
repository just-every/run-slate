import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './fixtures.ts';
import { planD1Import, createD1ImportJob, preflightD1ImportJob, canonicalJson, PLAN_BYTES_LIMIT, PlanTooLargeError } from '../../src/d1/index.ts';

async function tableCounts(db: any) {
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik\\_%' ESCAPE '\\' ORDER BY name").all();
  return Object.fromEntries(await Promise.all(results.map(async ({ name }: any) => [name, (await db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).first()).n])));
}
function duringLookup(db: any, change: () => void) {
  const wrap = (s: any): any => ({ bind(...p: any[]) { return wrap(s.bind(...p)); }, async first() { const r = await s.first(); change(); return r; }, all() { return s.all(); } });
  return { prepare(q: string) { const s = db.prepare(q); return q.startsWith('SELECT * FROM ik_jobs WHERE destination=') ? wrap(s) : s; }, batch(s: any[]) { return db.batch(s); } };
}

for (const replay of [false, true]) for (const growth of ['small', 'over-cap']) test(`real D1: ${replay ? 'replay' : 'fresh'} lookup rejects ${growth} caller mutation`, async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(source(1), mapping, ctx);
  const reviewed = { ...ctx, reviewedFingerprint: plan.fingerprint, operationKey: 'reviewed' };
  if (replay) await createD1ImportJob(plan, reviewed);
  const before = await tableCounts(r.db());
  const { fingerprint: _, ...content } = plan;
  const baseBytes = Buffer.byteLength(canonicalJson(content));
  const note = { severity: 'warning' as const, code: 'NOTE', message: '' };
  const fixed = baseBytes + Number(plan.diagnostics.length > 0) + Buffer.byteLength(canonicalJson(note));
  const mutate = () => plan.diagnostics.push({ ...note, message: growth === 'over-cap' ? 'x'.repeat(PLAN_BYTES_LIMIT + 1 - fixed) : 'changed' });
  const database = duringLookup(r.db(), mutate);
  await assert.rejects(createD1ImportJob(plan, { ...reviewed, storage: { ...ctx.storage, database } }),
    growth === 'over-cap' ? (e: any) => e instanceof PlanTooLargeError && e.bytes === PLAN_BYTES_LIMIT + 1 && e.subject === 'plan' : /REVIEW_FINGERPRINT_MISMATCH/);
  assert.deepEqual(await tableCounts(r.db()), before);
  if (!replay) assert.ok(Object.values(before).every(n => n === 0));
  if (growth === 'over-cap') assert.throws(() => preflightD1ImportJob(plan, reviewed), (e: any) => e instanceof PlanTooLargeError && e.bytes === PLAN_BYTES_LIMIT + 1);
});

test('real D1: admission does not authorize revoked creation or replay; valid replay preserves reviewed identity', async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(source(1), mapping, ctx);
  const reviewed = { ...ctx, reviewedFingerprint: plan.fingerprint };
  preflightD1ImportJob(plan, reviewed);
  await r.db().prepare('UPDATE sessions SET enabled=0').run();
  await assert.rejects(createD1ImportJob(plan, reviewed), /IMPORT_ATOMIC_GUARD/);
  assert.ok(Object.values(await tableCounts(r.db())).every(n => n === 0));
  await r.db().prepare('UPDATE sessions SET enabled=1').run();
  const job = await createD1ImportJob(plan, reviewed);
  assert.equal((await createD1ImportJob(plan, reviewed)).id, job.id);
  const before = await tableCounts(r.db());
  await r.db().prepare('UPDATE sessions SET enabled=0').run();
  await assert.rejects(createD1ImportJob(plan, reviewed), /IMPORT_ATOMIC_GUARD/);
  assert.deepEqual(await tableCounts(r.db()), before);
});

test('real D1: a mapper expansion from a tiny input is refused before encoding and leaves every kit table empty', async t => {
  const r = await runtime(t), ctx = r.context();
  const small = await planD1Import(source(1), { version: 'v1', map: () => ({ effects: [{ targetKind: 'contact', targetId: '0', value: Array(300).fill('') }] }) }, ctx);
  const { fingerprint: _, ...content } = small;
  const expected = Buffer.byteLength(canonicalJson(content)) + 300_000_000;
  const stringify = JSON.stringify;
  t.mock.method(JSON, 'stringify', (value: unknown, ...args: any[]) => {
    if (typeof value === 'string' && value.length >= 1_000_000) throw new Error('ENCODED_BEFORE_ADMISSION');
    return stringify(value, ...args);
  });
  const value = Array(300).fill('x'.repeat(1_000_000));
  await assert.rejects(planD1Import(source(1), { version: 'v1', map: () => ({ effects: [{ targetKind: 'contact', targetId: '0', value }] }) }, ctx),
    (e: any) => e instanceof PlanTooLargeError && e.bytes === expected && e.subject === 'plan');
  assert.ok(Object.values(await tableCounts(r.db())).every(n => n === 0));
});

for (const phase of ['stored', 'originals', 'inventory']) test(`real D1: replay detects a plan changed while awaiting ${phase}`, async t => {
  const r = await runtime(t), ctx = r.context(), plan = await planD1Import(source(1), mapping, ctx), db = r.db();
  const reviewed = { ...ctx, reviewedFingerprint: plan.fingerprint };
  await createD1ImportJob(plan, reviewed);
  const before = await tableCounts(db);
  let changed = false;
  const wrap = (statement: any): any => ({
    bind(...p: any[]) { return wrap(statement.bind(...p)); },
    async first() { const result = await statement.first(); change(); return result; },
    async all() { const result = await statement.all(); change(); return result; },
  });
  const change = () => { changed = true; plan.source.artifacts[0].name = 'changed-after-review'; };
  const prefix = phase === 'stored' ? 'SELECT * FROM ik_jobs WHERE id=' : phase === 'originals' ? 'SELECT *,json_quote(name) AS name_json FROM ik_originals WHERE job_id=' : 'SELECT * FROM ik_d1_history WHERE job_id=';
  const database = { prepare(query: string) {
    const statement = db.prepare(query);
    return query.startsWith(prefix) ? wrap(statement) : statement;
  }, batch(statements: any[]) { return db.batch(statements); } };
  await assert.rejects(createD1ImportJob(plan, { ...reviewed, storage: { ...ctx.storage, database } }), /REVIEW_FINGERPRINT_MISMATCH/);
  assert.equal(changed, true);
  assert.deepEqual(await tableCounts(db), before);
});
