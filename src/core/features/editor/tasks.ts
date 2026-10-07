import type { FeatureContext } from '../../app/feature-context';
import type { BlockInput } from '../pages/types';
/** Completion attribution is server owned. Preserve an existing completed task only by its stable identity. */
export function normalizeTask(ctx: FeatureContext, block: Pick<BlockInput, 'blockType' | 'content'>, prior?: Pick<BlockInput, 'blockType' | 'content'>) {
    if (block.blockType !== 'task') return block.content;
    const { completedBy: _display, completedAtLabel: _label, ...content } = block.content as Record<string, any>;
    const old = prior?.blockType === 'task' ? prior.content as Record<string, any> : undefined;
    return { ...content, completedByMemberId: content.done ? (old?.done ? old.completedByMemberId ?? ctx.actor.id : ctx.actor.id) : null, completedAt: content.done ? (old?.done ? old.completedAt ?? ctx.now : ctx.now) : null };
}
