import { publicHeader } from './header';
import { publicQueries } from './queries';
import { publicViewStatement } from '../analytics/public-views';
import { createUlid } from '../../shared/ulid';
import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { publishPublicPage, publicPage, publicLinkMap } from './service';
import { renderPublicDocument } from './render';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel } from '../sharing/current-access';
import { createSessionService } from '../session/service';
import { mediaResponse } from '../media/service';
async function authorizePublic(c: import('hono').Context<AppEnvironment>, p: Record<string, any>) {
    if (p.anonymous_access === 'forbidden' || p.workspace_anonymous === 'forbidden') {
        const member = c.get('member');
        if (!member)
            throw new ApiProblem(404, 'NOT_FOUND', 'This link is no longer available.');
        await requirePageLevel(featureContext(c), p.page_id, 'view');
    }
}
export function createPublishingRoutes() {
    return new Hono<AppEnvironment>().get('/:id',async c=>{const ctx=featureContext(c);await requirePageLevel(ctx,c.req.param('id'),'full');const exposure=await ctx.db.prepare('SELECT host,slug,indexable,theme,header_controls_json AS headerControls,duplicate_as_template AS duplicateAsTemplate,social_preview_json AS socialPreview,published_at AS publishedAt,revoked_at AS revokedAt FROM public_exposures WHERE page_id=?').bind(c.req.param('id')).first<Record<string,any>>();return c.json({exposure:exposure?{...exposure,indexable:!!exposure.indexable,duplicateAsTemplate:!!exposure.duplicateAsTemplate,headerControls:JSON.parse(exposure.headerControls),socialPreview:JSON.parse(exposure.socialPreview)}:null});}).post('/:id', async (c) => {
        const input = await c.req.json();
        const host = c.get('runtimeConfig')?.publicPageHost ?? new URL(c.req.url).host;
        if (input.host !== host)
            throw new ApiProblem(400, 'UNCONFIGURED_PUBLIC_HOST', 'Use the deployment public host.');
        return c.json(await publishPublicPage(featureContext(c), c.req.param('id'), input));
    });
}
export function createPublicPagesRoutes() {
    return new Hono<AppEnvironment>().get('/:slug/media/:id', async (c) => {
        const p = await publicPage(c.env.DB, new URL(c.req.url).host, c.req.param('slug'));
        await authorizePublic(c, p);
        const f = await c.env.DB.prepare('SELECT * FROM files WHERE id=? AND page_id=? AND deleted_at IS NULL').bind(c.req.param('id'), p.page_id).first<Record<string, any>>();
        if (!f)
            throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
        const blocks = JSON.parse(p.body_json), props = JSON.parse(p.properties_json);
        if (!(props.coverFileId === f.id || props.icon === `file:${f.id}` || blocks.some((b: any) => b.blockType === 'media' && (b.content.source?.fileId === f.id || b.content.source?.url === `/api/media/${f.id}`))))
            throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
        const display = c.req.query('display'), inline = !!display && blocks.some((b: any) => b.id === display && b.blockType === 'media' && b.content.kind !== 'file' && (b.content.source?.fileId === f.id || b.content.source?.url === `/api/media/${f.id}`));
        return mediaResponse(c.env.FILES, f, inline);
    }).get('/*', async (c) => { const p = await publicPage(c.env.DB, new URL(c.req.url).host, decodeURIComponent(new URL(c.req.url).pathname.slice(3))); await authorizePublic(c, p); if (!c.get('member'))
        await publicViewStatement(c.env.DB, { viewId: createUlid(), pageId: p.page_id, host: new URL(c.req.url).host, slug: p.slug, now: new Date().toISOString() }).run(); return c.html(renderPublicDocument(await publicHeader(c.env.DB, await publicQueries(c.env.DB, p), c.req.query('q')??''), await publicLinkMap(c.env.DB, p)), 200, { 'X-Robots-Tag': p.indexable ? 'index,follow' : 'noindex,nofollow', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'", 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); });
}
