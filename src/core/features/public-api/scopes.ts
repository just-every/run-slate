import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import type { TokenPrincipal } from './model';

export function requireScope(token: TokenPrincipal, containerId: string, write = false) {
  if (!token.scopes.some(scope => scope.containerId === containerId && (!write || scope.level === 'write'))) throw new ApiProblem(403, 'INSUFFICIENT_SCOPE', 'The token does not permit this operation in this space.');
}
export async function pageScope(ctx: FeatureContext, token: TokenPrincipal, pageId: string, write = false) {
  const page = await ctx.db.prepare('SELECT container_id FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(pageId, ctx.actor.workspaceId).first<{ container_id: string }>();
  if (!page) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
  requireScope(token, page.container_id, write);
}
