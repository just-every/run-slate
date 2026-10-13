import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setup, source, mapping, context } from './fixtures.ts';
import { exactSource } from './originals-fixtures.ts';
import { planImport, createImportJob, applyImportBatches, resumeImport, undoImport, rollbackImport, readImportOriginals, sha256, canonicalJson } from '../../src/index.ts';

async function reviewed(ctx, input = exactSource().source) {
  const plan = planImport(input, mapping, ctx); ctx.reviewedFingerprint = plan.fingerprint;
  return { plan, job: await createImportJob(plan, ctx) };
}
function verifyOriginals(ctx, id, bytes) {
  const originals = readImportOriginals(id, ctx), artifact = originals.find(o => o.kind === 'artifact')!;
  assert.equal(artifact.original.status, 'retained');
  assert.deepEqual(Buffer.from(artifact.original.base64, 'base64'), bytes);
  assert.equal(artifact.sha256, sha256(bytes)); assert.equal(artifact.size, bytes.length);
  assert.equal(originals.filter(o => o.kind === 'attachment').length, 3);
  for (const original of originals) assert.equal(sha256(Buffer.from(original.original.base64, 'base64')), original.sha256);
  const rows = ctx.storage.database.prepare('SELECT * FROM ik_originals WHERE job_id=?').all(id);
  assert.equal(rows.length, 4);
  assert.deepEqual(Buffer.from(rows.find(r => r.kind === 'artifact').bytes), bytes);
  return originals;
}
test('exact wrapper/whitespace bytes and every attachment survive durable reopen, apply and undo', async t => {
  const { ctx, path } = setup(t), { bytes } = exactSource(), { job } = await reviewed(ctx);
  const before = verifyOriginals(ctx, job.id, bytes);
  ctx.storage.close(); ctx.storage = context(path).storage;
  await applyImportBatches(job.id, ctx); assert.deepEqual(verifyOriginals(ctx, job.id, bytes), before);
  await undoImport(job.id, ctx); assert.deepEqual(verifyOriginals(ctx, job.id, bytes), before);
  ctx.storage.close(); ctx.storage = context(path).storage; assert.deepEqual(verifyOriginals(ctx, job.id, bytes), before);
});
test('legacy metadata-only plans explicitly mark unavailable originals without reconstructing them', async t => {
  const { ctx } = setup(t), { plan, job } = await reviewed(ctx, source(1));
  assert.deepEqual(plan.source.artifacts[0].original, { status: 'unavailable', reason: 'not-supplied' });
  assert.ok(plan.diagnostics.some(d => d.code === 'ORIGINAL_UNAVAILABLE'));
  assert.deepEqual(readImportOriginals(job.id, ctx)[0].original, { status: 'unavailable', reason: 'not-supplied' });
  await applyImportBatches(job.id, ctx); await undoImport(job.id, ctx);
  assert.equal(readImportOriginals(job.id, ctx).filter(o => o.original.status === 'retained').length, 1);
});
test('digest, size, canonical encoding and hidden credential metadata fail before persistence', async t => {
  const { ctx } = setup(t);
  for (const mutate of [a => a.sha256 = 'a'.repeat(64), a => a.size++, a => a.original.base64 += '\n']) {
    const input = exactSource().source; mutate(input.artifacts[0]); assert.throws(() => planImport(input, mapping, ctx), /ORIGINAL_HASH_SIZE_MISMATCH/);
  }
  const input = exactSource().source, bytes = Buffer.from('{"items":[],"metadata":{"access_token":"synthetic-secret"}}');
  Object.assign(input.artifacts[0], { size: bytes.length, sha256: sha256(bytes), original: { status: 'available', base64: bytes.toString('base64') } });
  assert.throws(() => planImport(input, mapping, ctx), /CREDENTIAL/);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_jobs').get().n, 0);
});
test('a custody insert failure rolls back the entire new job and attachment custody', async t => {
  const { ctx } = setup(t);
  ctx.storage.database.exec("CREATE TRIGGER reject_original BEFORE INSERT ON ik_originals WHEN NEW.kind='attachment' BEGIN SELECT RAISE(ABORT,'custody rejected'); END");
  await assert.rejects(reviewed(ctx), /custody rejected/);
  for (const table of ['ik_jobs', 'ik_original_sets', 'ik_originals']) assert.equal(ctx.storage.database.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
  ctx.storage.database.exec('DROP TRIGGER reject_original'); const { job } = await reviewed(ctx); verifyOriginals(ctx, job.id, exactSource().bytes);
});
test('missing/corrupt promised custody fails readback and resume, without synthesizing replacement bytes', async t => {
  const { ctx } = setup(t), { job } = await reviewed(ctx);
  const row = ctx.storage.database.prepare("SELECT * FROM ik_originals WHERE kind='artifact'").get();
  ctx.storage.database.prepare("UPDATE ik_originals SET bytes=? WHERE kind='artifact'").run(Buffer.from('corrupt'));
  assert.throws(() => readImportOriginals(job.id, ctx), /ORIGINAL_CUSTODY_MISMATCH/);
  await assert.rejects(resumeImport(job.id, ctx), /ORIGINAL_CUSTODY_MISMATCH/);
  ctx.storage.database.prepare("UPDATE ik_originals SET bytes=? WHERE kind='artifact'").run(row.bytes);
  ctx.storage.database.prepare("DELETE FROM ik_originals WHERE kind='artifact'").run();
  assert.throws(() => readImportOriginals(job.id, ctx), /ORIGINAL_CUSTODY_MISMATCH/);
});
test('rollback retains custody after a genuine SQL failure and readback requires current authority', async t => {
  const { ctx } = setup(t), { job } = await reviewed(ctx);
  ctx.storage.database.exec("CREATE TRIGGER reject_target BEFORE INSERT ON ik_targets WHEN NEW.id='1' BEGIN SELECT RAISE(ABORT,'target rejected'); END");
  await assert.rejects(applyImportBatches(job.id, ctx), /target rejected/); await rollbackImport(job.id, ctx);
  verifyOriginals(ctx, job.id, exactSource().bytes);
  ctx.storage.database.prepare('UPDATE test_authority SET permitted=0').run();
  assert.throws(() => readImportOriginals(job.id, ctx), /NOT_AUTHORIZED/);
});
const childPath = fileURLToPath(new URL('./originals-child.ts', import.meta.url));
async function kill(path, mode, id = '') {
  const child = spawn(process.execPath, [childPath, path, mode, id], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  child.stdout.on('data', data => { output += data; if (output.includes('KILL_NOW')) child.kill('SIGKILL'); }); child.stderr.on('data', data => errors += data);
  const signal = await new Promise(resolve => child.once('exit', (_code, signal) => resolve(signal))); clearTimeout(timer);
  assert.equal(signal, 'SIGKILL', errors); assert.match(output, /KILL_NOW/);
  return { id: /JOB ([^\n]+)/.exec(output)?.[1] ?? id, output };
}
function resumeFresh(path, id) {
  const child = spawnSync(process.execPath, [childPath, path, 'resume', id], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr); return JSON.parse(child.stdout);
}
async function expire(ctx, id) {
  const expires = ctx.storage.database.prepare('SELECT lease_expires FROM ik_jobs WHERE id=?').get(id).lease_expires;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, expires - Date.now() + 30)));
}
test('real SIGKILL during apply and undo retains exact originals before/after fresh-process recovery', async t => {
  const { ctx, path } = setup(t), { bytes } = exactSource(), first = await kill(path, 'apply'), id = first.id;
  const before = JSON.parse(/ORIGINALS ([^\n]+)/.exec(first.output)![1]); assert.deepEqual(verifyOriginals(ctx, id, bytes), before);
  assert.equal(ctx.storage.database.prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').get(id).checkpoint, 1);
  await expire(ctx, id); const completed = resumeFresh(path, id); assert.equal(completed.job.state, 'completed'); assert.deepEqual(completed.originals, before);
  await kill(path, 'undo', id); assert.deepEqual(verifyOriginals(ctx, id, bytes), before);
  await expire(ctx, id); const undone = resumeFresh(path, id); assert.equal(undone.job.state, 'undone'); assert.deepEqual(undone.originals, before);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_targets').get().n, 0); assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_stages').get().n, 0);
});

