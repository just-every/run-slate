import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {signInWithOutbox} from './outbox-auth.mjs';

test('test outbox harness requests strict native magic JSON and accepts only a new captured link', async () => {
  let requested = false, accepted = false, origin;
  const server = createServer(async (request,response) => {
    const url = new URL(request.url,origin);
    if(url.pathname==='/__dev/outbox') {
      response.writeHead(200,{'content-type':'text/html'});
      if(url.searchParams.get('message')==='fresh') response.end(`<a class="open" href="${origin}/auth/confirm?token=test-only-fixture-token">Open this link</a>`);
      else response.end(`${requested?'<a href="/__dev/outbox?message=fresh">Read message</a>':''}<a href="/__dev/outbox?message=stale">Read message</a>`);
    } else if(url.pathname==='/api/auth/magic') {
      assert.equal(request.method,'POST'); assert.equal(request.headers.origin,origin);
      assert.equal(request.headers['content-type'],'application/json');
      const chunks=[];for await(const chunk of request)chunks.push(chunk);
      const body=JSON.parse(Buffer.concat(chunks).toString());assert.deepEqual(Object.keys(body).sort(),['email','requestKey']);assert.equal(body.email,'owner@test.invalid');assert.ok(body.requestKey.length>=32);
      requested=true;response.writeHead(200,{'content-type':'application/json'});response.end('{"accepted":true}');
    } else if(url.pathname==='/auth/confirm') {
      assert.equal(requested,true);assert.equal(request.method,'POST');assert.equal(request.headers.origin,origin);const chunks=[];for await(const chunk of request)chunks.push(chunk);assert.equal(new URLSearchParams(Buffer.concat(chunks).toString()).get('token'),'test-only-fixture-token');accepted=true;
      response.writeHead(303,{'set-cookie':'slate_session=test-only-fixture-session; HttpOnly; Path=/','location':'/app'});response.end();
    } else if(url.pathname==='/api/session') {
      assert.equal(accepted,true);assert.equal(request.headers.cookie,'slate_session=test-only-fixture-session');
      response.writeHead(200,{'content-type':'application/json'});response.end('{"member":{"email":"owner@test.invalid","role":"owner"}}');
    } else {response.writeHead(404);response.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  try {const session=await signInWithOutbox(origin,'owner@test.invalid');assert.equal(session.body.member.email,'owner@test.invalid');assert.equal(session.body.next,'/app');}
  finally {await new Promise(resolve=>server.close(resolve));}
});
