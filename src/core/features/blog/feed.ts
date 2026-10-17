import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject } from '../sharing/current-access';
import { pageReadableSql } from '../notifications/creation-access';
import { canPost } from './service';

export interface PostView { pageId: string; title: string; containerId: string; containerName: string; postedAt: string; authorName: string; cover: unknown; coverFileId: string | null; commentCount: number }

const decode = (cursor: string): [string, string] => {
 try { const value = JSON.parse(atob(cursor)); if (Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'string')) return value as [string, string]; } catch { /* refused below */ }
 throw new ApiProblem(400, 'INVALID_CURSOR', 'Start again from the newest posts.');
};

/**
 * CONT-010: newest posts first, in one container or across the containers the member follows.
 * Every row is a page the member can read now; drafts and archived or trashed posts never list.
 * The title and cover are the published revision's, which is what a reader opens.
 */
export async function postFeed(ctx: FeatureContext, input: { containerId?: string; following?: boolean; cursor?: string; pageIds?: readonly string[] }) {
 await currentSubject(ctx);
 if (!input.containerId && !input.following && !input.pageIds) throw new ApiProblem(400, 'INVALID_FEED', 'Choose a space or the spaces you follow.');
 const [beforeAt, beforeId] = input.cursor ? decode(input.cursor) : [null, null], limit = 30;
 const rows = await ctx.db.prepare(`SELECT bp.id AS pageId,COALESCE(json_extract(r.properties_json,'$.title'),bp.title) AS title,bp.container_id AS containerId,bc.name AS containerName,
 b.posted_at AS postedAt,COALESCE(a.display_name,b.author_name,'Former member') AS authorName,json_extract(r.properties_json,'$.cover') AS cover,bp.cover_file_id AS coverFileId,
 (SELECT COUNT(*) FROM comments k JOIN comment_threads t ON t.id=k.thread_id WHERE t.page_id=bp.id AND k.deleted_at IS NULL) AS commentCount
 FROM blog_posts b JOIN pages bp ON bp.id=b.page_id JOIN containers bc ON bc.id=bp.container_id JOIN members m ON m.id=?1 AND m.workspace_id=b.workspace_id
 LEFT JOIN members a ON a.id=b.author_member_id
 LEFT JOIN page_revisions r ON r.page_id=bp.id AND r.id=COALESCE(bp.published_revision_id,bp.working_revision_id)
 WHERE b.workspace_id=?2 AND bp.deleted_at IS NULL AND bp.trashed_at IS NULL AND bp.archived_at IS NULL AND bp.lifecycle NOT IN ('draft','scheduled','archived')
 AND (?3 IS NULL OR bp.container_id=?3)
 AND (?4=0 OR bp.container_id IN (SELECT container_id FROM container_watches WHERE member_id=m.id))
 AND (?5 IS NULL OR b.posted_at<?5 OR b.posted_at=?5 AND b.page_id<?6)
 AND (?9 IS NULL OR bp.id IN (SELECT value FROM json_each(?9)))
 AND ${pageReadableSql('m', 'bp.id', 'm.workspace_id', '?7')}
 ORDER BY b.posted_at DESC,b.page_id DESC LIMIT ?8`).bind(ctx.actor.id, ctx.actor.workspaceId, input.containerId ?? null, +!!input.following, beforeAt, beforeId, ctx.now, limit + 1, input.pageIds ? JSON.stringify(input.pageIds) : null).all<PostView & { cover: string | null }>();
 const items = rows.results.slice(0, limit).map(row => ({ ...row, cover: row.cover ? JSON.parse(row.cover) : null }));
 const last = items.at(-1);
 return {
  items,
  nextCursor: rows.results.length > limit && last ? btoa(JSON.stringify([last.postedAt, last.pageId])) : undefined,
  ...(input.containerId ? { canPost: await canPost(ctx, input.containerId) } : {}),
 };
}
