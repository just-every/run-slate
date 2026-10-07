import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import type { PageRow } from './types';

/** Container changes can enable an already-published anonymous address. */
export async function publicMoveChanges(ctx: FeatureContext, pages: PageRow[], containerId: string) {
    const pageIds = JSON.stringify(pages.map(page => page.id));
    const sql = `SELECT json_group_array(json_array(page_id,revoked_at)) AS snapshot FROM
        (SELECT page_id,revoked_at FROM public_exposures WHERE page_id IN (SELECT value FROM json_each(?)) ORDER BY page_id COLLATE BINARY)`;
    const captured = await ctx.db.prepare(sql).bind(pageIds).first<string>('snapshot');
    const exposures = JSON.parse(captured!) as [string, string | null][];
    const settings = new Map<string, { links: boolean; anonymous: boolean }>();
    for (const id of new Set([containerId, ...pages.map(page => page.container_id)])) {
        const row = await ctx.db.prepare(`SELECT c.public_link_access='allowed' AND w.public_link_access='allowed' AS links,
            c.anonymous_access='allowed' AND w.anonymous_access='allowed' AS anonymous
            FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=?`).bind(id).first<{links:number;anonymous:number}>();
        settings.set(id, {links: row?.links === 1, anonymous: row?.anonymous === 1});
    }
    const changes: { pageId: string; memberId: null; audience?: 'public-link'; before: 'view' | null; after: 'view' | null }[] = [];
    for (const page of pages) {
        if (!page.published_revision_id || page.archived_at || page.trashed_at ||
            !['live', 'live-with-unpublished-changes'].includes(page.lifecycle) ||
            !exposures.some(([id, revoked]) => id === page.id && !revoked)) continue;
        const source = settings.get(page.container_id)!, target = settings.get(containerId)!;
        // A link remains usable by permitted signed-in readers when anonymous
        // access is forbidden. Changing that surface also needs sharing authority.
        if (source.links !== target.links) changes.push({pageId: page.id, memberId: null,
            audience: 'public-link', before: source.links ? 'view' : null, after: target.links ? 'view' : null});
        const before = source.links && source.anonymous ? 'view' : null;
        const after = target.links && target.anonymous ? 'view' : null;
        if (before !== after) changes.push({pageId: page.id, memberId: null, before, after});
    }
    return { changes, guard: mutationGuard(ctx.db, `SELECT (${sql})=?`, [pageIds, captured]) };
}
