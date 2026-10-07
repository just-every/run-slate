import { test, expect } from 'vitest';
import { scenario, key, rows } from './helpers';
import { createDatabase, saveField, createRecord } from '../../../src/core/features/databases/service';
import { openRecord, updateRecord } from '../../../src/core/features/databases/records';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { uploadMedia } from '../../../src/core/features/media/service';
import { createPage } from '../../../src/core/features/pages/service';
import type { Field } from '../../../src/core/features/databases/values';
test('DB-002 REV-001: every persisted field type, atomic invalid multi-field edits and loss-bearing type changes', async () => {
    const { owner, containerId } = await scenario();
    const db = await createDatabase(owner, { operationKey: key('db'), containerId, title: 'Typed schema' });
    let revision = db.receipt.revisionId;
    const target = await createRecord(owner, db.value.id, { operationKey: key('target'), title: 'Relation target', values: {} });
    const filePage = await createPage(owner, { operationKey: key('file-page'), containerId, title: 'Files' });
    const file = await uploadMedia(owner, { operationKey: key('file'), pageId: filePage.value.pageId, name: 'proof.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('Actual R2') });
    const definitions: Field[] = [['text', {}], ['number', {}], ['checkbox', {}], ['date', {}], ['select', { options: ['One', 'Two'] }], ['multi-select', { options: ['One', 'Two'] }], ['status', { options: ['Open', 'Done'] }], ['person', {}], ['file', {}], ['url', {}], ['email', {}], ['phone', {}], ['place', {}], ['relation', { databaseId: db.value.id }], ['rollup', { relationField: 'relation', targetField: 'number', calculation: 'sum' }], ['formula', { expression: { op: 'add', args: [{ field: 'number' }, { literal: 2 }] } }], ['created-at', {}], ['updated-at', {}], ['identifier', {}]].map(([type, config], position) => ({ id: type as string, name: type as string, type: type as Field['type'], config: config as Record<string, unknown>, position }));
    for (const field of definitions)
        revision = (await saveField(owner, db.value.id, { operationKey: key('field'), expectedRevisionId: revision, field })).receipt.revisionId;
    const values = { text: 'Words', number: 5, checkbox: true, date: '2026-09-29', select: 'One', 'multi-select': ['One', 'Two'], status: 'Open', person: [owner.actor.id], file: [file.value.id], url: 'https://example.com/path', email: 'test@example.com', phone: '+61 12345', place: 'Brisbane', relation: [target.value.pageId] };
    const record = await createRecord(owner, db.value.id, { operationKey: key('record'), title: 'All types', values });
    const opened = await openRecord(owner, record.value.pageId);
    expect(opened.values).toMatchObject({ ...values, formula: 7, identifier: record.value.pageId });
    expect(opened.fields.map(f => f.type)).toEqual(definitions.map(f => f.type));
    expect(opened.fields.filter(f => f.readOnly).map(f => f.type)).toEqual(['rollup', 'formula', 'created-at', 'updated-at', 'identifier']);
    const before = await rows('SELECT * FROM database_records WHERE page_id=?', record.value.pageId);
    await expect(updateRecord(owner, record.value.pageId, { operationKey: key('invalid-atomic'), expectedRevisionId: record.receipt.revisionId, values: { text: 'Must roll back', number: 'invalid' } })).rejects.toMatchObject({ code: 'INVALID_FIELD_VALUE' });
    expect(await rows('SELECT * FROM database_records WHERE page_id=?', record.value.pageId)).toEqual(before);
    await expect(saveField(owner, db.value.id, { operationKey: key('loss'), expectedRevisionId: revision, field: { ...definitions[0], type: 'number' } })).rejects.toMatchObject({ code: 'FIELD_DATA_LOSS' });
    expect((await openRecord(owner, record.value.pageId)).values.text).toBe('Words');
    await expect(updateRecord(owner, record.value.pageId, { operationKey: key('computed'), expectedRevisionId: record.receipt.revisionId, values: { formula: 999 } })).rejects.toMatchObject({ code: 'COMPUTED_FIELD' });
    const blank = await createRecord(owner, db.value.id, { operationKey: key('blank'), title: 'Empty fields', values: {} });
    const empty = await openRecord(owner, blank.value.pageId);
    for (const f of definitions.filter(f => !['formula', 'rollup', 'created-at', 'updated-at', 'identifier'].includes(f.type)))
        expect(empty.values[f.id] ?? null).toEqual(['relation', 'file'].includes(f.type) ? [] : null);
});
test('DB-002 DB-007 DB-008: reader-specific rollups and dependent formulas recompute after value edits and revoke without leaking hidden counts', async () => {
    const { owner, reader, containerId } = await scenario();
    const db = await createDatabase(owner, { operationKey: key('db'), containerId, title: 'Rollup access' });
    let revision = db.receipt.revisionId;
    const fs: Field[] = [{ id: 'amount', name: 'Amount', type: 'number', position: 0, config: {} }, { id: 'related', name: 'Related', type: 'relation', position: 1, config: { databaseId: db.value.id } }, { id: 'total', name: 'Total', type: 'rollup', position: 2, config: { relationField: 'related', targetField: 'amount', calculation: 'sum' } }, { id: 'double', name: 'Double', type: 'formula', position: 3, config: { expression: { op: 'multiply', args: [{ field: 'total' }, { literal: 2 }] } } }];
    for (const field of fs)
        revision = (await saveField(owner, db.value.id, { operationKey: key('field'), expectedRevisionId: revision, field })).receipt.revisionId;
    const a = await createRecord(owner, db.value.id, { operationKey: key('a'), title: 'Allowed', values: { amount: 3 } }), b = await createRecord(owner, db.value.id, { operationKey: key('b'), title: 'Restricted', values: { amount: 900 } }), summary = await createRecord(owner, db.value.id, { operationKey: key('summary'), title: 'Summary', values: { related: [a.value.pageId, b.value.pageId] } });
    for (const id of [a.value.pageId, summary.value.pageId])
        await saveGrant(owner, { operationKey: key('grant'), targetKind: 'page', targetId: id, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    expect((await openRecord(reader, summary.value.pageId)).values).toMatchObject({ related: [a.value.pageId], total: 3, double: 6 });
    expect((await openRecord(owner, summary.value.pageId)).values.total).toBe(903);
    const next = await updateRecord(owner, a.value.pageId, { operationKey: key('change'), expectedRevisionId: a.receipt.revisionId, values: { amount: 7 } });
    expect((await openRecord(reader, summary.value.pageId)).values.double).toBe(14);
    const [g] = await rows('SELECT id FROM page_grants WHERE page_id=? AND principal_id=?', a.value.pageId, reader.actor.id);
    await saveGrant(owner, { operationKey: key('revoke'), targetKind: 'page', targetId: a.value.pageId, id: g.id as string, principalKind: 'member', principalId: reader.actor.id, level: 'view', revoke: true });
    expect((await openRecord(reader, summary.value.pageId)).values).toMatchObject({ related: [], total: 0, double: 0 });
    await expect(saveField(owner, db.value.id, { operationKey: key('cycle'), expectedRevisionId: revision, field: { ...fs[3], config: { expression: { field: 'double' } } } })).rejects.toMatchObject({ code: 'FORMULA_CYCLE' });
});
