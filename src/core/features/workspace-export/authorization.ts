import type { Context } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { requireStepUp } from '../session/step-up';

/** Local mail is suppressed; the authenticated local owner can back up directly. */
export async function requireWorkspaceExportAuthority(c: Context<AppEnvironment>): Promise<void> {
  await requireWorkspaceOwner(featureContext(c));
  const config = c.get('runtimeConfig');
  if (config.localDevelopment) {
    // Runtime configuration admits this mode only at an exact loopback origin.
    // Keep the exception tied to a human session, never an agent credential.
    if (!c.get('sessionId')) throw new ApiProblem(401, 'UNAUTHENTICATED', 'A valid session is required.');
    if (new URL(c.req.url).origin !== config.appUrl) throw new ApiProblem(403, 'ORIGIN_DENIED', 'Use the application origin.');
    return;
  }
  await requireStepUp(c, 'export');
}
