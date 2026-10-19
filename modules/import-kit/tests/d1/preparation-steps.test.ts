import test from 'node:test';
import assert from 'node:assert/strict';
import { fullScale } from './scale-size.ts';
import { runtime } from './fixtures.ts';
import { planD1ImportStream, prepareD1ImportSteps, publishD1ImportPreparation, resumeD1ImportStream, cancelD1ImportStaging } from '../../src/d1/index.ts';
import type { ImportPreparationStep } from '../../src/d1/index.ts';
import { personTargets, peopleMapping } from '../../../../default-seed/src/core/features/people/imports.server.ts';
import { peopleSource } from './people-fixture.ts';

const rows = fullScale ? 100_000 : 12_345;

test(`real D1: a ${rows}-row import is prepared, verified and published across requests, each a small part of the one-request CPU, under the same fingerprint`, { timeout: 60 * 60_000 }, async t => {
  const r = await runtime(t);
  await r.db().prepare('CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,email TEXT,details TEXT,created_at TEXT,import_revision TEXT)').run();
  const context = (extra = {}) => ({ ...r.context(), destination: 'people', namespace: 'people', batchSize: 100, storage: { database: r.db(), targets: personTargets }, ...extra });
  const source = peopleSource(Array.from({ length: rows }, (_, i) => ({ ref: `r${i}`, name: `Respondent ${i}`, email: `respondent${i}@example.test`, details: { answers: { q1: `answer ${i % 97}`, q2: i % 5 } } })));
  source.artifacts.forEach(artifact => artifact.original = { status: 'unavailable', reason: 'not-supplied' });
  const cpu = async <T>(run: () => Promise<T>): Promise<[T, number]> => { const start = process.cpuUsage(); const result = await run(); const used = process.cpuUsage(start); return [result, (used.user + used.system) / 1000]; };
  const steps = async (operationKey: string) => {
    const costs: number[] = [];
    let step: ImportPreparationStep;
    do { const [next, ms] = await cpu(() => prepareD1ImportSteps(source, peopleMapping, context({ operationKey }))); step = next; costs.push(ms); } while (step.state !== 'reviewable');
    return { step, costs };
  };

  // A staged page changed between requests is refused, and cancelling removes every step's custody.
  let step = await prepareD1ImportSteps(source, peopleMapping, context({ operationKey: 'tampered.csv' }));
  while (step.state === 'preparing') step = await prepareD1ImportSteps(source, peopleMapping, context({ operationKey: 'tampered.csv' }));
  await r.db().prepare("UPDATE ik_d1_staging_chunks SET body=body||' ' WHERE rowid=(SELECT max(rowid) FROM ik_d1_staging_chunks)").run();
  await assert.rejects(async () => { while ((await prepareD1ImportSteps(source, peopleMapping, context({ operationKey: 'tampered.csv' }))).state !== 'reviewable'); }, /IMPORT_PREPARATION_INTERRUPTED|IMPORT_STAGE_CONTENT_CHANGED/);
  await cancelD1ImportStaging('tampered.csv', context());
  for (const table of ['ik_d1_staging', 'ik_d1_preparation_steps']) assert.equal((await r.db().prepare(`SELECT count(*) AS n FROM ${table}`).first())!.n, 0, `cancel leaves no ${table}`);

  const { step: reviewable, costs } = await steps('respondents.csv');
  assert.equal(reviewable.counts!.unique, rows);
  const [review, oneRequest] = await cpu(() => planD1ImportStream(source, peopleMapping, context()));
  assert.equal(reviewable.fingerprint, review.fingerprint, 'the steps verify the same complete canonical fingerprint a one-request review computes');
  await assert.rejects(publishD1ImportPreparation(reviewable.id, context({ reviewedFingerprint: '0'.repeat(64) })), /REVIEW_FINGERPRINT_MISMATCH/);
  const [published, publishing] = await cpu(() => publishD1ImportPreparation(reviewable.id, context({ reviewedFingerprint: reviewable.fingerprint })));
  assert.equal(published.total, rows);
  const [applied, applying] = await cpu(() => resumeD1ImportStream(reviewable.id, context()));
  assert.ok(applied.checkpoint > 0);
  assert.equal((await prepareD1ImportSteps(source, peopleMapping, context({ operationKey: 'respondents.csv' }))).state, 'published', 'the same upload replays its published import');
  const changed = peopleSource(Array.from({ length: rows }, (_, i) => ({ ref: `r${i}`, name: `Respondent ${i}`, email: `changed${i}@example.test`, details: {} })));
  changed.artifacts.forEach(artifact => artifact.original = { status: 'unavailable', reason: 'not-supplied' });
  await assert.rejects(prepareD1ImportSteps(changed, peopleMapping, context({ operationKey: 'respondents.csv' })), /OPERATION_KEY_CONFLICT/, 'a different upload under the published key is refused, never reported published');
  const largest = Math.max(...costs, publishing, applying);
  t.diagnostic(JSON.stringify({ rows, requests: costs.length + 2, largestRequestCpuMs: Math.round(largest), oneRequestReviewCpuMs: Math.round(oneRequest), stepCpuMs: costs.map(Math.round) }));
  // Bounded work per request: no request costs more than a small part of the
  // single request that reviews the whole file (which exceeds Workers' 30 s at 100,000).
  if (fullScale) assert.ok(largest < oneRequest / 5, `largest request ${Math.round(largest)} ms against one-request review ${Math.round(oneRequest)} ms`);
});

