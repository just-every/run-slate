import { pageDetails } from './details';
import { openPage } from './open';
import { pageOpenStatements } from '../analytics/service';
import { validatedJson, createPageSchema, updatePageSchema, updateBlockSchema, replaceBlocksSchema } from './input';
import { bulkPages } from './bulk';
import { ApiProblem } from '../../app/problems';
import { contentQuery, treeExpansion } from './queries';
import { previewLink, publicPreviewTransport } from '../editor/link-preview';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { createPage, readPage, updatePage } from './service';
import { listPages, previewMove, movePage, duplicatePage } from './tree';
import { updateBlock, replaceBlocks } from '../editor/service';
import { previewPublication } from '../lifecycle/publication-preview';
import { publishPage, cancelSchedule, discardChanges } from '../lifecycle/service';
import { requirePageLevel } from '../sharing/current-access';
import { commitOperation } from '../../app/operations';
export function createPagesRoutes() {
    const r = new Hono<AppEnvironment>();
    r.post('/bulk', async (c) => c.json(await bulkPages(featureContext(c), await c.req.json())));
    r.post('/link-preview', async (c) => {
        featureContext(c);
        if (c.get('runtimeConfig')?.linkPreviewsEnabled === false)
            throw new ApiProblem(503, 'PREVIEWS_DISABLED', 'The workspace has disabled URL previews.');
        const b = await c.req.json();
        return c.json(await previewLink(b.url, publicPreviewTransport));
    });
    r.get('/', async (c) => c.json(await listPages(featureContext(c), c.req.query('containerId'))));
    r.post('/', async (c) => c.json(await createPage(featureContext(c), await validatedJson(c, createPageSchema))));
    r.post('/:id/query', async (c) => c.json(await contentQuery(featureContext(c), c.req.param('id'), await c.req.json())));
    r.get('/:id/expansion', async (c) => c.json(await treeExpansion(featureContext(c), c.req.param('id'))));
    r.post('/:id/expansion', async (c) => c.json(await treeExpansion(featureContext(c), c.req.param('id'), await c.req.json())));
    r.get('/:id/details',async c=>c.json(await pageDetails(featureContext(c),c.req.param('id'),c.get('runtimeConfig')?.appUrl)));
    r.get('/:id', async (c) => c.json(await readPage(featureContext(c), c.req.param('id'))));
    r.patch('/:id', async (c) => c.json(await updatePage(featureContext(c), c.req.param('id'), await validatedJson(c, updatePageSchema))));
    r.patch('/:id/blocks/:blockId', async (c) => c.json(await updateBlock(featureContext(c), c.req.param('id'), c.req.param('blockId'), await validatedJson(c, updateBlockSchema))));
    r.put('/:id/blocks', async (c) => c.json(await replaceBlocks(featureContext(c), c.req.param('id'), await validatedJson(c, replaceBlocksSchema))));
    r.post('/:id/publish-preview', async (c) => c.json(await previewPublication(featureContext(c), c.req.param('id'), await c.req.json())));
    r.post('/:id/publish', async (c) => c.json(await publishPage(featureContext(c), c.req.param('id'), await c.req.json())));
    r.post('/:id/cancel-schedule', async (c) => c.json(await cancelSchedule(featureContext(c), c.req.param('id'), await c.req.json())));
    r.post('/:id/discard-changes', async (c) => c.json(await discardChanges(featureContext(c), c.req.param('id'), await c.req.json())));
    r.post('/:id/move-preview', async (c) => c.json(await previewMove(featureContext(c), c.req.param('id'), await c.req.json())));
    r.post('/:id/move', async (c) => c.json(await movePage(featureContext(c), c.req.param('id'), await c.req.json())));
    r.post('/:id/duplicate', async (c) => c.json(await duplicatePage(featureContext(c), c.req.param('id'), await c.req.json())));
    r.post('/:id/open', async c => c.json(await openPage(featureContext(c),c.req.param('id'),await c.req.json())));
    return r;
}
