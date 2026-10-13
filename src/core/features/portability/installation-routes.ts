import { Hono } from 'hono';
import { cloneRawRequest } from 'hono/request';
import { createPortabilityHandler } from '@runeditrun/rer/modules/portability';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { createSlateAuth } from '../session/auth';
import { requireStepUp } from '../session/step-up';
import { requireExportCoverage } from './coverage';
import { installationPolicy } from './installation';
import { retainedFiles } from './export-files';

/** Base installation archives, authenticated with Slate's native owner session. */
export function createInstallationExportRoutes() {
  const routes = new Hono<AppEnvironment>();
  routes.all('*', async c => {
    // This door exports only. Fresh local restore remains a separate CLI operation.
    const url = new URL(c.req.url), config = c.get('runtimeConfig'), origin = new URL(config.appUrl!).origin;
    if (!/^\/api\/portability\/exports(?:\/|$)/.test(url.pathname)) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    if (url.origin !== origin || c.req.header('origin') && c.req.header('origin') !== origin || !['GET', 'HEAD'].includes(c.req.method) && c.req.header('origin') !== origin) throw new ApiProblem(403, 'ORIGIN_DENIED', 'Use the application origin.');
    await requireStepUp(c, 'export');
    const ctx = featureContext(c);
    const { auth } = await createSlateAuth(ctx.db, config);
    const actor = await auth.requireStepUp(c.req.raw, 'export');
    const epoch = (await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch: number}>())!.epoch;
    await requireExportCoverage(ctx);
    // Coverage is evaluated against a single ACL epoch. A role, membership,
    // page or grant change during archive work must close this response too.
    async function currentAuthority() {
      const current = await auth.requireStepUp(c.req.raw, 'export');
      if (current.operator.id !== actor.operator.id || current.operator.version !== actor.operator.version || current.operator.role !== 'owner'
        || (await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch: number}>())?.epoch !== epoch) throw new ApiProblem(403, 'AUTHORITY_CHANGED', 'Your access changed. Start the export again.');
      return current.operator.id;
    }
    await currentAuthority();
    const handler = await createPortabilityHandler({
      db: ctx.db, buckets: { FILES: await retainedFiles(ctx.db, ctx.files) },
      policy: await installationPolicy(ctx.db), appOrigin: origin,
      authorize: currentAuthority,
    });
    // Hono validates JSON in its global middleware and caches the consumed body.
    const response = await handler(await cloneRawRequest(c.req));
    if (!response) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    await currentAuthority();
    if (!response.body || !response.ok) return response;
    // Base downloads stream lazily. Recheck native session/proof and the coverage
    // epoch before releasing every chunk, including the first manifest chunk.
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          await currentAuthority();
          const next = await reader.read();
          await currentAuthority();
          if (next.done) { reader.releaseLock(); controller.close(); }
          else controller.enqueue(next.value);
        } catch (error) {
          try { await reader.cancel(error); } finally { reader.releaseLock(); controller.error(error); }
        }
      },
      async cancel(reason) { await reader.cancel(reason); reader.releaseLock(); },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  });
  return routes;
}
