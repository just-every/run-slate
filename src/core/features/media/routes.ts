import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { uploadMedia, serveMedia } from './service';
import { ApiProblem } from '../../app/problems';
export function createMediaRoutes() {
    return new Hono<AppEnvironment>().post('/', async (c) => {
        const form = await c.req.formData(), file = form.get('file');
        if (!(file instanceof File))
            throw new ApiProblem(400, 'FILE_REQUIRED', 'Choose a file.');
        return c.json(await uploadMedia(featureContext(c), { operationKey: String(form.get('operationKey') ?? ''), pageId: String(form.get('pageId') ?? ''), name: file.name, contentType: file.type || 'application/octet-stream', bytes: new Uint8Array(await file.arrayBuffer()) }));
    }).get('/:id', async (c) => serveMedia(featureContext(c), c.req.param('id'), c.req.query('display')));
}
