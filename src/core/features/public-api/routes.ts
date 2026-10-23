import { Hono, type Context } from 'hono';
import { ZodError } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requireStepUp } from '../session/step-up';
import { registerActivityResolver } from '../activity/service';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { permitted } from '../search/visibility';
import { authenticateToken } from './authentication';
import { operations, openApi } from './definitions';
import { executeOperation } from './handlers';
import { mintToken, revokeToken, tokenAdministration } from './tokens';

export function publicError(c: Context<AppEnvironment>, cause: unknown) {
  const known = cause instanceof ApiProblem, invalid = cause instanceof ZodError || cause instanceof SyntaxError;
  return c.json({ error: { code: known ? cause.code : invalid ? 'INVALID_REQUEST' : 'INTERNAL_ERROR', message: known ? cause.message : invalid ? 'The request is invalid.' : 'Slate could not complete that request.', requestId: crypto.randomUUID() } }, known ? cause.status : invalid ? 400 : 500);
}

export function createPublicApiRoutes() {
  const router = new Hono<AppEnvironment>();
  router.get('/openapi.json', c => c.json(openApi()));
  for (const operation of operations) {
    router.on(operation.method.toUpperCase(), operation.path.replace(/\{(\w+)\}/g, ':$1'), async c => {
      const token = await authenticateToken(c);
      c.set('member', token.member);
      const ctx = featureContext(c);
      ctx.containerScopeIds = token.scopes.map(scope => scope.containerId);
      ctx.credentialGuard = () => mutationGuard(ctx.db, "SELECT revoked_at IS NULL AND token_hash IS NOT NULL AND expires_at>? AND scopes_json=? AND member_id=? FROM public_api_tokens WHERE id=?", [ctx.now, JSON.stringify(token.scopes), ctx.actor.id, token.id]);
      return c.json(await executeOperation(operation.id, ctx, token, c.req.param(), c.req.query(), operation.method === 'get' ? undefined : await c.req.json()) as never);
    });
  }
  router.all('*', async c => { await authenticateToken(c); throw new ApiProblem(404, 'NOT_FOUND', 'Not found.'); });
  router.onError((cause, c) => publicError(c, cause));
  return router;
}

export function createTokenAdministrationRoutes() {
  registerActivityResolver('api-token', async (ctx, id) => await permitted(() => requireWorkspaceOwner(ctx)) || !!await ctx.db.prepare('SELECT id FROM public_api_tokens WHERE id=? AND workspace_id=? AND member_id=?').bind(id, ctx.actor.workspaceId, ctx.actor.id).first());
  return new Hono<AppEnvironment>()
    .get('/', async c => c.json(await tokenAdministration(featureContext(c))))
    .post('/', async c => { await requireStepUp(c, 'credentials:mint'); return c.json(await mintToken(featureContext(c), await c.req.json())); })
    .post('/:id/revoke', async c => { await requireStepUp(c, 'credentials:mint'); return c.json(await revokeToken(featureContext(c), c.req.param('id'), (await c.req.json()).operationKey)); });
}
