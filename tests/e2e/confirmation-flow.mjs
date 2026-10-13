import assert from 'node:assert/strict';
import { newOutboxLink } from './outbox-auth.mjs';

/** A real emitted Worker request through the newly owned Hono document route. */
export async function confirmationFlow(origin) {
  const requested = await fetch(origin + '/api/auth/magic', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'jamie@aurora.example' }),
  });
  assert.equal(requested.status, 200);
  const link = new URL(await newOutboxLink(origin, []));
  const preview = await fetch(link);
  assert.equal(preview.status, 200); assert.equal(preview.headers.get('set-cookie'), null);
  assert.equal(preview.headers.get('referrer-policy'), 'strict-origin');
  const html = await preview.text();
  assert.match(html, /<form method="post" action="\/auth\/confirm">/);
  assert.doesNotMatch(html, /<script[ >]/i);
  const post = requestOrigin => fetch(origin + '/auth/confirm', {
    method: 'POST', redirect: 'manual', headers: { origin: requestOrigin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: link.searchParams.get('token') }),
  });
  assert.equal((await post('https://other.example.org')).status, 403);
  const accepted = await post(origin); assert.equal(accepted.status, 303, accepted.status === 303 ? undefined : await accepted.text());
  const cookie = accepted.headers.get('set-cookie')?.split(';', 1)[0]; assert.ok(cookie);
  assert.equal((await fetch(origin + '/api/session', { headers: { cookie } })).status, 200);
  assert.equal((await post(origin)).status, 400);
  const retired = await fetch(origin + '/api/auth/magic/accept?token=' + link.searchParams.get('token'));
  assert.equal(retired.status, 400); assert.equal(retired.headers.get('set-cookie'), null);
  assert.match(await retired.text(), /href="\/signin"/);
}