test('unmapped binary attachment artifacts retain exact bytes without fabricated target effects', async t => {
  const { ctx } = setup(t), input = exactSource().source, bytes = Buffer.from([0, 255, 10, 13, 128, 1, 0]);
  input.artifacts.push({ name: 'unsupported.bin', sha256: sha256(bytes), size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } });
  const { job } = await reviewed(ctx, input); await applyImportBatches(job.id, ctx); await undoImport(job.id, ctx);
  const original = readImportOriginals(job.id, ctx).find(o => o.name === 'unsupported.bin')!;
  assert.deepEqual(Buffer.from(original.original.base64, 'base64'), bytes); assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_targets').get().n, 0);
});

test('pre-custody durable jobs reopen without inventing unavailable file bytes', async t => {
  const { ctx, path } = setup(t);
  const plan = planImport(source(1), mapping, ctx);
  // Prior storage format: metadata-only artifacts and exact mapped attachments in plan_json.
  for (const artifact of plan.source.artifacts) delete artifact.original;
  plan.diagnostics = plan.diagnostics.filter(d => d.code !== 'ORIGINAL_UNAVAILABLE');
  const { fingerprint: _fingerprint, ...content } = plan;
  plan.fingerprint = sha256(canonicalJson(content));
  ctx.storage.database.prepare("INSERT INTO ik_jobs(id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,plan_json,state,total) VALUES(?,?,?,?,?,?,?,?,'queued',?)").run('legacy-job', plan.destination, plan.namespace, plan.mappingVersion, plan.principalId, plan.fingerprint, 'legacy-operation', canonicalJson(plan), plan.entries.length);
  ctx.storage.close(); ctx.storage = context(path).storage;
  const originals = readImportOriginals('legacy-job', ctx);
  assert.deepEqual(originals[0].original, { status: 'unavailable', reason: 'not-supplied' });
  assert.deepEqual(Buffer.from(originals[1].original.base64, 'base64'), Buffer.from('original 0'));
  await resumeImport('legacy-job', ctx); await undoImport('legacy-job', ctx);
  assert.deepEqual(readImportOriginals('legacy-job', ctx), originals);
});
