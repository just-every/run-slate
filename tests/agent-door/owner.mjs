import assert from 'node:assert/strict';
export default async function({request,origin,email,token,claim,reviewers}) {
 const headers={'content-type':'application/json',origin};
 const raw=await request(new URL(claim.path,origin).href,{method:'POST',headers,body:JSON.stringify({token}),redirect:'manual'});
 assert.equal(raw.status,403);await raw.body?.cancel();
 const response=await request(new URL(claim.path,origin).href,{method:'POST',headers,body:JSON.stringify({token:claim.token,displayName:'Morgan Lee',returnTo:'/app'}),redirect:'manual'});
 assert.equal(response.status,303);
 const cookie=response.headers.getSetCookie().map(item=>item.split(';',1)[0]).join('; ');
 const read=await request(new URL('/api/workspace',origin).href,{headers:{cookie}});assert.equal(read.status,200);await read.body?.cancel();
 const replay=await request(new URL(claim.path,origin).href,{method:'POST',headers,body:JSON.stringify({token:claim.token}),redirect:'manual'});assert.equal(replay.status,409);await replay.body?.cancel();
 await reviewers.initialize('reviewer',{cookie});
 console.log('Native owner bootstrap: raw=403 signed=303 owner-read=200 replay=409');
 return response;
}
