import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { requireContainerLevel, resolveCurrentAccess } from "../sharing/current-access";

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
    const out = [];
    for (const row of rows) {
        try {
            const access = await resolveCurrentAccess(ctx, row.id, { includeTrashed: true });
            if (!access.decision.allowed) continue;
            const { working_revision_id, published_revision_id, ...item } = row;
            item.title = await visibleTitle(ctx, row as any, access.decision.level);
            out.push({ ...item, ...await priorLocation(ctx, item) });
        } catch (error) {
            if (!(error instanceof ApiProblem) || error.status !== 404) throw error;
        }
    }
    return { items: out };
}
