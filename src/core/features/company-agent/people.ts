import type { PeopleAdapter, Person } from '../../../../modules/agent-door/index.ts';
import type { AppBindings, AuthenticatedMember } from '../../app/types';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { createSessionService, sessionOptions } from '../session/service';
import { nativeSamlPolicy } from '../session/saml/policy';
import { TENANT } from '../session/native/store';
import { personDisplayName, personInitials } from '../../shared/person-identity';

/** Native IDs and admission are authoritative. No token email participates. */
export async function nativeMember(db:D1Database,id:string):Promise<AuthenticatedMember|null> {
  const row=await db.prepare(`SELECT m.id,m.workspace_id AS workspaceId,w.name AS workspaceName,m.email,m.display_name AS displayName,m.role
    FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=? AND m.workspace_id=${TENANT} AND m.status='active'
    AND (m.member_kind!='guest' OR m.guest_expires_at IS NULL OR m.guest_expires_at>?) AND ${nativeSamlPolicy('m')}`)
    .bind(id,new Date().toISOString()).first<Omit<AuthenticatedMember,'initials'>>();
  return row?{...row,displayName:personDisplayName(row.displayName,row.email),initials:personInitials(row.displayName,row.email)}:null;
}
export const asPerson=(member:AuthenticatedMember):Person=>({id:member.id,email:member.email,name:member.displayName,role:member.role,active:true});
export async function slatePeople(env:AppBindings,config:RuntimeConfig):Promise<PeopleAdapter> {
  const db=env.DB;
  const person=async(id:string)=>{const member=await nativeMember(db,id);return member?asPerson(member):null;};
  const owner=()=>db.prepare(`SELECT id FROM members WHERE workspace_id=${TENANT} AND is_setup_owner=1 LIMIT 1`).first<{id:string}>();
  const paired=!!env.RER_OWNER_CLAIM_ISSUER;
  const roles=new Map<string,'owner'|'editor'>();
  if(paired) {
    const settings=await db.prepare('SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string|null}>();
    if(settings?.owner_id){const nativeOwner=await owner();if(nativeOwner&&await person(nativeOwner.id))roles.set(nativeOwner.id,'owner');}
    const admins=await db.prepare(`SELECT t.operator_id FROM bs_team t JOIN members m ON m.id=t.operator_id WHERE t.state='active' AND t.business_role='admin' AND t.business_id IS NOT NULL AND m.workspace_id=${TENANT} AND m.status='active' AND (m.member_kind!='guest' OR m.guest_expires_at IS NULL OR m.guest_expires_at>?) AND ${nativeSamlPolicy('m')}`).bind(new Date().toISOString()).all<{operator_id:string}>();
    for(const admin of admins.results)if(!roles.has(admin.operator_id))roles.set(admin.operator_id,'editor');
  }
  return {
    person,
    businessRole:who=>paired?roles.get(who.id)??null:who.role==='owner'?'owner':null,
    async sponsor({sub}) {
      const settings=await db.prepare('SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string|null}>();
      if(!settings)return null;
      if(settings.owner_id===sub){const bound=await owner();return bound?person(bound.id):null;}
      const bound=await db.prepare("SELECT operator_id FROM bs_team WHERE business_id=? AND state='active'").bind(sub).first<{operator_id:string|null}>();
      return bound?.operator_id?person(bound.operator_id):null;
    },
    async businessMember(who) {
      if(!await person(who.id))return null;
      const settings=await db.prepare('SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string|null}>();
      if(!settings)return null;
      if(settings.owner_id&&(await owner())?.id===who.id)return {id:settings.owner_id,role:'owner'};
      const row=await db.prepare("SELECT business_id,business_role FROM bs_team WHERE operator_id=? AND state='active' AND business_id IS NOT NULL").bind(who.id).first<{business_id:string;business_role:string}>();
      return row?{id:row.business_id,role:row.business_role==='admin'?'editor':null}:null;
    },
    async session(request) {
      const session=await createSessionService(db,sessionOptions(config)).current(request);
      // The native session already performed its SAML/provider admission checks.
      return session?asPerson(session.member):null;
    },
  };
}
