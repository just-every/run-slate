import { setTimeout } from 'node:timers/promises';
import { createHmac } from 'node:crypto';
const hmac = (key, value) => createHmac('sha256', key).update(value).digest('hex');
// Base operator-auth's local CLI proof (modules/operator-auth/local-cli.mjs), keyed
// by the operator-auth secret Slate derives from SESSION_SECRET (session/auth.ts):
// CLI sign-ins on this loopback server never spend the owner's sign-in budget.
const localCliProof = secret => hmac(hmac(secret, 'slate:operator-auth:v1'), 'local-cli\0sign-in');
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function messages(context) {
  // Slate declares devIdentity: its outbox answers only with the checkout's dev key.
  const response = await fetch(new URL('/__dev/outbox', context.origin), { signal: context.signal, headers: context.devKey ? { 'x-rer-dev-key': context.devKey } : {} });
  if (!response.ok) { await response.body?.cancel(); throw context.fail('setup'); }
  const wanted = `To: ${escape(context.vars.SETUP_OWNER_EMAIL)}</p>`.toLowerCase();
  return (await response.text()).split('<article>').slice(1).filter(part => part.toLowerCase().includes(wanted))
    .map(part => /\?message=([^"&]+)"/.exec(part)?.[1]).filter(Boolean).map(decodeURIComponent);
}
// Slate's first native request claims an empty installation for SETUP_OWNER_EMAIL.
// Existing owners and their workspaces are preserved by the native auth service.
export async function owner(context) {
  const before = new Set(await messages(context));
  const response = await fetch(new URL('/api/auth/magic', context.origin), {
    method: 'POST', signal: context.signal, redirect: 'error',
    headers: { Origin: context.origin, 'Content-Type': 'application/json', ...(typeof context.vars.SESSION_SECRET === 'string' && context.vars.SESSION_SECRET ? { 'x-rer-local-cli': localCliProof(context.vars.SESSION_SECRET) } : {}) },
    body: JSON.stringify({ email: context.vars.SETUP_OWNER_EMAIL }),
  });
  if (!response.ok) { await response.body?.cancel(); throw context.fail('setup'); }
  await response.body?.cancel();
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = (await messages(context)).find(id => !before.has(id));
    if (id) {
      context.ownerOutboxMessage = id;
      return;
    }
    await setTimeout(200, undefined, { signal: context.signal });
  }
  throw context.fail('setup');
}

export async function signIn(context) {
  // Dev/outbox request a fresh ordinary native message; setup reuses its request.
  if (!context.ownerOutboxMessage) {
    if (context.signInEmail) context.vars.SETUP_OWNER_EMAIL = context.signInEmail;
    await owner(context);
  }
  if (!context.ownerOutboxMessage || !(await messages(context)).includes(context.ownerOutboxMessage)) throw context.fail('setup');
  await context.store.step('Your sign-in link is waiting in the development outbox');
  return new URL(`/__dev/outbox?message=${encodeURIComponent(context.ownerOutboxMessage)}`, context.origin).href;
}
