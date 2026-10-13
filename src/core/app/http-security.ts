import type { Context } from 'hono';
import type { AppEnvironment } from './types';
import { ApiProblem } from './problems';
import { requestHash } from './operations';
/** Browser cookies are accepted only from this deployment; absent Origin is allowed for native API callers. */
export function assertRequestOrigin(c:Context<AppEnvironment>){
  if(['GET','HEAD','OPTIONS'].includes(c.req.method)&&c.req.header('upgrade')?.toLowerCase()!=='websocket')return;
  const origin=c.req.header('origin'),expected=new URL(c.req.url).origin;
  if(origin&&origin!==expected)throw new ApiProblem(403,'ORIGIN_DENIED','This request origin is not allowed.');
  const site=c.req.header('sec-fetch-site');
  if(site==='cross-site')throw new ApiProblem(403,'ORIGIN_DENIED','Cross-site mutations are not allowed.');
  if(c.req.header('cookie')&&!origin&&site && site!=='same-origin'&&site!=='none')throw new ApiProblem(403,'CSRF_DENIED','A same-origin request is required.');
  const length=Number(c.req.header('content-length')??'0');if(c.req.header('content-type')?.includes('application/json') && length>32*1024*1024)throw new ApiProblem(413,'BODY_TOO_LARGE','The request exceeds 32 MiB.');
}
export async function enforceRateLimit(c:Context<AppEnvironment>,scope:string,limit:number,seconds=60){
  const now=Date.now(),bucket=Math.floor(now/(seconds*1000));
  const address=c.req.header('cf-connecting-ip')??'local';
  const key=await requestHash({address,scope,bucket});
  const row=await c.env.DB.prepare('INSERT INTO request_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,new Date((bucket+1)*seconds*1000).toISOString()).first<{count:number}>();
  if(row&&row.count>limit){c.header('Retry-After',String(seconds));throw new ApiProblem(429,'RATE_LIMITED','Too many requests. Try again later.');}
}

export async function publicDocumentLimit(request:Request,db:D1Database):Promise<Response|null>{
 const url=new URL(request.url);if(url.pathname!=='/'&&url.pathname!=='/signin'&&url.pathname!=='/docs'&&!url.pathname.startsWith('/docs/')&&!url.pathname.startsWith('/assets/'))return null;
 const minute=Math.floor(Date.now()/60000),key=await requestHash({scope:'public-document',address:request.headers.get('cf-connecting-ip')??'local',minute});
 const row=await db.prepare('INSERT INTO request_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,new Date((minute+1)*60000).toISOString()).first<{count:number}>();
 return row&&row.count>120?Response.json({code:'RATE_LIMITED',message:'Too many requests. Try again later.'},{status:429,headers:{'Retry-After':'60'}}):null;
}
