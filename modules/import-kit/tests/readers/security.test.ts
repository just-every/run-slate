import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readApiSource } from '../../src/readers/index.ts';
import { createD1ImportJob, planD1Import, readD1ImportOriginals } from '../../src/d1/index.ts';
import { sqliteMapping, sqliteRuntime } from '../d1/sqlite-runtime.ts';
import type { Json } from '../../src/types.ts';
import { apiInput, code, jsonResponse } from './helpers.ts';

test('rejects cross-origin pagination/redirects before sending a credential to another origin', async () => {
  for (const next of ['https://other.example.test/items', '//other.example.test/items', 'http://import.example.test/items', 'https://import.example.test:9443/items']) {
    for (const redirect of [false, true]) {
      const requests: Request[] = [];
      await assert.rejects(readApiSource(apiInput({ token: 'synthetic-secret' }), async request => {
        requests.push(request);
        return redirect ? new Response(null, { status: 302, headers: { location: next } }) : jsonResponse([{ id: 'a' }], next);
      }), code('CROSS_ORIGIN_SOURCE_URL'));
      assert.equal(requests.length, 1);
      assert.equal(new URL(requests[0].url).origin, 'https://import.example.test');
    }
  }
});

test('same-origin redirects preserve auth and exact noncredential query data within request limits', async () => {
  const requests: Request[] = [];
  const bundle = await readApiSource(apiInput({ token: 'synthetic-secret' }), async request => {
    requests.push(request);
    return requests.length === 1 ? new Response(null, { status: 307, headers: { location: '/v2/items?cursor=a%2Fb' } }) : jsonResponse([{ id: 'a' }]);
  });
  assert.equal(requests.length, 2); assert.equal(requests[1].url, 'https://import.example.test/v2/items?cursor=a%2Fb');
  assert.equal(requests[1].headers.get('authorization'), 'Bearer synthetic-secret');
  assert.equal(bundle.artifacts.length, 1);
  await assert.rejects(readApiSource(apiInput({ maxRequests: 1 }), async () => new Response(null, { status: 302, headers: { location: '/v2' } })), code('SOURCE_REQUEST_LIMIT'));
  await assert.rejects(readApiSource(apiInput(), async () => new Response(null, { status: 302, headers: { location: '/items' } })), code('SOURCE_PAGINATION_CYCLE'));
});

