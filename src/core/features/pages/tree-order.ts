import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard, requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { creationDestinationGuards } from './service';
import { compareBinary } from './tree-position';
import { requirePageLevel, resolveCurrentAccess } from '../sharing/current-access';
import { pageRow, writable, lifecycleWritable, lifecyclePageGuard, pageGuard } from './repository';

export interface MovePlacement {
    containerId: string;
    parentPageId?: string | null;
    treePosition?: string;
    beforeId?: string;
    afterId?: string;
    atEnd?: true;
    orderPreviewHash?: string;
}
const invalid = () => new ApiProblem(400, 'INVALID_PLACEMENT', 'Choose exactly one valid placement.');
export function validatePlacement(input: MovePlacement, confirmation = false) {
    if (!input || typeof input !== 'object' || typeof input.containerId !== 'string' || !input.containerId ||
        (input.parentPageId !== undefined && input.parentPageId !== null && (typeof input.parentPageId !== 'string' || !input.parentPageId))) throw invalid();
    const selectors = ['beforeId', 'afterId', 'atEnd'].filter(key => Object.hasOwn(input, key));
    if (selectors.length > 1 || (selectors.length && Object.hasOwn(input, 'treePosition'))) throw invalid();
    if (selectors.length) {
        if ((Object.hasOwn(input, 'beforeId') && (typeof input.beforeId !== 'string' || !input.beforeId)) ||
            (Object.hasOwn(input, 'afterId') && (typeof input.afterId !== 'string' || !input.afterId)) ||
            (Object.hasOwn(input, 'atEnd') && input.atEnd !== true)) throw invalid();
        if (confirmation && (typeof input.orderPreviewHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.orderPreviewHash))) throw invalid();
    } else if ((confirmation || Object.hasOwn(input, 'treePosition')) && typeof input.treePosition !== 'string') throw invalid();
    if (!selectors.length && Object.hasOwn(input, 'orderPreviewHash')) throw invalid();
    return selectors.length === 1;
}
interface Sibling { id: string; revision_id: string; tree_position: string | null; archived_at: string | null; trashed_at: string | null }
const siblingsSql = `SELECT id,tree_position,revision_id,archived_at,trashed_at FROM pages WHERE workspace_id=? AND container_id=? AND parent_page_id IS ? AND deleted_at IS NULL ORDER BY tree_position COLLATE BINARY,id COLLATE BINARY`;
export async function prepareOrder(ctx: FeatureContext, id: string, input: MovePlacement) {
    const values = [ctx.actor.workspaceId, input.containerId, input.parentPageId ?? null];
    const rows = (await ctx.db.prepare(siblingsSql).bind(...values).all<Sibling>()).results;
    const anchor = input.beforeId ?? input.afterId;
    if (anchor) {
        if (anchor === id) throw invalid();
        // Do not distinguish inaccessible, missing, or wrong-location anchors.
        if (!rows.some(row => row.id === anchor)) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
        await requirePageLevel(ctx, anchor, 'view');
        lifecycleWritable(await pageRow(ctx, anchor));
    }
    const rest = rows.filter(row => row.id !== id);
    const index = anchor ? rest.findIndex(row => row.id === anchor) + (input.afterId ? 1 : 0) : rest.length;
    const desired = [...rest.slice(0, index).map(row => row.id), id, ...rest.slice(index).map(row => row.id)];
    const unchanged = rows.length === desired.length && rows.every((row, i) => row.id === desired[i]);
    const captured = JSON.stringify(rows.map(row => [row.id, row.tree_position, row.revision_id, row.archived_at, row.trashed_at]));
    const snapshotSql = `SELECT json_group_array(json_array(id,tree_position,revision_id,archived_at,trashed_at)) FROM (${siblingsSql})`;
    const guard = mutationGuard(ctx.db, `SELECT (${snapshotSql})=?`, [...values, captured], {
        select: `SELECT COUNT(*)=? AND NOT EXISTS(SELECT 1 FROM (${siblingsSql}) p LEFT JOIN json_each(?) e ON json_extract(e.value,'$[0]')=p.id WHERE e.value IS NULL OR p.tree_position IS NOT json_extract(e.value,'$[1]') OR p.archived_at IS NOT json_extract(e.value,'$[3]') OR p.trashed_at IS NOT json_extract(e.value,'$[4]') OR (p.revision_id!=json_extract(e.value,'$[2]') AND NOT EXISTS(SELECT 1 FROM content_events event JOIN pages locked ON locked.id=event.page_id WHERE event.page_id=p.id AND locked.locked_at IS NOT NULL AND event.revision_id=p.revision_id AND event.kind='locked' AND json_extract(event.detail_json,'$.previousRevisionId')=json_extract(e.value,'$[2]')))) FROM (${siblingsSql})`,
        values: [rows.length, ...values, captured, ...values],
    });
    // The review describes only actor-readable selection state. Hidden cohort state
    // remains in the same-batch guard, so concurrent mutations cannot misplace a page.
    const readable: Sibling[] = [];
    for (const row of rows) {
        try {
            if ((await resolveCurrentAccess(ctx, row.id)).decision.allowed) readable.push(row);
        } catch (error) {
            if (!(error instanceof ApiProblem && error.status === 404)) throw error;
        }
    }
    const hash = await requestHash({ id, containerId: input.containerId, parentPageId: input.parentPageId ?? null, beforeId: input.beforeId, afterId: input.afterId, atEnd: input.atEnd, rows: readable });
    const lower = rest[index - 1]?.tree_position;
    const upper = rest[index]?.tree_position;
    const token = () => crypto.randomUUID().replaceAll('-', '');
    // ASCII suffixes preserve SQLite BINARY ordering, including non-ASCII stored keys.
    let position: string | undefined;
    if (index === rest.length) position = (lower ?? '') + token();
    else if (upper !== null && upper !== undefined) {
        const smallest = lower == null ? '' : lower + '\u0000';
        const candidate = smallest + token();
        if (compareBinary(candidate, upper) < 0) position = candidate;
        else if (compareBinary(smallest, upper) < 0) position = smallest;
    }
    const maintenance: D1PreparedStatement[] = [];
    if (anchor) maintenance.push(lifecyclePageGuard(ctx, await pageRow(ctx, anchor)));
    if (!unchanged && position === undefined) {
        // Renormalization is a write too: archived/trash siblings must stay intact.
        for (const row of rest) {
            const page = await pageRow(ctx, row.id); writable(page);
            maintenance.push(pageGuard(ctx, page, row.revision_id));
        }
        // Random sorted keys reveal no numeric ranks or gaps for hidden siblings.
        const keys = desired.map(() => token()).sort();
        const assignments = desired.map((pageId, i) => [pageId, keys[i]]);
        position = keys[index];
        const bystanders = assignments.filter(([pageId]) => pageId !== id);
        // One JSON binding per bounded statement avoids D1's parameter limit.
        for (let i = 0; i < bystanders.length; i += 100) maintenance.push(ctx.db.prepare(`WITH positions AS (SELECT json_extract(value,'$[0]') AS id,json_extract(value,'$[1]') AS position FROM json_each(?)) UPDATE pages SET tree_position=(SELECT position FROM positions WHERE positions.id=pages.id) WHERE id IN (SELECT id FROM positions)`).bind(JSON.stringify(bystanders.slice(i, i + 100))));
    }
    return { hash, guard, unchanged, position: unchanged ? rows.find(row => row.id === id)!.tree_position : position!, maintenance };
}

