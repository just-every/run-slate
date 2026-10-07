import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { requirePageLevel } from '../sharing/current-access';
import { writable } from './repository';
import { descendants } from './tree';
import type { MovePlacement } from './tree-order';

/** Rechecked before receipt lookup as well as preview: archival does not bump revisions. */
export async function moveSources(ctx: FeatureContext, id: string, input: MovePlacement) {
    await requirePageLevel(ctx, id, 'edit');
    const pages = await descendants(ctx, id);
    for (const page of pages) {
        await requirePageLevel(ctx, page.id, 'edit');
        // Same-container descendants keep every stored field and history entry.
        if (page.id === id || page.container_id !== input.containerId) writable(page);
    }
    return pages;
}

/** Reject liveness changes within the very batch that writes receipts and history. */
export function writableMoveGuard(ctx: FeatureContext, id: string, containerId: string) {
    return mutationGuard(ctx.db, `SELECT EXISTS(SELECT 1 FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL AND archived_at IS NULL AND trashed_at IS NULL) AND NOT EXISTS(WITH RECURSIVE tree(id) AS (SELECT id FROM pages WHERE id=? AND workspace_id=? UNION SELECT p.id FROM pages p JOIN tree t ON p.parent_page_id=t.id WHERE p.deleted_at IS NULL) SELECT 1 FROM pages p JOIN tree t ON p.id=t.id WHERE (p.id=? OR p.container_id!=?) AND (p.deleted_at IS NOT NULL OR p.archived_at IS NOT NULL OR p.trashed_at IS NOT NULL))`, [id, ctx.actor.workspaceId, id, ctx.actor.workspaceId, id, containerId]);
}
