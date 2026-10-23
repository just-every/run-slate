import type {Context} from 'hono';
import type {AppEnvironment} from '../../../app/types';
import type {FeatureContext} from '../../../app/feature-context';
import {ApiProblem} from '../../../app/problems';
import {createMemberRepository} from '../../session/repository';
import {currentSubject} from '../../sharing/current-access';
import {requireGovernance} from '../../workspace/governance';
import {database,fields} from '../repository';
import {formDefinitionSchema,validateDefinition} from './definition';
import type {FormRow} from './settings';
export const unavailable=()=>new ApiProblem(404,'NOT_FOUND','This form is no longer available.');
export async function availableForm(c:Context<AppEnvironment>,slug:string){
 const row=await c.env.DB.prepare('SELECT * FROM database_forms WHERE slug=? AND published=1').bind(slug).first<FormRow>();
 if(!row||!row.publisher_member_id)throw unavailable();
 const actor=await createMemberRepository(c.env.DB).getMember(row.publisher_member_id);if(!actor)throw unavailable();
 const ctx:FeatureContext={db:c.env.DB,files:c.env.FILES,jobs:c.env.JOBS,actor,now:new Date().toISOString(),localDevelopment:c.get('runtimeConfig').localDevelopment};
 try{
  const db=await database(ctx,row.database_id,'edit'),definitions=await fields(ctx,row.database_id),definition=formDefinitionSchema.parse(JSON.parse(row.definition_json));
  validateDefinition(definition,definitions);
  const policy=await ctx.db.prepare('SELECT p.container_id,p.lifecycle,p.trashed_at,p.deleted_at,p.archived_at,c.public_link_access,c.anonymous_access,c.guest_access,w.public_link_access AS workspace_public,w.anonymous_access AS workspace_anonymous,w.guest_access AS workspace_guests FROM pages p JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?').bind(db.page_id).first<Record<string,string|null>>();
  if(!policy||policy.trashed_at||policy.deleted_at||policy.archived_at)throw unavailable();
  const member=c.get('member');let kind:'member'|'guest'|'anonymous'='anonymous';
  if(member){const subject=await currentSubject({...ctx,actor:member,authorizationEpoch:undefined});kind=subject.isGuest?'guest':'member';if(kind==='member'&&!definition.members||kind==='guest'&&(!definition.guestIds.includes(member.id)||policy.guest_access==='forbidden'||policy.workspace_guests==='forbidden'))throw unavailable();}
  else{
   if(c.env.RER_DEMO==='1'||!definition.anonymous||policy.public_link_access==='forbidden'||policy.workspace_public==='forbidden'||policy.anonymous_access==='forbidden'||policy.workspace_anonymous==='forbidden')throw unavailable();
   await requireGovernance(ctx,'publishPublicly',db.page_id);
  }
  return {row,ctx,definition,fields:definitions,pageId:db.page_id,containerId:policy.container_id!,memberId:member?.id??null,kind};
 }catch(cause){if(cause instanceof ApiProblem&&cause.status>=500)throw cause;throw unavailable();}
}
