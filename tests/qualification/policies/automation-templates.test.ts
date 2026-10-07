import { test, expect } from 'vitest';
import { scenario, profile, key, rows, textBlock } from './helpers';
import { createDatabase, createRecord } from '../../../src/core/features/databases/service';
import { saveRule } from '../../../src/core/features/automation/service';
import { enqueueAutomationEvent, processAutomationJob } from '../../../src/core/features/automation/jobs';
import { archivePage } from '../../../src/core/features/archive/service';
import { createPage, readPage, updatePage } from '../../../src/core/features/pages/service';
import { createComment, listComments } from '../../../src/core/features/comments/service';
import { saveTemplate, applyTemplate, changeTemplate, previewTemplate, listTemplates } from '../../../src/core/features/templates/service';
import { saveGrant } from '../../../src/core/features/sharing/grants';
for (const scope of ['source', 'container', 'site'] as const)
    test(`AUTO-001 AUTO-002 AUTO-003 AUTO-004 AUTO-005: ${scope} acts once at current authority and retains scope/history through all profiles`, async () => {
        const { owner, containerId } = await scenario();
        await profile(owner, { 'automation.scope.v1': scope });
        const db = await createDatabase(owner, { operationKey: key('database'), containerId, title: 'Rules' });
        const p = await createRecord(owner, db.value.id, { operationKey: key('record'), title: 'Action target', values: {} });
        const definition = { name: `${scope} comment`, scope, ...(scope === 'source' ? { sourceDatabaseId: db.value.id } : scope === 'container' ? { containerId } : {}), trigger: { event: 'record-created' as const }, conditions: [], actions: [{ type: 'comment' as const, body: 'Applied once' }] };
        const rule = await saveRule(owner, { ...definition, operationKey: key('rule') });
        const event = { key: key('event'), event: 'record-created', pageId: p.value.pageId, databaseId: db.value.id, containerId };
        const queued = await enqueueAutomationEvent(owner, event);
        expect(queued.jobIds).toHaveLength(1);
        const adapters = { archive: (ctx: any, id: string, input: any) => archivePage(ctx, id, { ...input, action: 'archive' }), notify: async () => { throw Error('No provider configured in qualification'); } };
        expect((await processAutomationJob(owner, queued.jobIds[0], adapters))?.state).toBe('success');
        await processAutomationJob(owner, queued.jobIds[0], adapters);
        expect((await listComments(owner, p.value.pageId)).comments).toHaveLength(1);
        expect((await enqueueAutomationEvent(owner, event)).jobIds).toHaveLength(0);
        const before = await rows('SELECT * FROM automation_runs WHERE rule_id=? ORDER BY id', rule.value.id);
        expect(before.some(r => r.state === 'success')).toBe(true);
        expect(before.some(r => r.state === 'configuration-changed')).toBe(true);
        for (const policy of ['source', 'container', 'site'] as const) {
            await profile(owner, { 'automation.scope.v1': policy });
            expect(await rows('SELECT scope FROM automation_rules WHERE id=?', rule.value.id)).toEqual([{ scope }]);
            expect(await rows('SELECT * FROM automation_runs WHERE rule_id=? ORDER BY id', rule.value.id)).toEqual(before);
        }
        for (const type of ['publish', 'unpublish', 'verify', 'permanent-delete', 'sharing', 'members'])
            await expect(saveRule(owner, { ...definition, operationKey: key('forbidden'), actions: [{ type }] } as any)).rejects.toMatchObject({ code: 'FORBIDDEN_AUTOMATION_ACTION' });
        const pending = await enqueueAutomationEvent(owner, { ...event, key: key('revoked') });
        await owner.db.prepare("UPDATE members SET status='removed' WHERE id=?").bind(owner.actor.id).run();
        expect((await processAutomationJob(owner, pending.jobIds[0], adapters))?.state).toBe('failure');
        expect((await rows('SELECT * FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=?', p.value.pageId))).toHaveLength(1);
    });
