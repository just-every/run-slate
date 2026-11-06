import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { compareTreePages } from "../pages/tree-position";
import { requireContainerLevel, resolveCurrentAccess, resolveCurrentAccessMany } from "../sharing/current-access";

/** Location labels use the same current authority and published title as their native doors. */
async function priorLocation(ctx: FeatureContext, item: Record<string, any>) {
    let containerName: string | null = null, parentTitle: string | null = null;
    try {
        await requireContainerLevel(ctx, item.priorContainerId, 'view');
        containerName = await ctx.db.prepare('SELECT name FROM containers WHERE id=? AND workspace_id=?')
            .bind(item.priorContainerId, ctx.actor.workspaceId).first<string>('name');
    } catch (error) {
        if (!(error instanceof ApiProblem) || error.status !== 404) throw error;
    }
    if (item.priorParentId) {
        try {
            const access = await resolveCurrentAccess(ctx, item.priorParentId, { includeTrashed: true });
            if (access.decision.allowed) {
                const parent = await ctx.db.prepare('SELECT title,working_revision_id,published_revision_id FROM pages WHERE id=?')
                    .bind(item.priorParentId).first<{title:string;working_revision_id:string;published_revision_id:string|null}>();
                if (parent) parentTitle = await visibleTitle(ctx, parent, access.decision.level);
            }
        } catch (error) {
            if (!(error instanceof ApiProblem) || error.status !== 404) throw error;
        }
    }
    return { priorContainerName: containerName, priorParentTitle: parentTitle };
}
async function visibleTitle(ctx: FeatureContext, page: {title:string;working_revision_id:string;published_revision_id:string|null}, level?: string | null) {
    if (!['edit', 'full'].includes(level ?? '') && page.published_revision_id && page.published_revision_id !== page.working_revision_id)
        return JSON.parse((await ctx.db.prepare('SELECT properties_json FROM page_revisions WHERE id=?')
            .bind(page.published_revision_id).first<{properties_json:string}>())?.properties_json ?? '{}').title ?? '';
    return page.title;
}
/** The displayed restore position counts only siblings the caller may currently read. */
async function visibleSiblings(ctx: FeatureContext, item: Record<string, any>) {
    const rows = (await ctx.db.prepare(`SELECT id,tree_position AS treePosition FROM pages
        WHERE workspace_id=? AND container_id=? AND parent_page_id IS ? AND deleted_at IS NULL`)
        .bind(ctx.actor.workspaceId, item.priorContainerId, item.priorParentId).all<{id:string;treePosition:string|null}>()).results;
    const access = await resolveCurrentAccessMany(ctx, rows.map(row => row.id), {includeTrashed:true});
    return rows.filter(row => access.get(row.id)?.decision.allowed);
}
export async function listArchive(ctx: FeatureContext) {
    const rows = (await ctx.db.prepare(`SELECT p.id,p.title,p.container_id AS containerId,p.revision_id AS revisionId,
        p.archived_at AS archivedAt,p.trashed_at AS trashedAt,l.reason,l.occurred_at AS occurredAt,
        l.actor_member_id AS actorMemberId,m.display_name AS actorDisplayName,
        l.prior_container_id AS priorContainerId,l.prior_parent_id AS priorParentId,l.prior_position AS priorPosition,
        p.working_revision_id,p.published_revision_id
        FROM pages p LEFT JOIN content_archive_locations l ON l.page_id=p.id
        LEFT JOIN members m ON m.id=l.actor_member_id AND m.workspace_id=p.workspace_id
        WHERE p.workspace_id=? AND p.deleted_at IS NULL AND (p.archived_at IS NOT NULL OR p.trashed_at IS NOT NULL)
        ORDER BY COALESCE(p.trashed_at,p.archived_at) DESC,p.id`).bind(ctx.actor.workspaceId).all<Record<string, any>>()).results;
    const out = [], siblings = new Map<string, ReturnType<typeof visibleSiblings>>();
    for (const row of rows) {
        try {
            const access = await resolveCurrentAccess(ctx, row.id, { includeTrashed: true });
            if (!access.decision.allowed) continue;
            const { working_revision_id, published_revision_id, ...item } = row;
            item.title = await visibleTitle(ctx, row as any, access.decision.level);
            const location = JSON.stringify([item.priorContainerId, item.priorParentId]);
            if (!siblings.has(location)) siblings.set(location, visibleSiblings(ctx, item));
            const ordered = (await siblings.get(location)!).map(row => row.id === item.id ? {...row,treePosition:item.priorPosition} : row).sort(compareTreePages);
            const index = ordered.findIndex(row => row.id === item.id);
            out.push({ ...item, priorOrder: index < 0 ? null : index + 1, ...await priorLocation(ctx, item) });
        } catch (error) {
            if (!(error instanceof ApiProblem) || error.status !== 404) throw error;
        }
    }
    return { items: out };
}
