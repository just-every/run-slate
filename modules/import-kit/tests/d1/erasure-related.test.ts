import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteTargets } from './sqlite-runtime.ts';
import { planD1Import, createD1ImportJob, resumeD1Import, undoD1Import, eraseD1ImportTarget, readD1ImportOriginals, readD1ImportJob, canonicalJson, sha256 } from '../../src/d1/index.ts';
import type { D1Database, SourceBundle, ImportMapping } from '../../src/d1/index.ts';

const person = 'related-person@example.test';
// The person's own record, a kept record that mentions them, a rejected row and an unrelated peer.
const records = [{ id: 'person', email: person }, { id: 'company', note: `Account contact <${person}>` }, { id: 'rejected', email: person, reject: true }, { id: 'peer', note: 'unrelated' }];
const mapping: ImportMapping = { version: 'v1', map: r => (r.payload as any).reject ? { effects: [], rejection: 'Invalid row' } : { effects: [{ targetKind: 'record', targetId: r.sourceId, value: r.payload }] } };
function bundle(name: string, payloads: any[], wrapper = ''): SourceBundle {
  const bytes = Buffer.from(canonicalJson({ wrapper, payloads })), hash = sha256(bytes);
  return { diagnostics: [], artifacts: [{ name, sha256: hash, size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }], records: payloads.map((payload, row) => ({ namespace: 'archive', kind: 'record', sourceId: payload.id, payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: { artifact: name, row } })) };
}
const related = { source: (record: any) => JSON.stringify(record.payload).includes(person), original: (bytes: Uint8Array) => Buffer.from(bytes).toString().includes(person) };
function retainedText(r: any) {
  const tables = r.native().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ik_%'").all();
  const text = [JSON.stringify(tables.map((row: any) => r.native().prepare(`SELECT * FROM ${row.name}`).all()))];
  const chunks = r.native().prepare('SELECT job_id,kind,original_key,bytes FROM ik_d1_original_chunks ORDER BY job_id,kind,original_key,ordinal').all(), groups = new Map<string, string>();
  for (const row of chunks) { const key = canonicalJson([row.job_id, row.kind, row.original_key]); groups.set(key, (groups.get(key) ?? '') + row.bytes); }
  for (const body of groups.values()) text.push(Buffer.from(body, 'base64').toString());
  for (const row of r.native().prepare('SELECT bytes FROM ik_originals WHERE bytes IS NOT NULL').all()) text.push(Buffer.from(row.bytes).toString());
  for (const match of text.join('').matchAll(/"base64":"([^"]+)"/g)) text.push(Buffer.from(match[1], 'base64').toString());
  return text.join('\n');
}
async function fixture(t: any) {
  const r = await sqliteRuntime(t), context = () => ({ ...r.context(), originalErasurePolicy: 'withdraw-affected-artifacts' as const });
  const imported = async (source: SourceBundle, key: string) => { const plan = await planD1Import(source, mapping, context()); const job = await createD1ImportJob(plan, { ...context(), operationKey: key, reviewedFingerprint: plan.fingerprint }); await resumeD1Import(job.id, context()); return { plan, job }; };
  const first = await imported(bundle('people.json', records), 'first');
  // A second file mentions the person only in bytes no record maps.
  const second = await imported(bundle('wrapped.json', [{ id: 'other', note: 'kept' }], `exported by ${person}`), 'second');
  return { r, context, first, second };
}
// The product erases the person and redacts the kept record in the same batch.
const native = () => [...sqliteTargets.remove('workspace', 'record', 'person'), ...sqliteTargets.write({ destination: 'workspace', targetKind: 'record', targetId: 'company', revision: 'redacted', value: { id: 'company', note: 'Account contact <erased>' } })];

test('related erasure withdraws kept, rejected and original-only copies while severing undo from the kept record', async t => {
  const { r, context, first, second } = await fixture(t);
  assert.ok(retainedText(r).includes(person), 'The fixture retains the person in plans and originals');
  // Target-only erasure leaves the kept record's source and the rejected row: the gap this option closes.
  const result = await eraseD1ImportTarget('record', 'person', native(), context(), related);
  assert.equal(result.erasedRecords, 3);
  assert.ok(!retainedText(r).includes(person), 'No retained plan, provenance, history or original holds the person');
  assert.deepEqual((await sqliteTargets.read(r.db(), 'workspace', 'record', 'company'))!.value, { id: 'company', note: 'Account contact <erased>' });
  assert.equal(await sqliteTargets.read(r.db(), 'workspace', 'record', 'person'), undefined);
  assert.deepEqual((await readD1ImportOriginals(second.job.id, context()))[0].original, { status: 'unavailable', reason: 'unavailable-after-erasure', policy: 'withdraw-affected-artifacts' });
  assert.equal((await readD1ImportJob(first.job.id, context())).state, 'completed');
  await assert.rejects(createD1ImportJob(first.plan, { ...context(), operationKey: 'replay', reviewedFingerprint: first.plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  // Undo reverses the unaffected peer and leaves the severed, redacted record in place.
  await undoD1Import(first.job.id, context());
  assert.equal(await sqliteTargets.read(r.db(), 'workspace', 'record', 'peer'), undefined);
  assert.equal((await sqliteTargets.read(r.db(), 'workspace', 'record', 'company'))!.revision, 'redacted');
  await undoD1Import(second.job.id, context());
  assert.equal(await sqliteTargets.read(r.db(), 'workspace', 'record', 'other'), undefined);
  assert.ok(!retainedText(r).includes(person));
});

test('related erasure refuses a job created after its scan and changes nothing', async t => {
  const { r, context } = await fixture(t);
  const late = await planD1Import(bundle('late.json', [{ id: 'late', note: person }]), mapping, context());
  let entered = false;
  const racing = new Proxy(r.db(), { get(target: D1Database, key) { if (key === 'batch') return async (statements: any[]) => { if (!entered && statements.some(statement => /^DELETE FROM ik_d1_assertions/.test(statement.query))) { entered = true; await createD1ImportJob(late, { ...context(), operationKey: 'late', reviewedFingerprint: late.fingerprint }); } return target.batch(statements); }; const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value; } });
  const raced = { ...context(), storage: { ...context().storage, database: racing } };
  await assert.rejects(eraseD1ImportTarget('record', 'person', native(), raced, related), /IMPORT_ATOMIC_GUARD/);
  assert.ok(entered);
  assert.ok(await sqliteTargets.read(r.db(), 'workspace', 'record', 'person'), 'The person is not deleted by a refused erasure');
  assert.ok(retainedText(r).includes(person));
  await assert.rejects(eraseD1ImportTarget('record', 'person', native(), { ...context(), maxBatchBytes: 2 * 1024 * 1024 }, related), /IMPORT_RELATED_ERASURE_UNBOUNDED_ONLY/);
});
