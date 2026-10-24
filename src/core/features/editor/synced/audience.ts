import type {FeatureContext} from '../../../app/feature-context';
import {ApiProblem} from '../../../app/problems';
import {can} from '../../sharing/access';
import {resolveCurrentAccessMany} from '../../sharing/current-access';
export const publicSql="EXISTS(SELECT 1 FROM public_exposures e JOIN pages p ON p.id=e.page_id JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id WHERE e.page_id=? AND e.revoked_at IS NULL AND p.published_revision_id IS NOT NULL AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes') AND c.public_link_access='allowed' AND c.anonymous_access='allowed' AND w.public_link_access='allowed' AND w.anonymous_access='allowed')";
/** Freeze people, not grants: a subsequent grant or new membership never widens retained content. */
export async function frozenAudience(ctx:FeatureContext,sourceId:string,destinationId:string,draftOnly=false){
 const people=(await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND status='active'").bind(ctx.actor.workspaceId).all<{id:string}>()).results;
 const readers:string[]=[];let ordinary=true;
 for(const person of people){
  const viewer={...ctx,containerScopeIds:undefined,actor:{...ctx.actor,id:person.id},authorizationEpoch:undefined};
  try{
   const access=await resolveCurrentAccessMany(viewer,[sourceId,destinationId],{includeTrashed:true});
   const visible=(id:string)=>{const decision=access.get(id)?.decision;return !!decision&&can(decision,'view');};
   const sourceDecision=access.get(sourceId)?.decision;
   const sourceVisible=visible(sourceId)&&(!draftOnly||!!sourceDecision&&can(sourceDecision,'edit'));
   if(sourceVisible)readers.push(person.id);
   else if(visible(destinationId))ordinary=false;
  }catch(error){if(!(error instanceof ApiProblem)||error.status!==401)throw error;}
 }
 const exposed=async(id:string)=>!!(await ctx.db.prepare('SELECT '+publicSql+' AS value').bind(id).first<{value:number}>())?.value;
 const anonymous=!draftOnly&&await exposed(sourceId),destinationPublic=await exposed(destinationId);
 return {readers,anonymous,ordinary:ordinary&&(!destinationPublic||anonymous)};
}
