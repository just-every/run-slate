import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/provenance/identity.ts';
import { planImport } from '../src/plan/index.ts';
import { assertPlanSize, PLAN_BYTES_LIMIT, PlanTooLargeError } from '../src/plan/size.ts';
import { createImportJob } from '../src/journal/jobs.ts';
import { setup, source, mapping } from './core/fixtures.ts';

const emptyNote = { severity: 'warning' as const, code: 'NOTE', message: '' };
/** Independent length arithmetic, using only the small envelope's encoding.
 * Repeated references exercise disk size, without a huge source allocation. */
function fillNotes(notes: typeof emptyNote[], envelopeBytes: number, targetBytes: number) {
  const noteBytes = Buffer.byteLength(JSON.stringify(emptyNote));
  const shared = { ...emptyNote, message: 'x'.repeat(1_000_000) };
  let bytes = envelopeBytes;
  while (bytes + noteBytes + 1_000_000 + Number(notes.length > 0) + noteBytes + 1 <= targetBytes) {
    bytes += noteBytes + shared.message.length + Number(notes.length > 0); notes.push(shared);
  }
  notes.push({ ...emptyNote, message: 'x'.repeat(targetBytes - bytes - noteBytes - Number(notes.length > 0)) });
}

test('source cap-plus-one and inclusive plan byte bound use exact bytes; SQLite leaves every kit table empty', async t => {
  const { ctx } = setup(t), oversized = source(0);
  fillNotes(oversized.diagnostics, Buffer.byteLength(canonicalJson(oversized)), PLAN_BYTES_LIMIT + 1);
  assert.throws(() => planImport(oversized, mapping, ctx), (e: any) => e instanceof PlanTooLargeError && e.subject === 'source' && e.bytes === PLAN_BYTES_LIMIT + 1);
  const plan = planImport(source(1), mapping, ctx), { fingerprint: _, ...content } = plan;
  const reviewed = { ...ctx, reviewedFingerprint: plan.fingerprint };
  fillNotes(plan.diagnostics, Buffer.byteLength(canonicalJson(content)), PLAN_BYTES_LIMIT);
  assert.doesNotThrow(() => assertPlanSize(plan), 'the inclusive bound admits exactly 300,000,000 content bytes');
  plan.diagnostics.at(-1)!.message += 'x';
  await assert.rejects(createImportJob(plan, reviewed), (e: any) => e instanceof PlanTooLargeError && e.subject === 'plan' && e.bytes === PLAN_BYTES_LIMIT + 1);
  const tables = ctx.storage.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik\\_%' ESCAPE '\\'").all();
  assert.ok(tables.length >= 5);
  for (const { name } of tables) assert.equal(ctx.storage.database.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n, 0, name);
});
