import { normalizeTask } from './tasks';
import { notificationStatements } from '../notifications/events';
import { mentionIds } from '../comments/service';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, pageBlocks, properties, pageGuard, revisionStatement, writable, contentEvent } from '../pages/repository';
import type { BlockInput, BlockUpdateInput } from '../pages/types';
import { validateBlockContent, validateBlockTree, plainContent } from './validation';
import { contentPolicy } from '../pages/policy';
function revisionUpdate(ctx: FeatureContext, id: string, revisionId: string, live: boolean) { return ctx.db.prepare("UPDATE pages SET working_revision_id=?,revision_id=?,published_revision_id=CASE WHEN ? THEN ? ELSE published_revision_id END,lifecycle=CASE WHEN ? THEN lifecycle WHEN lifecycle IN ('live','live-with-unpublished-changes') THEN 'live-with-unpublished-changes' ELSE lifecycle END,updated_at=? WHERE id=?").bind(revisionId, revisionId, +live, revisionId, +live, ctx.now, id); }
export async function updateBlock(ctx: FeatureContext, pageId: string, blockId: string, input: BlockUpdateInput) {
    // Retry only snapshot contention from a different block. The submitted block CAS is never rebased.
    for (let attempt = 0;; attempt++) {
        try {
            return await commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.block.update', request: { pageId, blockId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'edit'); }, prepare: async ({ revisionId }) => {
                    const page = await pageRow(ctx, pageId);
                    writable(page);
                    const blocks = await pageBlocks(ctx.db, pageId), block = blocks.find(b => b.id === blockId);
                    if (!block)
                        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
                    if (block.revisionId !== input.expectedRevisionId)
                        throw new ApiProblem(409, 'BLOCK_CONFLICT', 'This block changed. Keep your unsaved text and compare.', { blockId, currentRevisionId: block.revisionId, serverContent: block.content });
                    let content = validateBlockContent(block.blockType, input.content);
                    content = normalizeTask(ctx, { ...block, content }, block);
                    if (await requestHash(content) === await requestHash(block.content))
                        return { noChange: true, statements: [pageGuard(ctx, page, page.revision_id), mutationGuard(ctx.db, 'SELECT revision_id=? FROM page_blocks WHERE id=? AND page_id=?', [input.expectedRevisionId, blockId, pageId])], entity: { id: pageId, kind: 'page', revisionId: page.revision_id }, value: { pageId, revisionId: page.revision_id, blockRevisionId: block.revisionId } };
                    const blockRevisionId = createUlid();
                    const next = blocks.map(b => b.id === blockId ? { ...b, content, revisionId: blockRevisionId } : b);
                    const policy = await contentPolicy(ctx), live = policy['page.lifecycle.v1'] === 'always-live' && !['draft', 'scheduled'].includes(page.lifecycle);
                    return { statements: [pageGuard(ctx, page, page.revision_id), mutationGuard(ctx.db, 'SELECT revision_id=? FROM page_blocks WHERE id=? AND page_id=?', [input.expectedRevisionId, blockId, pageId]), ctx.db.prepare('UPDATE page_blocks SET content_json=?,revision_id=?,updated_at=? WHERE id=?').bind(JSON.stringify(content), blockRevisionId, ctx.now, blockId), revisionUpdate(ctx, pageId, revisionId, live), await revisionStatement(ctx, pageId, revisionId, { blocks: next, properties: await properties(ctx, page) }), ctx.db.prepare('INSERT OR IGNORE INTO page_contributors VALUES (?,?,?)').bind(pageId, ctx.actor.id, ctx.now), contentEvent(ctx, pageId, revisionId, 'block', { blockId, blockRevisionId }), ...anchorUpdates(ctx, pageId, next),...notificationStatements(ctx,{id:`${revisionId}:mentions`,event:'mention',pageId,recipientIds:mentionIds(content).filter(id=>!mentionIds(block.content).includes(id))})], entity: { id: pageId, kind: 'page', revisionId }, value: { pageId, revisionId, blockRevisionId } };
                } });
        }
        catch (e) {
            if (!(e instanceof ApiProblem) || e.code !== 'REVISION_CONFLICT' || attempt >= 7)
                throw e;
        }
    }
}
export function anchorUpdates(ctx: FeatureContext, pageId: string, blocks: import('../../shared/api/content').BlockView[]) {
    const ids = new Map<string, string>();
    function visit(v: unknown, id: string) {
        if (Array.isArray(v))
            v.forEach(x => visit(x, id));
        else if (v && typeof v === 'object') {
            const o = v as Record<string, unknown>;
            if (typeof o.commentAnchorId === 'string')
                ids.set(o.commentAnchorId, id);
            Object.values(o).forEach(x => visit(x, id));
        }
    }
    blocks.forEach(b => visit(b.content, b.id));
    return [ctx.db.prepare("UPDATE comment_threads SET orphaned=1 WHERE page_id=? AND kind='inline'").bind(pageId), ...blocks.map(b => ctx.db.prepare("UPDATE comment_threads SET orphaned=0 WHERE page_id=? AND block_id=? AND length(json_extract(anchor_json,'$.quote'))>0 AND instr(?,json_extract(anchor_json,'$.quote'))>0").bind(pageId, b.id, plainContent(b.content))), ...Array.from(ids, ([anchor, id]) => ctx.db.prepare("UPDATE comment_threads SET orphaned=0,block_id=? WHERE page_id=? AND json_extract(anchor_json,'$.anchorId')=?").bind(id, pageId, anchor))];
}
export async function replaceBlocks(ctx: FeatureContext, pageId: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    blocks: BlockInput[];
}) { return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.blocks.replace', request: { pageId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'edit'); }, prepare: ({ revisionId }) => prepareReplaceBlocks(ctx, pageId, input, revisionId) }); }
export async function prepareReplaceBlocks(ctx: FeatureContext, pageId: string, input: {
    expectedRevisionId: string;
    blocks: BlockInput[];
}, revisionId: string) {
    const incoming = validateBlockTree(input.blocks);
    const page = await pageRow(ctx, pageId);
    writable(page);
    const old = await pageBlocks(ctx.db, pageId);
    const next = incoming.map(b => ({ ...b, content: normalizeTask(ctx, b, old.find(o => o.id === b.id)), pageId, parentBlockId: b.parentBlockId ?? null, revisionId: createUlid() }));
    for (const b of next) {
        const foreign = await ctx.db.prepare('SELECT page_id FROM page_blocks WHERE id=?').bind(b.id).first<{
            page_id: string;
        }>();
        if (foreign && foreign.page_id !== pageId)
            throw new ApiProblem(409, 'BLOCK_ID_COLLISION', 'Block belongs to another page.');
    }
    const removed = old.filter(b => !next.some(n => n.id === b.id));
    const policy = await contentPolicy(ctx), live = policy['page.lifecycle.v1'] === 'always-live' && !['draft', 'scheduled'].includes(page.lifecycle);
    return { statements: [pageGuard(ctx, page, input.expectedRevisionId), ...removed.flatMap(b => [ctx.db.prepare('UPDATE comment_threads SET block_id=NULL,orphaned=1 WHERE block_id=?').bind(b.id), ctx.db.prepare('DELETE FROM page_blocks WHERE id=?').bind(b.id)]), ...next.map(b => ctx.db.prepare('INSERT INTO page_blocks (id,page_id,parent_block_id,block_type,content_json,tree_position,revision_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent_block_id=excluded.parent_block_id,block_type=excluded.block_type,content_json=excluded.content_json,tree_position=excluded.tree_position,revision_id=excluded.revision_id,updated_at=excluded.updated_at').bind(b.id, pageId, b.parentBlockId, b.blockType, JSON.stringify(b.content), b.treePosition, b.revisionId, ctx.now, ctx.now)), revisionUpdate(ctx, pageId, revisionId, live), await revisionStatement(ctx, pageId, revisionId, { blocks: next, properties: await properties(ctx, page) }), ...anchorUpdates(ctx, pageId, next), contentEvent(ctx, pageId, revisionId, 'structure')], entity: { id: pageId, kind: 'page', revisionId }, value: { pageId, revisionId, blocks: next } };
}
