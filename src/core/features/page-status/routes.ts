import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { currentSubject } from '../sharing/current-access';
import { setPageStatus, verification, setStatusEntry } from './service';
import { reviewCount, reviewQueue } from './review';
export function createStatusRoutes() { return new Hono<AppEnvironment>().get('/', async (c) => { const ctx = featureContext(c); await currentSubject(ctx); return c.json({ items: (await ctx.db.prepare('SELECT key,label,color,requires_verification AS requiresVerification,retired_at AS retiredAt FROM status_entries WHERE workspace_id=?').bind(ctx.actor.workspaceId).all()).results }); }).post('/', async (c) => c.json(await setStatusEntry(featureContext(c), await c.req.json()))).get('/review', async (c) => c.json(await reviewQueue(featureContext(c), { filter: c.req.query('filter'), cursor: c.req.query('cursor'), limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined }))).get('/review/count', async (c) => c.json(await reviewCount(featureContext(c)))).post('/page/:id', async (c) => c.json(await setPageStatus(featureContext(c), c.req.param('id'), await c.req.json()))).get('/page/:id', async (c) => c.json({ verification: await verification(featureContext(c), c.req.param('id')) })); }
