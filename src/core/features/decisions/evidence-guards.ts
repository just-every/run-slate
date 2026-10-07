import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import type {EvidenceInput} from '../ai/contracts';
/** Bind every cited local revision to the acceptance transaction after live disclosure checks. */
export async function currentCitationGuards(ctx:FeatureContext,refs:EvidenceInput[],depth=0):Promise<D1PreparedStatement[]>{
 if(depth>8)throw new ApiProblem(409,'EVIDENCE_DEPTH','The source chain exceeds its bounded depth.');
 const guards:D1PreparedStatement[]=[];
 for(const ref of refs){
 if(ref.kind==='page'){
 guards.push(mutationGuard(ctx.db,"SELECT working_revision_id=? AND deleted_at IS NULL AND trashed_at IS NULL AND lifecycle IN ('live','live-with-unpublished-changes') AND EXISTS(SELECT 1 FROM page_revisions r WHERE r.id=? AND r.page_id=pages.id AND r.deleted_at IS NULL) FROM pages WHERE id=? AND workspace_id=?",[ref.revisionId,ref.revisionId,ref.sourceId,ctx.actor.workspaceId]));continue;
 }
 if(ref.kind==='source'){
 const source=await ctx.db.prepare('SELECT s.revision_id,c.id AS connection_id,c.revision_id AS connection_revision FROM federation_sources s JOIN federation_connections c ON c.id=s.connection_id WHERE s.id=? AND s.workspace_id=?').bind(ref.sourceId,ctx.actor.workspaceId).first<{revision_id:string;connection_id:string;connection_revision:string}>();
 if(!source)throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The source is unavailable.');
 guards.push(mutationGuard(ctx.db,"SELECT s.state='active' AND s.revision_id=? AND s.published_revision_id=? AND c.state='connected' AND c.revision_id=? AND r.deleted_at IS NULL AND r.published_at IS NOT NULL FROM federation_sources s JOIN federation_connections c ON c.id=s.connection_id JOIN federation_revisions r ON r.id=? AND r.source_id=s.id WHERE s.id=? AND s.workspace_id=?",[source.revision_id,ref.revisionId,source.connection_revision,ref.revisionId,ref.sourceId,ctx.actor.workspaceId]));continue;
 }
 const row=ref.kind==='decision'?await ctx.db.prepare("SELECT r.content_json AS content FROM intelligence_revisions r JOIN knowledge_decisions d ON d.id=r.entity_id WHERE d.id=? AND d.workspace_id=? AND r.id=? AND r.entity_kind='decision-acceptance'").bind(ref.sourceId,ctx.actor.workspaceId,ref.revisionId).first<{content:string}>():await ctx.db.prepare('SELECT v.definition_json AS content FROM intelligence_skill_versions v JOIN intelligence_skills s ON s.id=v.skill_id WHERE s.id=? AND s.workspace_id=? AND v.id=?').bind(ref.sourceId,ctx.actor.workspaceId,ref.revisionId).first<{content:string}>();
 if(!row)throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The exact evidence revision is unavailable.');
 guards.push(ref.kind==='decision'?mutationGuard(ctx.db,"SELECT state='accepted' AND removed_at IS NULL AND accepted_revision_id=? AND EXISTS(SELECT 1 FROM pages p WHERE p.id=knowledge_decisions.page_id AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes')) FROM knowledge_decisions WHERE id=? AND workspace_id=?",[ref.revisionId,ref.sourceId,ctx.actor.workspaceId]):mutationGuard(ctx.db,"SELECT s.current_revision_id=? AND v.state='active' AND EXISTS(SELECT 1 FROM pages p WHERE p.id=s.page_id AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes')) FROM intelligence_skills s JOIN intelligence_skill_versions v ON v.id=? AND v.skill_id=s.id WHERE s.id=? AND s.workspace_id=?",[ref.revisionId,ref.revisionId,ref.sourceId,ctx.actor.workspaceId]));
 const content=JSON.parse(row.content),nested=ref.kind==='decision'?content.citations:content.refs;
 if(!Array.isArray(nested))throw new ApiProblem(404,'EVIDENCE_UNAVAILABLE','The exact evidence revision is unavailable.');
 guards.push(...await currentCitationGuards(ctx,nested,depth+1));
 }
 return guards;
}
