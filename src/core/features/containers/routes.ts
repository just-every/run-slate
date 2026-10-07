import { archiveContainer } from './archive';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { createContainer, listContainers, readContainer, updateContainer } from './service';
export function createContainersRoutes() { return new Hono<AppEnvironment>().get('/', async (c) => c.json(await listContainers(featureContext(c),c.req.query('archived')==='true'))).post('/', async (c) => c.json(await createContainer(featureContext(c), await c.req.json()))).get('/:id',async c=>c.json(await readContainer(featureContext(c),c.req.param('id')))).post('/:id/archive', async (c) => c.json(await archiveContainer(featureContext(c), c.req.param('id'), await c.req.json()))).patch('/:id', async (c) => c.json(await updateContainer(featureContext(c), c.req.param('id'), await c.req.json()))); }
