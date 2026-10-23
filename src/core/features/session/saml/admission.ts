import { ApiProblem } from '../../../app/problems';
import { mutationGuard } from '../../../app/operations';
import { createUlid } from '../../../shared/ulid';
import { personalContainerStatements } from '../../workspace/personal';
import { version, type SessionStore, type SlatePerson } from '../native/store';
import { DAY, type SamlAssertion, type SamlConfig } from './types';

/** JIT uses the existing invitation/member records; no shadow account directory. */
export async function samlAdmission(store:SessionStore, config:SamlConfig, proof:SamlAssertion, now:number):Promise<{person:SlatePerson;statements:D1PreparedStatement[]}> {
 const db=store.db,iso=new Date(now).toISOString();
 const binding=await db.prepare('SELECT member_id FROM member_identity_bindings WHERE issuer=? AND subject=?').bind(proof.issuer,proof.subject).first<{member_id:string}>();
 const person=await store.member('lower(email)=?',proof.email);
 if(binding&&binding.member_id!==person?.id)throw new ApiProblem(403,'SAML_ADMISSION_DENIED','This identity is not admitted to this workspace.');
 if(person?.status==='active')return {person,statements:[]};
 if(proof.email.split('@')[1]!==config.email_domain)throw new ApiProblem(403,'SAML_ADMISSION_DENIED','This identity is not admitted to this workspace.');
 if(config.domain_status!=='verified'||config.domain_checked_at===null||config.domain_checked_at<=now-DAY)throw new ApiProblem(503,'SAML_DOMAIN_UNVERIFIED','The workspace email domain must be verified before new members can sign in.');
 const invitation=await db.prepare("SELECT i.id,i.invited_by_member_id FROM invitations i JOIN members inviter ON inviter.id=i.invited_by_member_id WHERE i.workspace_id=? AND lower(i.email)=? AND i.kind='member' AND i.accepted_by_member_id IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND inviter.status='active' AND inviter.member_kind='member' AND inviter.workspace_id=i.workspace_id ORDER BY i.created_at DESC,i.id LIMIT 1").bind(config.workspace_id,proof.email,iso).first<{id:string;invited_by_member_id:string}>();
 const allowed=(JSON.parse(config.allowed_emails_json) as string[]).includes(proof.email);
 // Removal is an explicit revocation: an allow-list cannot resurrect an account.
 if((!allowed&&!invitation)||(person&&!invitation))throw new ApiProblem(403,'SAML_ADMISSION_DENIED','This identity is not invited or allow-listed.');
 const id=person?.id??createUlid();
 const statements=[mutationGuard(db,"SELECT domain_status='verified' AND domain_checked_at>? AND email_domain=? AND generation=? FROM saml_provider_config WHERE workspace_id=?",[now-DAY,config.email_domain,config.generation,config.workspace_id])];
 if(invitation){
  statements.push(mutationGuard(db,"SELECT i.accepted_by_member_id IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND i.kind='member' AND lower(i.email)=? AND EXISTS(SELECT 1 FROM members m WHERE m.id=i.invited_by_member_id AND m.workspace_id=i.workspace_id AND m.status='active' AND m.member_kind='member') FROM invitations i WHERE i.id=? AND i.workspace_id=?",[iso,proof.email,invitation.id,config.workspace_id]));
 } else statements.push(mutationGuard(db,"SELECT EXISTS(SELECT 1 FROM json_each(allowed_emails_json) WHERE value=?) FROM saml_provider_config WHERE workspace_id=? AND generation=?",[proof.email,config.workspace_id,config.generation]));
 if(person){
  statements.push(mutationGuard(db,"SELECT status!='active' AND lower(email)=? FROM members WHERE id=? AND workspace_id=?",[proof.email,id,config.workspace_id]));
  statements.push(db.prepare("UPDATE members SET status='active',role='member',member_kind='member',is_setup_owner=0,guest_expires_at=NULL,updated_at=? WHERE id=?").bind(iso,id));
 }else statements.push(db.prepare("INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES(?,?,?,?,?,'member','member','active',0,?,?)").bind(id,config.workspace_id,proof.email,proof.email.split('@')[0],proof.email.slice(0,2).toUpperCase(),iso,iso));
 if(invitation)statements.push(db.prepare('UPDATE invitations SET accepted_by_member_id=? WHERE id=?').bind(id,invitation.id));
 const personal=person&&await db.prepare('SELECT id FROM containers WHERE workspace_id=? AND key=? AND archived_at IS NULL').bind(config.workspace_id,`personal:${id}`).first();
 if(!personal){
  statements.push(db.prepare("UPDATE containers SET key='archived:'||id WHERE workspace_id=? AND key=? AND archived_at IS NOT NULL").bind(config.workspace_id,`personal:${id}`));
  statements.push(...personalContainerStatements(db,{workspaceId:config.workspace_id,memberId:id,now:iso}));
 }
 // A revived member's authority version stays native; proof and member fence are
 // repeated after the admission statements in the same issuing transaction.
 const authority=person?(await db.prepare(`SELECT ${version('m')} AS value FROM members m WHERE id=?`).bind(id).first<{value:number}>())!.value:1;
 return {person:{id,email:proof.email,role:'member',status:'active',owner:false,version:authority,displayName:proof.email.split('@')[0]!,createdAt:person?.createdAt??now,memberKind:'member'},statements};
}
