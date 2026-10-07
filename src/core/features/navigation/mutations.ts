import type { FeatureContext } from '../../app/feature-context';
import { commitOperation,mutationGuard } from '../../app/operations';
import { currentSubject } from '../sharing/current-access';
/** Personal changes use immutable revisions without changing the referenced page's authoring history. */
export function personalMutation<T>(ctx:FeatureContext,input:{operationKey:string;action:string;request:unknown;authorize?:()=>Promise<void>;build:(revisionId:string)=>Promise<{statements:D1PreparedStatement[];value:T}>}) {
  return commitOperation(ctx,{...input,authorize:async()=>{await currentSubject(ctx);await input.authorize?.();},prepare:async({revisionId})=>{
    const plan=await input.build(revisionId);return {statements:[...plan.statements,ctx.db.prepare('INSERT INTO discovery_revisions (id,workspace_id,member_id,entity_kind,entity_id,body_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,ctx.actor.id,input.action.split('.')[0],ctx.actor.id,JSON.stringify(input.request),ctx.now)],entity:{id:ctx.actor.id,kind:input.action.split('.')[0],revisionId},value:plan.value};
  }});
}
export function personalGuard(ctx:FeatureContext,table:'saved_searches'|'discovery_preferences',id:string,expected:string|null) {
  const key=table==='saved_searches'?'id':'member_id';
  return mutationGuard(ctx.db,expected===null?`SELECT NOT EXISTS(SELECT 1 FROM ${table} WHERE ${key}=?)`:`SELECT revision_id=? FROM ${table} WHERE ${key}=?`,expected===null?[id]:[expected,id]);
}
