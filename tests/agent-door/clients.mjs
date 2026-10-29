import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {native} from './fixtures.mjs';

let proofAt=0;
async function stepUp(context) {
 if(Date.now()-proofAt<8*60_000)return;
 const before=Date.now();
 const challenge=await context.request(new URL('/auth/step-up',context.origin).href,{method:'POST',headers:{cookie:context.cookie,origin:context.origin,'content-type':'application/json'},body:JSON.stringify({action:'credentials:mint',returnTo:'/app'})});
 assert.equal(challenge.status,202);await challenge.body?.cancel();
 const text=(await context.mail.read({after:before})).map(item=>(item.text??'')+' '+(item.html??'')).join(' ');
 const match=text.match(/https?:\/\/[^\s"<>]*\/auth\/confirm\?[^\s"<>]+/);
 assert.ok(match,'Native owner step-up must reach the configured mail edge.');
 const link=new URL(match[0].replaceAll('&amp;','&'));
 const preview=await context.request(link.href,{headers:{cookie:context.cookie}});assert.equal(preview.status,200);await preview.body?.cancel();
 const confirmed=await context.request(new URL('/auth/confirm',context.origin).href,{method:'POST',headers:{cookie:context.cookie,origin:context.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')}).toString(),redirect:'manual'});
 assert.equal(confirmed.status,303);await confirmed.body?.cancel();
 proofAt=Date.now();
}
function client(record,name) {return {token:record.secret,clientId:'api-token:'+record.value.id,agent:{id:'api-token:'+record.value.id,name,specialist:'wiki curator'}};}
async function mcp(context,client,method,params) {
 const response=await context.request(new URL('/mcp',context.origin).href,{method:'POST',headers:{origin:context.origin,'content-type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...(params.name||params.uri?{'Mcp-Name':params.name??params.uri}:{}),authorization:'Bearer '+client.token},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'Native scope proof',version:'1'}}}})});
 return {status:response.status,body:await response.json()};
}
export async function nativeClients(context,containerId,pageId,foreignPageId) {
 await stepUp(context);
 const writeName='Scoped wiki client '+randomUUID(),readName='Read-only wiki client '+randomUUID();
 const write=await native(context,'/api/developer/tokens',{name:writeName,scopes:[{containerId,level:'write'}]});
 const read=await native(context,'/api/developer/tokens',{name:readName,scopes:[{containerId,level:'read'}]});
 const clients={local:client(write,writeName),reader:client(read,readName)};
 if(context.phase!=='initial') {
  const valid=await mcp(context,clients.reader,'tools/call',{name:'slate.pages.read',arguments:{id:pageId}});
  assert.equal(valid.status,200);assert.equal(valid.body.result?.isError,false);
  const missing=await mcp(context,clients.reader,'tools/call',{name:'slate.pages.create',arguments:{containerId,title:'Must refuse',idempotency_key:randomUUID()}});
  assert.equal(missing.status,403);
  for(const target of [foreignPageId,randomUUID()]) {
   const unavailable=await mcp(context,clients.reader,'resources/read',{uri:'slate://pages/'+target});
   assert.equal(unavailable.body.error?.data?.code,'resource_unavailable');
  }
  console.log('Native scoped MCP proof: permitted read=200 read-only write=403 foreign/missing resource=resource_unavailable');
 }
 return clients;
}
