import {appendFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
/** Local transport fixtures intercept actual Workerd outbound HTTP. No network escapes. */
const captured:{url:string;method:string;body:string;headers:Record<string,string>}[]=[];
export async function readCaptured(request:Request){if(request.method==='DELETE')captured.length=0;return Response.json(captured);}
export async function captureOutbound(request:Request){
 const body=await request.text(),url=new URL(request.url);captured.push({url:request.url,method:request.method,body,headers:Object.fromEntries(request.headers)});
 if(process.env.QUAL_EVIDENCE){await mkdir(process.env.QUAL_EVIDENCE,{recursive:true});await appendFile(path.join(process.env.QUAL_EVIDENCE,'captured-http.jsonl'),JSON.stringify(captured.at(-1))+'\n');}
 if(url.hostname==='identity.example.invalid'&&url.pathname==='/.well-known/openid-configuration')return Response.json({issuer:url.origin,authorization_endpoint:url.origin+'/authorize',token_endpoint:url.origin+'/token',jwks_uri:url.origin+'/keys'});
 if(url.hostname==='cloudflare-dns.com')return Response.json({Answer:url.searchParams.get('type')==='A'?[{type:1,data:'93.184.216.34'}]:[]});
 if(url.hostname==='personal-canary.example.com')return new Response('<title>Local canary fixture</title>',{headers:{'content-type':'text/html'}});
 if(url.hostname==='api.resend.com')return Response.json({id:'TEST-BOUNDARY-RECEIPT'});
 // Deliberate failures prove requests and fail-closed behavior, not provider acceptance.
 return new Response('External networking blocked by data qualification boundary',{status:503});
}
