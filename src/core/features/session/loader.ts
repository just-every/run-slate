import {redirect} from '@tanstack/react-router';
import {safeAppPath} from '../../platform/auth/paths';
import { createServerFn } from '@tanstack/react-start';
import type { SignInCapabilities } from './capabilities';

// Only public capability booleans cross the server-function boundary.
export const loadSignInCapabilities = createServerFn({ method: 'GET' }).inputValidator((data: {next?: string; requested?: number; owner_link?: number}) => data).handler(async ({data}): Promise<SignInCapabilities> => {
  const [{ requestBindings }, { runtimeConfigFor }, { getRequestUrl }, { storedSignInCapabilities }] = await Promise.all([
    import('../../platform/bindings.server'), import('../../app/runtime-gate'),
    import('@tanstack/react-start/server'), import('./capabilities'),
  ]);
  const bindings = requestBindings();
  const config = runtimeConfigFor(bindings, getRequestUrl().hostname);
  if (data.requested !== 1 && data.owner_link !== 1) {
    const [{createSessionService, sessionOptions}, {startRequestHeaders}] = await Promise.all([
      import('./service'), import('../../platform/auth/start-request'),
    ]);
    const member = await createSessionService(bindings.DB, sessionOptions(config)).authenticate(startRequestHeaders());
    if (member) throw redirect({href: safeAppPath(data.next)});
  }
  return storedSignInCapabilities(bindings.DB, config);
});
