import { personalJson } from '../navigation/request';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { analytics,recordView } from './service';
export function createAnalyticsRoutes(){const app=new Hono<AppEnvironment>();app.use('*',personalJson);app.get('/',async c=>c.json(await analytics(featureContext(c),c.req.query())));app.post('/views',async c=>c.json(await recordView(featureContext(c),await c.req.json())));return app;}
