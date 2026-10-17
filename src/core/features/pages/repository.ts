import { watchedChangeStatements } from '../notifications/watched-changes';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { mutationGuard } from '../../app/operations';
import type { BlockView } from '../../shared/api/content';
import type { PageRow, PageProperties, RevisionSnapshot, RevisionRow } from './types';
import { revisionContentHash } from '../../shared/knowledge/revisions';
import { plainContent } from '../editor/validation';
export async function pageRow(ctx: FeatureContext, id: string): Promise<PageRow> {
    const row = await ctx.db.prepare('SELECT * FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(id, ctx.actor.workspaceId).first<PageRow>();
    if (!row)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    return row;
}
export async function pageBlocks(db: D1Database, id: string): Promise<BlockView[]> {
    return (await db.prepare('SELECT id,page_id AS pageId,parent_block_id AS parentBlockId,block_type AS blockType,content_json AS content,tree_position AS treePosition,revision_id AS revisionId FROM page_blocks WHERE page_id=? ORDER BY tree_position,id').bind(id).all<Omit<BlockView, 'content'> & {
        content: string;
    }>()).results.map(b => ({ ...b, content: JSON.parse(b.content) }));
}
export async function properties(ctx: FeatureContext, page: PageRow): Promise<PageProperties> {
    const prior = await ctx.db.prepare('SELECT properties_json FROM page_revisions WHERE id=? AND page_id=?').bind(page.working_revision_id, page.id).first<{
        properties_json: string;
    }>();
    const cover = prior ? JSON.parse(prior.properties_json).cover : undefined;
    const databaseFields = prior ? JSON.parse(prior.properties_json).databaseFields : undefined;
    const byline = prior ? JSON.parse(prior.properties_json).byline : undefined;
    return { ...(cover ? { cover } : {}), ...(databaseFields ? { databaseFields } : {}), ...(byline ? { byline } : {}), title: page.title, icon: page.icon, coverFileId: page.cover_file_id, ownerMemberId: page.owner_member_id, statusKey: page.status_key, labels: (await ctx.db.prepare('SELECT label FROM page_labels WHERE page_id=? ORDER BY label').bind(page.id).all<{
            label: string;
        }>()).results.map(r => r.label), typeface: page.typeface, smallText: !!page.small_text, fullWidth: !!page.full_width };
}
export async function snapshot(ctx: FeatureContext, page: PageRow): Promise<RevisionSnapshot> { const [blocks, p] = await Promise.all([pageBlocks(ctx.db, page.id), properties(ctx, page)]); return { blocks, properties: p }; }
/** Access/security changes retain CAS without becoming content edits. */
export const pageAccessGuard = (ctx: FeatureContext, page: PageRow, expected: string) => mutationGuard(ctx.db, 'SELECT revision_id=? AND deleted_at IS NULL FROM pages WHERE id=? AND workspace_id=?', [expected, page.id, ctx.actor.workspaceId]);
/** Comments remain available while locked; lifecycle changes still fence their commits. */
export const lifecyclePageGuard = (ctx: FeatureContext, page: PageRow) => mutationGuard(ctx.db, 'SELECT deleted_at IS NULL AND archived_at IS NULL AND trashed_at IS NULL FROM pages WHERE id=? AND workspace_id=?', [page.id, ctx.actor.workspaceId]);
export function lifecycleWritable(page: PageRow) {
    if (page.archived_at || page.trashed_at || page.deleted_at)
        throw new ApiProblem(409, 'PAGE_READ_ONLY', 'This page is archived or in trash.');
}
export function unlocked(page: PageRow) {
    if (page.locked_at) throw new ApiProblem(409, 'PAGE_LOCKED', 'This page is locked. Unlock it before editing.');
}
export function writable(page: PageRow) { lifecycleWritable(page); unlocked(page); }
/** A same-batch content fence; the recheck recognizes only a lock of this exact CAS revision. */
export function pageGuard(ctx: FeatureContext, page: PageRow, expected: string) {
    return contentGuard(ctx, page, expected, true);
}
/** Archive/restore can change lifecycle, but still cannot mutate a locked page. */
export function pageLockGuard(ctx: FeatureContext, page: PageRow, expected = page.revision_id) {
    return contentGuard(ctx, page, expected, false);
}
function contentGuard(ctx: FeatureContext, page: PageRow, expected: string, lifecycle: boolean) {
    const live = lifecycle ? ' AND archived_at IS NULL AND trashed_at IS NULL' : '';
    const suffix = ` AND deleted_at IS NULL${live} FROM pages WHERE id=? AND workspace_id=?`;
    return mutationGuard(ctx.db, `SELECT revision_id=? AND locked_at IS NULL${suffix}`, [expected, page.id, ctx.actor.workspaceId], {
        pageId: page.id,
        select: `SELECT (revision_id=? OR (locked_at IS NOT NULL AND EXISTS(SELECT 1 FROM content_events e WHERE e.page_id=pages.id AND e.revision_id=pages.revision_id AND e.kind='locked' AND json_extract(e.detail_json,'$.previousRevisionId')=?)))${suffix}`,
        values: [expected, expected, page.id, ctx.actor.workspaceId],
    });
}
export async function revisionStatement(ctx: FeatureContext, pageId: string, id: string, s: RevisionSnapshot, origin = 'autosave', ordinal: number | null = null, label: string | null = null) { s = {...s, blocks: [...s.blocks].sort((a,b) => a.treePosition < b.treePosition ? -1 : a.treePosition > b.treePosition ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)}; const hash = await revisionContentHash({ body: s.blocks.map(b => ({ text: plainContent(b.content) })), properties: { title: s.properties.title, labels: s.properties.labels, ...Object.fromEntries(Object.entries(s.properties.databaseFields ?? {}).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v])) } }); return ctx.db.prepare('INSERT INTO page_revisions (id,page_id,author_member_id,origin,content_hash,body_json,properties_json,status_key,ordinal,label,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id, pageId, ctx.actor.id, origin, hash, JSON.stringify(s.blocks), JSON.stringify(s.properties), s.properties.statusKey, ordinal, label, ctx.now); }
export function contentEvent(ctx: FeatureContext, pageId: string, revisionId: string, kind: string, detail: unknown = {}, watchedContainerIds:string[] = [], watchedKind = kind):D1PreparedStatement[] {
 return [ctx.db.prepare('INSERT INTO content_events (page_id,revision_id,actor_member_id,kind,detail_json,created_at) VALUES (?,?,?,?,?,?)').bind(pageId, revisionId, ctx.actor.id, kind, JSON.stringify(detail), ctx.now),...watchedChangeStatements(ctx,pageId,watchedKind,watchedContainerIds)];
}
export async function revisionRow(ctx: FeatureContext, pageId: string, id: string) {
    const row = await ctx.db.prepare('SELECT * FROM page_revisions WHERE id=? AND page_id=?').bind(id, pageId).first<RevisionRow>();
    if (!row)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    return row;
}
export function ref(p: PageRow) { return { id: p.id, containerId: p.container_id, title: p.title, revisionId: p.revision_id, lifecycle: p.lifecycle }; }