test('TMPL-001 TMPL-002 TMPL-003 TMPL-004 TMPL-005 TMPL-006 REV-001: snapshot excludes live discussions/grants and survives source/template edits, scope changes, archive/restore/delete', async () => {
    const { owner, reader, containerId } = await scenario();
    const source = await createPage(owner, { operationKey: key('source'), containerId, title: 'Template root', blocks: [textBlock(key('block'), 'Exact authored content')], properties: { icon: '📘', labels: ['authored'] } });
    const child = await createPage(owner, { operationKey: key('child'), containerId, parentPageId: source.value.pageId, title: 'Authored child' });
    await createComment(owner, source.value.pageId, { operationKey: key('comment'), body: [{ text: 'Discussion must not copy' }] });
    await saveGrant(owner, { operationKey: key('grant'), targetKind: 'page', targetId: source.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    const template = await saveTemplate(owner, { operationKey: key('template'), sourcePageId: source.value.pageId, includeChildren: true, containerId, title: 'Manual starter', description: 'Written manual', category: 'Reference' });
    let revision = template.receipt.revisionId;
    const preview = await previewTemplate(owner, template.value.id);
    expect(JSON.stringify(preview.snapshot)).toContain('Exact authored content');
    expect(JSON.stringify(preview.snapshot)).toContain('Authored child');
    expect(JSON.stringify(preview.snapshot)).not.toContain('Discussion must not copy');
    expect((await listTemplates(owner, { query: 'not-a-template' })).emptyMessage).toBe('No templates match this search.');
    expect((await listTemplates(owner, { containerId, query: 'written', category: 'Reference' })).items.map(t => t.id)).toContain(template.value.id);
    expect((await listTemplates(owner)).items.map(t => t.id)).not.toContain(template.value.id);
    const input = { operationKey: key('apply'), containerId, expectedRevisionId: revision };
    const applied = await applyTemplate(owner, template.value.id, input);
    expect(await applyTemplate(owner, template.value.id, input)).toEqual(applied);
    expect(applied.value.pageIds).toHaveLength(2);
    expect((await listComments(owner, applied.value.pageId)).comments).toEqual([]);
    expect(await rows('SELECT * FROM page_grants WHERE page_id=?', applied.value.pageId)).toEqual([]);
    expect((await readPage(owner, applied.value.pageId)).properties.icon).toBe('📘');
    await updatePage(owner, source.value.pageId, { operationKey: key('source-edit'), expectedRevisionId: source.receipt.revisionId, properties: { title: 'Changed source' } });
    expect((await readPage(owner, applied.value.pageId)).page.title).toBe('Template root');
    for (const action of ['move', 'archive', 'restore', 'delete'] as const) {
        const changed = await changeTemplate(owner, template.value.id, { operationKey: key(action), expectedRevisionId: revision, action, containerId: null });
        revision = changed.receipt.revisionId;
        expect((await readPage(owner, applied.value.pageId)).blocks[0].content).toEqual({ text: [{ text: 'Exact authored content' }] });
        if (action === 'move')
            expect((await listTemplates(owner)).items.map(t => t.id)).toContain(template.value.id);
    }
    await expect(previewTemplate(owner, template.value.id)).rejects.toMatchObject({ status: 404 });
    expect((await readPage(owner, applied.value.pageId)).page.title).toBe('Template root');
});
test('AUTO-001 AUTO-003 AUTO-004: real source schedule executes one slot once; self-produced field event is throttled durably', async () => {
    const { runAutomationSchedule } = await import('../../../src/core/features/automation/jobs');
    const { runAutomationMaintenance } = await import('../../../src/core/features/automation/events');
    const { saveField } = await import('../../../src/core/features/databases/service');
    const { updateRecord, openRecord } = await import('../../../src/core/features/databases/records');
    const { owner, containerId } = await scenario();
    const db = await createDatabase(owner, { operationKey: key('db'), containerId, title: 'Scheduled rule' });
    await saveField(owner, db.value.id, { operationKey: key('field'), expectedRevisionId: db.receipt.revisionId, field: { id: 'loop-value', name: 'Value', type: 'number', position: 0, config: {} } });
    const record = await createRecord(owner, db.value.id, { operationKey: key('record'), title: 'Scheduled target', values: { 'loop-value': 1 } });
    await saveRule(owner, { operationKey: key('schedule'), name: 'Scheduled comment', scope: 'source', sourceDatabaseId: db.value.id, trigger: { event: 'schedule', startsAt: owner.now, intervalMinutes: 60 }, conditions: [], actions: [{ type: 'comment', body: 'Scheduled once' }] });
    const adapters = { archive: (ctx: any, id: string, input: any) => archivePage(ctx, id, { ...input, action: 'archive' }), notify: async () => { throw Error('No external provider'); } };
    await runAutomationSchedule(owner, adapters);
    await runAutomationSchedule(owner, adapters);
    expect((await listComments(owner, record.value.pageId)).comments).toHaveLength(1);
    const loop = await saveRule(owner, { operationKey: key('loop'), name: 'Bounded self loop', scope: 'source', sourceDatabaseId: db.value.id, trigger: { event: 'record-updated' }, conditions: [], actions: [{ type: 'edit-fields', values: { 'loop-value': 9 } }] });
    await updateRecord(owner, record.value.pageId, { operationKey: key('trigger'), expectedRevisionId: record.receipt.revisionId, values: { 'loop-value': 3 } });
    await runAutomationMaintenance(owner);
    await runAutomationMaintenance(owner);
    expect((await openRecord(owner, record.value.pageId)).values['loop-value']).toBe(9);
    const states = (await rows('SELECT state FROM automation_runs WHERE rule_id=?', loop.value.id)).map(r => r.state);
    expect(states.filter(s => s === 'success')).toHaveLength(1);
    expect(states.filter(s => s === 'throttled')).toHaveLength(1);
    await runAutomationMaintenance(owner);
    expect((await rows('SELECT state FROM automation_runs WHERE rule_id=?', loop.value.id)).map(r => r.state).sort()).toEqual(states.sort());
});
test('TMPL-004 TMPL-005: shipped template denies edit/delete, duplicate creates independently editable copy with no copied status/public grant', async () => {
    const { owner, containerId } = await scenario();
    const p = await createPage(owner, { operationKey: key('source'), containerId, title: 'Shipped source' });
    const template = await saveTemplate(owner, { operationKey: key('template'), sourcePageId: p.value.pageId, includeChildren: false, containerId: null, title: 'Shipped starter', description: '', category: 'Reference' });
    // Publisher fixture: the built-in template flag is not a member command.
    await owner.db.prepare('UPDATE knowledge_templates SET is_shipped=1 WHERE id=?').bind(template.value.id).run();
    await expect(changeTemplate(owner, template.value.id, { operationKey: key('delete-shipped'), expectedRevisionId: template.receipt.revisionId, action: 'delete' })).rejects.toMatchObject({ code: 'SHIPPED_TEMPLATE' });
    await expect(saveTemplate(owner, { operationKey: key('edit-shipped'), id: template.value.id, expectedRevisionId: template.receipt.revisionId, sourcePageId: p.value.pageId, includeChildren: false, containerId: null, title: 'Disallowed', description: '', category: 'Reference' })).rejects.toMatchObject({ code: 'SHIPPED_TEMPLATE' });
    const copy = await changeTemplate(owner, template.value.id, { operationKey: key('copy'), expectedRevisionId: template.receipt.revisionId, action: 'duplicate' });
    expect(copy.value.id).not.toBe(template.value.id);
    await saveTemplate(owner, { operationKey: key('edit-copy'), id: copy.value.id, expectedRevisionId: copy.receipt.revisionId, sourcePageId: p.value.pageId, includeChildren: false, containerId: null, title: 'Owner customized', description: '', category: 'Reference' });
    expect((await previewTemplate(owner, template.value.id)).title).toBe('Shipped starter');
    expect((await previewTemplate(owner, copy.value.id)).title).toBe('Owner customized');
});
test('AUTO-003 AUTO-004: no-action, condition-not-met, rate throttle and repeated local adapter failures retain distinguishable logs', async () => {
    const { ApiProblem } = await import('../../../src/core/app/problems');
    const { saveField } = await import('../../../src/core/features/databases/service');
    const { runLog } = await import('../../../src/core/features/automation/service');
    const { owner, containerId } = await scenario();
    const db = await createDatabase(owner, { operationKey: key('db'), containerId, title: 'Log states' });
    await saveField(owner, db.value.id, { operationKey: key('field'), expectedRevisionId: db.receipt.revisionId, field: { id: 'condition-value', name: 'Value', type: 'number', position: 0, config: {} } });
    const record = await createRecord(owner, db.value.id, { operationKey: key('record'), title: 'Log target', values: { 'condition-value': 1 } });
    const base = { scope: 'source' as const, sourceDatabaseId: db.value.id, trigger: { event: 'record-created' }, conditions: [], actions: [] };
    const adapters = { archive: (ctx: any, id: string, input: any) => archivePage(ctx, id, { ...input, action: 'archive' }), notify: async () => { throw new ApiProblem(400, 'LOCAL_ADAPTER_FAILURE', 'Labelled local adapter failure'); } };
    const definitions = [{ ...base, name: 'No effects', expected: 'no-action' }, { ...base, name: 'Condition false', conditions: [{ field: 'condition-value', op: 'gt' as const, value: 99 }], expected: 'condition-not-met' }];
    for (const definition of definitions) {
        const { expected, ...config } = definition;
        const rule = await saveRule(owner, { ...config, operationKey: key('rule') });
        const queued = await enqueueAutomationEvent(owner, { key: key('event'), ruleId: rule.value.id, event: 'record-created', pageId: record.value.pageId, databaseId: db.value.id, containerId });
        expect((await processAutomationJob(owner, queued.jobIds[0], adapters))?.state).toBe(expected);
        expect(JSON.stringify(await runLog(owner, rule.value.id))).toContain(expected);
    }
    const failing = await saveRule(owner, { ...base, operationKey: key('failure-rule'), name: 'Repeated local failure', actions: [{ type: 'notify', recipientMemberIds: [owner.actor.id], message: 'Local test' }] });
    for (let i = 0; i < 3; i++) {
        const queued = await enqueueAutomationEvent(owner, { key: key('failure-event'), ruleId: failing.value.id, event: 'record-created', pageId: record.value.pageId, databaseId: db.value.id, containerId });
        expect((await processAutomationJob(owner, queued.jobIds[0], adapters))?.state).toBe('failure');
    }
    expect((await rows('SELECT disabled_at,disabled_reason FROM automation_rules WHERE id=?', failing.value.id))[0]).toEqual({ disabled_at: owner.now, disabled_reason: 'Disabled after repeated failures.' });
    expect((await rows("SELECT id FROM automation_runs WHERE rule_id=? AND state='failure'", failing.value.id))).toHaveLength(3);
    const throttle = await saveRule(owner, { ...base, operationKey: key('throttle-rule'), name: 'Rate limit' });
    await enqueueAutomationEvent(owner, { key: key('throttle-event'), ruleId: throttle.value.id, event: 'record-created', pageId: record.value.pageId, databaseId: db.value.id, containerId }, { chainDepth: 5, runsPerMinute: 0, consecutiveFailures: 3, targetsPerRun: 100 });
    expect((await rows("SELECT state FROM automation_runs WHERE rule_id=? AND state='throttled'", throttle.value.id))).toHaveLength(1);
});
