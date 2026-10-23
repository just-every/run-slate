import limits from '../../../../seed.json';
import {requireGuestDomain} from '../workspace/guest-policy';
import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { createUlid } from '../../shared/ulid';
import { memberIdentityUpdateStatements } from '../workspace/members';
/** Native acceptance runs before before member insertion and after after its member/invitation writes. */
export async function scimInvitationAcceptancePlan(ctx:FeatureContext,invitationId:string,memberId:string):Promise<{before:D1PreparedStatement[];after:D1PreparedStatement[]}> {
  const row=await ctx.db.prepare("SELECT r.id,r.user_name,r.display_name,r.member_id,r.state FROM scim_resources r WHERE r.workspace_id=? AND r.invitation_id=? AND r.resource_type='User' AND r.state!='deleted'").bind(ctx.actor.workspaceId,invitationId).first<{id:string;user_name:string;display_name:string;member_id:string|null;state:string}>();
  if(!row)return {before:[],after:[]};
  const revision=await ctx.db.prepare('SELECT revision_id FROM workspaces WHERE id=?').bind(ctx.actor.workspaceId).first<string>('revision_id');
  await requireGuestDomain(ctx.db,ctx.actor.workspaceId,row.user_name);
  const before=[
    mutationGuard(ctx.db,'SELECT revision_id=? FROM workspaces WHERE id=?',[revision!,ctx.actor.workspaceId]),
    mutationGuard(ctx.db,"SELECT count(*)<? FROM members WHERE workspace_id=? AND member_kind='member' AND status='active'",[limits.limits.capacityEstimate.membersPerDeployment,ctx.actor.workspaceId]),
    mutationGuard(ctx.db,"SELECT state='pending' AND user_name=(SELECT email FROM invitations WHERE id=?) AND (member_id IS NULL OR member_id=?) FROM scim_resources WHERE id=? AND invitation_id=?",[invitationId,memberId,row.id,invitationId]),
    mutationGuard(ctx.db,"SELECT NOT EXISTS(SELECT 1 FROM members WHERE workspace_id=? AND (id=? OR lower(email)=lower(?)) AND (role!='member' OR member_kind!='member'))",[ctx.actor.workspaceId,memberId,row.user_name]),
  ];
  const after=await memberIdentityUpdateStatements(ctx,createUlid(),{memberId,email:row.user_name,displayName:row.display_name});
  return {before,after};
}
