import { compareRevisions } from './compare';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { revisionHistory, readRevision, restorePageRevision, deleteRevision } from './service';
export function createRevisionsRoutes() { return new Hono<AppEnvironment>().get('/:pageId', async (c) => c.json({ items: await revisionHistory(featureContext(c), c.req.param('pageId')) })).get('/:pageId/compare/:left/:right', async (c) => c.json(await compareRevisions(featureContext(c), c.req.param('pageId'), c.req.param('left'), c.req.param('right')))).get('/:pageId/:id', async (c) => c.json(await readRevision(featureContext(c), c.req.param('pageId'), c.req.param('id')))).post('/:pageId/:id/restore', async (c) => c.json(await restorePageRevision(featureContext(c), c.req.param('pageId'), c.req.param('id'), await c.req.json()))).delete('/:pageId/:id', async (c) => c.json(await deleteRevision(featureContext(c), c.req.param('pageId'), c.req.param('id'), await c.req.json()))); }
