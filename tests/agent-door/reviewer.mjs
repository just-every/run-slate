import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export default async function({request,origin,email,owner,mail}) {
 const headers={cookie:owner.cookie,origin,'content-type':'application/json'};
 const before=Date.now();
 const invited=await request(new URL('/api/invitations',origin).href,{method:'POST',headers,body:JSON.stringify({operationKey:randomUUID(),email,kind:'member'})});assert.equal(invited.status,200);await invited.body?.cancel();
 const messages=await mail.read({after:before});
 const text=messages.map(item=>(item.text??'')+' '+(item.html??'')).join(' ');
 const match=text.match(/https?:\/\/[^\s"<>]*\/api\/auth\/invitation\/accept\?[^\s"<>]+/);
 assert.ok(match,'The production mail edge must accept the native invitation.');
 const link=new URL(match[0].replaceAll('&amp;','&'));
 const response=await request(new URL('/api/auth/invitation/accept',origin).href,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')}).toString(),redirect:'manual'});
 assert.equal(response.status,303);
 return response;
}
