import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { resolveCurrentAccess } from "../sharing/current-access";
export async function listArchive(ctx: FeatureContext) {
        const rows = (await ctx.db.prepare('SELECT p.id,p.title,p.container_id AS containerId,p.revision_id AS revisionId,p.archived_at AS archivedAt,p.trashed_at AS trashedAt,l.reason,l.occurred_at AS occurredAt FROM pages p LEFT JOIN content_archive_locations l ON l.page_id=p.id WHERE p.workspace_id=? AND p.deleted_at IS NULL AND (p.archived_at IS NOT NULL OR p.trashed_at IS NOT NULL)').bind(ctx.actor.workspaceId).all<Record<string, any>>()).results, out = [];
        for (const r of rows) {
            try {
                if ((await resolveCurrentAccess(ctx, r.id, { includeTrashed: true })).decision.allowed)
                    out.push(r);
            }
            catch (e) {
                if (!(e instanceof ApiProblem) || e.status !== 404)
                    throw e;
            }
        }
        return { items: out };
}
