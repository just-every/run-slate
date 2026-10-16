import type { FeatureContext } from '../../app/feature-context';
import { requirePageLevel } from '../sharing/current-access';
import { labelForReader } from '../pages/mentions';
import { labelQuotes } from './quotes';

export async function listComments(ctx:FeatureContext,pageId:string) {
  await requirePageLevel(ctx,pageId,'view');
  const [threads,comments,reactions]=await Promise.all([
    ctx.db.prepare('SELECT * FROM comment_threads WHERE page_id=? ORDER BY created_at,id').bind(pageId).all<Record<string,any>&{anchor_json:string|null;anchor_revision_id:string|null}>()
      .then(rows=>labelQuotes(ctx,pageId,rows.results)),
    ctx.db.prepare('SELECT c.id,c.thread_id AS threadId,c.parent_comment_id AS parentCommentId,c.author_member_id AS authorMemberId,c.body_json AS body,m.display_name AS authorDisplayName,c.created_at AS createdAt,c.updated_at AS updatedAt,c.deleted_at AS deletedAt,c.revision_id AS revisionId FROM comments c JOIN comment_threads t ON t.id=c.thread_id LEFT JOIN members m ON m.id=c.author_member_id WHERE t.page_id=? ORDER BY c.created_at,c.id').bind(pageId).all<Record<string,any>>()
      .then(rows=>labelForReader(ctx,rows.results.map(c=>({...c,body:c.deletedAt?null:JSON.parse(c.body)})))),
    ctx.db.prepare('SELECT r.id,r.page_id AS pageId,r.comment_id AS commentId,r.member_id AS memberId,m.display_name AS displayName,r.emoji FROM reactions r JOIN members m ON m.id=r.member_id WHERE r.page_id=? OR r.comment_id IN (SELECT c.id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=?)').bind(pageId,pageId).all().then(rows=>rows.results)
  ]);
  return {threads,comments,reactions};
}
