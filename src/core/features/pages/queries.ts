import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel, requireContainerLevel, resolveCurrentAccess } from '../sharing/current-access';
import { pageRow } from './repository';
import { readPage } from './service';
import { commitOperation } from '../../app/operations';
export async function contentQuery(ctx: FeatureContext, pageId: string, definition: {
    container?: string;
    ancestor?: string;
    pageType?: string;
    status?: string;
    contributor?: string;
    dateRange?: string;
    orderBy?: string;
    limit?: number;
}) {
    await requirePageLevel(ctx, pageId, 'view');
    if (definition.container) {
        try {
            await requireContainerLevel(ctx, definition.container, 'view');
        }
        catch {
            throw new ApiProblem(404, 'QUERY_SOURCE_UNAVAILABLE', 'The query source is unavailable.');
        }
    }
    if (definition.ancestor) {
        try {
            await requirePageLevel(ctx, definition.ancestor, 'view');
        }
        catch {
            throw new ApiProblem(404, 'QUERY_SOURCE_UNAVAILABLE', 'The query source is unavailable.');
        }
    }
    const rows = (await ctx.db.prepare("SELECT id FROM pages WHERE workspace_id=? AND lifecycle IN ('live','live-with-unpublished-changes') AND deleted_at IS NULL AND trashed_at IS NULL AND archived_at IS NULL AND (? IS NULL OR container_id=?) AND (? IS NULL OR page_kind=?) AND (? IS NULL OR status_key=?) ORDER BY updated_at DESC,id").bind(ctx.actor.workspaceId, definition.container ?? null, definition.container ?? null, definition.pageType ?? null, definition.pageType ?? null, definition.status ?? null, definition.status ?? null).all<{
        id: string;
    }>()).results;
    const items = [];
    for (const row of rows) {
        if (!(await resolveCurrentAccess(ctx, row.id)).decision.allowed)
            continue;
        const p = await pageRow(ctx, row.id);
        if (definition.dateRange) {
            const range = definition.dateRange.split('/');
            if (range.length !== 2 || range.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date)))
                throw new ApiProblem(400, 'INVALID_DATE_RANGE', 'Use an inclusive start/end date range.');
            if (p.updated_at.slice(0, 10) < range[0]! || p.updated_at.slice(0, 10) > range[1]!)
                continue;
        }
        if (definition.contributor && !await ctx.db.prepare('SELECT 1 FROM page_contributors WHERE page_id=? AND member_id=?').bind(p.id, definition.contributor).first())
            continue;
        if (definition.ancestor) {
            let parent = p.parent_page_id, found = false;
            const seen = new Set<string>();
            while (parent && !seen.has(parent)) {
                seen.add(parent);
                if (parent === definition.ancestor) {
                    found = true;
                    break;
                }
                parent = (await pageRow(ctx, parent)).parent_page_id;
            }
            if (!found)
                continue;
        }
        const doc = await readPage(ctx, p.id);
        items.push(doc.page);
    }
    if (definition.orderBy === 'title')
        items.sort((a, b) => a.title.localeCompare(b.title));
    return { items: items.slice(0, Math.min(100, definition.limit ?? 20)), ranAt: ctx.now };
}
export async function treeExpansion(ctx: FeatureContext, pageId: string, input?: {
    operationKey: string;
    expanded: boolean;
}) {
    await requirePageLevel(ctx, pageId, 'view');
    if (!input) {
        const row = await ctx.db.prepare('SELECT expanded FROM content_tree_expansion WHERE member_id=? AND page_id=?').bind(ctx.actor.id, pageId).first<{
            expanded: number;
        }>();
        return { expanded: !!row?.expanded };
    }
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.expansion', request: { pageId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'view'); }, prepare: async ({ revisionId }) => ({ statements: [ctx.db.prepare('INSERT INTO content_tree_expansion VALUES (?,?,?,?) ON CONFLICT(member_id,page_id) DO UPDATE SET expanded=excluded.expanded,updated_at=excluded.updated_at').bind(ctx.actor.id, pageId, +input.expanded, ctx.now)], entity: { id: pageId, kind: 'page', revisionId }, value: { expanded: input.expanded } }) });
}
