import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export default async function({request,origin,email,owner,mail}) {
 const headers={cookie:owner.cookie,origin,'content-type':'application/json'};
 const post=async(path,body)=>{const r=await request(new URL(path,origin).href,{method:'POST',headers,body:JSON.stringify({operationKey:randomUUID(),...body})});assert.equal(r.status,200);return r.json();};
 const container=(await post('/api/containers',{name:'Guest admission',visibility:'closed'})).value;
 const page=(await post('/api/pages',{containerId:container.id,title:'Guest admission record'})).value;
 const before=Date.now();
 await post('/api/invitations',{email,kind:'guest',pageId:page.pageId,level:'view'});
 const text=(await mail.read({after:before})).map(item=>(item.text??'')+' '+(item.html??'')).join(' ');
 const match=text.match(/https?:\/\/[^\s"<>]*\/api\/auth\/invitation\/accept\?[^\s"<>]+/);
 assert.ok(match,'Native guest mail must be accepted by the declared edge.');
 const link=new URL(match[0].replaceAll('&amp;','&'));
 return request(new URL('/api/auth/invitation/accept',origin).href,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')}).toString(),redirect:'manual'});
}
