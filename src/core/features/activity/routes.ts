import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { activity } from './service';
export function createActivityRoutes(){const app=new Hono<AppEnvironment>();app.get('/',async c=>{const q=c.req.query();const ctx={...featureContext(c),sourceSecret:c.env.CONNECTOR_CREDENTIALS_KEY};return c.json(await activity(ctx,{category:q.category as 'all'|'changes'|undefined,actorId:q.actorId,action:q.action,kind:q.kind,containerId:q.containerId,from:q.from,to:q.to,cursor:q.cursor,limit:q.limit?Number(q.limit):undefined}));});return app;}
