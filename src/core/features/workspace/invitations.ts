import {scimInvitationAcceptancePlan} from '../scim/invitation-acceptance';
import type { AccessLevel } from '../../shared/knowledge/model';
import { requireConfiguredLevel } from '../sharing/configuration';
import { createMemberRepository } from '../session/repository';
import { personalContainerStatements } from './personal';
import type { FeatureContext } from '../../app/feature-context';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { currentSubject, requirePageLevel, requireContainerLevel, requireWorkspaceOwner } from '../sharing/current-access';
import { createOpaqueToken, sessionDigest } from '../../platform/auth/token';
import { createUlid } from '../../shared/ulid';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { deliverIdentityMail } from '../session/mail';
import { admitIdentityMail, requireMailConfig } from '../session/mail-admission';
import { requireGuestDomain } from './guest-policy';
type InvitationInput={operationKey:string;email:string;kind:'member'|'guest';pageId?:string;containerId?:string;level?:AccessLevel;expiresAt?:string|null};
/** Admit the invitation and encrypted delivery together, before transport. */
export async function prepareInvitation(ctx:FeatureContext,config:RuntimeConfig,input:InvitationInput) {
  if(input.kind==='member'&&(input.level!==undefined||input.expiresAt!==undefined))throw new ApiProblem(400,'INVALID_INVITATION_SCOPE','Resource permissions apply only to guest invitations.');
  if(input.expiresAt!==undefined&&input.expiresAt!==null&&(!Number.isFinite(Date.parse(input.expiresAt))||input.expiresAt<=ctx.now))throw new ApiProblem(400,'INVALID_GRANT_EXPIRY','Choose a future grant expiry.');
  if((input.pageId&&input.containerId)||(input.kind==='member'&&(input.pageId||input.containerId)))throw new ApiProblem(400,'INVALID_INVITATION_SCOPE','A guest invitation names exactly one page or container; member invitations do not confer resource grants.');
  requireMailConfig(config);
  const token=createOpaqueToken();
  const result=await commitOperation(ctx,{operationKey:input.operationKey,action:'member.invite',request:input,authorize:async()=>{
    const subject=await currentSubject(ctx);if(subject.isGuest)throw new ApiProblem(403,'FORBIDDEN','Guests cannot invite people.');
    if(input.kind==='guest') { await requireConfiguredLevel(ctx,input.level??'view'); if(input.pageId) { const access=await requirePageLevel(ctx,input.pageId,'full'); if(access.context.container.externalAccess.guests==='forbidden')throw new ApiProblem(403,'GUESTS_FORBIDDEN','Guests are forbidden here.'); } else if(input.containerId) { await requireContainerLevel(ctx,input.containerId,'full'); const veto=await ctx.db.prepare('SELECT c.visibility,c.guest_access,w.guest_access AS site_guests FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=?').bind(input.containerId).first<{visibility:string;guest_access:string;site_guests:string}>();if(!veto||veto.visibility==='personal'||veto.guest_access==='forbidden'||veto.site_guests==='forbidden')throw new ApiProblem(403,'GUESTS_FORBIDDEN','Guests are forbidden here.'); } else throw new ApiProblem(400,'TARGET_REQUIRED','A guest requires a page or container.'); }
  },prepare:async({revisionId})=>{
    const policy=input.kind==='guest'?await requireGuestDomain(ctx.db,ctx.actor.workspaceId,input.email):null;
    const grantExpiry=input.expiresAt==null&&policy?.defaultExpiryDays?new Date(Date.parse(ctx.now)+policy.defaultExpiryDays*86400000).toISOString():input.expiresAt??null;
    const id=createUlid(),grantId=input.kind==='guest'?createUlid():null; const existing=await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND lower(email)=lower(?) AND status='active'").bind(ctx.actor.workspaceId,input.email.toLowerCase()).first();
    const statements:D1PreparedStatement[]=[];
    if(!existing) { if(grantId){const table=input.pageId?'page_grants':'container_grants',key=input.pageId?'page_id':'container_id';statements.push(ctx.db.prepare(`INSERT INTO ${table} (id,${key},principal_kind,principal_id,level,expires_at,created_at,updated_at) VALUES (?,?,'member',?,?,?,?,?)`).bind(grantId,input.pageId??input.containerId!,`invitation:${id}`,input.level??'view',grantExpiry,ctx.now,ctx.now));} statements.push(ctx.db.prepare('INSERT INTO invitations (id,workspace_id,email,kind,container_id,page_id,container_grant_id,page_grant_id,token_digest,invited_by_member_id,expires_at,created_at,guest_expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,ctx.actor.workspaceId,input.email.toLowerCase(),input.kind,input.containerId??null,input.pageId??null,input.containerId?grantId:null,input.pageId?grantId:null,await sessionDigest(config.sessionSecret,token),ctx.actor.id,new Date(Date.parse(ctx.now)+7*86400000).toISOString(),ctx.now,grantExpiry)); const url=new URL('/api/auth/invitation/accept',config.appUrl);url.searchParams.set('token',token);const delivery=await admitIdentityMail(ctx.db,config,{workspaceId:ctx.actor.workspaceId,email:input.email.toLowerCase(),kind:'invitation',invitationId:id,url:url.toString(),operationKey:input.operationKey,requestedByMemberId:ctx.actor.id},ctx.now);statements.push(delivery.statement); }
    return {entity:{id:ctx.actor.workspaceId,kind:'invitation',revisionId},value:{accepted:true},statements};
  }});
  return result;
}
export async function invite(ctx:FeatureContext,config:RuntimeConfig,input:InvitationInput) {
  const result=await prepareInvitation(ctx,config,input);
  // Admission, encrypted command and receipt committed together; replay resumes the same command.
  const delivery=await ctx.db.prepare('SELECT id FROM mail_deliveries WHERE workspace_id=? AND requested_by_member_id=? AND operation_key=?').bind(ctx.actor.workspaceId,ctx.actor.id,input.operationKey).first<{id:string}>();
  if(delivery)await deliverIdentityMail(ctx.db,config,delivery.id,ctx,ctx.now);
  return result;
}
/** The confirmation page reads a pending invitation without changing anything (WORK-006). */
export async function previewInvitation(db:D1Database,config:RuntimeConfig,token:string):Promise<{expiresAt:string}|null> {
  return db.prepare('SELECT expires_at AS expiresAt FROM invitations WHERE token_digest=? AND revoked_at IS NULL AND accepted_by_member_id IS NULL AND expires_at>?').bind(await sessionDigest(config.sessionSecret,token),new Date().toISOString()).first<{expiresAt:string}>();
}
/** Accepts once and returns the member; the caller issues the session through the native session store. */
export async function acceptInvitation(db:D1Database,config:RuntimeConfig,token:string,resources?:{files:R2Bucket;jobs:Queue<unknown>}):Promise<{memberId:string}> {
  const now=new Date().toISOString();
  const row=await db.prepare('SELECT * FROM invitations WHERE token_digest=? AND revoked_at IS NULL AND accepted_by_member_id IS NULL AND expires_at>?').bind(await sessionDigest(config.sessionSecret,token),now).first<{id:string;workspace_id:string;email:string;kind:string;invited_by_member_id:string;page_id:string|null;container_id:string|null;page_grant_id:string|null;container_grant_id:string|null;guest_expires_at:string|null}>();
  if(!row)throw new ApiProblem(400,'LINK_INVALID','This invitation is invalid or expired.');
  let accessEpoch:number|undefined,guestExpiry:string|null=null;
  if(row.kind==='guest'){if(!resources)throw new ApiProblem(503,'INVITATION_UNAVAILABLE','Guest invitation validation requires the application runtime.');const inviter=await createMemberRepository(db).getMember(row.invited_by_member_id);if(!inviter)throw new ApiProblem(400,'LINK_INVALID','This invitation is invalid or expired.');const accessCtx:FeatureContext={db,files:resources.files,jobs:resources.jobs,actor:inviter,now};if(row.page_id)await requirePageLevel(accessCtx,row.page_id,'full');else if(row.container_id)await requireContainerLevel(accessCtx,row.container_id,'full');else throw new ApiProblem(400,'LINK_INVALID','This invitation has no target.');const policy=await requireGuestDomain(db,row.workspace_id,row.email);const grant=await db.prepare(`SELECT expires_at AS expiresAt FROM ${row.page_id?'page_grants':'container_grants'} WHERE id=?`).bind(row.page_grant_id??row.container_grant_id).first<{expiresAt:string|null}>();guestExpiry=row.guest_expires_at??grant?.expiresAt??(policy.defaultExpiryDays?new Date(Date.parse(now)+policy.defaultExpiryDays*86400000).toISOString():null);accessEpoch=accessCtx.authorizationEpoch;}
  const former=await db.prepare('SELECT id,status FROM members WHERE workspace_id=? AND lower(email)=lower(?)').bind(row.workspace_id,row.email).first<{id:string;status:string}>();
  // A removed member, or a restored historical actor (PORT-005), returns under the same id.
  if(former&&!['removed','historical'].includes(former.status))throw new ApiProblem(400,'LINK_INVALID','This invitation is invalid or already used.');
  const personal=former?.status==='historical'&&!!await db.prepare("SELECT 1 FROM containers WHERE workspace_id=? AND key=? AND archived_at IS NULL").bind(row.workspace_id,`personal:${former.id}`).first();
  const id=former?.id??createUlid();
  const statements=[mutationGuard(db,'SELECT accepted_by_member_id IS NULL AND revoked_at IS NULL AND expires_at>? FROM invitations WHERE id=?',[now,row.id]),former?db.prepare("UPDATE members SET status='active',role='member',member_kind=?,is_setup_owner=0,updated_at=?,guest_expires_at=? WHERE id=?").bind(row.kind,now,guestExpiry,id):db.prepare("INSERT INTO members (id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at,guest_expires_at) VALUES (?,?,?,?,?,'member',?,'active',0,?,?,?)").bind(id,row.workspace_id,row.email,row.email.split('@')[0],row.email.slice(0,2).toUpperCase(),row.kind,now,now,guestExpiry),db.prepare('UPDATE invitations SET accepted_by_member_id=? WHERE id=?').bind(id,row.id)];
  // Only a current full member of this workspace can stand behind a delivered invitation.
  statements.unshift(mutationGuard(db,"SELECT status='active' AND member_kind='member' AND workspace_id=? FROM members WHERE id=?",[row.workspace_id,row.invited_by_member_id]));
  if(accessEpoch!==undefined)statements.unshift(mutationGuard(db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[accessEpoch]));
  if(former)statements.unshift(mutationGuard(db,"SELECT status=? FROM members WHERE id=?",[former.status,id]));
  if(row.kind==='member'&&former)statements.push(db.prepare("UPDATE containers SET key='archived:'||id WHERE workspace_id=? AND key=? AND archived_at IS NOT NULL").bind(row.workspace_id,`personal:${id}`));
  // A returning historical member keeps the personal space that came back with them.
  if(row.kind==='member'&&!personal)statements.push(...personalContainerStatements(db,{workspaceId:row.workspace_id,memberId:id,now}));
  if(row.kind==='guest') statements.unshift(mutationGuard(db,"SELECT c.visibility!='personal' AND c.guest_access='allowed' AND w.guest_access='allowed' FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=COALESCE(?,(SELECT container_id FROM pages WHERE id=? AND deleted_at IS NULL))",[row.container_id,row.page_id]));
  if(row.kind==='guest'){
    const table=row.page_id?'page_grants':'container_grants',key=row.page_id?'page_id':'container_id',grantId=row.page_grant_id??row.container_grant_id;
    statements.unshift(mutationGuard(db,`SELECT revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND principal_id=? AND ${key}=? FROM ${table} WHERE id=?`,[now,`invitation:${row.id}`,row.page_id??row.container_id,grantId]));
    statements.push(db.prepare(`UPDATE ${table} SET principal_id=?,updated_at=? WHERE id=?`).bind(id,now,grantId));
  }
  if(await db.prepare("SELECT id FROM scim_resources WHERE invitation_id=? AND state='pending'").bind(row.id).first()){
    if(!resources)throw new ApiProblem(503,'INVITATION_UNAVAILABLE','Directory invitation validation requires the application runtime.');
    const inviter=await createMemberRepository(db).getMember(row.invited_by_member_id);if(!inviter)throw new ApiProblem(400,'LINK_INVALID','This invitation is invalid or expired.');
    const plan=await scimInvitationAcceptancePlan({db,files:resources.files,jobs:resources.jobs,actor:inviter,now},row.id,id);
    statements.unshift(...plan.before);statements.push(...plan.after);
  }
  try { await db.batch(statements); } catch {throw new ApiProblem(400,'LINK_INVALID','This invitation is invalid or already used.');}
  return {memberId:id};
}
export async function revokeInvitation(ctx:FeatureContext,input:{operationKey:string;id:string}) {
  return commitOperation(ctx,{operationKey:input.operationKey,action:'invitation.revoke',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>({entity:{id:input.id,kind:'invitation',revisionId},value:{revoked:true},statements:[mutationGuard(ctx.db,'SELECT workspace_id=? AND accepted_by_member_id IS NULL AND revoked_at IS NULL AND expires_at>? FROM invitations WHERE id=?',[ctx.actor.workspaceId,ctx.now,input.id]),ctx.db.prepare('UPDATE invitations SET revoked_at=? WHERE id=?').bind(ctx.now,input.id),ctx.db.prepare('UPDATE page_grants SET revoked_at=?,updated_at=? WHERE id=(SELECT page_grant_id FROM invitations WHERE id=?)').bind(ctx.now,ctx.now,input.id),ctx.db.prepare('UPDATE container_grants SET revoked_at=?,updated_at=? WHERE id=(SELECT container_grant_id FROM invitations WHERE id=?)').bind(ctx.now,ctx.now,input.id),ctx.db.prepare("UPDATE mail_deliveries SET state=CASE WHEN state='sent' THEN state ELSE 'failed' END,delivery_phase=CASE WHEN state='sent' THEN delivery_phase ELSE 'cancelled' END,payload_ciphertext=NULL,next_attempt_at=NULL,lease_until=NULL,updated_at=? WHERE invitation_id=?").bind(ctx.now,input.id)]})});
}

/** Pending invitations are an owner view; delivery history has its own surface. */
export async function listInvitations(ctx:FeatureContext) {
  await requireWorkspaceOwner(ctx);
  return {items:(await ctx.db.prepare("SELECT id,email,kind AS role,expires_at AS expiresAt FROM invitations WHERE workspace_id=? AND accepted_by_member_id IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC,id")
    .bind(ctx.actor.workspaceId,ctx.now).all<{id:string;email:string;role:'member'|'guest';expiresAt:string}>()).results};
}
