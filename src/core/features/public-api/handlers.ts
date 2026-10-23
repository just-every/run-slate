import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { listPages } from '../pages/tree';
import { createPage, readPage, updatePage } from '../pages/service';
import { updateBlock, replaceBlocks } from '../editor/service';
import { createPageSchema, updatePageSchema, updateBlockSchema, replaceBlocksSchema } from '../pages/input';
import { requirePageLevel } from '../sharing/current-access';
import type { TokenPrincipal } from './model';
import { requireScope, pageScope } from './scopes';
import { paginate } from './pagination';
import { taskPatch, type OperationId } from './definitions';

export async function executeOperation(id: OperationId, ctx: FeatureContext, token: TokenPrincipal, params: Record<string, string>, query: Record<string, string>, body: unknown) {
  const pageId = params.pageId!, blockId = params.blockId!;
  if (id === 'listPages') {
    if (!query.containerId) throw new ApiProblem(400, 'SPACE_REQUIRED', 'Choose a space.');
    requireScope(token, query.containerId);
    return paginate((await listPages(ctx, query.containerId)).items, query, { id, member: ctx.actor.id, token: token.id, containerId: query.containerId });
  }
  if (id === 'createPage') {
    const input = createPageSchema.parse(body);
    requireScope(token, input.containerId, true);
    return createPage(ctx, input);
  }
  await pageScope(ctx, token, pageId, !['getPage', 'listBlocks', 'listTasks'].includes(id));
  if (id === 'getPage') return readPage(ctx, pageId);
  if (id === 'updatePage') return updatePage(ctx, pageId, updatePageSchema.parse(body));
  if (id === 'replaceBlocks') return replaceBlocks(ctx, pageId, replaceBlocksSchema.parse(body));
  if (id === 'updateBlock') return updateBlock(ctx, pageId, blockId, updateBlockSchema.parse(body));
  const document = await readPage(ctx, pageId);
  if (id === 'listBlocks' || id === 'listTasks') return paginate(document.blocks.filter(block => id === 'listBlocks' || block.blockType === 'task'), query, { id, pageId, member: ctx.actor.id, token: token.id });
  const input = taskPatch.parse(body);
  await requirePageLevel(ctx, pageId, 'edit');
  const block = document.blocks.find(block => block.id === blockId && block.blockType === 'task');
  if (!block) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
  return updateBlock(ctx, pageId, blockId, input);
}
