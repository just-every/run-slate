import {faultR2} from '../portability-jobs/helpers';
import {freshRestore, nativeExport} from './helpers';
import {env} from 'cloudflare:test';
import {beforeEach, expect, test} from 'vitest';
import {fixture, reset, document} from '../authority/fixture';
import {startImport, runImport, readImport} from '../../../src/core/features/imports/jobs';
import {archivePage, permanentDeletePage} from '../../../src/core/features/archive/service';
import {removeMember} from '../../../src/core/features/workspace/members';
import {storedText} from './helpers';

beforeEach(reset);

test("Erasure ARCH-006 BASE-DATA-003 PORT-001 PORT-002: atomic page and member custody erasure survives cleanup failure, restore and re-export", async () => {
 await scenario("Erasure ARCH-006 BASE-DATA-003: mapped and queued import metadata shares the atomic erasure/cleanup transaction", async () => {
  const f = await fixture(), ctx = f.context(), name = `q11-mapped-${crypto.randomUUID()}`;
  const parent = await document(f, 'Retained destination');
  const parentRevision = await ctx.db.prepare('SELECT revision_id FROM pages WHERE id=?').bind(parent.id).first<string>('revision_id');
  const imported = await startImport(ctx, {operationKey: crypto.randomUUID(), format: 'text', source: {name: `${name}.txt`, bytes: new TextEncoder().encode('Child document')}, destination: {pageId: parent.id, expectedRevisionId: parentRevision!, mode: 'children'}});
  await runImport(ctx, imported.id);
  const mapped = await readImport(ctx, imported.id);
  const page = (await ctx.db.prepare("SELECT target_id id FROM federation_import_mappings WHERE import_job_id=? AND target_kind='page'").bind(imported.id).first<{id: string}>())!;
  const revisionId = await ctx.db.prepare('SELECT revision_id FROM pages WHERE id=?').bind(page.id).first<string>('revision_id');
  const queuedName = `q11-queued-${crypto.randomUUID()}.txt`;
  const queued = await startImport(ctx, {operationKey: crypto.randomUUID(), format: 'text', source: {name: queuedName, bytes: new TextEncoder().encode('Queued private document')}, destination: {pageId: page.id, expectedRevisionId: revisionId!, mode: 'append'}});
  const queuedImport = await readImport(ctx, queued.id);
  await archivePage(ctx, page.id, {operationKey: crypto.randomUUID(), expectedRevisionId: revisionId!, action: 'trash'});
  const before = await storedText(ctx.db), input = {operationKey: crypto.randomUUID(), confirmedPageIds: [page.id]};
  // Fail a later canonical write in the REAL D1 transaction, after metadata redaction.
  await ctx.db.prepare("CREATE TRIGGER q11_erasure_abort BEFORE UPDATE OF deleted_at ON pages BEGIN SELECT RAISE(ABORT,'Erasure labelled erasure failure'); END").run();
  try {
    await expect(permanentDeletePage(ctx, page.id, input)).rejects.toThrow('Erasure labelled erasure failure');
    expect(await storedText(ctx.db)).toBe(before);
    expect(await ctx.files.head(mapped!.archive_key)).not.toBeNull();
    expect(await ctx.files.head(queuedImport.archive_key)).not.toBeNull();
  } finally {
    await ctx.db.prepare('DROP TRIGGER q11_erasure_abort').run();
  }
  expect((await permanentDeletePage(ctx, page.id, input)).value.deletedPageIds).toEqual([page.id]);
  const after = await storedText(ctx.db);
  expect(after).not.toContain(name);
  expect(after).not.toContain(queuedName);
  for (const id of [mapped!.id, queued.id]) {
    const history = (await ctx.db.prepare("SELECT content_json,content_hash,author_member_id FROM core_entity_revisions WHERE entity_kind='import' AND entity_id=?").bind(id).all()).results;
    expect(history.length).toBeGreaterThan(0);
    expect(history.every(row => row.content_json === '{}' && row.content_hash === '' && row.author_member_id === null)).toBe(true);
    expect((await readImport(ctx, id)).state).toBe('deleted');
  }
  expect(await ctx.files.head(mapped!.archive_key)).toBeNull();
  expect(await ctx.files.head(queuedImport.archive_key)).toBeNull();
  expect((await env.DB.prepare('SELECT * FROM content_media_cleanup').all()).results).toEqual([]);

 });
 await reset();
 await scenario("Erasure BASE-DATA-003: member erasure clears retained import custody without erasing another member import", async () => {
  const f = await fixture(), ctx = f.context();
  const erasedName = `q11-member-${crypto.randomUUID()}.txt`, keptName = `q11-owner-${crypto.randomUUID()}.txt`;
  async function stage(memberId: string, name: string) {
    const actor = f.context(memberId);
    const job = await startImport(actor, {operationKey: crypto.randomUUID(), format: 'text', source: {name, bytes: new TextEncoder().encode('Pending import original')}});
    return readImport(actor, job.id);
  }
  const erased = await stage(f.reader, erasedName), kept = await stage(f.owner, keptName);
  expect(await storedText(ctx.db)).toContain(erasedName);
  expect((await removeMember(ctx, {operationKey: crypto.randomUUID(), memberId: f.reader, erase: true})).value.erased).toBe(true);
  expect(await storedText(ctx.db)).not.toContain(erasedName);
  expect(await storedText(ctx.db)).toContain(keptName);
  expect(await ctx.files.head(erased.archive_key)).toBeNull();
  expect(await ctx.files.head(kept.archive_key)).not.toBeNull();
  expect((await readImport(ctx, kept.id)).state).toBe('queued');
  expect(await ctx.db.prepare('SELECT state,filename FROM federation_imports WHERE id=?').bind(erased.id).first()).toEqual({state: 'deleted', filename: 'Erased original archive'});

 });
 await reset();
 await scenario("Erasure ARCH-006 BASE-DATA-003 PORT-001 PORT-002: append filename erasure survives fresh restore/re-export with or without cleanup failure", async () => {
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
});

async function scenario(name: string, run: () => Promise<void>) {
  try { await run(); }
  catch (cause) { throw new Error(`Scenario ${name} failed`, { cause }); }
}
