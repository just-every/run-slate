import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { door } from './fixture.ts';
import { createImportDoorHandler } from '../../src/door/index.ts';
import { readD1ImportOriginals } from '../../src/d1/index.ts';
import { rpcBytes, RPC_LIMIT } from '../../../d1-transport/index.mjs';
import type { D1Database } from '../../src/d1/types.ts';

/** Every D1 call the door makes, as sent on the wire, and every result it reads
 * back. `fail` may refuse a batch before it reaches the database, as a dropped
 * D1 connection would. */
function metered(database: D1Database, fail: (sql: string[]) => boolean) {
  const seen = {request: 0, result: 0, stagedChunkRows: 0};
  const note = (statements: {sql: string; params?: unknown[]}[]) => { seen.request = Math.max(seen.request, rpcBytes(statements)); };
  const back = <T,>(value: T): T => { seen.result = Math.max(seen.result, Buffer.byteLength(JSON.stringify(value) ?? '')); return value; };
  const wrap = (s: any): any => ({query: s.query, values: s.values, bind: (...v: unknown[]) => wrap(s.bind(...v)),
    first: async () => { note([{sql: s.query, params: s.values}]); return back(await s.first()); },
    all: async () => { note([{sql: s.query, params: s.values}]); return back(await s.all()); }});
  const db: D1Database = {prepare: query => wrap(database.prepare(query)),
    batch: async members => {
      const statements = members.map((m: any) => ({sql: m.query as string, params: m.values as unknown[]}));
      note(statements);
      if (fail(statements.map(s => s.sql))) throw new Error('D1_ERROR: Network connection lost');
      const result = back(await database.batch(members));
      for (const s of statements) if (s.sql.startsWith('INSERT INTO ik_d1_staging_chunks(')) seen.stagedChunkRows += (JSON.parse(String(s.params.at(-1))) as unknown[]).length;
      return result;
    }};
  return {db, seen};
}

/** One large source through the HTTP door: plan, a creation interrupted part
 * way through its staging, the resumed creation, apply, originals and undo. */
export async function largeSourceJourney(t: TestContext, source: Buffer, maxRecords: number) {
  const d = await door(t), pages = (JSON.parse(source.toString()) as unknown[]).length, native = d.runtime.native();
  let stagingBatches = 0, interrupt = true;
  const {db, seen} = metered(d.options.database, sql => interrupt && sql.some(s => s.startsWith('INSERT INTO ik_d1_staging_chunks(')) && ++stagingBatches === 3);
  d.mount(createImportDoorHandler({...d.options, database: db}));
  await d.enable();
  const quota = {maxBytes: source.length, maxChunks: Math.ceil(source.length / 65_536), maxRecords};
  const planned = await d.call('plan', {uploadId: await d.upload(source, quota)}, quota);
  assert.equal(planned.status, 200, JSON.stringify(planned.body));
  assert.equal(planned.body.summary.created, pages);

  // The connection drops on the third staged batch: no job exists, nothing is
  // applied, and the staged rows written before it stay private.
  const grant = {fingerprint: planned.body.fingerprint, ...d.approval, ...quota};
  const dropped = await d.call('apply', {planId: planned.body.planId, reviewedFingerprint: planned.body.fingerprint}, grant);
  assert.equal(dropped.status, 409, JSON.stringify(dropped.body));
  assert.equal(native.prepare('SELECT count(*) n FROM ik_jobs').get()!.n, 0);
  assert.equal(native.prepare('SELECT count(*) n FROM native_records').get()!.n, 0);
  assert.equal((await d.call('status', {planId: planned.body.planId}, quota)).body.job, null);
  const staged = native.prepare('SELECT count(*) n FROM ik_d1_staging_chunks').get()!.n as number;
  const before = seen.stagedChunkRows;
  assert.ok(staged > 0 && staged === before, `staged ${staged} of ${before}`);

  // The next apply resumes from those rows, publishes the job and applies it.
  interrupt = false;
  const job = await d.apply(planned.body, quota);
  assert.equal(job.state, 'completed');
  const written = seen.stagedChunkRows - before, chunks = native.prepare('SELECT count(*) n FROM ik_d1_plan_chunks WHERE job_id=?').get(job.id)!.n as number;
  assert.equal(written, chunks - staged, 'the retry stages only the chunks after its checkpoint');
  assert.equal(native.prepare('SELECT count(*) n FROM ik_d1_staging').get()!.n, 0, 'publication removes the private stage');
  assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE destination='workspace'").get()!.n, pages);
  const [original] = await readD1ImportOriginals(job.id, {...d.runtime.context(), namespace: native.prepare('SELECT namespace FROM ik_jobs WHERE id=?').get(job.id)!.namespace as string});
  assert.deepEqual(original.original, {status: 'retained', base64: source.toString('base64')});

  await d.undo(planned.body.planId);
  assert.equal(native.prepare("SELECT count(*) n FROM native_records WHERE destination='workspace'").get()!.n, 0);
  // No request carries the whole original, let alone the whole plan, and every
  // call stays inside D1's RPC ceiling and the door's per-request budget.
  const original64 = source.toString('base64').length, statements = Math.max(...d.requests.map(r => r.statements));
  t.diagnostic(JSON.stringify({sourceBytes: source.length, pages, planChunks: chunks, largestRequestBytes: seen.request, largestResultBytes: seen.result, originalBase64Bytes: original64, mostStatementsInOneRequest: statements, doorRequests: d.requests.length}));
  assert.ok(seen.request < original64, `largest request ${seen.request}`);
  assert.ok(seen.result <= RPC_LIMIT, `largest result ${seen.result}`);
  assert.ok(statements <= 1000, `most statements ${statements}`);
}
