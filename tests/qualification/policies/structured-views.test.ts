import {formCase} from './form-case';
import {dashboardCase} from './dashboard-case';
import { test, expect, beforeEach } from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';

// Every policy case owns one installation, including variants inside a matrix.
beforeEach(resetDeployment);
import { scenario, profile, key, rows, textBlock } from './helpers';
import { createDatabase, saveField, createRecord, setStructureLock } from '../../../src/core/features/databases/service';
import { saveView, queryView, chart, listViews, type View } from '../../../src/core/features/databases/views';
import { openRecord, updateRecord } from '../../../src/core/features/databases/records';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { replaceBlocks } from '../../../src/core/features/editor/service';
import { listComments, createComment } from '../../../src/core/features/comments/service';
import { revisionHistory } from '../../../src/core/features/versions/service';
const view = (id: string): View => ({ id, name: id, layout: 'table', filters: [], sorts: [], groups: [], calculations: {}, display: {}, position: 0 });
test('DB-003 DB-004 DB-005 DB-006 DB-007 DB-008 DB-009 DB-011 DB-013 DB-014: layouts and aggregate/filter/group/chart boundaries change only views and use reader authorized records', async () => {
    const { owner, reader, containerId } = await scenario();
    const db = await createDatabase(owner, { operationKey: key('db'), containerId, title: 'Read scope' });
    let revision = db.receipt.revisionId;
    for (const field of [{ id: 'score', name: 'Score', type: 'number' as const, position: 0, config: {} }, { id: 'status', name: 'Status', type: 'status' as const, position: 1, config: { options: ['Open', 'Done', 'Empty'] } }, { id: 'date', name: 'Date', type: 'date' as const, position: 2, config: {} }])
        revision = (await saveField(owner, db.value.id, { operationKey: key('field'), expectedRevisionId: revision, field })).receipt.revisionId;
    const records = [];
    for (const [title, score, status] of [['First', 2, 'Open'], ['Second', 8, 'Done'], ['Hidden', 1000, 'Open']] as const)
        records.push(await createRecord(owner, db.value.id, { operationKey: key('record'), title, values: { score, status, date: '2026-09-29' } }));
    await saveGrant(owner, { operationKey: key('reader-db'), targetKind: 'page', targetId: db.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    // A restricted draft is an explicit labelled test fixture; hidden arithmetic must not leak.
    await owner.db.prepare("UPDATE pages SET lifecycle='draft',access_inheritance='restricted' WHERE id=?").bind(records[2].value.pageId).run();
    const before = await rows('SELECT * FROM database_records WHERE database_id=? ORDER BY page_id', db.value.id);
    for (const [position, layout] of (['table', 'board', 'list', 'gallery', 'calendar', 'timeline'] as const).entries()) {
        const v = { ...view(`layout-${layout}`), layout, position, sorts: [{ field: 'score', direction: 'desc' as const }], groups: [{ field: 'status', hideEmpty: false }], calculations: { score: 'sum' }, display: { dateField: 'date' } };
        revision = (await saveView(owner, db.value.id, { operationKey: key('view'), expectedRevisionId: revision, view: v })).receipt.revisionId;
        const q = await queryView(reader, db.value.id, v.id);
        expect(q.records.map(r => r.title)).toEqual(['Second', 'First']);
        expect(q.calculations.score).toBe(10);
        expect(q.groups[0].groups).toContainEqual({ value: 'Empty', count: 0, pageIds: [] });
        expect(q.records.map(r => r.pageId)).not.toContain(records[2].value.pageId);
    }
    expect(await rows('SELECT * FROM database_records WHERE database_id=? ORDER BY page_id', db.value.id)).toEqual(before);
    const filtered = { ...view('filtered'), position: 6, filters: [{ or: [{ field: 'score', op: 'lt' as const, value: 3 }, { field: 'status', op: 'eq' as const, value: 'Missing' }] }], calculations: { score: 'sum' } };
    revision = (await saveView(owner, db.value.id, { operationKey: key('filter'), expectedRevisionId: revision, view: filtered })).receipt.revisionId;
    expect((await queryView(reader, db.value.id, 'filtered')).records.map(r => r.title)).toEqual(['First']);
    expect((await chart(reader, db.value.id, 'filtered', 'status', 'score', 'sum')).series).toEqual([{ label: 'Open', value: 2 }]);
    for (const [operation, result] of Object.entries({ count: 2, filled: 2, empty: 0, sum: 10, average: 5, minimum: 2, maximum: 8, range: 6, percent: 100 })) {
        revision = (await saveView(owner, db.value.id, { operationKey: key('aggregate'), expectedRevisionId: revision, view: { ...view('calc'), position: 7, calculations: { score: operation } } })).receipt.revisionId;
        expect((await queryView(reader, db.value.id, 'calc')).calculations.score).toBe(result);
    }
    const embedded = await queryView(reader, db.value.id, 'layout-table', { pageId: db.value.pageId, filters: [{ field: 'status', op: 'eq', value: 'Done' }], sorts: [{ field: 'score', direction: 'asc' }] });
    expect(embedded.records.map(r => r.title)).toEqual(['Second']);
    expect((await queryView(reader, db.value.id, 'layout-table')).records).toHaveLength(2);
    const locked = await setStructureLock(owner, db.value.id, { operationKey: key('lock'), expectedRevisionId: revision, locked: true });
    await expect(saveView(owner, db.value.id, { operationKey: key('locked-view'), expectedRevisionId: locked.receipt.revisionId, view: view('denied') })).rejects.toMatchObject({ code: 'STRUCTURE_LOCKED' });
    await updateRecord(owner, records[0].value.pageId, { operationKey: key('locked-record'), expectedRevisionId: records[0].receipt.revisionId, values: { score: 4 } });
    expect((await queryView(reader, db.value.id, 'calc')).calculations.score).toBe(100);
    await dashboardCase(owner, reader, containerId);
    await formCase();
});
test("DB-001 DB-010 DB-012 REV-002: both record parity profiles retain body, comments and immutable field revisions on profile round trip", async () => {
    for (const parity of ['record-is-page', 'record-is-row'] as const) {
        await resetDeployment();
        const { owner, containerId } = await scenario();
        const db = await createDatabase(owner, { operationKey: key('db'), containerId, title: 'Records' });
        const record = await createRecord(owner, db.value.id, { operationKey: key('record'), title: 'Rich record', values: {} });
        const id = record.value.pageId;
        const body = await replaceBlocks(owner, id, { operationKey: key('body'), expectedRevisionId: record.receipt.revisionId, blocks: [textBlock(key('block'), 'Persistent body')] });
        await createComment(owner, id, { operationKey: key('comment'), body: [{ text: 'Persistent comment' }] });
        const before = await rows('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id', id);
        for (const value of [parity, parity === 'record-is-page' ? 'record-is-row' : 'record-is-page', parity] as const) {
            await profile(owner, { 'record.page-parity.v1': value });
            const opened = await openRecord(owner, id);
            expect(opened.parity).toBe(value);
            expect(opened.presentation.body).toBe(value === 'record-is-page');
            expect(opened.page.blocks[0].content).toEqual({ text: [{ text: 'Persistent body' }] });
            expect((await listComments(owner, id)).comments[0].body).toEqual([{ text: 'Persistent comment' }]);
            expect(await rows('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id', id)).toEqual(before);
            expect((await revisionHistory(owner, id)).some(r => r.id === body.receipt.revisionId)).toBe(true);
        }
    }
});
test('DB-003 DB-004 DB-005 DB-009: edit, duplicate and delete views preserve records; missing grouping/date fields give actionable errors', async () => {
    const { owner, containerId } = await scenario();
    const db = await createDatabase(owner, { operationKey: key('database'), containerId, title: 'View lifecycle' });
    let revision = db.receipt.revisionId;
    const record = await createRecord(owner, db.value.id, { operationKey: key('record'), title: 'Unaffected', values: {} });
    for (const layout of ['board', 'calendar', 'timeline'] as const)
        await expect(saveView(owner, db.value.id, { operationKey: key('missing-field'), expectedRevisionId: revision, view: { ...view(layout), layout } })).rejects.toMatchObject({ code: 'FIELD_REQUIRED', status: 400 });
    const original = { ...view('first-view'), name: 'Original' };
    revision = (await saveView(owner, db.value.id, { operationKey: key('first'), expectedRevisionId: revision, view: original })).receipt.revisionId;
    const duplicate = { ...original, id: 'second-view', name: 'Copy', position: 1 };
    revision = (await saveView(owner, db.value.id, { operationKey: key('copy'), expectedRevisionId: revision, view: duplicate })).receipt.revisionId;
    expect((await listViews(owner, db.value.id)).map(v => v.name)).toEqual(['Original', 'Copy']);
    revision = (await saveView(owner, db.value.id, { operationKey: key('rename'), expectedRevisionId: revision, view: { ...duplicate, name: 'Renamed' } })).receipt.revisionId;
    await saveView(owner, db.value.id, { operationKey: key('delete'), expectedRevisionId: revision, view: original, delete: true });
    expect((await listViews(owner, db.value.id)).map(v => v.name)).toEqual(['Renamed']);
    expect((await openRecord(owner, record.value.pageId)).page.page.title).toBe('Unaffected');
});
test('DB-010: row profile excludes records from page tree while restoring page profile returns identical stored record', async () => {
    const { listPages } = await import('../../../src/core/features/pages/tree');
    const { owner, containerId } = await scenario();
    const db = await createDatabase(owner, { operationKey: key('db'), containerId, title: 'Parity tree' });
    const record = await createRecord(owner, db.value.id, { operationKey: key('record'), title: 'Parity record', values: {} });
    expect((await listPages(owner, containerId)).items.map(p => p.id)).toContain(record.value.pageId);
    await profile(owner, { 'record.page-parity.v1': 'record-is-row' });
    expect((await listPages(owner, containerId)).items.map(p => p.id)).not.toContain(record.value.pageId);
    await profile(owner, { 'record.page-parity.v1': 'record-is-page' });
    expect((await listPages(owner, containerId)).items.map(p => p.id)).toContain(record.value.pageId);
});
