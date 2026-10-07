import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { collaborationSnapshot, updatePresence } from './service';
import { requirePageLevel } from '../sharing/current-access';
import { ApiProblem } from '../../app/problems';
export function createCollaborationRoutes() {
    return new Hono<AppEnvironment>().get('/:pageId/socket', async (c) => {
        const ctx = featureContext(c);
        await requirePageLevel(ctx, c.req.param('pageId'), 'view');
        const rooms = (c.env as AppEnvironment['Bindings'] & {
            CONTENT_COLLABORATION?: DurableObjectNamespace;
        }).CONTENT_COLLABORATION;
        if (!rooms)
            throw new ApiProblem(503, 'COLLABORATION_UNAVAILABLE', 'Live collaboration binding is unavailable.');
        const url = new URL(c.req.url);
        url.searchParams.set('pageId', c.req.param('pageId'));
        return rooms.get(rooms.idFromName(c.req.param('pageId'))).fetch(new Request(url, c.req.raw));
    }).get('/:pageId', async (c) => c.json(await collaborationSnapshot(featureContext(c), c.req.param('pageId'), Number(c.req.query('after') ?? 0)))).post('/:pageId/presence', async (c) => { const b = await c.req.json(); return c.json(await updatePresence(featureContext(c), c.req.param('pageId'), b.sessionId, b.cursor)); });
}
