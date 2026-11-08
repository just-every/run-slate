import {deleteContainer} from './delete';
import {requireStepUp} from '../session/step-up';
import {requireWorkspaceOwner} from '../sharing/current-access';
import { archiveContainer } from './archive';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { createContainer, listContainers, readContainer, updateContainer } from './service';
import { readContainerHome, setContainerHome } from './home';
import { parseBody } from '../workspace/routes';
const homeSchema=z.object({operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().min(1),pageId:z.string().min(1).max(160).optional(),create:z.boolean().optional()}).strict();
export function createContainersRoutes() {
 return new Hono<AppEnvironment>()
  .get('/', async c => c.json(await listContainers(featureContext(c),c.req.query('archived')==='true')))
  .post('/', async c => c.json(await createContainer(featureContext(c),await c.req.json())))
  .get('/:id/home', async c => c.json(await readContainerHome(featureContext(c),c.req.param('id'))))
  .put('/:id/home', async c => c.json(await setContainerHome(featureContext(c),c.req.param('id'),await parseBody(c.req,homeSchema))))
  .delete('/:id',async c=>{await requireWorkspaceOwner(featureContext(c));await requireStepUp(c,'delete');return c.json(await deleteContainer(featureContext(c),c.req.param('id'),await parseBody(c.req,z.object({operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().min(1),confirmed:z.boolean()}).strict())));})
  .get('/:id', async c => c.json(await readContainer(featureContext(c),c.req.param('id'))))
  .post('/:id/archive', async c => c.json(await archiveContainer(featureContext(c),c.req.param('id'),await c.req.json())))
  .patch('/:id', async c => c.json(await updateContainer(featureContext(c),c.req.param('id'),await c.req.json())));
}
