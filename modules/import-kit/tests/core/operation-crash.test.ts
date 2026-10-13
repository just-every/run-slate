import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeSetup, nativeRows } from './operation-native-fixtures.ts';
import { resumeImport, readImportJob, readImportOriginals, sha256 } from '../../src/index.ts';
const childPath = fileURLToPath(new URL('./operation-crash-child.ts', import.meta.url));
async function kill(path: string, mode: string, id = '', delayed = false) {
  const child = spawn(process.execPath, [childPath, path, mode, id, String(Date.now()), String(delayed)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = ''; const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  child.stdout.on('data', data => { output += data; if (output.includes('KILL_NOW')) child.kill('SIGKILL'); });
  child.stderr.on('data', data => errors += data);
  try {
    const result = await new Promise(resolve => child.once('exit', (_code, signal) => resolve(signal)));
    assert.equal(result, 'SIGKILL', errors); assert.match(output, /KILL_NOW/);
    return /JOB ([^\n]+)/.exec(output)?.[1] ?? id;
  } finally { clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
}
function resumeFresh(path: string, id: string) {
  const result = spawnSync(process.execPath, [childPath, path, 'resume', id, String(Date.now())], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}
async function expire(ctx, id, t) {
  const row = ctx.storage.database.prepare('SELECT lease_expires FROM ik_jobs WHERE id=?').get(id);
  assert.ok(row.lease_expires > Date.now(), 'killed holder still owns a live lease');
  t.mock.timers.tick(row.lease_expires - Date.now() + 1);
}
async function crashProof(t, delayed = false) {
  // Only Date is controlled: SQLite, child scheduling and SIGKILL remain real.
  t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
  const { ctx, path } = nativeSetup(t), id = await kill(path, 'apply', '', delayed), db = ctx.storage.database;
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(readImportJob(id, ctx).checkpoint, 1); assert.equal(nativeRows(ctx).length, 3);
  assert.equal(db.prepare('SELECT count(*) n FROM ik_provenance').get().n, 3);
  assert.equal(db.prepare('SELECT count(*) n FROM ik_stages').get().n, 1);
  const originals = readImportOriginals(id, ctx);
  assert.equal(originals.length, 3); assert.ok(originals.every(original => original.original.status === 'retained' && sha256(Buffer.from(original.original.base64, 'base64')) === original.sha256));
  await assert.rejects(resumeImport(id, ctx), /LEASE_BUSY/); await expire(ctx, id, t);
  assert.equal(resumeFresh(path, id).state, 'completed'); assert.equal(nativeRows(ctx).length, 6);
  assert.equal(db.prepare('SELECT count(*) n FROM ik_batches').get().n, 2);
  assert.deepEqual(readImportOriginals(id, ctx), originals);
  await kill(path, 'undo', id, delayed);
  assert.equal(readImportJob(id, ctx).state, 'undoing'); assert.equal(nativeRows(ctx).length, 5);
  assert.equal(db.prepare('SELECT count(*) n FROM ik_provenance WHERE reversed=1').get().n, 1);
  await expire(ctx, id, t); assert.equal(resumeFresh(path, id).state, 'undone');
  assert.equal(nativeRows(ctx).length, 0); assert.equal(db.prepare('SELECT count(*) n FROM ik_sources').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM ik_provenance WHERE reversed=1').get().n, 6);
  assert.equal(db.prepare('SELECT count(*) n FROM ik_stages').get().n, 0); assert.deepEqual(readImportOriginals(id, ctx), originals);
}
test('native SQLite WAL survives SIGKILL inside apply and undo, retaining complete attribution and exact originals', t => crashProof(t));
test('native crash recovery preserves live-lease refusal despite scheduler delays longer than the lease', t => crashProof(t, true));