/** A request the platform ends right after the call `ends` matches commits: that
 * call and every later one of the request reject, so no cleanup of it runs. */
function endedAfter(db: any, ends: (sql: string) => boolean) {
  let ended = false;
  const call = async <T>(sql: string, run: () => Promise<T>) => {
    if (ended) throw new Error('REQUEST_ENDED');
    const result = await run();
    if (ends(sql)) { ended = true; throw new Error('REQUEST_ENDED'); }
    return result;
  };
  const wrap = (sql: string, statement: any): any => ({ sql, statement, bind: (...values: unknown[]) => wrap(sql, statement.bind(...values)),
    first: (...args: any[]) => call(sql, () => statement.first(...args)), all: () => call(sql, () => statement.all()), run: () => call(sql, () => statement.run()), raw: (...args: any[]) => call(sql, () => statement.raw(...args)) });
  return { prepare: (sql: string) => wrap(sql, db.prepare(sql)), batch: (list: any[]) => call(list.map(item => item.sql).join(';'), () => db.batch(list.map(item => item.statement))) };
}

test('real D1: a collecting step ended after sealing its slice continues on the next request, and cancelling leaves no private custody', { timeout: 20 * 60_000 }, async t => {
  const r = await runtime(t);
  await r.db().prepare('CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,email TEXT,details TEXT,created_at TEXT,import_revision TEXT)').run();
  const context = (extra = {}) => ({ ...r.context(), destination: 'people', namespace: 'people', batchSize: 100, storage: { database: r.db(), targets: personTargets }, ...extra });
  const total = 6000;
  const source = peopleSource(Array.from({ length: total }, (_, i) => ({ ref: `r${i}`, name: `Respondent ${i}`, email: `respondent${i}@example.test`, details: { answers: { q1: `answer ${i % 97}` } } })));
  source.artifacts.forEach(artifact => artifact.original = { status: 'unavailable', reason: 'not-supplied' });
  // The step's slice is sealed; the request ends before the control row records it.
  const ended = (operationKey: string) => assert.rejects(prepareD1ImportSteps(source, peopleMapping, { ...context({ operationKey }), storage: { database: endedAfter(r.db(), sql => sql.includes('SET sealed_revision')), targets: personTargets } }), /REQUEST_ENDED/);
  const rows = async (table: string) => (await r.db().prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

  assert.equal((await prepareD1ImportSteps(source, peopleMapping, context({ operationKey: 'cancelled.csv' }))).records, 5000);
  await ended('cancelled.csv');
  assert.equal(await rows('ik_d1_staging'), 2, 'the recorded slice and the unrecorded sealed one');
  await cancelD1ImportStaging('cancelled.csv', context());
  for (const table of ['ik_d1_staging', 'ik_d1_staging_chunks', 'ik_d1_staging_index', 'ik_d1_preparation_steps']) assert.equal(await rows(table), 0, `cancel leaves no ${table}`);

  await ended('resumed.csv');
  let step: ImportPreparationStep;
  do step = await prepareD1ImportSteps(source, peopleMapping, context({ operationKey: 'resumed.csv' })); while (step.state !== 'reviewable');
  assert.equal(step.fingerprint, (await planD1ImportStream(source, peopleMapping, context())).fingerprint, 'the resumed steps verify what a one-request review computes');
  assert.equal((await publishD1ImportPreparation(step.id, context({ reviewedFingerprint: step.fingerprint }))).total, total);
  assert.equal(await rows('ik_d1_staging'), 0, 'no private generation outlives the published import');
});
