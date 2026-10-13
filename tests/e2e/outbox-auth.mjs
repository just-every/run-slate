import { devKeyHeaders, testDevKey } from './dev-key.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const messagePaths = html => [...html.matchAll(/href="([^"<>]*\?message=[^"<>]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
async function inbox(origin) {
  const response = await fetch(origin + '/__dev/outbox', {headers: devKeyHeaders});
  assert.equal(response.status, 200, 'The isolated development outbox must be available.');
  return messagePaths(await response.text());
}
export async function newOutboxLink(origin, before) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const paths = await inbox(origin);
    for (const entry of paths.filter(value => !before.includes(value))) {
      const response = await fetch(new URL(entry, origin), {headers: devKeyHeaders});
      const html = await response.text();
      const match = html.match(/class="open" href="([^"<>]+)"/);
      if (!match) continue;
      const link = new URL(match[1].replaceAll('&amp;', '&'));
      assert.equal(link.origin, origin);
      assert.equal(link.pathname, '/auth/confirm');
      return link.href;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('A new development outbox magic link was not captured.');
}
/** Strict JSON native request, fresh durable capture, real acceptance and cookie. */
export async function signInWithOutbox(origin, email) {
  const before = await inbox(origin);
  const request = await fetch(origin + '/api/auth/magic', {method: 'POST', headers: {'content-type':'application/json', origin}, body: JSON.stringify({email, requestKey: randomUUID()})});
  assert.equal(request.status, 200, 'The native magic request must succeed.');
  const link = new URL(await newOutboxLink(origin, before));
  const response = await fetch(link.origin + link.pathname, {method:'POST', headers:{origin,'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({token:link.searchParams.get('token')}),redirect:'manual'});
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie?.startsWith('slate_session='));
  const session = await fetch(origin + '/api/session', {headers:{cookie}});
  assert.equal(session.status, 200);
  return {cookie, body:{next:response.headers.get('location'), ...(await session.json())}};
}
/** Exercise the actual email form and outbox UI, retaining browser cookie storage. */
export async function signInBrowser(page, origin, email = 'jamie@aurora.example') {
  const before = await inbox(origin);
  await page.goto(origin + '/signin');
  await page.getByLabel('Email address', {exact:true}).fill(email);
  await page.getByRole('button', {name:'Email me a sign-in link', exact:true}).click();
  const link = await newOutboxLink(origin, before);
  // The browser trades the local dev key for the outbox gate cookie, as RER_OPEN does.
  assert.equal((await page.request.post(origin + '/__dev/key', {data: {key: testDevKey}})).status(), 204);
  await page.goto(origin + '/__dev/outbox');
  const message = await page.getByRole('link', {name:'Read message', exact:true}).first().getAttribute('href');
  await page.goto(new URL(message, origin).href);
  const open = page.getByRole('link', {name:'Open this link', exact:true});
  assert.equal(await open.getAttribute('href'), link);
  await open.click();
  await page.getByRole('button', {name:'Confirm',exact:true}).click();
  // An owner whose workspace is not yet set up is routed to the native setup wizard instead of the app.
  await page.waitForURL(url => url.origin === origin && (url.pathname === '/app' || url.pathname === '/setup'));
}
