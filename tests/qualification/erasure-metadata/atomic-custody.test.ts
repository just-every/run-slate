import {env} from 'cloudflare:test';
import {beforeEach, expect, test} from 'vitest';
import {fixture, reset, document} from '../authority/fixture';
import {startImport, runImport, readImport} from '../../../src/core/features/imports/jobs';
import {archivePage, permanentDeletePage} from '../../../src/core/features/archive/service';
import {removeMember} from '../../../src/core/features/workspace/members';
import {storedText} from './helpers';

beforeEach(reset);

test('Erasure ARCH-006 BASE-DATA-003: mapped and queued import metadata shares the atomic erasure/cleanup transaction', async () => {
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

test('Erasure BASE-DATA-003: member erasure clears retained import custody without erasing another member import', async () => {
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
