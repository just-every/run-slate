import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { identityRevision } from './revisions';
export interface GuestPolicy { defaultExpiryDays:number|null; allowedDomains:string[]; deniedDomains:string[] }
export async function readGuestPolicy(db:D1Database,workspaceId:string):Promise<GuestPolicy> {
  const row=await db.prepare('SELECT guest_default_expiry_days AS days,guest_allowed_domains AS allowed,guest_denied_domains AS denied FROM workspaces WHERE id=?').bind(workspaceId).first<{days:number|null;allowed:string;denied:string}>();
  if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
  return {defaultExpiryDays:row.days,allowedDomains:JSON.parse(row.allowed),deniedDomains:JSON.parse(row.denied)};
}
export async function guestPolicy(ctx:FeatureContext) { await requireWorkspaceOwner(ctx);return readGuestPolicy(ctx.db,ctx.actor.workspaceId); }
export async function saveGuestPolicy(ctx:FeatureContext,input:GuestPolicy&{operationKey:string}) {
  const normalize=(domains:string[])=>[...new Set(domains.map(domain=>domain.trim().toLowerCase()))].sort();
  const policy={defaultExpiryDays:input.defaultExpiryDays,allowedDomains:normalize(input.allowedDomains),deniedDomains:normalize(input.deniedDomains)};
  return commitOperation(ctx,{operationKey:input.operationKey,action:'workspace.guest-policy',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>({entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId},value:policy,statements:[await identityRevision(ctx,revisionId,'workspace',ctx.actor.workspaceId,policy),ctx.db.prepare('UPDATE workspaces SET guest_default_expiry_days=?,guest_allowed_domains=?,guest_denied_domains=?,updated_at=?,revision_id=? WHERE id=?').bind(policy.defaultExpiryDays,JSON.stringify(policy.allowedDomains),JSON.stringify(policy.deniedDomains),ctx.now,revisionId,ctx.actor.workspaceId)]})});
}
/** Exact email domains; a deny wins, and an empty allow list admits other domains. */
export async function requireGuestDomain(db:D1Database,workspaceId:string,email:string) {
  const policy=await readGuestPolicy(db,workspaceId),domain=email.slice(email.lastIndexOf('@')+1).toLowerCase();
  if(policy.deniedDomains.includes(domain)||(policy.allowedDomains.length&&!policy.allowedDomains.includes(domain)))throw new ApiProblem(403,'GUEST_DOMAIN_DENIED','This email domain is not allowed for guests.');
  return policy;
}
