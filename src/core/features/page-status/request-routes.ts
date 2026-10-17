import './request-integration';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { createReviewRequest, reassignReviewRequest, cancelReviewRequest, requestReviewChanges } from './requests';
import { requireRequestManager } from './request-access';
import { reviewRequestQueue, readReviewRequest, reviewTargets } from './request-queue';
import { verifyReviewRequest } from './request-verification';
export function createReviewRequestRoutes() {
 return new Hono<AppEnvironment>()
 .get('/queue', async c => c.json(await reviewRequestQueue(featureContext(c), { view: c.req.query('view'), state: c.req.query('state'), cursor: c.req.query('cursor'), limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined })))
 .get('/page/:pageId/targets', async c => c.json(await reviewTargets(featureContext(c), c.req.param('pageId'))))
 .get('/page/:pageId', async c => {
  const ctx = featureContext(c), pageId = c.req.param('pageId'), queue = await reviewRequestQueue(ctx, { pageId, state: 'all' });
  let canRequest = true;
  try { await requireRequestManager(ctx, pageId); } catch (error) { if (!(error instanceof ApiProblem) || error.code !== 'REVIEW_MANAGER_REQUIRED') throw error; canRequest = false; }
  return c.json({ ...queue, canRequest });
 })
 .post('/page/:pageId', async c => c.json(await createReviewRequest(featureContext(c), c.req.param('pageId'), await c.req.json())))
 .get('/:id', async c => c.json(await readReviewRequest(featureContext(c), c.req.param('id'))))
 .post('/:id/reassign', async c => c.json(await reassignReviewRequest(featureContext(c), c.req.param('id'), await c.req.json())))
 .post('/:id/cancel', async c => c.json(await cancelReviewRequest(featureContext(c), c.req.param('id'), await c.req.json())))
 .post('/:id/changes', async c => c.json(await requestReviewChanges(featureContext(c), c.req.param('id'), await c.req.json())))
 .post('/:id/verify', async c => c.json(await verifyReviewRequest(featureContext(c), c.req.param('id'), await c.req.json())));
}
