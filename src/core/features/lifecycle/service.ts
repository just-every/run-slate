import {syncedGuards} from '../editor/synced/guards';
import {taskEffects} from '../work-items/effects';
import { prepareRestoreRecordValues } from '../databases/content-plan';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, pageGuard, snapshot, revisionStatement, contentEvent, writable, revisionRow } from '../pages/repository';
import { contentPolicy } from '../pages/policy';
import { anchorUpdates } from '../editor/service';
import { validateBlockTree } from '../editor/validation';
import { normalizeTask } from '../editor/tasks';
import { pageBlocks } from '../pages/repository';
import { carryAnchors } from './restore-anchors';
export { publishPage } from './publication';
export async function cancelSchedule(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
}) {
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.schedule.cancel', request: { id, ...input }, authorize: async () => { await requirePageLevel(ctx, id, 'edit'); }, prepare: async ({ revisionId }) => {
            const p = await pageRow(ctx, id);
            writable(p);
            if (p.lifecycle !== 'scheduled')
                throw new ApiProblem(409, 'NOT_SCHEDULED', 'Page is not scheduled.');
            return { statements: [pageGuard(ctx, p, input.expectedRevisionId), ctx.db.prepare("UPDATE content_schedules SET state='cancelled',updated_at=? WHERE page_id=?").bind(ctx.now, id), ctx.db.prepare("UPDATE pages SET lifecycle='draft',published_revision_id=NULL,revision_id=?,updated_at=? WHERE id=?").bind(revisionId, ctx.now, id), await revisionStatement(ctx, id, revisionId, await snapshot(ctx, p)), ...contentEvent(ctx, id, revisionId, 'schedule-cancelled')], entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId } };
        } });
}
export async function discardChanges(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
}) {
    await requirePageLevel(ctx, id, 'edit');
    const p = await pageRow(ctx, id);
    writable(p);
    if (!p.published_revision_id)
        throw new ApiProblem(409, 'NO_PUBLISHED_REVISION', 'No published content exists.');
    const r = await revisionRow(ctx, id, p.published_revision_id);
    return restorePageContent(ctx, id, input, JSON.parse(r.body_json), JSON.parse(r.properties_json), 'discard');
}
import type { BlockView } from '../../shared/api/content';
import type { PageProperties } from '../pages/types';
export async function restorePageContent(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
}, blocks: BlockView[], props: PageProperties, source: string) {
    // Restoration uses one atomic structural operation; metadata is included by the prepared restore boundary below.
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.restore', request: { id, ...input, source }, authorize: async () => { await requirePageLevel(ctx, id, 'edit'); }, prepare: async ({ revisionId }) => prepareRestorePage(ctx, id, input.expectedRevisionId, revisionId, blocks, props, source) });
}
export async function prepareRestorePage(ctx: FeatureContext, id: string, expected: string, revisionId: string, blocks: BlockView[], props: PageProperties, source: string) {
    const p = await pageRow(ctx, id);
    writable(p);
    const policy = await contentPolicy(ctx), live = policy['page.lifecycle.v1'] === 'always-live' && !['draft', 'scheduled'].includes(p.lifecycle);
    const old = await pageBlocks(ctx.db,id);
    blocks = await Promise.all(validateBlockTree(blocks).map(async b => ({...b,pageId:id,parentBlockId:b.parentBlockId ?? null,revisionId,content:await normalizeTask(ctx,b,old.find(o=>o.id===b.id))})));
    const threads = (await ctx.db.prepare("SELECT id,block_id,anchor_json FROM comment_threads WHERE page_id=? AND kind='inline' AND anchor_json IS NOT NULL").bind(id).all<{id:string;block_id:string|null;anchor_json:string}>()).results;
    blocks = carryAnchors(old, blocks, threads);
    const anchors = (await ctx.db.prepare('SELECT id,block_id FROM comment_threads WHERE page_id=? AND block_id IS NOT NULL').bind(id).all<{id:string;block_id:string}>()).results;
    const statements = [...await syncedGuards(ctx,blocks,old,true),pageGuard(ctx, p, expected), ctx.db.prepare('UPDATE comment_threads SET block_id=NULL,orphaned=1 WHERE page_id=?').bind(id), ctx.db.prepare('DELETE FROM page_blocks WHERE page_id=?').bind(id), ...blocks.map(b => ctx.db.prepare('INSERT INTO page_blocks (id,page_id,parent_block_id,block_type,content_json,tree_position,revision_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(b.id, id, b.parentBlockId, b.blockType, JSON.stringify(b.content), b.treePosition, revisionId, ctx.now, ctx.now)), ctx.db.prepare("UPDATE pages SET title=?,icon=?,cover_file_id=?,typeface=?,small_text=?,full_width=?,status_key=?,working_revision_id=?,revision_id=?,published_revision_id=CASE WHEN ? THEN ? ELSE published_revision_id END,lifecycle=CASE WHEN ? THEN lifecycle WHEN lifecycle='live' THEN 'live-with-unpublished-changes' ELSE lifecycle END,updated_at=? WHERE id=?").bind(props.title, props.icon, props.coverFileId, props.typeface, +props.smallText, +props.fullWidth, props.statusKey, revisionId, revisionId, +live, revisionId, +live, ctx.now, id), ctx.db.prepare('DELETE FROM page_labels WHERE page_id=?').bind(id), ...props.labels.map(l => ctx.db.prepare('INSERT INTO page_labels VALUES (?,?,?)').bind(id, l, ctx.now)), await revisionStatement(ctx, id, revisionId, { blocks: blocks.map(b => ({ ...b, revisionId })), properties: props }), ...contentEvent(ctx, id, revisionId, 'restored', { source }),...await taskEffects(ctx,id,blocks,old,revisionId)];
    // Reattach stable blocks after replacement, then resolve text/mark anchors against the restored content.
    statements.push(...anchors.filter(a=>blocks.some(b=>b.id===a.block_id)).map(a=>ctx.db.prepare('UPDATE comment_threads SET block_id=?,orphaned=0 WHERE id=?').bind(a.block_id,a.id)),...anchorUpdates(ctx,id,blocks));
    if (source === 'discard')
        statements.push(ctx.db.prepare("UPDATE pages SET working_revision_id=published_revision_id,lifecycle='live' WHERE id=?").bind(id));
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(source))
        statements.unshift(mutationGuard(ctx.db, 'SELECT deleted_at IS NULL FROM page_revisions WHERE id=? AND page_id=?', [source, id]));
    if (props.databaseFields)
        statements.push(...await prepareRestoreRecordValues(ctx, id, revisionId, props.databaseFields));
    // REV-003: activity names the restored revision; it opens that revision from Activity.
    return { statements, entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId }, ...(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(source) ? { detail: { revisionId: source } } : {}) };
}
