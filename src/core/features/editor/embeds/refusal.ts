import {providerEmbed,embedFrameSources} from './providers';
import {contentLimits} from '../limits';

export type EmbedVerdict = {verdict:'embeddable'|'refuses'|'unknown'; observedAt:string};
const age=86400;
/** Host-only observations contain no item URL, page, member, credentials or provider document. */
export async function observedEmbed(db:D1Database,workspaceId:string,origin:string,url:string):Promise<EmbedVerdict|null>{
  const embed=providerEmbed(url);if(!embed)return null;
  const row=await db.prepare('SELECT verdict,observed_at AS observedAt FROM provider_embed_observations WHERE workspace_id=? AND provider_host=? AND deployment_origin=?').bind(workspaceId,new URL(embed.url).hostname,origin).first<EmbedVerdict>();
  return row&&Date.now()-Date.parse(row.observedAt)<age*1000?row:null;
}
function allowed(url:URL){
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&embedFrameSources.split(' ').some(source=>source.includes('*.')?url.hostname.endsWith('.'+source.split('*.')[1])&&url.hostname!==source.split('*.')[1]:url.origin===source);
}
function admits(source:string,provider:URL,deployment:URL){
  if(source==='*')return true;
  if(source==="'self'")return provider.origin===deployment.origin;
  if(source==='https:'||source==='http:')return source===deployment.protocol;
  if(source===deployment.origin)return true;
  const wildcard=source.match(/^(https?):\/\/\*\.([^/:]+)(?::(\d+|\*))?$/);
  return !!wildcard&&deployment.protocol===wildcard[1]+':'&&deployment.hostname.endsWith('.'+wildcard[2])&&(!wildcard[3]? !deployment.port:wildcard[3]==='*'||deployment.port===wildcard[3]);
}
function refused(response:Response,url:URL,deployment:URL){
  // Every enforced policy must admit all ancestors (the wrapper and deployment share an origin).
  const policies=(response.headers.get('content-security-policy')??'').split(',');
  let ancestors=false;
  for(const policy of policies){
    const directive=policy.split(';').map(x=>x.trim()).find(x=>/^frame-ancestors(?:\s|$)/i.test(x));
    if(!directive)continue;
    ancestors=true;
    if(!directive.split(/\s+/).slice(1).some(source=>admits(source,url,deployment)))return true;
  }
  // CSP frame-ancestors supersedes X-Frame-Options in modern browsers.
  if(!ancestors){const xfo=(response.headers.get('x-frame-options')??'').toUpperCase();if(/(?:^|[,\s])DENY(?:$|[,\s])/.test(xfo)||xfo.includes('SAMEORIGIN')&&url.origin!==deployment.origin)return true;}
  return response.status>=400;
}
async function inspect(url:URL,deployment:URL,signal:AbortSignal):Promise<'embeddable'|'refuses'>{
  for(const method of ['HEAD','GET']){
    let current=url;
    for(let hop=0;;hop++){
      if(!allowed(current))throw Error('Untrusted embed destination');
      const response=await fetch(current.href,{method,redirect:'manual',credentials:'omit',headers:{accept:'text/html'},signal});
      if(response.status>=300&&response.status<400){
        await response.body?.cancel();
        const location=response.headers.get('location');
        if(!location||hop>=contentLimits.maximumUrlFetchRedirects)throw Error('Embed redirect bound');
        current=new URL(location,current);continue;
      }
      if(method==='HEAD'&&[405,501].includes(response.status)){await response.body?.cancel();break;}
      if(refused(response,current,deployment)){await response.body?.cancel();return 'refuses';}
      if(method==='HEAD'){await response.body?.cancel();break;}
      if(Number(response.headers.get('content-length'))>contentLimits.maximumUrlFetchBytes){await response.body?.cancel();throw Error('Embed size bound');}
      const reader=response.body?.getReader(),decoder=new TextDecoder();let size=0,body='';
      if(reader)try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>contentLimits.maximumUrlFetchBytes)throw Error('Embed size bound');body+=decoder.decode(chunk.value,{stream:true});}}finally{await reader?.cancel();}
      // Explicit refusal documents only; arbitrary provider applications are not parsed as failures.
      if(/(?:refused to connect|does not allow embedding|embedding (?:is )?(?:disabled|not allowed)|cannot be embedded)/i.test(body))return 'refuses';
      return 'embeddable';
    }
  }
  return 'embeddable';
}
export async function checkEmbed(db:D1Database,workspaceId:string,origin:string,raw:string):Promise<EmbedVerdict>{
  const embed=providerEmbed(raw);if(!embed)throw Error('Unsupported embed');
  const cached=await observedEmbed(db,workspaceId,origin,raw);if(cached)return cached;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  let verdict:EmbedVerdict['verdict']='unknown';
  try{verdict=await inspect(new URL(embed.url),new URL(origin),controller.signal);}catch{/* An inconclusive probe is not evidence of refusal. */}finally{clearTimeout(timer);}
  const value={verdict,observedAt:new Date().toISOString()};
  if(verdict!=='unknown')await db.prepare('INSERT INTO provider_embed_observations(workspace_id,provider_host,deployment_origin,verdict,observed_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id,provider_host) DO UPDATE SET deployment_origin=excluded.deployment_origin,verdict=excluded.verdict,observed_at=excluded.observed_at').bind(workspaceId,new URL(embed.url).hostname,origin,value.verdict,value.observedAt).run();
  return value;
}
