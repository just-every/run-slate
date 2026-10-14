import { createServerFn } from '@tanstack/react-start';
import type { SignInCapabilities } from './capabilities';

// Only public capability booleans cross the server-function boundary.
export const loadSignInCapabilities = createServerFn({ method: 'GET' }).handler(async (): Promise<SignInCapabilities> => {
  const [{ requestBindings }, { runtimeConfigFor }, { getRequestUrl }, { storedSignInCapabilities }] = await Promise.all([
    import('../../platform/bindings.server'), import('../../app/runtime-gate'),
    import('@tanstack/react-start/server'), import('./capabilities'),
  ]);
  const bindings = requestBindings();
  return storedSignInCapabilities(bindings.DB, runtimeConfigFor(bindings, getRequestUrl().hostname));
});