/** Snapshot the entire closure, including edges and liveness, to catch insert/reparent races. */
export async function treeTopologyGuard(ctx: FeatureContext, id: string) {
    const sql = `WITH RECURSIVE tree(id) AS (SELECT id FROM pages WHERE id=? AND workspace_id=? UNION SELECT p.id FROM pages p JOIN tree t ON p.parent_page_id=t.id WHERE p.deleted_at IS NULL) SELECT json_group_array(json_array(id,container_id,parent_page_id,tree_position,revision_id,deleted_at,archived_at,trashed_at)) AS snapshot FROM (SELECT p.* FROM pages p JOIN tree t ON p.id=t.id ORDER BY p.id COLLATE BINARY)`;
    const values = [id, ctx.actor.workspaceId];
    const captured = await ctx.db.prepare(sql).bind(...values).first<string>('snapshot');
    return mutationGuard(ctx.db, `SELECT (${sql})=?`, [...values, captured], {
        select: `WITH RECURSIVE tree(id) AS (SELECT id FROM pages WHERE id=? AND workspace_id=? UNION SELECT p.id FROM pages p JOIN tree t ON p.parent_page_id=t.id WHERE p.deleted_at IS NULL) SELECT COUNT(*)=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM pages p JOIN tree t ON t.id=p.id LEFT JOIN json_each(?) e ON json_extract(e.value,'$[0]')=p.id WHERE e.value IS NULL OR p.container_id IS NOT json_extract(e.value,'$[1]') OR p.parent_page_id IS NOT json_extract(e.value,'$[2]') OR p.tree_position IS NOT json_extract(e.value,'$[3]') OR p.deleted_at IS NOT json_extract(e.value,'$[5]') OR p.archived_at IS NOT json_extract(e.value,'$[6]') OR p.trashed_at IS NOT json_extract(e.value,'$[7]') OR (p.revision_id!=json_extract(e.value,'$[4]') AND NOT EXISTS(SELECT 1 FROM content_events event WHERE event.page_id=p.id AND p.locked_at IS NOT NULL AND event.revision_id=p.revision_id AND event.kind='locked' AND json_extract(event.detail_json,'$.previousRevisionId')=json_extract(e.value,'$[4]')))) FROM tree`,
        values: [...values, captured, captured],
    });
}
export function destinationGuards(ctx: FeatureContext, input: MovePlacement) {
    return creationDestinationGuards(ctx, input.containerId, input.parentPageId);
}
