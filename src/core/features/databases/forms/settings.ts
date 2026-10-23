import {z} from 'zod';
import type {FeatureContext} from '../../../app/feature-context';
import {commitOperation,mutationGuard} from '../../../app/operations';
import {ApiProblem} from '../../../app/problems';
import {createUlid} from '../../../shared/ulid';
import {createOpaqueToken} from '../../../platform/auth/token';
import {database,fields,revision} from '../repository';
import {requireGovernance} from '../../workspace/governance';
import {formDefinitionSchema,validateDefinition,type FormDefinition} from './definition';
export interface FormRow {id:string;workspace_id:string;database_id:string;slug:string;title:string;definition_json:string;published:number;publisher_member_id:string|null;revision_id:string;created_at:string;updated_at:string}
export const formSettingsSchema=z.object({operationKey:z.string().min(8).max(160),expectedRevisionId:z.string().nullable(),title:z.string().trim().min(1).max(200),definition:formDefinitionSchema,published:z.boolean()}).strict();
export async function readDatabaseForm(ctx:FeatureContext,id:string){
 await database(ctx,id,'edit');
 const item=await ctx.db.prepare('SELECT * FROM database_forms WHERE database_id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<FormRow>();
 return {item:item?{id:item.id,title:item.title,definition:JSON.parse(item.definition_json) as FormDefinition,published:!!item.published,revisionId:item.revision_id,href:`/p/forms/${item.slug}`}:null};
}
export async function saveDatabaseForm(ctx:FeatureContext,id:string,input:z.infer<typeof formSettingsSchema>){
 return commitOperation(ctx,{operationKey:input.operationKey,action:'databases.form',request:{id,...input},authorize:async()=>{const db=await database(ctx,id,'edit');if(input.published&&input.definition.anonymous)await requireGovernance(ctx,'publishPublicly',db.page_id);},prepare:async({revisionId})=>{
  const db=await database(ctx,id,'edit'),definition=input.definition;
  validateDefinition(definition,await fields(ctx,id));
  if(definition.guestIds.length){const guests=await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND member_kind='guest' AND status='active' AND (guest_expires_at IS NULL OR guest_expires_at>?)").bind(ctx.actor.workspaceId,ctx.now).all<{id:string}>();if(definition.guestIds.some(id=>!guests.results.some(g=>g.id===id)))throw new ApiProblem(400,'INVALID_FORM','Choose active named guests.');}
  if(input.published&&definition.anonymous){const veto=await ctx.db.prepare('SELECT c.public_link_access,c.anonymous_access,w.public_link_access AS workspace_public,w.anonymous_access AS workspace_anonymous FROM pages p JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?').bind(db.page_id).first<Record<string,string>>();if(!veto||Object.values(veto).some(value=>value==='forbidden'))throw new ApiProblem(403,'PUBLIC_LINKS_FORBIDDEN','Public links and anonymous access must be allowed for this space.');}
  const prior=await ctx.db.prepare('SELECT * FROM database_forms WHERE database_id=?').bind(id).first<FormRow>();
  if((prior?.revision_id??null)!==input.expectedRevisionId)throw new ApiProblem(409,'REVISION_CONFLICT','The form changed. Reload it.');
  const formId=prior?.id??createUlid(),slug=prior?.slug??createOpaqueToken();
  const guard=prior?mutationGuard(ctx.db,'SELECT revision_id=? FROM database_forms WHERE id=?',[input.expectedRevisionId,formId]):mutationGuard(ctx.db,'SELECT NOT EXISTS(SELECT 1 FROM database_forms WHERE database_id=?)',[id]);
  return {entity:{kind:'page',id:db.page_id,revisionId},value:{id:formId,revisionId,href:`/p/forms/${slug}`},detail:{formId,published:input.published},statements:[guard,mutationGuard(ctx.db,'SELECT revision_id=? FROM databases WHERE id=?',[db.revision_id,id]),ctx.db.prepare('INSERT INTO database_forms(id,workspace_id,database_id,slug,title,definition_json,published,publisher_member_id,revision_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,definition_json=excluded.definition_json,published=excluded.published,publisher_member_id=excluded.publisher_member_id,revision_id=excluded.revision_id,updated_at=excluded.updated_at').bind(formId,ctx.actor.workspaceId,id,slug,input.title,JSON.stringify(definition),+input.published,ctx.actor.id,revisionId,ctx.now,ctx.now),revision(ctx,revisionId,'database-form',formId,{title:input.title,definition,published:input.published})]};
 }});
}
