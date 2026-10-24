// Opt-in synthetic import journey; not part of the push suite.
// node --cpu-prof --cpu-prof-dir=evidence modules/import-kit/tests/d1/import-cost.journey.ts
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { sqliteRuntime, sqliteSource, sqliteTargets, sqliteMapping } from './sqlite-runtime.ts';
import { planD1ImportStream, createD1ImportStream, resumeD1ImportStream, undoD1ImportStream } from '../../src/d1/index.ts';

const cleanup: (() => void | Promise<void>)[] = [];
const runtime = await sqliteRuntime({ after(fn: () => void) { cleanup.push(fn); } });
const db = runtime.db(), native = new WeakMap<object, any>();
let statements = 0, batches = 0, requests = 0, requestStatements = 0, providerMs = 0;
const wrap = (statement: any): any => {
  const result = { bind: (...params: any[]) => wrap(statement.bind(...params)) } as any;
  for (const method of ['first', 'all']) result[method] = async (...args: any[]) => {
    statements++; requestStatements++;
    const start = performance.now();
    try { return await statement[method](...args); } finally { providerMs += performance.now() - start; }
  };
  native.set(result, statement); return result;
};
const database = {
  prepare: (query: string) => wrap(db.prepare(query)),
  async batch(members: any[]) {
    batches++; statements += members.length; requestStatements += members.length;
    const start = performance.now();
    try { return await db.batch(members.map(member => native.get(member))); }
    finally { providerMs += performance.now() - start; }
  },
};
async function request<T>(fn: () => Promise<T>): Promise<T> {
  requests++; requestStatements = 0;
  const result = await fn(); assert.ok(requestStatements <= 1000); return result;
}
try {
  const count = Number(process.env.IMPORT_COST_RECORDS ?? 3351), bundle = sqliteSource(count, 'Historical 🌱 漢字 feedback');
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  const context = () => ({ ...runtime.context(), batchSize: 50, storage: { database, targets: { ...sqliteTargets,
    planCodec: { id: 'synthetic-identity-v1', encode: (plan: any) => plan, decode: (plan: any) => plan } } } });
  const start = performance.now(), cpu = process.cpuUsage();
  const plan = await request(() => planD1ImportStream(bundle, sqliteMapping, context()));
  let job = await request(() => createD1ImportStream(plan, { ...context(), reviewedFingerprint: plan.fingerprint }));
  while (job.state !== 'completed') job = await request(() => resumeD1ImportStream(job.id, context()));
  assert.equal(runtime.native().prepare('SELECT count(*) n FROM native_records').get()!.n, count);
  while (job.state !== 'undone') job = await request(() => undoD1ImportStream(job.id, context()));
  assert.equal(runtime.native().prepare('SELECT count(*) n FROM native_records').get()!.n, 0);
  const used = process.cpuUsage(cpu), wallMs = performance.now() - start;
  console.log(JSON.stringify({ records: count, pages: plan.pages.length, requests, statements, batches, wallMs, providerMs,
    pipelineMs: wallMs - providerMs, cpuMs: (used.user + used.system) / 1000, state: job.state }));
} finally { for (const close of cleanup.reverse()) await close(); }
