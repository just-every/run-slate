import { createHmac } from 'node:crypto';
import { owner as claimWithSetupToken } from '@runeditrun/rer/adapter-auth';
const hmac = (key, value) => createHmac('sha256', key).update(value).digest('hex');
const localCliProof = secret => hmac(hmac(secret, 'slate:operator-auth:v1'), 'local-cli\0sign-in');

/** The native request claims an empty local workspace; development mail is suppressed. */
export async function owner(context) {
  if (context.vars.LOCAL_DEVELOPMENT !== 'true' && context.vars[context.ownerClaim?.tokenField ?? 'SETUP_TOKEN']) return claimWithSetupToken(context, {});
  const response = await fetch(new URL('/api/auth/magic', context.origin), {
    method: 'POST', signal: context.signal, redirect: 'error',
    headers: { Origin: context.origin, 'Content-Type': 'application/json', 'x-rer-local-cli': localCliProof(context.vars.SESSION_SECRET) },
    body: JSON.stringify({ email: context.vars.SETUP_OWNER_EMAIL }),
  });
  if (!response.ok) { await response.body?.cancel(); throw context.fail('setup'); }
  await response.body?.cancel();
}

/** rer dev exchanges its private key for a native local session. */
export async function signIn(context) { return new URL('/app', context.origin).href; }
