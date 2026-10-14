import { createDependencies } from '../../../../modules/dependencies/index.mjs';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { createSlateAuth } from './auth';

/** Shared protocol routes, composed with Slate's native authority before document rendering. */
export async function slateDependencyResponse(request: Request, db: D1Database, config: RuntimeConfig): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/.well-known/rer-') && !path.startsWith('/auth/dependencies/') && !path.startsWith('/auth/oidc/auth/') && !['/auth/providers', '/auth/settings/identity'].includes(path)) return null;
  const { auth, handle } = await createSlateAuth(db, config);
  const dependencies = createDependencies({ db, auth, name: 'Slate', origin: new URL(config.appUrl!).origin, local: config.localDevelopment, provider: config.dependencyProvider });
  return await dependencies.handle(request) ?? await handle(request);
}
