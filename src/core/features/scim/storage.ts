import limits from '../../../../seed.json';
import type { ScimContext } from './context';
import { mutationGuard } from '../../app/operations';
import { ScimError } from './protocol';
export interface ResourceRow {
  id:string;workspace_id:string;resource_type:'User'|'Group';external_id:string|null;member_id:string|null;invitation_id:string|null;group_id:string|null;user_name:string|null;display_name:string|null;given_name:string|null;family_name:string|null;state:'pending'|'active'|'inactive'|'deleted';created_at:string;updated_at:string;
}
export interface NativeMember { id:string;email:string;display_name:string;role:string;member_kind:string;status:string }
export async function resource(ctx:ScimContext,type:'User'|'Group',id:string):Promise<ResourceRow> {
  const row=await ctx.db.prepare("SELECT * FROM scim_resources WHERE workspace_id=? AND resource_type=? AND id=? AND state!='deleted'").bind(ctx.actor.workspaceId,type,id).first<ResourceRow>();
  if(!row)throw new ScimError(404,`${type} not found.`);
  return row;
}
export async function nativeMember(ctx:ScimContext,id:string|null):Promise<NativeMember|null> {
  if(!id)return null;
  const row=await ctx.db.prepare('SELECT id,email,display_name,role,member_kind,status FROM members WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<NativeMember>();
  if(!row)throw new ScimError(404,'The native member no longer exists.');
  requireProvisionable(row);
  return row;
}
export function requireProvisionable(row: Pick<NativeMember,'role'|'member_kind'>) {
  if(row.role!=='member'||row.member_kind!=='member')throw new ScimError(403,'SCIM can provision only Members. Owner and guest accounts are protected.','mutability');
}
export function targetGuard(ctx:ScimContext,memberId:string) {
  return mutationGuard(ctx.db,"SELECT workspace_id=? AND role='member' AND member_kind='member' FROM members WHERE id=?",[ctx.actor.workspaceId,memberId]);
}
export function emailTargetGuard(ctx:ScimContext,email:string) {
  return mutationGuard(ctx.db,"SELECT NOT EXISTS(SELECT 1 FROM members WHERE workspace_id=? AND lower(email)=lower(?) AND (role!='member' OR member_kind!='member'))",[ctx.actor.workspaceId,email]);
}
// SCIM admission counts accepted Members plus distinct live Member invitations, including native invitations.
export function capacityGuard(ctx:ScimContext,email:string) {
  return mutationGuard(ctx.db,`SELECT (SELECT count(*) FROM members WHERE workspace_id=? AND status='active' AND member_kind='member') + (SELECT count(DISTINCT lower(i.email)) FROM invitations i WHERE i.workspace_id=? AND i.kind='member' AND i.revoked_at IS NULL AND i.accepted_by_member_id IS NULL AND i.expires_at>? AND NOT EXISTS(SELECT 1 FROM members m WHERE m.workspace_id=i.workspace_id AND lower(m.email)=lower(i.email) AND m.status='active')) < ? OR EXISTS(SELECT 1 FROM members WHERE workspace_id=? AND lower(email)=lower(?) AND status='active' AND member_kind='member')`,[ctx.actor.workspaceId,ctx.actor.workspaceId,ctx.now,limits.limits.capacityEstimate.membersPerDeployment,ctx.actor.workspaceId,email]);
}
export function resourceGuard(ctx:ScimContext,row:ResourceRow) {
  return mutationGuard(ctx.db,'SELECT updated_at=? AND state=? FROM scim_resources WHERE id=? AND workspace_id=?',[row.updated_at,row.state,row.id,ctx.actor.workspaceId]);
}
export function resourceUpdate(ctx:ScimContext,row:ResourceRow) {
  return ctx.db.prepare('UPDATE scim_resources SET external_id=?,member_id=?,invitation_id=?,group_id=?,user_name=?,display_name=?,given_name=?,family_name=?,state=?,updated_at=? WHERE id=? AND workspace_id=?').bind(row.external_id,row.member_id,row.invitation_id,row.group_id,row.user_name,row.display_name,row.given_name,row.family_name,row.state,ctx.now,row.id,ctx.actor.workspaceId);
}
export function resourceInsert(ctx:ScimContext,row:ResourceRow) {
  return ctx.db.prepare('INSERT INTO scim_resources (id,workspace_id,resource_type,external_id,member_id,invitation_id,group_id,user_name,display_name,given_name,family_name,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(row.id,ctx.actor.workspaceId,row.resource_type,row.external_id,row.member_id,row.invitation_id,row.group_id,row.user_name,row.display_name,row.given_name,row.family_name,row.state,ctx.now,ctx.now);
}
