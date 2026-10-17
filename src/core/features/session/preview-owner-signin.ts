import { validToken } from '../../../../modules/operator-auth/crypto.mjs';
import { requirePost } from '../../../../modules/operator-auth/http.mjs';
import { confirmationResponse } from '../../../../modules/operator-auth/identity/email-link/confirmation.mjs';
import { OWNER_SIGNIN_PATH, OWNER_SIGNIN_SECONDS, ownerSigninDigest } from '../../../../modules/operator-auth/owner-signin-grant.mjs';
import { mutationGuard } from '../../app/operations';
import type { AppBindings } from '../../app/types';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { slateSessions } from './auth';
import { TENANT, version } from './native/store';

export { OWNER_SIGNIN_PATH };

/**
 * A live grant names the workspace's active owner at its current authority
 * version, is unconsumed and unexpired, and never runs longer than Base's
 * OWNER_SIGNIN_SECONDS from now whatever the writer's clock said.
 */
const LIVE = `g.token_hash=? AND g.consumed_at IS NULL AND g.expires_at>? AND g.expires_at<=?
  AND m.role='owner' AND m.status='active' AND m.workspace_id=${TENANT} AND g.operator_version=${version('m')}`;
const live = async (token: string, now: number) => [await ownerSigninDigest(token), now, now + OWNER_SIGNIN_SECONDS * 1000] as const;

/**
 * A grant's owner email whatever its state, so a token holder whose grant cannot
 * be used is sent to sign-in with their address filled in. Without a token
 * nothing is looked up: an anonymous visitor never learns the owner's address.
 */
async function grantEmail(db: D1Database, token: unknown): Promise<string | undefined> {
  if (typeof token !== 'string' || !validToken(token)) return undefined;
  const row = await db.prepare('SELECT m.email FROM oa_owner_signins g JOIN members m ON m.id=g.operator_id WHERE g.token_hash=?').bind(await ownerSigninDigest(token)).first<{ email: string }>();
  return row?.email;
}

/** Slate's sign-in page, saying the owner link no longer works and prefilled with the grant's email when known. */
async function signInInstead(db: D1Database, token: unknown): Promise<Response> {
  const email = await grantEmail(db, token);
  const search = new URLSearchParams({ owner_link: '1', ...(email ? { login_hint: email } : {}) });
  return new Response(null, { status: 303, headers: { Location: `/signin?${search}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

/** RER marks a preview Worker with RER_PREVIEW=true (or, earlier, a RER_PREVIEW_TOKEN secret); a live Worker has neither. */
const isPreviewWorker = (env: Pick<AppBindings, 'RER_PREVIEW' | 'RER_PREVIEW_TOKEN'>) => env.RER_PREVIEW === 'true' || Boolean(env.RER_PREVIEW_TOKEN);

/**
 * The owner's entry into a Managed preview (Base's /auth/owner-signin, native):
 * RER writes one single-use grant into the preview's own database and opens
 * this path with its token. GET shows the confirmation and writes nothing; its
 * POST consumes the grant and issues the owner's native session in one batch.
 * Only a preview Worker honours a grant. A grant that cannot be used (missing,
 * used, expired, another member's, or opened on a Worker that is not a preview)
 * sends the person to Slate's sign-in page instead, never to an error body.
 */
export async function previewOwnerSignIn(request: Request, env: AppBindings, config: RuntimeConfig, branding: { productName: string; accentColor: string; signInPath: string; theme: string }): Promise<Response> {
  const db = env.DB;
  if (request.method === 'GET' || request.method === 'HEAD') {
    const token = new URL(request.url).searchParams.get('token');
    if (!isPreviewWorker(env) || !validToken(token)) return signInInstead(db, token);
    const now = Date.now();
    const grant = await db.prepare(`SELECT g.expires_at AS expiresAt FROM oa_owner_signins g JOIN members m ON m.id=g.operator_id WHERE ${LIVE}`).bind(...await live(token, now)).first<{ expiresAt: number }>();
    if (!grant) return signInInstead(db, token);
    return confirmationResponse({ branding, preview: { kind: 'owner', expiresInMinutes: Math.max(1, Math.ceil((grant.expiresAt - now) / 60000)) }, token, method: request.method, action: OWNER_SIGNIN_PATH });
  }
  requirePost(request, { origin: new URL(config.appUrl!).origin, local: config.localDevelopment });
  const token = (await request.formData()).get('token');
  const invalid = () => signInInstead(db, token);
  if (!isPreviewWorker(env) || typeof token !== 'string' || !validToken(token)) return invalid();
  const now = Date.now(), args = await live(token, now);
  const owner = await db.prepare(`SELECT m.id FROM oa_owner_signins g JOIN members m ON m.id=g.operator_id WHERE ${LIVE}`).bind(...args).first<{ id: string }>();
  const store = slateSessions(db, config), person = owner && await store.member('id=?', owner.id);
  if (!person) return invalid();
  // One transaction: the grant is still live for this owner, is consumed, and
  // the session is issued; a reused, expired or raced grant issues nothing.
  const completed = await store.issue({ person, kind: 'native', now, returnTo: '/app', freshProof: true, statements: [
    mutationGuard(db, `SELECT EXISTS(SELECT 1 FROM oa_owner_signins g JOIN members m ON m.id=g.operator_id WHERE ${LIVE} AND m.id=?)`, [...args, person.id]),
    db.prepare('UPDATE oa_owner_signins SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL').bind(now, args[0]),
  ] });
  if (!completed) return invalid();
  return new Response(null, { status: 303, headers: { Location: completed.returnTo, 'Set-Cookie': completed.cookie, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
