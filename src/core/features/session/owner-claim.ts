import { ownerIdentity } from '../../../ext/config';
// Base verifies the signed claim; Slate retains its sole native owner/session authority.
import { verifyOwnerClaim, OwnerClaimError } from '../../../../modules/owner-claim/index.mjs';
import type { AppBindings } from '../../app/types';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { bootstrapOwner } from '../workspace/bootstrap';
import { slateSessions } from './auth';

export async function ownerClaim(request: Request, env: AppBindings, config: RuntimeConfig): Promise<Response> {
  if (!env.RER_OWNER_CLAIM_ISSUER || !env.RER_OWNER_CLAIM_INSTALLATION_ID || !env.RER_OWNER_CLAIM_PUBLIC_KEYS) return new Response('Not found.', { status: 404 });
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const origin = new URL(config.appUrl!).origin;
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.origin !== origin || request.headers.get('origin') !== origin || url.search) return Response.json({ error: 'invalid_request' }, { status: 403, headers });
  try {
    const input = request.headers.get('content-type')?.includes('application/json') ? await request.json() as Record<string, unknown> : Object.fromEntries(await request.formData());
    if (typeof input.token !== 'string' || (input.displayName !== undefined && (typeof input.displayName !== 'string' || input.displayName.length > 160)) || Object.keys(input).some(key => !['token', 'returnTo', 'displayName'].includes(key))) return Response.json({ error: 'invalid_input' }, { status: 400, headers });
    const claim = await verifyOwnerClaim(input.token, { issuer: env.RER_OWNER_CLAIM_ISSUER, installationId: env.RER_OWNER_CLAIM_INSTALLATION_ID, publicKeys: JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS), appOrigin: origin, expectedEmail: config.setupOwnerEmail! });
    // The empty-workspace CAS is the native one-use claim: existing installations
    // and concurrent/replayed claims cannot create or regain owner authority.
    if (!await bootstrapOwner(env.DB, config, claim.email, ownerIdentity.name, input.displayName as string | undefined)) return Response.json({ error: 'claim_unavailable' }, { status: 409, headers });
    const store = slateSessions(env.DB, config);
    const person = await store.member('lower(email)=lower(?)', claim.email);
    const session = person && await store.issue({ person, kind: 'native', now: Date.now(), returnTo: '/app', freshProof: true });
    if (!session) throw new Error('Native session unavailable');
    return new Response(null, { status: 303, headers: { ...headers, 'Set-Cookie': session.cookie, Location: session.returnTo } });
  } catch (error) {
    return Response.json({ error: error instanceof OwnerClaimError ? (error as { code: string }).code : 'claim_unavailable' }, { status: error instanceof OwnerClaimError ? (error as { status: number }).status : 503, headers });
  }
}
