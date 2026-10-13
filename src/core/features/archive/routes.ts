import { requireStepUp } from '../session/step-up';
import { ApiProblem } from '../../app/problems';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { archivePage, permanentDeletePage } from './service';
import { resolveCurrentAccess } from '../sharing/current-access';
export function createArchiveRoutes() {
    return new Hono<AppEnvironment>().get('/', async (c) => {
        const ctx = featureContext(c), rows = (await ctx.db.prepare('SELECT p.id,p.title,p.container_id AS containerId,p.revision_id AS revisionId,p.archived_at AS archivedAt,p.trashed_at AS trashedAt,l.reason,l.occurred_at AS occurredAt FROM pages p LEFT JOIN content_archive_locations l ON l.page_id=p.id WHERE p.workspace_id=? AND p.deleted_at IS NULL AND (p.archived_at IS NOT NULL OR p.trashed_at IS NOT NULL)').bind(ctx.actor.workspaceId).all<Record<string, any>>()).results, out = [];
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
        return c.json({ items: out });
    }).post('/:id', async (c) => c.json(await archivePage(featureContext(c), c.req.param('id'), await c.req.json()))).post('/:id/permanent-delete', async (c) => { const input = await c.req.json(); await requireStepUp(c, 'delete'); return c.json(await permanentDeletePage(featureContext(c), c.req.param('id'), input)); });
}
