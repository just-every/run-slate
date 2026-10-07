import { env } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { scenario, profile, key, rows } from './helpers';
import { startImport, runImport } from '../../../src/core/features/imports/jobs';
import { readPage } from '../../../src/core/features/pages/service';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { readWorkspace } from '../../../src/core/features/workspace/settings';
const defaults = { 'page.lifecycle.v1': 'always-live', 'page.access.v1': 'workspace-general', 'page.public-access.v1': 'site', 'page.version.v1': 'autosnapshot', 'page.status.v1': 'verification-only', 'container.access.v1': 'class-led', 'record.page-parity.v1': 'record-is-page', 'automation.scope.v1': 'source' } as const;
const alternatives = { 'page.lifecycle.v1': 'draft-then-publish', 'page.access.v1': 'container-general', 'page.public-access.v1': 'link', 'page.version.v1': 'labelled', 'page.status.v1': 'open-vocabulary', 'container.access.v1': 'grant-led', 'record.page-parity.v1': 'record-is-row', 'automation.scope.v1': 'container' } as const;
for (const [format, name] of [['notion-workspace', 'notion-workspace-export.zip'], ['confluence-space', 'confluence-space-export.zip'], ['google-docx', 'google-docs-download.docx'], ['docx', 'word-government-impact-assessment.docx']] as const)
    test(`LIFE-006 SHARE-005 WEB-007 REV-007 STAT-005 CONT-008 DB-010 AUTO-005: genuine ${format} stored superset is byte-identical across all 17 policy values`, async () => {
        const { owner, reader } = await scenario();
        const bytes = new Uint8Array(await (await (env as typeof env & {
            TEST_IMPORT_FIXTURES: Fetcher;
        }).TEST_IMPORT_FIXTURES.fetch(`https://fixtures/${name}`)).arrayBuffer());
        expect(bytes.length).toBeGreaterThan(1000);
        const job = await startImport(owner, { operationKey: key('genuine-import'), format, source: { name, bytes } });
        const result = await runImport(owner, job.id);
        expect(result.state).toBe('completed');
        expect(JSON.parse(result.counts_json).pages).toBeGreaterThan(0);
        const tables = ['pages', 'page_blocks', 'page_revisions', 'page_grants', 'containers', 'container_grants', 'public_exposures', 'status_entries', 'database_records', 'database_fields', 'automation_rules', 'automation_runs'];
        const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await rows(`SELECT * FROM ${table} ORDER BY 1`)])));
        const originals = await rows('SELECT id FROM pages WHERE workspace_id=? ORDER BY id', owner.actor.workspaceId);
        // This labelled share is applied to an actual imported page; it does not replace any imported content.
        await saveGrant(owner, { operationKey: key('import-reader'), targetKind: 'page', targetId: originals[0].id as string, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
        const readerBefore = await readPage(reader, originals[0].id as string);
        const before = await snapshot();
        const docs = await Promise.all(originals.map(p => readPage(owner, p.id as string)));
        for (const values of [alternatives, { 'automation.scope.v1': 'site' } as const, defaults, alternatives, defaults]) {
            await profile(owner, values);
            const current = await readWorkspace(owner);
            for (const [id, value] of Object.entries(values))
                expect(current.policies[id as keyof typeof current.policies]).toBe(value);
            expect(await snapshot()).toEqual(before);
            const readerAfter = await readPage({ ...reader }, originals[0].id as string);
            expect(readerAfter.blocks).toEqual(readerBefore.blocks);
            expect(readerAfter.properties).toEqual(readerBefore.properties);
            for (let i = 0; i < originals.length; i++) {
                const page = await readPage(owner, originals[i].id as string);
                expect(page.blocks).toEqual(docs[i].blocks);
                expect(page.properties).toEqual(docs[i].properties);
                expect(page.page.lifecycle).toBe(docs[i].page.lifecycle);
            }
        }
        expect(await (await owner.files.get(result.archive_key))!.arrayBuffer()).toEqual(bytes.buffer);
        expect((await runImport(owner, job.id)).state).toBe('completed');
        expect(await snapshot()).toEqual(before);
    });
