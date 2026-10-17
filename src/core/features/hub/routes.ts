import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { hubEditor, updateHub } from './configuration';
import { hubPages } from './pages';
import { readHub } from './service';
import { parseBody } from '../workspace/routes';

const ids=z.array(z.string().min(1).max(160)).max(20);
const updateSchema=z.object({operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().min(1).nullable(),configuration:z.object({title:z.string().trim().min(1).max(200),description:z.string().max(4000),linkPageIds:ids,announcementPageIds:ids,keyPageIds:ids}).strict()}).strict();

export function createHubRoutes() {
  return new Hono<AppEnvironment>()
    .get('/', async c => c.json(await readHub(featureContext(c))))
    .get('/configuration', async c => c.json(await hubEditor(featureContext(c))))
    .get('/pages', async c => { const ctx=featureContext(c); await requireWorkspaceOwner(ctx); return c.json({items:await hubPages(ctx)}); })
    .put('/', async c => c.json(await updateHub(featureContext(c), await parseBody(c.req,updateSchema))));
}
