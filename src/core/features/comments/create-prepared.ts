import {canonicalGroupLabels} from './group-labels';
import { mentionEffects } from './group-mentions';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {createUlid} from '../../shared/ulid';
import {requirePageLevel} from '../sharing/current-access';
import {pageRow, lifecycleWritable, lifecyclePageGuard} from '../pages/repository';
import {validateBlockContent} from '../editor/validation';
import {notificationStatements} from '../notifications/events';
import {implicitWatchStatement} from '../navigation/service';
import {commentRevision} from './content';
import type {CommentInput} from './service';

/** Native comment writes prepared for composition into one guarded operation. */
export async function prepareCreateComment(ctx: FeatureContext, pageId: string, input: Omit<CommentInput,'operationKey'>, {revisionId}:{revisionId:string}) {
    const normalized = validateBlockContent('paragraph', {text:input.body}) as {text:CommentInput['body']};
    input = {...input,body:await canonicalGroupLabels(ctx,normalized.text)};
    await requirePageLevel(ctx, pageId, 'comment');
    const page = await pageRow(ctx, pageId);
    lifecycleWritable(page);
    const id = createUlid(), threadId = input.threadId ?? createUlid(), statements: D1PreparedStatement[] = [lifecyclePageGuard(ctx, page)];
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
    statements.push(ctx.db.prepare('INSERT INTO comments (id,thread_id,parent_comment_id,author_member_id,body_json,created_at,updated_at,revision_id,agent_creator_json) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, threadId, input.parentCommentId ?? null, ctx.actor.id, JSON.stringify(input.body), ctx.now, ctx.now, revisionId,ctx.agent?JSON.stringify(ctx.agent):null), ctx.db.prepare('UPDATE comment_threads SET revision_id=?,updated_at=? WHERE id=?').bind(revisionId, ctx.now, threadId), await commentRevision(ctx, threadId, revisionId, input.body), implicitWatchStatement(ctx, pageId), ...notificationStatements(ctx, { id: `${revisionId}:comment`, event: input.parentCommentId ? 'reply' : 'comment', pageId, commentId: id }), ...await mentionEffects(ctx,pageId,page.container_id,input.body,[],revisionId,id));
    return { statements, detail: {commentId:id,revisionId}, entity: { id: threadId, kind: 'comment-thread', revisionId }, value: { id, threadId, revisionId } };
}
