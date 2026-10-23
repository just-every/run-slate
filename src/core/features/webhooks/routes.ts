import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { requireStepUp } from '../session/step-up';
import { registerActivityResolver } from '../activity/service';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { permitted } from '../search/visibility';
import { subscribe, changeSubscription, replayDelivery } from './configuration';
import { subscriptionList, deliveryList, managedSubscription } from './store';
const action = z.object({ operationKey: z.string().min(8).max(160) }).strict();
export function createWebhookRoutes() {
  registerActivityResolver('webhook', async (ctx,id) => await permitted(() => requireWorkspaceOwner(ctx)) || permitted(async()=>{await managedSubscription(ctx,id,true);}));
  return new Hono<AppEnvironment>()
    .get('/', async c => c.json(await subscriptionList(featureContext(c))))
    .post('/', async c => { await requireWorkspaceOwner(featureContext(c)); await requireStepUp(c, 'credentials:mint'); return c.json(await subscribe(featureContext(c), await c.req.json())); })
    .get('/:id/deliveries', async c => c.json(await deliveryList(featureContext(c), c.req.param('id'))))
    .post('/:id/enable', async c => { await requireWorkspaceOwner(featureContext(c)); await requireStepUp(c, 'credentials:mint'); return c.json(await changeSubscription(featureContext(c), c.req.param('id'), action.parse(await c.req.json()).operationKey, 'enable')); })
    .post('/:id/remove', async c => { await managedSubscription(featureContext(c),c.req.param('id'),true); await requireStepUp(c, 'delete'); return c.json(await changeSubscription(featureContext(c), c.req.param('id'), action.parse(await c.req.json()).operationKey, 'remove')); })
    .post('/:id/deliveries/:deliveryId/replay', async c => { await requireWorkspaceOwner(featureContext(c)); await requireStepUp(c, 'credentials:mint'); return c.json(await replayDelivery(featureContext(c), c.req.param('id'), c.req.param('deliveryId'), action.parse(await c.req.json()).operationKey)); });
}
