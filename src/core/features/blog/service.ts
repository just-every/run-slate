import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { destination, prepareCreatePage } from '../pages/service';
import { validateUploadedAppearance } from '../pages/appearance';
import { requireContainerLevel } from '../sharing/current-access';
import type { PageCover } from '../pages/appearance';

export interface PostInput { operationKey: string; title: string; cover?: PageCover | null; body?: string }

/** CONT-010: a post is a page created live in the container, dated now and attributed to its author. */
export async function createPost(ctx: FeatureContext, containerId: string, input: PostInput) {
 if (typeof input.title !== 'string' || !input.title.trim()) throw new ApiProblem(400, 'INVALID_TITLE', 'Give the post a title.');
 if (input.body !== undefined && (typeof input.body !== 'string' || input.body.length > 100_000)) throw new ApiProblem(400, 'INVALID_BODY', 'The post text is too long.');
 const blocks = (input.body ?? '').split(/\n{2,}/).map(text => text.trim()).filter(Boolean)
  .map((text, index) => ({ id: crypto.randomUUID(), blockType: 'paragraph', content: { text: [{ text }] }, treePosition: `a${String(index).padStart(4, '0')}` }));
 const request = { containerId, ...input };
 return commitOperation(ctx, { operationKey: input.operationKey, action: 'blog.post', request, authorize: () => destination(ctx, containerId, null), prepare: async ({ revisionId }) => {
  const properties = input.cover ? { cover: input.cover } : {};
  await validateUploadedAppearance(ctx, '', properties);
  return prepareCreatePage(ctx, { operationKey: input.operationKey, containerId, title: input.title.trim(), blocks, properties }, revisionId, undefined, { postedAt: ctx.now });
 } });
}

/** Whether this member may write posts in the container: the same edit level that creates pages there. */
export async function canPost(ctx: FeatureContext, containerId: string) {
 try { await requireContainerLevel(ctx, containerId, 'edit'); return true; }
 catch (cause) { if (cause instanceof ApiProblem && cause.status === 404) return false; throw cause; }
}
