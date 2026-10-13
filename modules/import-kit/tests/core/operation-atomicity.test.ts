import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportBatches, undoImport, rollbackImport, resumeImport, readImportJob, canonicalJson } from '../../src/index.ts';
import { nativeSetup, nativeJob, nativeRows, nativeTargets, firstArticle } from './operation-native-fixtures.ts';

for (const action of ['apply', 'undo'] as const) test(`${action} detects attribution corruption introduced between batches, before another native effect`, async t => {
  let ctx: any, saved: any, injected = false;
  const corruptAfterCommit = () => setImmediate(() => {
    saved = firstArticle(ctx); injected = true;
    ctx.storage.database.prepare('UPDATE ik_provenance SET record_json=? WHERE id=?').run(canonicalJson({ ...JSON.parse(saved.record_json), jobId: 'corrupt-publisher' }), saved.id);
  });
  const targets = { ...nativeTargets,
    write(db, row) { nativeTargets.write(db, row); if (action === 'apply' && row.targetKind === 'article' && row.targetId === '0') corruptAfterCommit(); },
    remove(db, destination, kind, id) { nativeTargets.remove(db, destination, kind, id); if (action === 'undo' && kind === 'attachment' && id === '1') corruptAfterCommit(); }
  };
  ({ ctx } = nativeSetup(t, targets)); const { job } = await nativeJob(ctx);
  if (action === 'undo') await applyImportBatches(job, ctx);
  await assert.rejects(action === 'apply' ? applyImportBatches(job, ctx) : undoImport(job.id, ctx), /PROVENANCE_STORAGE_MISMATCH/);
  assert.equal(injected, true); assert.equal(nativeRows(ctx).length, action === 'apply' ? 3 : 5);
  assert.equal(readImportJob(job.id, ctx).checkpoint, action === 'apply' ? 1 : 2);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_batches WHERE action=?').get(action).n, 1);
  assert.equal(JSON.parse(ctx.storage.database.prepare('SELECT record_json FROM ik_provenance WHERE id=?').get(saved.id).record_json).jobId, 'corrupt-publisher');
  // The engine does not repair data; restoring the captured bytes here models an
  // explicit operator repair, after which ordinary resume must remain usable.
  ctx.storage.database.prepare('UPDATE ik_provenance SET record_json=? WHERE id=?').run(saved.record_json, saved.id);
  const result = await resumeImport(job.id, ctx);
  assert.equal(result.state, action === 'apply' ? 'completed' : 'undone');
  assert.equal(nativeRows(ctx).length, action === 'apply' ? 6 : 0);
});
for (const action of ['apply', 'undo'] as const) test(`${action} checks final transaction state after native triggers and rolls back corruption plus native work`, async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx), db = ctx.storage.database;
  if (action === 'apply') { ctx.maxBatches = 1; await applyImportBatches(job, ctx); delete ctx.maxBatches; }
  else await applyImportBatches(job, ctx);
  const before = nativeRows(ctx), row = firstArticle(ctx), checkpoint = readImportJob(job.id, ctx).checkpoint;
  const trigger = action === 'apply' ? "AFTER INSERT ON native_articles WHEN NEW.id='1'" : 'AFTER DELETE ON native_attachments';
  db.exec(`CREATE TRIGGER corrupt_provenance ${trigger} BEGIN UPDATE ik_provenance SET record_json=json_set(record_json,'$.jobId','trigger-corruption') WHERE ordinal=0 AND effect_ordinal=0; END;`);
  await assert.rejects(action === 'apply' ? resumeImport(job.id, ctx) : undoImport(job.id, ctx), /PROVENANCE_STORAGE_MISMATCH/);
  assert.deepEqual(nativeRows(ctx), before); assert.equal(firstArticle(ctx).record_json, row.record_json);
  assert.equal(readImportJob(job.id, ctx).checkpoint, checkpoint);
  assert.equal(db.prepare("SELECT count(*) n FROM ik_batches WHERE action='undo'").get().n, 0);
  db.exec('DROP TRIGGER corrupt_provenance'); await resumeImport(job.id, ctx);
  assert.equal(nativeRows(ctx).length, action === 'apply' ? 6 : 0);
});
test('corruption of an already reversed record blocks further reversal and finalization', async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
  ctx.maxBatches = 1; await undoImport(job.id, ctx); delete ctx.maxBatches;
  const db = ctx.storage.database, row = db.prepare('SELECT * FROM ik_provenance WHERE reversed=1').get();
  db.prepare('DELETE FROM ik_provenance WHERE id=?').run(row.id);
  const before = nativeRows(ctx);
  await assert.rejects(resumeImport(job.id, ctx), /PROVENANCE_(MISSING|REVERSAL_MISMATCH)/);
  assert.deepEqual(nativeRows(ctx), before); assert.equal(readImportJob(job.id, ctx).state, 'undoing');
  assert.equal(db.prepare('SELECT count(*) n FROM ik_sources').get().n, 2);
});
test('later native edits remain explicit conflicts and partial reversal can resume after restoration', async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx); await applyImportBatches(job, ctx);
  const db = ctx.storage.database, original = nativeTargets.read(db, ctx.destination, 'article', '0')!;
  nativeTargets.write(db, { ...original, revision: 'native-edit', value: { title: 'Changed natively', body: 'Keep this' } });
  await assert.rejects(rollbackImport(job.id, ctx), /NATIVE_EDIT_CONFLICT/);
  assert.equal(nativeTargets.read(db, ctx.destination, 'article', '0')!.revision, 'native-edit');
  assert.equal(readImportJob(job.id, ctx).state, 'rolling_back');
  nativeTargets.write(db, original); assert.equal((await resumeImport(job.id, ctx)).state, 'rolled_back');
  assert.equal(nativeRows(ctx).length, 0);
});
test('final native apply commit rechecks authority after checkpoint-triggered changes', async t => {
  const { ctx } = nativeSetup(t), { job } = await nativeJob(ctx), db = ctx.storage.database;
  db.exec("CREATE TRIGGER revoke_on_completion AFTER UPDATE OF checkpoint ON ik_jobs WHEN NEW.checkpoint=NEW.total BEGIN UPDATE native_authority SET allowed=0; END;");
  await assert.rejects(applyImportBatches(job, ctx), /NOT_AUTHORIZED/);
  assert.equal(readImportJob(job.id, ctx).checkpoint, 1); assert.equal(nativeRows(ctx).length, 3);
  assert.equal(db.prepare("SELECT allowed FROM native_authority WHERE id='owner'").get().allowed, 1);
  db.exec('DROP TRIGGER revoke_on_completion'); assert.equal((await resumeImport(job.id, ctx)).state, 'completed');
});
test('native replacements restore full before-images after validated partial reversal', async t => {
  const { ctx } = nativeSetup(t), db = ctx.storage.database;
  const before = { destination: ctx.destination, targetKind: 'article', targetId: '0', revision: 'native-original', value: { title: 'Existing', body: 'Original body' } };
  nativeTargets.write(db, before);
  const { nativeMapping } = await import('./operation-native-fixtures.ts');
  const { job } = await nativeJob(ctx, { version: 'v1', map: source => {
    const mapped = nativeMapping.map(source);
    if (source.sourceId === '0') mapped.effects[0].expectedRevision = before.revision;
    return mapped;
  } });
  await applyImportBatches(job, ctx); ctx.maxBatches = 1; await undoImport(job.id, ctx); delete ctx.maxBatches;
  await resumeImport(job.id, ctx); assert.deepEqual(nativeRows(ctx), [before]);
});
