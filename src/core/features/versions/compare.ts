import type { FeatureContext } from '../../app/feature-context';
import { readRevision } from './service';
import type { BlockView } from '../../shared/api/content';
import { ApiProblem } from '../../app/problems';
export async function compareRevisions(ctx: FeatureContext, pageId: string, leftId: string, rightId: string) {
    const [left, right] = await Promise.all([readRevision(ctx, pageId, leftId), readRevision(ctx, pageId, rightId)]);
    if (!('blocks' in left) || !('blocks' in right))
        throw new ApiProblem(409, 'DELETED_REVISION', 'A deleted revision has no content to compare.');
    const old = new Map<string, BlockView>((left.blocks as BlockView[]).map(b => [b.id, b])), next = new Map<string, BlockView>((right.blocks as BlockView[]).map(b => [b.id, b]));
    return { leftId, rightId, blocks: [...new Set([...old.keys(), ...next.keys()])].map(id => ({ id, change: !old.has(id) ? 'added' : !next.has(id) ? 'removed' : JSON.stringify(old.get(id)?.content) !== JSON.stringify(next.get(id)?.content) || old.get(id)?.treePosition !== next.get(id)?.treePosition ? 'changed' : 'unchanged', before: old.get(id) ?? null, after: next.get(id) ?? null })), properties: { before: left.properties, after: right.properties } };
}
