import { requireGuestDomain } from '../workspace/guest-policy';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { commitOperation } from '../../app/operations';
import { createUlid } from '../../shared/ulid';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { identityRevision } from '../workspace/revisions';
import { invite } from '../workspace/invitations';
import { removeMember, updateMemberIdentity, memberIdentityUpdateStatements } from '../workspace/members';
import { nativeCommitContext, type ScimContext } from './context';
import { resource, resourceGuard, resourceInsert, resourceUpdate, nativeMember, requireProvisionable, targetGuard, emailTargetGuard, capacityGuard, type ResourceRow, type NativeMember } from './storage';
import { ScimError, reportIgnored } from './protocol';
import { parseUser, type UserInput } from './user-input';
import { userView } from './user-view';

function cancelInvitation(ctx:ScimContext,row:ResourceRow):D1PreparedStatement[] {
  if(!row.invitation_id)return [];
  return [ctx.db.prepare('UPDATE invitations SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND accepted_by_member_id IS NULL').bind(ctx.now,row.invitation_id),ctx.db.prepare("UPDATE mail_deliveries SET payload_ciphertext=NULL,next_attempt_at=NULL,lease_until=NULL,state=CASE WHEN state='sent' THEN state ELSE 'failed' END,delivery_phase=CASE WHEN state='sent' THEN delivery_phase ELSE 'cancelled' END,updated_at=? WHERE invitation_id=?").bind(ctx.now,row.invitation_id)];
}
function assign(row:ResourceRow,input:UserInput):ResourceRow {
  return {...row,user_name:input.userName,display_name:input.displayName,given_name:input.givenName,family_name:input.familyName,external_id:input.externalId};
}
async function metadata(ctx:ScimContext,row:ResourceRow,input:UserInput,create:boolean,extra:D1PreparedStatement[]=[],previous:ResourceRow=row) {
  const native=nativeCommitContext(ctx,ctx.operationKey,[emailTargetGuard(ctx,input.userName),...(create?[]:[resourceGuard(ctx,previous)])],[...extra,create?resourceInsert(ctx,row):resourceUpdate(ctx,row)]);
  await commitOperation(native,{operationKey:ctx.operationKey,action:'scim.user',request:{id:row.id,input,state:row.state},authorize:()=>requireWorkspaceOwner(native),prepare:async({revisionId})=>({entity:{id:row.id,kind:'scim-credential',revisionId},value:{id:row.id},statements:[await identityRevision(native,revisionId,'scim-user',row.id,{userName:row.user_name,externalId:row.external_id,state:row.state})]})});
}
async function writeUser(ctx:ScimContext,config:RuntimeConfig,row:ResourceRow,input:UserInput,create:boolean,member:NativeMember|null) {
  const previous={...row};row=assign(row,input);
  if(input.active||input.userName!==previous.user_name)await requireGuestDomain(ctx.db,ctx.actor.workspaceId,input.userName);
  const mailbox=await ctx.db.prepare('SELECT id,email,display_name,role,member_kind,status FROM members WHERE workspace_id=? AND lower(email)=lower(?)').bind(ctx.actor.workspaceId,input.userName).first<NativeMember>();
  if(mailbox){requireProvisionable(mailbox);if(mailbox.id!==member?.id)throw new ScimError(409,'That mailbox belongs to another native Member.','uniqueness');}
  const before=[emailTargetGuard(ctx,input.userName),...(create?[]:[resourceGuard(ctx,previous)]),...(member?[targetGuard(ctx,member.id)]:[])];
  const save=()=>create?resourceInsert(ctx,row):resourceUpdate(ctx,row);
  if(member?.status==='active'){
    row.member_id=member.id;
    row.state=input.active?'active':'inactive';
    const after=[save()];
    if(!input.active){
      after.unshift(...await memberIdentityUpdateStatements(ctx,createUlid(),{memberId:member.id,email:input.userName,displayName:input.displayName}));
      await removeMember(nativeCommitContext(ctx,ctx.operationKey,before,after),{operationKey:ctx.operationKey,memberId:member.id});
    }else await updateMemberIdentity(nativeCommitContext(ctx,ctx.operationKey,before,after),{operationKey:ctx.operationKey,memberId:member.id,email:input.userName,displayName:input.displayName});
  }else if(input.active){
    const pending=!create&&row.state==='pending'&&previous.user_name===input.userName&&!!await ctx.db.prepare('SELECT id FROM invitations WHERE id=? AND revoked_at IS NULL AND accepted_by_member_id IS NULL AND expires_at>?').bind(row.invitation_id,ctx.now).first();
    if(pending){await metadata(ctx,row,input,false);}
    else{
      row.state='pending';row.invitation_id=null;
      const after=[...(member?await memberIdentityUpdateStatements(ctx,createUlid(),{memberId:member.id,email:input.userName,displayName:input.displayName}):[]),save(),ctx.db.prepare('UPDATE scim_resources SET invitation_id=(SELECT invitation_id FROM mail_deliveries WHERE workspace_id=? AND requested_by_member_id=? AND operation_key=?) WHERE id=?').bind(ctx.actor.workspaceId,ctx.actor.id,ctx.operationKey,row.id)];
      await invite(nativeCommitContext(ctx,ctx.operationKey,[...before,...cancelInvitation(ctx,previous),capacityGuard(ctx,input.userName)],after),config,{operationKey:ctx.operationKey,email:input.userName,kind:'member'});
    }
  }else{
    row.state='inactive';row.invitation_id=null;
    const identity=member?await memberIdentityUpdateStatements(ctx,createUlid(),{memberId:member.id,email:input.userName,displayName:input.displayName}):[];
    await metadata(ctx,row,input,create,[...cancelInvitation(ctx,previous),...identity],previous);
  }
  return reportIgnored(await userView(ctx,await resource(ctx,'User',row.id)),input.ignored);
}
export async function createUser(ctx:ScimContext,config:RuntimeConfig,body:Record<string,unknown>) {
  const input=parseUser(body),id=createUlid();
  const existing=await ctx.db.prepare('SELECT id,email,display_name,role,member_kind,status FROM members WHERE workspace_id=? AND lower(email)=lower(?)').bind(ctx.actor.workspaceId,input.userName).first<NativeMember>();
  if(existing)requireProvisionable(existing);
  const duplicate=await ctx.db.prepare("SELECT id FROM scim_resources WHERE workspace_id=? AND resource_type='User' AND state!='deleted' AND (lower(user_name)=lower(?) OR (? IS NOT NULL AND external_id=?))").bind(ctx.actor.workspaceId,input.userName,input.externalId,input.externalId).first();
  if(duplicate)throw new ScimError(409,'The User already exists.','uniqueness');
  const row:ResourceRow={id,workspace_id:ctx.actor.workspaceId,resource_type:'User',external_id:null,member_id:existing?.id??null,invitation_id:null,group_id:null,user_name:null,display_name:null,given_name:null,family_name:null,state:'inactive',created_at:ctx.now,updated_at:ctx.now};
  return writeUser(ctx,config,row,input,true,existing);
}
export async function replaceUser(ctx:ScimContext,config:RuntimeConfig,id:string,body:Record<string,unknown>) {
  const row=await resource(ctx,'User',id),member=await nativeMember(ctx,row.member_id);
  return writeUser(ctx,config,row,parseUser(body),false,member);
}
export async function deleteUser(ctx:ScimContext,id:string) {
  const row=await resource(ctx,'User',id),previous={...row},member=await nativeMember(ctx,row.member_id);
  row.state='deleted';
  const before=[resourceGuard(ctx,previous),...(member?[targetGuard(ctx,member.id)]:[])];
  const after=[...cancelInvitation(ctx,row),resourceUpdate(ctx,row)];
  if(member?.status==='active')await removeMember(nativeCommitContext(ctx,ctx.operationKey,before,after),{operationKey:ctx.operationKey,memberId:member.id});
  else await metadata(ctx,row,{userName:row.user_name!,displayName:row.display_name!,givenName:row.given_name,familyName:row.family_name,externalId:row.external_id,active:false,ignored:[]},false,cancelInvitation(ctx,row),previous);
}
