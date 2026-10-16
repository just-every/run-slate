import { listArchive } from "./list";
import { requireStepUp } from '../session/step-up';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { archivePage, permanentDeletePage } from './service';
export function createArchiveRoutes() {
    return new Hono<AppEnvironment>().get('/', async (c) => {
        return c.json(await listArchive(featureContext(c)));
    }).post('/:id', async (c) => c.json(await archivePage(featureContext(c), c.req.param('id'), await c.req.json()))).post('/:id/permanent-delete', async (c) => { const input = await c.req.json(); await requireStepUp(c, 'delete'); return c.json(await permanentDeletePage(featureContext(c), c.req.param('id'), input)); });
}
