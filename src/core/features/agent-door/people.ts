import type { PeopleAdapter, Person } from '../../../../modules/agent-door/index.ts';
import type { AppBindings, AuthenticatedMember } from '../../app/types';
import { createSessionService, sessionOptions } from '../session/service';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { TENANT } from '../session/native/store';

/** Slate has owners and members, not Base operators or a native admin role. */
export function nativePeople(env: AppBindings, config: RuntimeConfig): PeopleAdapter {
  const read = async (id: string): Promise<Person | null> => {
    const row = await env.DB.prepare(`SELECT id,email,display_name AS name,role,status,member_kind FROM members WHERE id=? AND workspace_id=${TENANT}`).bind(id).first<Person & {status:string;member_kind:string}>();
    return row ? {id:row.id,email:row.email.toLowerCase(),name:row.name,role:row.role,active:row.status==='active' && row.member_kind==='member'} : null;
  };
  const owner = () => env.DB.prepare(`SELECT id FROM members WHERE workspace_id=${TENANT} AND is_setup_owner=1 AND role='owner' AND status='active'`).first<{id:string}>();
  return {
    person: read,
    async sponsor({sub}) {
      const settings=await env.DB.prepare('SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string|null}>();
      if(!settings)return null;
      if(settings.owner_id===sub){const person=await owner();return person?read(person.id):null;}
      const binding=await env.DB.prepare("SELECT operator_id FROM bs_team WHERE business_id=? AND state='active'").bind(sub).first<{operator_id:string|null}>();
      return binding?.operator_id?read(binding.operator_id):null;
    },
    async businessMember(person) {
      if(!person.active)return null;
      const settings=await env.DB.prepare('SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string|null}>();
      if(!settings)return null;
      if(settings.owner_id&&(await owner())?.id===person.id)return {id:settings.owner_id,role:'owner'};
      const row=await env.DB.prepare("SELECT business_id,business_role FROM bs_team WHERE operator_id=? AND state='active' AND business_id IS NOT NULL").bind(person.id).first<{business_id:string;business_role:string}>();
      return row?{id:row.business_id,role:row.business_role==='admin'?'editor':null}:null;
    },
    async session(request) {
      const member=await createSessionService(env.DB,sessionOptions(config)).authenticate(request);
      return member?read(member.id):null;
    },
  };
}
export async function nativeMember(db:D1Database,id:string):Promise<AuthenticatedMember> {
  const row=await db.prepare(`SELECT m.id,m.workspace_id AS workspaceId,w.name AS workspaceName,m.email,m.display_name AS displayName,m.initials,m.role FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=? AND m.workspace_id=${TENANT} AND m.status='active' AND m.member_kind='member'`).bind(id).first<AuthenticatedMember>();
  if(!row)throw new Error('Native sponsor unavailable');
  return row;
}
