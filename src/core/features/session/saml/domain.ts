import { mutationGuard } from '../../../app/operations';
import { readSamlConfig } from './storage';
import { DAY, type SamlConfig } from './types';

export const txtName = (config:Pick<SamlConfig,'email_domain'>) => `_slate-saml.${config.email_domain}`;
export const txtValue = (config:Pick<SamlConfig,'dns_challenge'>) => `slate-saml-verification=${config.dns_challenge}`;
function txt(data:unknown):string|null {
 if(typeof data!=='string')return null;
 const chunks=[...data.matchAll(/"([^"\\]*)"/g)];
 if(!chunks.length||data.replace(/"([^"\\]*)"/g,'').trim())return null;
 return chunks.map(chunk=>chunk[1]).join('');
}
/** The resolver is a fixed network edge, never a caller-selected URL. */
export async function checkSamlDomain(db:D1Database, config:SamlConfig, now=Date.now(), fences:D1PreparedStatement[]=[]):Promise<void> {
 let verified=false, failure:string|null=null;
 try {
  const url=new URL('https://cloudflare-dns.com/dns-query'); url.searchParams.set('name',txtName(config)); url.searchParams.set('type','TXT');
  const response=await fetch(url,{headers:{accept:'application/dns-json'},redirect:'manual',signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error('resolver');
  const raw=await response.text(); if(raw.length>65536)throw new Error('resolver');
  const data=JSON.parse(raw) as {Status?:unknown;Answer?:{type?:unknown;data?:unknown;name?:unknown}[]};
  verified=data.Status===0 && Array.isArray(data.Answer) && data.Answer.some(answer=>answer.type===16 && typeof answer.name==='string' && answer.name.replace(/\.$/,'').toLowerCase()===txtName(config) && txt(answer.data)===txtValue(config));
  if(!verified)failure='The required DNS TXT record was not found.';
 } catch { failure='The DNS verification service could not confirm the TXT record.'; }
 const statements=[...fences,
  mutationGuard(db,'SELECT dns_challenge=? AND email_domain=? FROM saml_provider_config WHERE workspace_id=?',[config.dns_challenge,config.email_domain,config.workspace_id]),
  db.prepare(`UPDATE saml_provider_config SET domain_status=?,domain_checked_at=?,domain_verified_at=CASE WHEN ?=1 THEN ? ELSE domain_verified_at END,
   domain_failed_at=CASE WHEN ?=1 THEN NULL ELSE ? END,domain_failure=? WHERE workspace_id=?`).bind(verified?'verified':'failed',now,+verified,now,+verified,now,failure,config.workspace_id),
 ];
 if(!verified){
  // Owners receive a durable in-app notice once per failing daily observation.
  const notice=`saml-domain:${config.workspace_id}:${config.dns_challenge}:${Math.floor(now/DAY)}`;
  statements.push(db.prepare(`INSERT OR IGNORE INTO notifications(id,workspace_id,recipient_member_id,event,detail_json,created_at,audience)
   SELECT ?||':'||id,workspace_id,id,'saml-domain-failed',?,?,'direct' FROM members WHERE workspace_id=? AND role='owner' AND status='active'`)
   .bind(notice,JSON.stringify({samlDomainFailure:{domain:config.email_domain,checkedAt:now,reason:failure},outcome:'SAML domain verification failed. New members cannot be created through SAML until the TXT record is verified again.'}),new Date(now).toISOString(),config.workspace_id));
 }
 await db.batch(statements);
}
export async function recheckSamlDomains(db:D1Database, now=Date.now()) {
 const config=await readSamlConfig(db);
 if(config?.enabled && (config.domain_checked_at===null || config.domain_checked_at<=now-DAY))await checkSamlDomain(db,config,now);
 await db.batch([
  db.prepare('DELETE FROM saml_requests WHERE expires_at<=?').bind(now),
  db.prepare('DELETE FROM saml_assertion_replay WHERE expires_at<=?').bind(now),
 ]);
}