test('credential URLs are rejected intact; no stripping, metadata leakage or second request', async () => {
  for (const next of [
    '/items?access_token=synthetic-secret', '/items?API_KEY=synthetic-secret',
    'https://name:test-password@import.example.test/items', '/items?cursor=synthetic-secret',
    '/items?cursor=synthetic%2Dsecret', '/items?x=1#synthetic-secret',
  ]) {
    let calls = 0;
    await assert.rejects(readApiSource(apiInput({ token: 'synthetic-secret' }), async () => {
      calls++; return new Response(null, { status: 302, headers: { location: next } });
    }), error => { assert.ok(error instanceof Error); assert.ok(!JSON.stringify(error).includes('synthetic-secret')); assert.ok(!error.message.includes('synthetic-secret')); return true; });
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(readApiSource(apiInput({ url: 'https://import.example.test/items?token=synthetic-secret' }), async () => { calls++; return jsonResponse([]); }));
  assert.equal(calls, 0);
});

test('credentials in response originals, parser output or thrown errors cannot reach a bundle or diagnostics', async () => {
  const payloads: Json[] = [{ id: 'a', token: 'test-other-value' }, { id: 'a', message: 'synthetic-secret' }, { id: 'a', message: 'Bearer synthetic-secret' }];
  for (const payload of payloads) {
    await assert.rejects(readApiSource(apiInput({ token: 'synthetic-secret', parsePage: () => ({ records: [] }) }), async () => jsonResponse([payload])), error => {
      assert.ok(!JSON.stringify(error).includes('synthetic-secret')); return true;
    });
  }
  await assert.rejects(readApiSource(apiInput({ token: 'synthetic-secret', parsePage: () => ({ records: [{ kind: 'ticket', sourceId: 'a', payload: { leak: 'synthetic-secret' } }] }) }), async () => jsonResponse([])), code('CREDENTIAL_IN_SOURCE_DATA'));
  await assert.rejects(readApiSource(apiInput({ token: 'synthetic-secret' }), async () => { throw new Error('Bearer synthetic-secret'); }), error => {
    assert.ok(code('SOURCE_REQUEST_FAILED')(error)); assert.ok(!String(error).includes('synthetic-secret')); assert.equal((error as Error).cause, undefined); return true;
  });
});

test('explicit header credentials work in memory; conflicts fail rather than dropping credentials', async () => {
  let calls = 0;
  await assert.rejects(readApiSource(apiInput({ token: 'test-one-value', headers: { Authorization: 'Bearer test-another-value' } }), async () => { calls++; return jsonResponse([]); }), code('CONFLICTING_API_CREDENTIALS'));
  assert.equal(calls, 0);
  await readApiSource(apiInput({ headers: { Authorization: 'Bearer test-header-secret' } }), async request => {
    assert.equal(request.headers.get('authorization'), 'Bearer test-header-secret'); return jsonResponse([]);
  });
  await assert.rejects(readApiSource(apiInput({ headers: { Authorization: 'Bearer test-header-secret' } }), async () => jsonResponse([{ id: 'a', text: 'test-header-secret' }])), code('CREDENTIAL_IN_SOURCE_DATA'));
});

test('authentication in excluded metadata rejects before parsing while unrelated exact originals remain usable', async t => {
  const credentials = ['synthetic-' + String.fromCharCode(233), 'synthetic-' + String.fromCharCode(232, 195, 169, 241) + '-literal%41', 'synthetic-escaped%41', 'synthetic-regex.[a]+$'];
  for (const credential of credentials) {
    const encoded = encodeURIComponent(credential);
    const byteEncoded = [...credential].map(character => '%' + character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    const mixed = [...credential].map((character, index) => index % 2 ? encodeURIComponent(character) : '%' + character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    const unicodeOnly = credential.replace(/[^\x00-\x7f]/g, character => encodeURIComponent(character));
    for (const reflection of [credential, encoded, encodeURIComponent(encoded), byteEncoded, mixed, unicodeOnly, '%FF%broken/' + encodeURIComponent(encoded) + '/%C3%']) {
      for (const explicitHeader of [false, true]) {
        let parsed = false, sent = 0;
        await assert.rejects(readApiSource(apiInput({
          ...(explicitHeader ? { headers: { Authorization: 'Bearer ' + credential } } : { token: credential }),
          paginationCursorPolicy: 'page-token-v1',
          parsePage: () => { parsed = true; return { records: [] }; },
        }), async request => {
          sent++;
          assert.equal(request.headers.get('authorization'), 'Bearer ' + credential);
          return Response.json({ items: [], pagination: { next_page_token: reflection } });
        }), error => {
          assert.ok(code('CREDENTIAL_IN_SOURCE_DATA')(error));
          assert.ok(!JSON.stringify(error).includes(credential));
          return true;
        });
        assert.equal(sent, 1);
        assert.equal(parsed, false);
      }
    }
    // A value is not inferred to be authentication merely because it is encoded.
    const bytes = Buffer.from(JSON.stringify({ items: [], pagination: { next_page_token: encoded } }, null, 2) + '\r\n');
    const bundle = await readApiSource(apiInput({ token: 'synthetic-different-synthetic-auth', paginationCursorPolicy: 'page-token-v1', parsePage: () => ({ records: [] }) }), async () => new Response(bytes));
    const original = bundle.artifacts[0].original;
    assert.equal(original?.status, 'available');
    if (original?.status !== 'available') assert.fail('Missing original bytes');
    assert.deepEqual(Buffer.from(original.base64, 'base64'), bytes);
  }
  const scalarReflections = [
    ['314159265358979', '314159265358979'],
    ['314159265358979', '314159265358979.000'],
    ['314159265358979', '3.14159265358979E+14'],
    ['9007199254740993', '9007199254740993'],
    ['9007199254740993', '9.007199254740993e15'],
    ['9007199254740992', '9007199254740993'],
    ['0.00000000125', '1.25e-9'],
    ['1' + '0'.repeat(320), '1e320'],
    ['1e309', '10e308'],
    ['true', 'true'],
    ['false', 'false'],
    ['null', 'null'],
  ];
  for (const [credential, reflection] of scalarReflections) {
    for (const header of ['token', 'Authorization', 'X-Api-Key']) {
      for (const paginationCursorPolicy of [undefined, 'page-token-v1'] as const) {
        for (const preserveNumberLexeme of [undefined, () => false, () => true]) {
          let parsed = false, selected = false, sent = 0;
          await assert.rejects(readApiSource(apiInput({
            ...(header === 'token' ? { token: credential } : { headers: { [header]: header === 'Authorization' ? 'Bearer ' + credential : credential } }),
            paginationCursorPolicy,
            preserveNumberLexeme: preserveNumberLexeme && (() => { selected = true; return preserveNumberLexeme(); }),
            parsePage: () => { parsed = true; return { records: [] }; },
          }), async request => {
            sent++;
            assert.ok(header === 'X-Api-Key' ? request.headers.get(header) === credential : request.headers.get('authorization') === 'Bearer ' + credential);
            return new Response('{"items":[],"pagination":{"next_page_token":' + reflection + '}}');
          }), error => {
            assert.ok(code('CREDENTIAL_IN_SOURCE_DATA')(error));
            assert.ok(!JSON.stringify(error).includes(credential));
            return true;
          });
          assert.equal(sent, 1);
          assert.equal(parsed, false);
          assert.equal(selected, false);
        }
      }
    }
  }
  // Parser-generated scalar fields have the same boundary as response fields.
  for (const credential of ['314159265358979', 'true', 'false', 'null']) {
    await assert.rejects(readApiSource(apiInput({ token: credential, parsePage: () => ({ records: [{ kind: 'ticket', sourceId: 'a', payload: { reflection: JSON.parse(credential) } }] }) }), async () => jsonResponse([])), code('CREDENTIAL_IN_SOURCE_DATA'));
  }

  // Nearby unsafe integers must not be conflated by rounding the credential itself.
  const unrelatedCredential = '9007199254740993';
  const numericBytes = Buffer.from('{\n  "items": [], "secret": false, "flags": [true, false, null], "metadata": [314159265358979, 9007199254740992, 9.007199254740992e15, 9007199254740994, 3.14159265358979e14, 0.00000000125, -0, 1e21, {"count": 42}]\n}\r\n');
  const runtime = await sqliteRuntime(t);
  for (const paginationCursorPolicy of [undefined, 'page-token-v1'] as const) {
    for (const preserveNumberLexeme of [undefined, () => false, () => true]) {
      const bundle = await readApiSource(apiInput({ namespace: 'archive', token: unrelatedCredential, paginationCursorPolicy, preserveNumberLexeme, parsePage: () => ({ records: [] }) }), async request => {
        assert.ok(request.headers.get('authorization') === 'Bearer ' + unrelatedCredential);
        return new Response(numericBytes);
      });
      const plan = await planD1Import(bundle, sqliteMapping, runtime.context());
      const job = await createD1ImportJob(plan, { ...runtime.context(), reviewedFingerprint: plan.fingerprint });
      runtime.reopen();
      const original = (await readD1ImportOriginals(job.id, runtime.context()))[0].original;
      assert.equal(original.status, 'retained');
      if (original.status !== 'retained') assert.fail('Missing original bytes');
      assert.deepEqual(Buffer.from(original.base64, 'base64'), numericBytes);
    }
  }
});

test('rejects a transport that automatically followed a redirect', async () => {
  const response = jsonResponse([]);
  Object.defineProperty(response, 'redirected', { value: true });
  await assert.rejects(readApiSource(apiInput(), async () => response), code('UNSAFE_TRANSPORT_REDIRECT'));
});
