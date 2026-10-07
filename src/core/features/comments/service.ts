import { notificationStatements } from '../notifications/events';
import { implicitWatchStatement } from '../navigation/service';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, writable } from '../pages/repository';
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
export async function listComments(ctx: FeatureContext, pageId: string) { await requirePageLevel(ctx, pageId, 'view'); const threads = (await ctx.db.prepare('SELECT * FROM comment_threads WHERE page_id=? ORDER BY created_at,id').bind(pageId).all()).results; const comments = (await ctx.db.prepare('SELECT c.id,c.thread_id AS threadId,c.parent_comment_id AS parentCommentId,c.author_member_id AS authorMemberId,c.body_json AS body,m.display_name AS authorDisplayName,c.created_at AS createdAt,c.updated_at AS updatedAt,c.deleted_at AS deletedAt,c.revision_id AS revisionId FROM comments c JOIN comment_threads t ON t.id=c.thread_id LEFT JOIN members m ON m.id=c.author_member_id WHERE t.page_id=? ORDER BY c.created_at,c.id').bind(pageId).all<Record<string, any>>()).results.map(c => ({ ...c, body: c.deletedAt ? null : JSON.parse(c.body) })); const reactions = (await ctx.db.prepare('SELECT r.id,r.page_id AS pageId,r.comment_id AS commentId,r.member_id AS memberId,m.display_name AS displayName,r.emoji FROM reactions r JOIN members m ON m.id=r.member_id WHERE r.page_id=? OR r.comment_id IN (SELECT c.id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=?)').bind(pageId, pageId).all()).results; return { threads, comments, reactions }; }
export async function createComment(ctx: FeatureContext, pageId: string, input: CommentInput) {
    const normalized = validateBlockContent('paragraph', { text: input.body }) as {text: JsonValue};
    input = {...input, body: normalized.text};
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'comments.create', request: { pageId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'comment'); }, prepare: async ({ revisionId }) => {
            writable(await pageRow(ctx, pageId));
            const id = createUlid(), threadId = input.threadId ?? createUlid(), statements: D1PreparedStatement[] = [];
            if (input.threadId) {
                const t = await ctx.db.prepare('SELECT id FROM comment_threads WHERE id=? AND page_id=?').bind(threadId, pageId).first();
                if (!t)
                    throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
            }
            else {
                if (input.kind === 'inline') {
                    if (!input.blockId || !input.anchor?.anchorId || !input.anchorRevisionId)
                        throw new ApiProblem(400, 'INVALID_ANCHOR', 'Inline comments need a block, anchor and exact revision.');
                    const block = await ctx.db.prepare('SELECT id FROM page_blocks WHERE id=? AND page_id=?').bind(input.blockId, pageId).first();
                    const revision = await ctx.db.prepare('SELECT id FROM page_revisions WHERE id=? AND page_id=? AND deleted_at IS NULL').bind(input.anchorRevisionId, pageId).first();
                    if (!block || !revision)
                        throw new ApiProblem(400, 'INVALID_ANCHOR', 'Anchor is not on this page.');
                }
                statements.push(ctx.db.prepare('INSERT INTO comment_threads (id,workspace_id,page_id,kind,block_id,anchor_json,anchor_revision_id,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(threadId, ctx.actor.workspaceId, pageId, input.kind ?? 'page', input.blockId ?? null, input.anchor ? JSON.stringify(input.anchor) : null, input.anchorRevisionId ?? null, ctx.now, ctx.now, revisionId));
            }
            if (input.parentCommentId) {
                const parent = await ctx.db.prepare('SELECT id FROM comments WHERE id=? AND thread_id=?').bind(input.parentCommentId, threadId).first();
                if (!parent)
                    throw new ApiProblem(400, 'INVALID_REPLY', 'Reply must target this thread.');
            }
            statements.push(ctx.db.prepare('INSERT INTO comments (id,thread_id,parent_comment_id,author_member_id,body_json,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,?,?)').bind(id, threadId, input.parentCommentId ?? null, ctx.actor.id, JSON.stringify(input.body), ctx.now, ctx.now, revisionId), ctx.db.prepare('UPDATE comment_threads SET revision_id=?,updated_at=? WHERE id=?').bind(revisionId, ctx.now, threadId), await commentRevision(ctx, threadId, revisionId, input.body), implicitWatchStatement(ctx, pageId), ...notificationStatements(ctx, { id: `${revisionId}:comment`, event: input.parentCommentId ? 'reply' : 'comment', pageId, commentId: id }), ...notificationStatements(ctx, { id: `${revisionId}:mentions`, event: 'mention', pageId, commentId: id, recipientIds: mentionIds(input.body) }));
            return { statements, detail: {commentId:id,revisionId}, entity: { id: threadId, kind: 'comment-thread', revisionId }, value: { id, threadId, revisionId } };
        } });
}
async function commentRevision(ctx: FeatureContext, id: string, revisionId: string, value: unknown) { return ctx.db.prepare('INSERT INTO record_revisions (id,workspace_id,entity_kind,entity_id,content_hash,content_json,author_member_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(revisionId, ctx.actor.workspaceId, 'comment-thread', id, await requestHash({ value, revisionId }), JSON.stringify(value), ctx.actor.id, ctx.now); }
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
        }, prepare: async ({ revisionId }) => { writable(await pageRow(ctx, row.page_id)); return { statements: [mutationGuard(ctx.db, 'SELECT revision_id=? FROM comments WHERE id=?', [input.expectedRevisionId, id]), ctx.db.prepare('UPDATE comments SET body_json=?,deleted_at=?,revision_id=?,updated_at=? WHERE id=?').bind(input.delete ? '[]' : JSON.stringify(input.body), input.delete ? ctx.now : null, revisionId, ctx.now, id), ctx.db.prepare('UPDATE comment_threads SET revision_id=?,updated_at=? WHERE id=?').bind(revisionId, ctx.now, row.thread_id), await commentRevision(ctx, row.thread_id, revisionId, { id, body: input.body ?? null, deleted: !!input.delete }), ...notificationStatements(ctx, { id: `${revisionId}:mentions`, event: 'mention', pageId: row.page_id, commentId: id, recipientIds: mentionIds(input.body).filter(id => !mentionIds(JSON.parse(row.body_json)).includes(id)) })], detail: {commentId:id,revisionId}, entity: { id: row.thread_id, kind: 'comment-thread', revisionId }, value: { id, revisionId } }; } });
}
export async function resolveThread(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    resolved: boolean;
}) {
    const t = await ctx.db.prepare('SELECT * FROM comment_threads WHERE id=?').bind(id).first<Record<string, any>>();
    if (!t)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'comments.resolve', request: { id, ...input }, authorize: async () => { await requirePageLevel(ctx, t.page_id, 'comment'); }, prepare: async ({ revisionId }) => { writable(await pageRow(ctx, t.page_id)); return { statements: [mutationGuard(ctx.db, 'SELECT revision_id=? FROM comment_threads WHERE id=?', [input.expectedRevisionId, id]), ctx.db.prepare('UPDATE comment_threads SET state=?,resolved_at=?,resolved_by_member_id=?,revision_id=?,updated_at=? WHERE id=?').bind(input.resolved ? 'resolved' : 'open', input.resolved ? ctx.now : null, input.resolved ? ctx.actor.id : null, revisionId, ctx.now, id), await commentRevision(ctx, id, revisionId, { resolved: input.resolved })], detail: {revisionId}, entity: { id, kind: 'comment-thread', revisionId }, value: { id, revisionId } }; } });
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
            return { statements: [input.remove ? ctx.db.prepare('DELETE FROM reactions WHERE member_id=? AND emoji=? AND ((page_id=? AND comment_id IS NULL) OR comment_id=?)').bind(ctx.actor.id, input.emoji, input.commentId ? null : pageId, input.commentId ?? null) : ctx.db.prepare('INSERT OR IGNORE INTO reactions (id,page_id,comment_id,member_id,emoji,created_at) VALUES (?,?,?,?,?,?)').bind(createUlid(), input.commentId ? null : pageId, input.commentId ?? null, ctx.actor.id, input.emoji, ctx.now)], entity: { id: pageId, kind: 'page', revisionId }, value: { reacted: !input.remove } };
        } });
}
export function mentionIds(value: unknown): string[] {
    const ids = new Set<string>();
    function walk(v: unknown) {
        if (Array.isArray(v))
            v.forEach(walk);
        else if (v && typeof v === 'object') {
            const o = v as Record<string, any>;
            if (o.mention?.kind === 'person' && typeof o.mention.id === 'string')
                ids.add(o.mention.id);
            Object.values(o).forEach(walk);
        }
    }
    walk(value);
    return [...ids];
}
