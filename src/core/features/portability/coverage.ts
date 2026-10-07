import {requireSkillDefinitionDisclosure} from '../skills/disclosure';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requireWorkspaceOwner,requirePageLevel} from '../sharing/current-access';
import {resolveEvidence} from '../source-memory/service';
/** A workspace role cannot grant itself access to private working revisions. */
export async function requireExportCoverage(ctx:FeatureContext){
 await requireWorkspaceOwner(ctx);
 if(await ctx.db.prepare('SELECT id FROM workspaces WHERE id!=? LIMIT 1').bind(ctx.actor.workspaceId).first())throw new ApiProblem(403,'EXPORT_SCOPE_INCOMPLETE','This complete deployment archive includes another workspace. Use a workspace-isolated deployment before exporting; no archive was made.');
 const pages=(await ctx.db.prepare('SELECT id FROM pages WHERE workspace_id=? AND deleted_at IS NULL').bind(ctx.actor.workspaceId).all<{id:string}>()).results;
 for(const page of pages){try{await requirePageLevel(ctx,page.id,'edit',{includeTrashed:true});}catch{throw new ApiProblem(403,'EXPORT_SCOPE_INCOMPLETE','A complete archive needs access to every working page, including private drafts and personal pages. Ask their owners to deliberately share the required content, or export an accessible page or container. No archive was made.');}}
 // Erasure leaves an explicit payload-free retired tombstone, not a method to disclose.
 const skills=(await ctx.db.prepare("SELECT v.definition_json FROM intelligence_skill_versions v JOIN intelligence_skills s ON s.id=v.skill_id WHERE s.workspace_id=? AND NOT(s.name='' AND v.state='retired' AND v.definition_json='{}')").bind(ctx.actor.workspaceId).all<{definition_json:string}>()).results;
 for(const version of skills){try{await requireSkillDefinitionDisclosure(ctx,JSON.parse(version.definition_json));}catch{throw new ApiProblem(403,'EXPORT_SCOPE_INCOMPLETE','A retained method depends on source material that is no longer readable. No archive was made.');}}
 const imports=await ctx.db.prepare("SELECT 1 FROM federation_imports WHERE workspace_id=? AND actor_id!=? AND state!='deleted' LIMIT 1").bind(ctx.actor.workspaceId,ctx.actor.id).first();
 if(imports)throw new ApiProblem(403,'EXPORT_SCOPE_INCOMPLETE','Another member owns a retained import archive. Its owner must remove the retained original before this complete export; imported pages remain subject to their own sharing. No archive was made.');
 const sources=(await ctx.db.prepare("SELECT id,published_revision_id FROM federation_sources WHERE workspace_id=? AND state='active' AND published_revision_id IS NOT NULL").bind(ctx.actor.workspaceId).all<{id:string;published_revision_id:string}>()).results;
 for(const source of sources){const evidence=await resolveEvidence(ctx,{sourceId:source.id,sourceRevisionId:source.published_revision_id},{secret:ctx.sourceSecret});if(evidence.state!=='available')throw new ApiProblem(403,'EXPORT_SCOPE_INCOMPLETE','A retained connected source cannot currently be read. Reconnect its authorized identity or remove the retained source before exporting. No archive was made.');}
}
