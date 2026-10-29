import {canonicalGroupLabels} from './group-labels';
import { mentionEffects } from './group-mentions';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, lifecycleWritable, lifecyclePageGuard } from '../pages/repository';
import {prepareCreateComment} from './create-prepared';
import {commentRevision,mentionIds} from './content';
import { validateBlockContent } from '../editor/validation';
import type { JsonValue } from '../../shared/api/common';
export interface CommentInput {
    operationKey: string;
    threadId?: string;
    parentCommentId?: string;
    body: JsonValue;
    kind?: 'inline' | 'page';
    blockId?: string;
    anchor?: {
        anchorId: string;
        quote: string;
    };
    anchorRevisionId?: string;
}
export { listComments } from './list';
export {prepareCreateComment} from './create-prepared';
export {mentionIds} from './content';
export async function createComment(ctx: FeatureContext, pageId: string, input: CommentInput) {
    const normalized = validateBlockContent('paragraph', {text:input.body}) as {text:JsonValue};
    input = {...input,body:normalized.text};
    return commitOperation(ctx, {
        operationKey:input.operationKey, action:'comments.create', request:{pageId,...input},
        authorize:async()=>{await requirePageLevel(ctx,pageId,'comment');},
        prepare:receipt=>prepareCreateComment(ctx,pageId,input,receipt),
    });
}
export async function editComment(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    body?: JsonValue;
    delete?: boolean;
}) {
    const row = await ctx.db.prepare('SELECT c.*,t.page_id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=?').bind(id).first<Record<string, any>>();
    if (!row)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    if (!input.delete)
        validateBlockContent('paragraph', { text: input.body ?? null });
    return commitOperation(ctx, { operationKey: input.operationKey, action: input.delete ? 'comments.delete' : 'comments.edit', request: { id, ...input }, authorize: async () => {
            await requirePageLevel(ctx, row.page_id, 'comment');
            if (row.author_member_id !== ctx.actor.id)
                throw new ApiProblem(403, 'FORBIDDEN', 'Only the author can edit or delete their comment.');
        }, prepare: async ({ revisionId }) => { const page=await pageRow(ctx,row.page_id); lifecycleWritable(page); const body=input.delete?[]:await canonicalGroupLabels(ctx,input.body); return { statements: [lifecyclePageGuard(ctx,page), mutationGuard(ctx.db, 'SELECT revision_id=? FROM comments WHERE id=?', [input.expectedRevisionId, id]), ctx.db.prepare('UPDATE comments SET body_json=?,deleted_at=?,revision_id=?,updated_at=?,agent_editor_json=? WHERE id=?').bind(input.delete ? '[]' : JSON.stringify(body), input.delete ? ctx.now : null, revisionId, ctx.now,ctx.agent?JSON.stringify(ctx.agent):null, id), ctx.db.prepare('UPDATE comment_threads SET revision_id=?,updated_at=? WHERE id=?').bind(revisionId, ctx.now, row.thread_id), await commentRevision(ctx, row.thread_id, revisionId, { id, body: body ?? null, deleted: !!input.delete }), ...await mentionEffects(ctx,row.page_id,page.container_id,body,JSON.parse(row.body_json),revisionId,id)], detail: {commentId:id,revisionId}, entity: { id: row.thread_id, kind: 'comment-thread', revisionId }, value: { id, revisionId } }; } });
}
export async function resolveThread(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    resolved: boolean;
}) {
    const t = await ctx.db.prepare('SELECT * FROM comment_threads WHERE id=?').bind(id).first<Record<string, any>>();
    if (!t)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'comments.resolve', request: { id, ...input }, authorize: async () => { await requirePageLevel(ctx, t.page_id, 'comment'); }, prepare: async ({ revisionId }) => { const page=await pageRow(ctx,t.page_id); lifecycleWritable(page); return { statements: [lifecyclePageGuard(ctx,page), mutationGuard(ctx.db, 'SELECT revision_id=? FROM comment_threads WHERE id=?', [input.expectedRevisionId, id]), ctx.db.prepare('UPDATE comment_threads SET state=?,resolved_at=?,resolved_by_member_id=?,revision_id=?,updated_at=?,resolved_agent_json=? WHERE id=?').bind(input.resolved ? 'resolved' : 'open', input.resolved ? ctx.now : null, input.resolved ? ctx.actor.id : null, revisionId, ctx.now,ctx.agent?JSON.stringify(ctx.agent):null, id), await commentRevision(ctx, id, revisionId, { resolved: input.resolved })], detail: {revisionId}, entity: { id, kind: 'comment-thread', revisionId }, value: { id, revisionId } }; } });
}
export async function react(ctx: FeatureContext, pageId: string, input: {
    operationKey: string;
    commentId?: string;
    emoji: string;
    remove?: boolean;
}) {
    if (!input.emoji || input.emoji.length > 32)
        throw new ApiProblem(400, 'INVALID_REACTION', 'An emoji is required.');
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'comments.reaction', request: { pageId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'view'); }, prepare: async ({ revisionId }) => {
            if (input.commentId && !await ctx.db.prepare('SELECT c.id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=? AND t.page_id=?').bind(input.commentId, pageId).first())
                throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
            return { statements: [input.remove ? ctx.db.prepare('DELETE FROM reactions WHERE member_id=? AND emoji=? AND ((page_id=? AND comment_id IS NULL) OR comment_id=?)').bind(ctx.actor.id, input.emoji, input.commentId ? null : pageId, input.commentId ?? null) : ctx.db.prepare('INSERT OR IGNORE INTO reactions (id,page_id,comment_id,member_id,emoji,created_at,agent_attribution_json) VALUES (?,?,?,?,?,?,?)').bind(createUlid(), input.commentId ? null : pageId, input.commentId ?? null, ctx.actor.id, input.emoji, ctx.now,ctx.agent?JSON.stringify(ctx.agent):null)], entity: { id: pageId, kind: 'page', revisionId }, value: { reacted: !input.remove } };
        } });
}
