import { resolveAllThreads } from './resolve-all';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { listComments, createComment, editComment, resolveThread, react } from './service';
export function createCommentsRoutes() { return new Hono<AppEnvironment>().get('/page/:pageId', async (c) => c.json(await listComments(featureContext(c), c.req.param('pageId')))).post('/page/:pageId', async (c) => c.json(await createComment(featureContext(c), c.req.param('pageId'), await c.req.json()))).post('/page/:pageId/resolve-all', async (c) => c.json(await resolveAllThreads(featureContext(c), c.req.param('pageId'), await c.req.json()))).post('/page/:pageId/reaction', async (c) => c.json(await react(featureContext(c), c.req.param('pageId'), await c.req.json()))).patch('/:id', async (c) => c.json(await editComment(featureContext(c), c.req.param('id'), await c.req.json()))).post('/thread/:id/resolve', async (c) => c.json(await resolveThread(featureContext(c), c.req.param('id'), await c.req.json()))); }
