import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requireWorkspaceOwner, currentSubject } from '../sharing/current-access';
import { resolveKnowledgePolicyProfile, type KnowledgePolicyProfile } from '../../shared/knowledge/policies';
import type { WorkspaceView } from '../../shared/api/workspace';
export async function workspacePolicies(ctx:FeatureContext):Promise<KnowledgePolicyProfile> {
  const row=await ctx.db.prepare('SELECT profile_json FROM workspace_policies WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{profile_json:string}>();
  return resolveKnowledgePolicyProfile(row?JSON.parse(row.profile_json):{});
}
export async function readWorkspace(ctx:FeatureContext):Promise<WorkspaceView> {
  await currentSubject(ctx);
  const [row,policies]=await Promise.all([ctx.db.prepare('SELECT id,name,mark,description,revision_id AS revisionId,guest_access AS guestAccess,public_link_access AS publicLinkAccess,anonymous_access AS anonymousAccess FROM workspaces WHERE id=?').bind(ctx.actor.workspaceId).first<Omit<WorkspaceView,'policies'>>(),workspacePolicies(ctx)]);
  if(!row) throw new ApiProblem(404,'NOT_FOUND','Not found.'); return {...row,policies};
}
export async function updateWorkspace(ctx:FeatureContext,input:{operationKey:string;expectedRevisionId:string;name:string;mark:string;description:string;guestAccess:'allowed'|'forbidden';publicLinkAccess:'allowed'|'forbidden';anonymousAccess:'allowed'|'forbidden';policies:KnowledgePolicyProfile}) {
  const profile=resolveKnowledgePolicyProfile(input.policies);
  return commitOperation(ctx,{operationKey:input.operationKey,action:'workspace.update',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>{
    const value={...input,id:ctx.actor.workspaceId,revisionId,policies:profile};
    return {entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId},value,statements:[
      mutationGuard(ctx.db,'SELECT revision_id=? FROM workspaces WHERE id=?',[input.expectedRevisionId,ctx.actor.workspaceId]),
      ctx.db.prepare('UPDATE workspaces SET name=?,mark=?,description=?,guest_access=?,public_link_access=?,anonymous_access=?,updated_at=?,revision_id=? WHERE id=?').bind(input.name,input.mark,input.description,input.guestAccess,input.publicLinkAccess,input.anonymousAccess,ctx.now,revisionId,ctx.actor.workspaceId),
      ctx.db.prepare('INSERT INTO workspace_policies (workspace_id,profile_json,updated_at) VALUES (?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=excluded.updated_at').bind(ctx.actor.workspaceId,JSON.stringify(profile),ctx.now),
      ctx.db.prepare('INSERT INTO core_entity_revisions (id,workspace_id,entity_kind,entity_id,content_hash,content_json,author_member_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,'workspace',ctx.actor.workspaceId,await requestHash(value),JSON.stringify(value),ctx.actor.id,ctx.now),
    ]};
  }});
}

/** Called only in an owner-authorized operation; statements join its atomic policy/allowance batch. */
export async function prepareAiEnableStatements(ctx:FeatureContext,enabled:boolean):Promise<D1PreparedStatement[]> {
 await requireWorkspaceOwner(ctx);
 return [ctx.db.prepare('UPDATE workspaces SET ai_enabled=?,updated_at=? WHERE id=?').bind(+enabled,ctx.now,ctx.actor.workspaceId)];
}
