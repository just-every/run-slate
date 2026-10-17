import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { postFeed } from './feed';
import { createPost } from './service';

export function createBlogRoutes() {
 return new Hono<AppEnvironment>()
  .get('/', async c => c.json(await postFeed(featureContext(c), { containerId: c.req.query('containerId'), following: c.req.query('following') === '1', cursor: c.req.query('cursor') })))
  .post('/containers/:containerId/posts', async c => c.json(await createPost(featureContext(c), c.req.param('containerId'), await c.req.json())));
}
