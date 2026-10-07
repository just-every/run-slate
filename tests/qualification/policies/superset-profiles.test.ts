import { test, expect } from 'vitest';
import { scenario, profile, key, rows, textBlock } from './helpers';
import { createPage, readPage } from '../../../src/core/features/pages/service';
import { createDatabase, createRecord, saveField } from '../../../src/core/features/databases/service';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { publishPage } from '../../../src/core/features/lifecycle/service';
import { publishPublicPage } from '../../../src/core/features/publishing/service';
import { setStatusEntry, setPageStatus } from '../../../src/core/features/page-status/service';
import { saveTemplate } from '../../../src/core/features/templates/service';
import { saveRule } from '../../../src/core/features/automation/service';
import { createComment } from '../../../src/core/features/comments/service';
import { readWorkspace } from '../../../src/core/features/workspace/settings';

const defaults = { 'page.lifecycle.v1': 'always-live', 'page.access.v1': 'workspace-general', 'page.public-access.v1': 'site', 'page.version.v1': 'autosnapshot', 'page.status.v1': 'verification-only', 'container.access.v1': 'class-led', 'record.page-parity.v1': 'record-is-page', 'automation.scope.v1': 'source' } as const;
const alternatives = { 'page.lifecycle.v1': 'draft-then-publish', 'page.access.v1': 'container-general', 'page.public-access.v1': 'link', 'page.version.v1': 'labelled', 'page.status.v1': 'open-vocabulary', 'container.access.v1': 'grant-led', 'record.page-parity.v1': 'record-is-row', 'automation.scope.v1': 'container' } as const;

test('LIFE-006 SHARE-005 WEB-007 REV-007 STAT-005 CONT-008 DB-010 AUTO-005: preexisting rich superset survives both profile directions with second actor reload', async () => {
    const { owner, reader, containerId } = await scenario();
    await profile(owner, alternatives);
    const live = await createPage(owner, { operationKey: key('live'), containerId, title: 'Labelled content', blocks: [textBlock(key('body'), 'Preserved authored body')] });
    const draft = await createPage(owner, { operationKey: key('draft'), containerId, title: 'Private retained draft' });
    const published = await publishPage(owner, live.value.pageId, { operationKey: key('publish'), expectedRevisionId: live.receipt.revisionId, label: 'Permanent label' });
    await saveGrant(owner, { operationKey: key('reader'), targetKind: 'page', targetId: live.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    await createComment(owner, live.value.pageId, { operationKey: key('comment'), body: [{ text: 'Permanent discussion' }] });
    await publishPublicPage(owner, live.value.pageId, { operationKey: key('public'), expectedRevisionId: published.receipt.revisionId, host: 'localhost', slug: `superset-${live.value.pageId}`, theme: 'dark', headerControls: [], duplicateAsTemplate: true });
    await setStatusEntry(owner, { operationKey: key('status'), key: 'retained', label: 'Retained status', color: '#112233', requiresVerification: false });
    await setPageStatus(owner, live.value.pageId, { operationKey: key('set-status'), expectedRevisionId: published.receipt.revisionId, statusKey: 'retained' });
    await saveTemplate(owner, { operationKey: key('template'), sourcePageId: live.value.pageId, includeChildren: false, containerId, title: 'Retained template', description: 'Profile superset', category: 'Reference' });
    const database = await createDatabase(owner, { operationKey: key('database'), containerId, title: 'Retained database' });
    await saveField(owner, database.value.id, { operationKey: key('field'), expectedRevisionId: database.receipt.revisionId, field: { id: 'number', name: 'Number', type: 'number', position: 0, config: {} } });
    const record = await createRecord(owner, database.value.id, { operationKey: key('record'), title: 'Retained row body', values: { number: 42 } });
    for (const scope of ['source', 'container', 'site'] as const) {
        await profile(owner, { 'automation.scope.v1': scope });
        await saveRule(owner, { operationKey: key('rule'), name: `Retained ${scope}`, scope, ...(scope === 'source' ? { sourceDatabaseId: database.value.id } : scope === 'container' ? { containerId } : {}), trigger: { event: 'record-created' }, conditions: [], actions: [{ type: 'comment', body: 'Future local action' }] });
    }
    const tables = ['pages', 'page_blocks', 'page_revisions', 'page_grants', 'containers', 'container_grants', 'public_exposures', 'status_entries', 'database_records', 'database_fields', 'automation_rules', 'automation_runs', 'knowledge_templates', 'comments'];
    const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, await rows(`SELECT * FROM ${table} ORDER BY 1`)])));
    const before = await snapshot();
    for (const values of [defaults, alternatives, { ...alternatives, 'automation.scope.v1': 'site' } as const, defaults, alternatives]) {
        await profile(owner, values);
        expect((await readWorkspace(owner)).policies).toEqual(values);
        expect(await snapshot()).toEqual(before);
        expect((await readPage({ ...reader }, live.value.pageId)).page.title).toBe('Labelled content');
        await expect(readPage({ ...reader }, draft.value.pageId)).rejects.toMatchObject({ status: 404 });
        expect((await readPage(owner, record.value.pageId)).properties.databaseFields).toEqual({ number: 42 });
    }
});
