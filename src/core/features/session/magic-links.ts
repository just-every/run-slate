import { bootstrapOwner } from '../workspace/bootstrap';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { createOpaqueToken, sessionDigest } from '../../platform/auth/token';
import { createUlid } from '../../shared/ulid';
import { ApiProblem } from '../../app/problems';
import { mutationGuard } from '../../app/operations';
import { admitIdentityMail } from './mail-admission';
import { deliverIdentityMail, type MailRow } from './mail';
import { mailStatus, retryMail } from './mail-status';
export async function requestMagicLink(db:D1Database,config:RuntimeConfig,email:string,requestKey?:string) {
  if(!config.mailApiKey||!config.mailFrom||!config.appUrl) throw new ApiProblem(503,'MAIL_UNAVAILABLE','Magic-link delivery is not configured.');
  const requestDigest=requestKey?await sessionDigest(config.sessionSecret,`mail-request:${email.toLowerCase()}:${requestKey}`):undefined;
  if(requestDigest){const prior=await db.prepare('SELECT * FROM mail_deliveries WHERE request_digest=?').bind(requestDigest).first<MailRow>();if(prior){await retryMail(db,config,prior,new Date().toISOString());return {accepted:true};}}
  await bootstrapOwner(db,config,email);
  const member=await db.prepare("SELECT id,workspace_id FROM members WHERE lower(email)=lower(?) AND status='active'").bind(email.toLowerCase()).first<{id:string;workspace_id:string}>();
  if(!member) return {accepted:true};
  const token=createOpaqueToken(),now=new Date(),expires=new Date(now.getTime()+86400000).toISOString(),linkId=createUlid();
  const url=new URL('/api/auth/magic/accept',config.appUrl);url.searchParams.set('token',token);
  const delivery=await admitIdentityMail(db,config,{workspaceId:member.workspace_id,email:email.toLowerCase(),memberId:member.id,kind:'signin',url:url.toString(),magicLinkId:linkId,requestDigest},now.toISOString());
  try{await db.batch([
    mutationGuard(db,"SELECT status='active' AND lower(email)=lower(?) FROM members WHERE id=?",[email,member.id]),
    db.prepare('INSERT INTO magic_links (id,email,token_digest,expires_at,created_at) VALUES (?,?,?,?,?)').bind(linkId,email.toLowerCase(),await sessionDigest(config.sessionSecret,token),expires,now.toISOString()),delivery.statement,
  ]);}catch(cause){if(requestDigest){const prior=await db.prepare('SELECT id FROM mail_deliveries WHERE request_digest=?').bind(requestDigest).first<{id:string}>();if(prior){await deliverIdentityMail(db,config,prior.id);return {accepted:true};}}throw cause;}
  await deliverIdentityMail(db,config,delivery.id);
  return {accepted:true};
}
/** The unguessable request key is a status capability, never a sign-in credential. */
export async function magicLinkStatus(db:D1Database,config:RuntimeConfig,email:string,requestKey:string){
 const digest=await sessionDigest(config.sessionSecret,`mail-request:${email.toLowerCase()}:${requestKey}`);
 const row=await db.prepare('SELECT * FROM mail_deliveries WHERE request_digest=?').bind(digest).first<MailRow>();
 if(!row)return {state:'unconfirmed',errorDetail:null,nextAttemptAt:null,canRetry:false};
 const {state,errorDetail,nextAttemptAt,canRetry}=mailStatus(row,new Date().toISOString());return {state,errorDetail,nextAttemptAt,canRetry};
}
export async function acceptMagicLink(db:D1Database,config:RuntimeConfig,token:string) {
  const now=new Date().toISOString(),digest=await sessionDigest(config.sessionSecret,token);
  const row=await db.prepare("SELECT l.id,m.id AS member_id FROM magic_links l JOIN members m ON lower(m.email)=lower(l.email) AND m.status='active' WHERE l.token_digest=? AND l.used_at IS NULL AND l.expires_at>?").bind(digest,now).first<{id:string;member_id:string}>();
  if(!row) throw new ApiProblem(400,'LINK_INVALID','This sign-in link is invalid or expired.');
  const sessionToken=createOpaqueToken(),expiresAt=new Date(Date.parse(now)+30*86400000).toISOString();
  try { await db.batch([
    mutationGuard(db,"SELECT used_at IS NULL AND expires_at>? FROM magic_links WHERE id=?",[now,row.id]),
    mutationGuard(db,"SELECT status='active' FROM members WHERE id=?",[row.member_id]),
    db.prepare('UPDATE magic_links SET used_at=? WHERE id=?').bind(now,row.id),
    db.prepare('INSERT INTO sessions (id,member_id,token_digest,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?)').bind(createUlid(),row.member_id,await sessionDigest(config.sessionSecret,sessionToken),now,now,expiresAt),
  ]); } catch { throw new ApiProblem(400,'LINK_INVALID','This sign-in link is invalid or expired.'); }
  return {token:sessionToken,expiresAt};
}
