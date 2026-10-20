import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { statusEntries } from './entries';
import { setPageStatus, verification, setStatusEntry } from './service';
import { reviewCount, reviewQueue } from './review';
import { createReviewRequestRoutes } from './request-routes';
import { bulkVerifyReviews } from './request-verification';
import { createVerificationRuleRoutes } from './rules/routes';
export function createStatusRoutes() {
 return new Hono<AppEnvironment>()
 .get('/', async c => c.json(await statusEntries(featureContext(c))))
 .post('/', async c => c.json(await setStatusEntry(featureContext(c), await c.req.json())))
 .route('/requests', createReviewRequestRoutes())
 .route('/rules', createVerificationRuleRoutes())
 .get('/review', async c => c.json(await reviewQueue(featureContext(c), { filter: c.req.query('filter'), cursor: c.req.query('cursor'), limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined })))
 .get('/review/count', async c => c.json(await reviewCount(featureContext(c))))
 .post('/review/bulk-verify', async c => c.json(await bulkVerifyReviews(featureContext(c), await c.req.json())))
 .post('/page/:id', async c => c.json(await setPageStatus(featureContext(c), c.req.param('id'), await c.req.json())))
 .get('/page/:id', async c => c.json({ verification: await verification(featureContext(c), c.req.param('id')) }));
}
