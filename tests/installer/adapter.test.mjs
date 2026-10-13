import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { owner, signIn } from '../../scripts/installer/auth.mjs';
import { repository } from './helpers.mjs';

test('native owner hook sends strict Slate JSON and sign-in opens its new outbox message', async t => {
  let gets = 0; const requests = [];
  const old = '<article><p>To: owner@example.test</p><a href="?message=old">old</a></article>';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([new URL(url).pathname, options]);
    if (new URL(url).pathname === '/api/auth/magic') return new Response('{"accepted":true}', { status: 200 });
    gets++;
    return new Response(old + (gets > 1 ? '<article><p>To: other@example.test</p><a href="?message=wrong">other</a></article><article><p>To: owner@example.test</p><a href="?message=new">new</a></article>' : ''));
  });
  const origin = 'http://127.0.0.1:41234', signal = new AbortController().signal;
  const context = { origin, signal, vars: { SETUP_OWNER_EMAIL: 'owner@example.test' }, store: { step: async () => {} }, fail: () => Error('setup failed') };
  await owner(context);
  assert.equal(context.ownerOutboxMessage, 'new');
  const result = await signIn(context);
  assert.equal(result, origin + '/__dev/outbox?message=new');
  const post = requests.find(([path]) => path === '/api/auth/magic')[1];
  assert.equal(post.method, 'POST'); assert.equal(post.headers.Origin, origin); assert.equal(post.signal, signal);
  assert.deepEqual(JSON.parse(post.body), { email: 'owner@example.test' });
  assert.equal(requests.filter(([path]) => path === '/api/auth/magic').length, 1, 'sign-in opens the captured link without another request');
});
test('sign-in cannot complete without a newly captured owner message', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<article><p>To: owner@example.test</p><a href="?message=old">old</a></article>'));
  const context = { origin: 'http://127.0.0.1:41234', vars: { SETUP_OWNER_EMAIL: 'owner@example.test' }, store: { step: async () => assert.fail('must not report ready') }, fail: () => Error('setup failed') };
  await assert.rejects(signIn(context), /setup failed/);
  await assert.rejects(signIn({ ...context, ownerOutboxMessage: 'missing' }), /setup failed/);
});
