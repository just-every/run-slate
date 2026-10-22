import {env} from 'cloudflare:test';
import {beforeEach, expect, test} from 'vitest';
import {fixture, reset, document} from '../authority/fixture';
import {startImport, runImport, readImport} from '../../../src/core/features/imports/jobs';
import {archivePage, permanentDeletePage} from '../../../src/core/features/archive/service';
import {faultR2} from '../portability-jobs/helpers';
import {freshRestore, nativeExport, storedText} from './helpers';

beforeEach(reset);

test('Erasure ARCH-006 BASE-DATA-003 PORT-001 PORT-002: append filename erasure survives fresh restore/re-export with or without cleanup failure', async () => {
 let firstCase=true;
 for (const cleanupFailure of [false, true]){
 if(!firstCase)await reset();
 firstCase=false;

  const f = await fixture(), ctx = f.context();
  const erasedName = `q11-private-${crypto.randomUUID()}.txt`;
  const keptName = `q11-retained-${crypto.randomUUID()}.txt`;
  const erased = await document(f, 'Page to erase'), kept = await document(f, 'Page to retain');
  async function append(pageId: string, name: string) {
    const expectedRevisionId = await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(pageId).first<string>('revision_id');
    const job = await startImport(ctx, {operationKey: crypto.randomUUID(), format: 'text', source: {name, bytes: new TextEncoder().encode(`Payload for ${name}`)}, destination: {pageId, expectedRevisionId: expectedRevisionId!, mode: 'append'}});
    await runImport(ctx, job.id);
    return readImport(ctx, job.id);
  }
  const erasedImport = await append(erased.id, erasedName), keptImport = await append(kept.id, keptName);
  const keptRevisions = (await env.DB.prepare("SELECT * FROM core_entity_revisions WHERE entity_kind='import' AND entity_id=? ORDER BY id").bind(keptImport.id).all()).results;
  const revisions = (await env.DB.prepare("SELECT id FROM core_entity_revisions WHERE entity_kind='import' AND entity_id=? ORDER BY id").bind(erasedImport.id).all<{id: string}>()).results;
  expect(revisions).toHaveLength(2);
  expect(await storedText(ctx.db)).toContain(erasedName);
  expect((await env.DB.prepare('SELECT * FROM federation_import_mappings WHERE import_job_id=?').bind(erasedImport.id).all()).results).toEqual([]);
  const before = await nativeExport(ctx);
  expect(before.text).toContain(erasedName);
  expect(before.text).toContain(keptName);
  const expectedRevisionId = await env.DB.prepare('SELECT revision_id FROM pages WHERE id=?').bind(erased.id).first<string>('revision_id');
  await archivePage(ctx, erased.id, {operationKey: crypto.randomUUID(), expectedRevisionId: expectedRevisionId!, action: 'trash'});
  const input = {operationKey: crypto.randomUUID(), confirmedPageIds: [erased.id]};
  if (cleanupFailure) {
    await expect(permanentDeletePage(faultR2(ctx, 'delete'), erased.id, input)).rejects.toMatchObject({code: 'ERASURE_PENDING'});
    expect(await storedText(ctx.db)).not.toContain(erasedName);
    expect(await ctx.files.head(erasedImport.archive_key)).not.toBeNull();
    expect(await ctx.db.prepare('SELECT count(*) n FROM content_media_cleanup').first<number>('n')).toBeGreaterThan(0);
  }
  const result = await permanentDeletePage(ctx, erased.id, input);
  expect((await permanentDeletePage(ctx, erased.id, input)).value).toEqual(result.value);
  expect(await storedText(ctx.db)).not.toContain(erasedName);
  expect(await storedText(ctx.db)).toContain(keptName);
  expect((await env.DB.prepare("SELECT * FROM core_entity_revisions WHERE entity_kind='import' AND entity_id=? ORDER BY id").bind(keptImport.id).all()).results).toEqual(keptRevisions);
  expect((await env.DB.prepare("SELECT id FROM core_entity_revisions WHERE entity_kind='import' AND entity_id=? ORDER BY id").bind(erasedImport.id).all()).results).toEqual(revisions);
  expect(await ctx.files.head(erasedImport.archive_key)).toBeNull();
  expect(await ctx.files.head(keptImport.archive_key)).not.toBeNull();
  expect((await ctx.db.prepare('SELECT * FROM content_media_cleanup').all()).results).toEqual([]);
  const exported = await nativeExport(ctx);
  expect(exported.text).not.toContain(erasedName);
  expect(exported.text).toContain(keptName);
  const restored = await freshRestore(ctx, exported.bytes);
  expect(await storedText(restored.db)).not.toContain(erasedName);
  expect(await storedText(restored.db)).toContain(keptName);
  expect(await restored.db.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(kept.id).first()).toEqual({title: 'Page to retain', deleted_at: null});
  const key = await restored.db.prepare('SELECT archive_key FROM federation_imports WHERE id=?').bind(keptImport.id).first<string>('archive_key');
  expect(await (await restored.files.get(key!))!.text()).toBe(`Payload for ${keptName}`);
  const reexported = await nativeExport(restored);
  expect(reexported.text).not.toContain(erasedName);
  expect(reexported.text).toContain(keptName);
  expect((await restored.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
 }
});
