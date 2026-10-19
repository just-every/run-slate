import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requireWorkspaceOwner, resolveCurrentAccessMany } from '../sharing/current-access';
import { createMemberRepository } from '../session/repository';
import { removeMember } from './members';
import { commitOperation, mutationGuard } from '../../app/operations';
import { identityRevision } from './revisions';
export interface GuestView { id:string;displayName:string;email:string;invitedBy:string|null;lastActiveAt:string|null;expiresAt:string|null;access:{id:string;title:string;expiresAt:string|null}[] }
export async function listGuests(ctx:FeatureContext) {
  await requireWorkspaceOwner(ctx);
  const people=(await ctx.db.prepare(`SELECT m.id,m.display_name AS displayName,m.email,m.guest_expires_at AS expiresAt,
    (SELECT inviter.display_name FROM invitations i JOIN members inviter ON inviter.id=i.invited_by_member_id WHERE i.accepted_by_member_id=m.id ORDER BY i.created_at DESC LIMIT 1) AS invitedBy,
    (SELECT MAX(updated_at) FROM sessions WHERE member_id=m.id) AS lastActiveAt
    FROM members m WHERE m.workspace_id=? AND m.member_kind='guest' AND m.status='active' ORDER BY m.display_name,m.id`).bind(ctx.actor.workspaceId).all<Omit<GuestView,'access'>>()).results;
  const pages=(await ctx.db.prepare("SELECT id,title FROM pages WHERE workspace_id=? AND deleted_at IS NULL AND trashed_at IS NULL ORDER BY title,id").bind(ctx.actor.workspaceId).all<{id:string;title:string}>()).results;
  const items:GuestView[]=[];
  for(const person of people){
    if(person.expiresAt&&person.expiresAt<=ctx.now){items.push({...person,access:[]});continue;}
    const actor=await createMemberRepository(ctx.db).getMember(person.id);
    if(!actor)continue;
    const decisions=await resolveCurrentAccessMany({...ctx,actor},pages.map(page=>page.id));
    const access:GuestView['access']=[];
    for(const page of pages){const resolved=decisions.get(page.id);if(!resolved?.decision.level)continue;
      const grants=[...resolved.context.page.grants,...resolved.context.inheritedGrants,...resolved.context.container.grants].filter(grant=>!grant.revokedAt&&(!grant.expiresAt||grant.expiresAt>ctx.now)&&(grant.principalKind==='member'?grant.principalId===person.id:grant.principalKind==='group'&&resolved.subject.groupIds.includes(grant.principalId)));
      const expiresAt=grants.some(grant=>!grant.expiresAt)?null:grants.map(grant=>grant.expiresAt!).sort().at(-1)??null;
      access.push({...page,expiresAt});
    }
    items.push({...person,access});
  }
  return {items};
}
export async function setGuestExpiry(ctx:FeatureContext,input:{operationKey:string;memberId:string;expiresAt:string|null}) {
  if(input.expiresAt&&input.expiresAt<=ctx.now)throw new ApiProblem(400,'INVALID_GUEST_EXPIRY','Choose a future expiry, or revoke this guest now.');
  return commitOperation(ctx,{operationKey:input.operationKey,action:'guest.expiry',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>({entity:{id:input.memberId,kind:'member',revisionId},value:{expiresAt:input.expiresAt},statements:[mutationGuard(ctx.db,"SELECT member_kind='guest' AND status='active' AND workspace_id=? FROM members WHERE id=?",[ctx.actor.workspaceId,input.memberId]),ctx.db.prepare('UPDATE members SET guest_expires_at=?,updated_at=? WHERE id=?').bind(input.expiresAt,ctx.now,input.memberId),await identityRevision(ctx,revisionId,'member',input.memberId,{guestExpiresAt:input.expiresAt})]})});
}
export async function revokeGuests(ctx:FeatureContext,input:{operationKey:string;memberIds:string[]}) {
  await requireWorkspaceOwner(ctx);
  const ids=[...new Set(input.memberIds)];
  for(const id of ids){const row=await ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND member_kind='guest'").bind(id,ctx.actor.workspaceId).first();if(!row)throw new ApiProblem(400,'INVALID_GUEST','Choose guests from this workspace.');}
  // The existing removal command fences authority, ends sessions and retains authorship.
  for(let index=0;index<ids.length;index++)await removeMember(ctx,{operationKey:`${input.operationKey}:${index}`,memberId:ids[index]});
  return {revoked:ids.length};
}
