import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { runtimeHealth } from './runtime-health.mjs';

test('readiness owns fresh connections across idle closes and drains every response', async t => {
  const sockets = new Set(), received = [];
  const server = http.createServer((request, response) => {
    sockets.add(request.socket);
    received.push([request.method, request.url, request.headers.connection, request.headers['x-runtime-probe']]);
    response.writeHead(received.length % 2 ? 200 : 503);
    response.end('health body');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (let pair = 0; pair < 20; pair++) {
    assert.equal(await runtimeHealth(origin, { connection: 'keep-alive', 'x-runtime-probe': 'preserved' }, 1000), 200);
    server.closeIdleConnections();
    assert.equal(await runtimeHealth(origin, new Headers({ 'x-runtime-probe': 'preserved' }), 1000), 503);
  }
  assert.equal(sockets.size, 40);
  assert.deepEqual(received, Array.from({ length: 40 }, () => ['GET', '/health', 'close', 'preserved']));
});

test('a stalled readiness response cannot outlive its deadline', async t => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200);
    response.write('unfinished');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await assert.rejects(runtimeHealth(`http://127.0.0.1:${server.address().port}`, undefined, 100), { name: 'AbortError' });
});
