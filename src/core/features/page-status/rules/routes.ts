import { Hono } from 'hono';
import type { AppEnvironment } from '../../../app/types';
import { featureContext } from '../../../app/feature-context';
import { containerRules, dismissFlag, pageRuleState, previewRule, saveRule, validatedRule } from './store';
import './notice';

const body = async (request: { json: () => Promise<unknown> }) => (await request.json().catch(() => null) ?? {}) as Record<string, unknown>;
/** STAT-007 under `/api/status/rules`. A rule action other than its kind's `unverify` or `flag` is a 400 before any write. */
export function createVerificationRuleRoutes() {
 return new Hono<AppEnvironment>()
 .get('/container/:id', async c => c.json(await containerRules(featureContext(c), c.req.param('id'))))
 .put('/container/:id', async c => {
  const ctx = featureContext(c), input = await body(c.req);
  validatedRule(input);
  return c.json(await saveRule(ctx, c.req.param('id'), input));
 })
 .post('/container/:id/preview', async c => c.json(await previewRule(featureContext(c), c.req.param('id'), await body(c.req), c.env.APP_URL)))
 .get('/page/:id', async c => c.json(await pageRuleState(featureContext(c), c.req.param('id'))))
 .post('/page/:id/dismiss', async c => {
  const ctx = featureContext(c), input = await body(c.req);
  return c.json(await dismissFlag(ctx, { operationKey: String(input.operationKey ?? ''), pageId: c.req.param('id'), kind: String(input.kind ?? '') }));
 });
}
