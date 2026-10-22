import { Hono } from 'hono';
import type { AppEnvironment } from '../../../app/types';
import { ApiProblem } from '../../../app/problems';
import { slateSessions } from '../auth';
import { readSamlConfig } from './storage';
import { consumeSaml, samlMetadata, startSaml } from './flow';
import { checkSamlDomain } from './domain';
import { requireSamlOwner, samlOwnerGuard, samlSettings, saveSamlSettings } from './settings';
import { escapeXml } from './xml';

/** Failed browser sign-ins are readable documents; API clients keep structured errors. */
async function protocolResponse(request:Request,run:()=>Promise<Response>):Promise<Response> {
 try{return await run();}catch(cause){
  if(!(cause instanceof ApiProblem)||!request.headers.get('accept')?.includes('text/html'))throw cause;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SAML sign-in unavailable · Slate</title><style>body{font:18px/1.6 system-ui,sans-serif;color:#20211e;background:#fafaf7;margin:0}main{max-width:36rem;padding:4rem 1.5rem;margin:auto}h1{font-size:2rem;line-height:1.2}a{color:#145a3d;text-decoration:underline}</style></head><body><main><h1>SAML sign-in could not be completed</h1><p>${escapeXml(cause.message)}</p><p><a href="/signin">Return to sign in</a></p></main></body></html>`,{status:cause.status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 }
}
export function createSamlRoutes() {
 return new Hono<AppEnvironment>()
  .get('/auth/saml/metadata',c=>c.body(samlMetadata(new URL(c.get('runtimeConfig').appUrl!).origin),200,{'content-type':'application/samlmetadata+xml; charset=utf-8'}))
  .get('/auth/saml/start',c=>protocolResponse(c.req.raw,()=>startSaml(c.req.raw,slateSessions(c.env.DB,c.get('runtimeConfig')),new URL(c.get('runtimeConfig').appUrl!).origin)))
  .post('/auth/saml/acs',c=>protocolResponse(c.req.raw,()=>consumeSaml(c.req.raw,slateSessions(c.env.DB,c.get('runtimeConfig')),new URL(c.get('runtimeConfig').appUrl!).origin)))
  .get('/api/auth/saml/public',async c=>{const config=await readSamlConfig(c.env.DB);return c.json({enabled:!!config?.enabled,enforced:!!config?.enforced,startUrl:'/auth/saml/start'});})
  .get('/api/auth/saml',async c=>{requireSamlOwner(c);return c.json(await samlSettings(c.env.DB,new URL(c.get('runtimeConfig').appUrl!).origin));})
  .put('/api/auth/saml',async c=>c.json(await saveSamlSettings(c)))
  .post('/api/auth/saml/verify-domain',async c=>{
   const owner=await samlOwnerGuard(c),config=await readSamlConfig(c.env.DB);
   if(!config)throw new ApiProblem(409,'SAML_CONFIG_REQUIRED','Save the SAML configuration first.');
   await checkSamlDomain(c.env.DB,config,Date.now(),[owner]);
   return c.json(await samlSettings(c.env.DB,new URL(c.get('runtimeConfig').appUrl!).origin));
  });
}
