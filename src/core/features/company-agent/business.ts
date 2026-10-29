import { SettingsError } from '../../../../modules/business-settings/types.ts';
import { createBusinessSettings, type TeamAdapter, type ManagedMember } from '../../../../modules/business-settings/index.ts';
import type { AppBindings } from '../../app/types';
import type { RuntimeConfig } from '../../platform/config/runtime';
import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { createUlid } from '../../shared/ulid';
import { TENANT } from '../session/native/store';
import { authorizeInvitation, nativeInvitationPlan, nativeRevokeInvitationPlan } from '../workspace/invitations';
import { nativeRemoveMemberPlan } from '../workspace/members';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { deliverIdentityMail } from '../session/mail';
import { nativeMember } from './people';

/** Slate has owner/member roles. A Business admin remains a native member;
 * editor is only their Business policy role and cannot grant wiki ownership. */
export const businessManifest={settings:1 as const,values:['display_name'] as const,team:{roles:{admin:'member',member:'member'}}};
export function slateBusiness(env:AppBindings,config:RuntimeConfig) {
  const db=env.DB;
  const ownerRow=()=>db.prepare(`SELECT id,email FROM members WHERE workspace_id=${TENANT} AND is_setup_owner=1 AND status='active' AND role='owner'`).first<{id:string;email:string}>();
  const team:TeamAdapter={
    async ownerEmail(){return (await ownerRow())?.email??null;},
    async prepare({members,managed,ownerEmail,roles,guard}) {
      const owner=await ownerRow(),actor=owner&&await nativeMember(db,owner.id);
      if(!actor||owner?.email.toLowerCase()!==ownerEmail.toLowerCase()||roles.admin!=='member'||roles.member!=='member')throw new SettingsError('native_owner_required');
      const ctx:FeatureContext={db,files:env.FILES,jobs:env.JOBS,actor,now:new Date().toISOString()};
      await requireWorkspaceOwner(ctx);
      const statements:D1PreparedStatement[]=[mutationGuard(db,`SELECT (${guard.sql}) AND EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND status='active' AND role='owner' AND is_setup_owner=1)`,[...guard.args as (string|number|null)[],actor.id,actor.workspaceId])];
      const rows:ManagedMember[]=[],deliveries:string[]=[];
      const desired=new Map(members.map(member=>[member.email,member]));
      for(const email of new Set([...desired.keys(),...managed.map(row=>row.email)])) {
        const member=desired.get(email),prior=managed.find(row=>row.email===email);
        const businessId=member?.id??prior?.businessId;
        const invitation=businessId?await db.prepare('SELECT invitation_id,member_id FROM slate_business_invitations WHERE business_id=?').bind(businessId).first<{invitation_id:string;member_id:string|null}>():null;
        const nativeId=prior?.operatorId??invitation?.member_id;
        const target=nativeId?await db.prepare('SELECT id,email,role,status FROM members WHERE id=? AND workspace_id=?').bind(nativeId,actor.workspaceId).first<{id:string;email:string;role:string;status:string}>():null;
        // Never adopt a coincidentally equal address or displace a bound person.
        const collision=!prior&&!invitation&&await db.prepare('SELECT id FROM members WHERE workspace_id=? AND lower(email)=lower(?)').bind(actor.workspaceId,email).first();
        if(email===ownerEmail||collision||target?.role==='owner'||nativeId&&!target) {
          rows.push({email,operatorId:prior?.operatorId??null,invite:member?.invite??prior?.invite??0,state:'conflict'});continue;
        }
        if(!member) {
          if(target?.status==='active') {
            const plan=await nativeRemoveMemberPlan(ctx,{operationKey:'business:'+createUlid(),memberId:target.id},createUlid());
            statements.push(...plan.statements);
          }
          if(invitation&&await db.prepare('SELECT 1 FROM invitations WHERE id=? AND accepted_by_member_id IS NULL AND revoked_at IS NULL AND expires_at>?').bind(invitation.invitation_id,ctx.now).first())statements.push(...nativeRevokeInvitationPlan(ctx,{operationKey:'business:'+createUlid(),id:invitation.invitation_id},createUlid()).statements);
          rows.push({...prior!,email,state:'inactive'});continue;
        }
        if(target?.status==='active') {
          rows.push({email,operatorId:target.id,invite:member.invite,state:'active'});continue;
        }
        if(invitation&&member.invite<=(prior?.invite??0)) {
          rows.push({email,operatorId:target?.id??null,invite:member.invite,state:'invited'});continue;
        }
        if(!member.id)throw new SettingsError('business_person_id_required');
        const input={operationKey:'business:'+createUlid(),email:target?.email??email,kind:'member' as const};
        await authorizeInvitation(ctx,input);
        const plan=await nativeInvitationPlan(ctx,config,input,createUlid());
        statements.push(...plan.statements,db.prepare('INSERT INTO slate_business_invitations(business_id,invitation_id,member_id) VALUES(?,?,?) ON CONFLICT(business_id) DO UPDATE SET invitation_id=excluded.invitation_id WHERE slate_business_invitations.member_id IS NULL OR slate_business_invitations.member_id=excluded.member_id').bind(member.id,plan.invitationId,target?.id??null));
        deliveries.push(input.operationKey);
        rows.push({email,operatorId:target?.id??null,invite:member.invite,state:'invited'});
      }
      return {statements,rows,async afterCommit(){for(const key of deliveries){const delivery=await db.prepare('SELECT id FROM mail_deliveries WHERE operation_key=? AND requested_by_member_id=?').bind(key,actor.id).first<{id:string}>();if(delivery)await deliverIdentityMail(db,config,delivery.id,ctx,ctx.now);}}};
    },
  };
  return createBusinessSettings({db,business:businessManifest,team,trust:env.RER_BUSINESS_TRUST??null});
}
