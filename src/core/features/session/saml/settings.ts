import type { Context } from 'hono';
import { z } from 'zod';
import type { AppEnvironment } from '../../../app/types';
import { ApiProblem } from '../../../app/problems';
import { mutationGuard } from '../../../app/operations';
import { slateSessions } from '../auth';
import { actorFence } from '../native/store';
import { createOpaqueToken } from '../../../platform/auth/token';
import { requireStepUp } from '../step-up';
import { readSamlConfig } from './storage';
import { validateCertificate } from './xml';
import { DAY, samlEndpoints } from './types';
import { txtName, txtValue } from './domain';

const domain=z.string().trim().toLowerCase().min(3).max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
export const settingsSchema=z.object({idpEntityId:z.string().trim().min(1).max(2048),ssoUrl:z.string().url().max(2048),certificate:z.string().trim().max(16384).optional(),emailDomain:domain,allowedEmails:z.array(z.string().email().max(254)).max(500),enabled:z.boolean(),enforced:z.boolean(),breakGlassOwnerId:z.string().max(128).nullable().transform(value=>value||null)}).strict();
export function requireSamlOwner(c:Context<AppEnvironment>) {
 if(c.get('member')?.role!=='owner')throw new ApiProblem(403,'FORBIDDEN','Workspace owner authority is required.');
}
/** Fresh proof and current native authority are repeated after the network call, at commit. */
export async function samlOwnerGuard(c:Context<AppEnvironment>, now=Date.now()) {
 requireSamlOwner(c);
 await requireStepUp(c,'domains:change');
 const store=slateSessions(c.env.DB,c.get('runtimeConfig')),actor=await store.read(c.req.raw,now);
 if(!actor)throw new ApiProblem(401,'UNAUTHENTICATED','Sign in again.');
 const fence=actorFence(actor,now,store.identityEnabled);
 return mutationGuard(c.env.DB,`SELECT ${fence.sql} AND EXISTS(SELECT 1 FROM members WHERE id=? AND role='owner' AND status='active')
  AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND proof_at>=? AND proof_at<=? AND proof_version=?)`,[...fence.args,actor.operator.id,actor.id,now-600_000,now,actor.operator.version]);
}
export async function samlSettings(db:D1Database, origin:string) {
 const row=await readSamlConfig(db);
 const owners=(await db.prepare("SELECT id,email,display_name AS displayName FROM members WHERE workspace_id=(SELECT id FROM workspaces ORDER BY created_at,id LIMIT 1) AND role='owner' AND status='active' AND member_kind='member' ORDER BY created_at,id").all()).results;
 return {...samlEndpoints(origin),owners,txtName:row?txtName(row):null,txtValue:row?txtValue(row):null,config:row?{
  enabled:!!row.enabled,idpEntityId:row.idp_entity_id,ssoUrl:row.sso_url,certificateConfigured:!!row.certificate,emailDomain:row.email_domain,
  allowedEmails:JSON.parse(row.allowed_emails_json) as string[],enforced:!!row.enforced,breakGlassOwnerId:row.break_glass_owner_id,
  domainStatus:row.domain_status,domainVerifiedAt:row.domain_verified_at,domainCheckedAt:row.domain_checked_at,domainFailedAt:row.domain_failed_at,domainFailure:row.domain_failure,
 }:null};
}
export async function saveSamlSettings(c:Context<AppEnvironment>) {
 const input=settingsSchema.parse(await c.req.json()),now=Date.now(),db=c.env.DB;
 const ownerGuard=await samlOwnerGuard(c,now),previous=await readSamlConfig(db);
 let url:URL; try {url=new URL(input.ssoUrl);}catch{throw new ApiProblem(400,'SAML_CONFIG_INVALID','Enter the identity provider sign-in URL.');}
 const local=c.get('runtimeConfig').localDevelopment && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:' && !(local&&url.protocol==='http:'))||url.username||url.password||url.hash)throw new ApiProblem(400,'SAML_CONFIG_INVALID','Use an HTTPS identity provider URL.');
 try { new URL(input.idpEntityId); }catch{throw new ApiProblem(400,'SAML_CONFIG_INVALID','The identity provider entity ID must be an absolute URI.');}
 let certificate:string;
 try{certificate=!input.enabled&&!input.certificate&&previous?previous.certificate:validateCertificate(input.certificate||previous?.certificate||'',now);}
 catch{throw new ApiProblem(400,'SAML_CONFIG_INVALID','Paste a valid, unexpired RSA X.509 signing certificate with a key of at least 2048 bits.');}
 const unchangedDomain=previous?.email_domain===input.emailDomain;
 if(input.enforced&&(!input.enabled||!unchangedDomain||previous?.domain_status!=='verified'||!previous.domain_checked_at||previous.domain_checked_at<=now-DAY))throw new ApiProblem(400,'SAML_DOMAIN_UNVERIFIED','Verify the email domain before enforcing SSO.');
 const workspace=previous?.workspace_id??(await db.prepare('SELECT id FROM workspaces ORDER BY created_at,id LIMIT 1').first<{id:string}>())?.id;
 if(!workspace)throw new ApiProblem(409,'SAML_CONFIG_INVALID','Set up the workspace first.');
 const allowedEmails=[...new Set(input.allowedEmails.map(email=>email.toLowerCase()))];
 if(allowedEmails.some(email=>email.split('@')[1]!==input.emailDomain))throw new ApiProblem(400,'SAML_CONFIG_INVALID','Allow-listed addresses must belong to the verified domain.');
 const statements=[ownerGuard,
  mutationGuard(db,'SELECT COALESCE((SELECT generation FROM saml_provider_config WHERE workspace_id=?),0)=?',[workspace,previous?.generation??0]),
 ];
 if(input.breakGlassOwnerId)statements.push(mutationGuard(db,"SELECT EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND role='owner' AND status='active' AND member_kind='member')",[input.breakGlassOwnerId,workspace]));
 if(input.enforced&&!input.breakGlassOwnerId)throw new ApiProblem(400,'SAML_BREAK_GLASS_REQUIRED','Choose one active owner for the magic-link break-glass path.');
 if(input.enforced)statements.push(mutationGuard(db,"SELECT domain_status='verified' AND domain_checked_at>? AND email_domain=? FROM saml_provider_config WHERE workspace_id=?",[now-DAY,input.emailDomain,workspace]));
 statements.push(db.prepare(`INSERT INTO saml_provider_config(workspace_id,enabled,generation,idp_entity_id,sso_url,certificate,email_domain,dns_challenge,domain_status,domain_verified_at,domain_checked_at,domain_failed_at,domain_failure,allowed_emails_json,enforced,break_glass_owner_id,updated_by_member_id,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET enabled=excluded.enabled,generation=excluded.generation,idp_entity_id=excluded.idp_entity_id,sso_url=excluded.sso_url,certificate=excluded.certificate,email_domain=excluded.email_domain,dns_challenge=excluded.dns_challenge,domain_status=excluded.domain_status,domain_verified_at=excluded.domain_verified_at,domain_checked_at=excluded.domain_checked_at,domain_failed_at=excluded.domain_failed_at,domain_failure=excluded.domain_failure,allowed_emails_json=excluded.allowed_emails_json,enforced=excluded.enforced,break_glass_owner_id=excluded.break_glass_owner_id,updated_by_member_id=excluded.updated_by_member_id,updated_at=excluded.updated_at`)
  .bind(workspace,+input.enabled,(previous?.generation??0)+1,input.idpEntityId,url.toString(),certificate,input.emailDomain,unchangedDomain?previous!.dns_challenge:createOpaqueToken(),unchangedDomain?previous!.domain_status:'pending',unchangedDomain?previous!.domain_verified_at:null,unchangedDomain?previous!.domain_checked_at:null,unchangedDomain?previous!.domain_failed_at:null,unchangedDomain?previous!.domain_failure:null,JSON.stringify(allowedEmails),+input.enforced,input.breakGlassOwnerId,c.get('member')!.id,now));
 statements.push(db.prepare('INSERT INTO auth_identity_audit(id,actor_id,action,value,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),c.get('member')!.id,'saml:configure',JSON.stringify({enabled:input.enabled,enforced:input.enforced,idpEntityId:input.idpEntityId,emailDomain:input.emailDomain,breakGlassOwnerId:input.breakGlassOwnerId}),now));
 statements.push(db.prepare("UPDATE sessions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE auth_protocol='saml' AND member_id IN (SELECT id FROM members WHERE workspace_id=?)").bind(new Date(now).toISOString(),new Date(now).toISOString(),workspace));
 try {await db.batch(statements);}catch(cause){if(/constraint|core_write_guards/i.test(String(cause)))throw new ApiProblem(409,'AUTHORITY_CHANGED','The SAML settings or owner authority changed. Reload and try again.');throw cause;}
 return samlSettings(db,new URL(c.get('runtimeConfig').appUrl!).origin);
}
