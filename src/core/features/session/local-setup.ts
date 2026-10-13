import { AuthError } from '../../../../modules/operator-auth/index.mjs';
import { requireLoopback, requirePost } from '../../../../modules/operator-auth/http.mjs';
import { isLocalCli } from '../../../../modules/operator-auth/local-cli.mjs';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { slateSessions } from './auth';

export const LOCAL_SETUP_PATH = '/auth/setup-complete';

/** Acknowledge the existing native claim to rer setup; never create authority. */
export async function completeNativeLocalSetup(request: Request, db: D1Database, config: RuntimeConfig) {
  // The CLI signs with the raw private setting. Keep this proof confined to
  // completion; Base email/provider proofs retain Slate's derived auth key.
  const local = { origin: new URL(config.appUrl!).origin, local: config.localDevelopment, SESSION_SECRET: config.sessionSecret };
  requirePost(request, local);
  requireLoopback(request);
  if (!await isLocalCli(request, local)) throw new AuthError('owner_required', 403);
  const owner = await slateSessions(db, config).member("role='owner' AND status='active' ORDER BY is_setup_owner DESC, created_at, id");
  if (!owner) throw new AuthError('owner_required', 403);
  // Native dependency authority always refuses first-setup provider claims.
  // There is no Base first_setup flag to mutate, nor a second owner ledger.
  return { complete: true };
}
