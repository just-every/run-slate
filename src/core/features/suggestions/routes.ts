import { acceptGrantedSuggestion } from './delegated';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { requirePageLevel } from '../sharing/current-access';
import { suggestEdits, decideSuggestion } from './service';
import { labelForReader } from '../pages/mentions';
export function createSuggestionsRoutes() { return new Hono<AppEnvironment>().get('/page/:id', async (c) => { const ctx = featureContext(c); await requirePageLevel(ctx, c.req.param('id'), 'view'); const rows = (await ctx.db.prepare('SELECT * FROM content_suggestions WHERE page_id=? ORDER BY created_at').bind(c.req.param('id')).all<Record<string, any>>()).results; return c.json({ items: await Promise.all(rows.map(async row => ({ ...row, patch_json: JSON.stringify(await labelForReader(ctx, JSON.parse(row.patch_json))) }))) }); }).post('/page/:id', async (c) => c.json(await suggestEdits(featureContext(c), c.req.param('id'), await c.req.json()))).post('/:id/granted-accept', async (c) => c.json(await acceptGrantedSuggestion(featureContext(c), c.req.param('id'), await c.req.json()))).post('/:id/decide', async (c) => c.json(await decideSuggestion(featureContext(c), c.req.param('id'), await c.req.json()))); }
