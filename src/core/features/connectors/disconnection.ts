import {interruptSelectedAttempts} from '../runs/attempt-interruption';
import type {FeatureContext} from '../../app/feature-context';
import type {EvidenceInput} from '../ai/contracts';
import type {ConnectionRow} from './types';
/** Disconnect withdraws execution consent as well as the credential. Reconnect cannot replay it. */
export async function disconnectionStatements(ctx:FeatureContext,connection:ConnectionRow){
 const sources=(await ctx.db.prepare('SELECT s.id FROM federation_sources s JOIN federation_connections c ON c.id=s.connection_id WHERE s.workspace_id=? AND c.provider=?').bind(ctx.actor.workspaceId,connection.provider).all<{id:string}>()).results;
 const affectedSources=new Set(sources.map(s=>s.id));
 const skills=(await ctx.db.prepare('SELECT v.id,v.skill_id,v.definition_json,s.owner_id FROM intelligence_skill_versions v JOIN intelligence_skills s ON s.id=v.skill_id WHERE s.workspace_id=?').bind(ctx.actor.workspaceId).all<{id:string;skill_id:string;definition_json:string;owner_id:string}>()).results;
 const decisions=(await ctx.db.prepare("SELECT id,content_json FROM intelligence_revisions WHERE workspace_id=? AND entity_kind='decision-acceptance'").bind(ctx.actor.workspaceId).all<{id:string;content_json:string}>()).results;
 const graph=new Map<string,EvidenceInput[]>([...skills.map(v=>[v.id,JSON.parse(v.definition_json).refs] as [string,EvidenceInput[]]),...decisions.map(v=>[v.id,JSON.parse(v.content_json).citations] as [string,EvidenceInput[]])]);
 function affected(refs:EvidenceInput[],seen=new Set<string>()):boolean{return refs.some(ref=>{if(ref.kind==='source')return affectedSources.has(ref.sourceId);if(ref.kind!=='skill'&&ref.kind!=='decision')return false;if(seen.has(ref.revisionId))return true;return affected(graph.get(ref.revisionId)??[],new Set([...seen,ref.revisionId]));});}
 const versions=skills.filter(v=>{const def=JSON.parse(v.definition_json);return (v.owner_id===connection.member_id||def.audience.includes(connection.member_id))&&affected(def.refs);}).map(v=>v.id);
 const runs=(await ctx.db.prepare("SELECT id,requester_id,refs_json,audience_json,skill_revision_id FROM intelligence_runs WHERE workspace_id=? AND status IN ('queued','running','paused','needs-review')").bind(ctx.actor.workspaceId).all<{id:string;requester_id:string;refs_json:string;audience_json:string;skill_revision_id:string|null}>()).results;
 const runIds=runs.filter(run=>(run.requester_id===connection.member_id||JSON.parse(run.audience_json).includes(connection.member_id))&&(affected(JSON.parse(run.refs_json))||versions.includes(run.skill_revision_id??''))).map(run=>run.id);
 const statements:D1PreparedStatement[]=[];
 for(const versionId of versions)statements.push(ctx.db.prepare("UPDATE intelligence_skill_versions SET state=CASE WHEN state='active' THEN CASE WHEN evaluation_id IS NULL THEN 'draft' ELSE 'evaluated' END ELSE state END,authority_id=NULL WHERE id=?").bind(versionId));
 for(const runId of runIds)statements.push(
  ...interruptSelectedAttempts(ctx.db,'SELECT id FROM intelligence_runs WHERE id=?',[runId],ctx.now,'SOURCE_DISCONNECTED'),
  ctx.db.prepare("UPDATE intelligence_runs SET status='paused',failure_reason='SOURCE_DISCONNECTED',lease_id=NULL,deadline_at=NULL,updated_at=? WHERE id=?").bind(ctx.now,runId),
  ctx.db.prepare('UPDATE intelligence_budgets SET released_at=? WHERE run_id=? AND released_at IS NULL').bind(ctx.now,runId),
  ctx.db.prepare("UPDATE intelligence_effects SET state='cancelled',failure_reason='SOURCE_DISCONNECTED' WHERE run_id=? AND state='prepared'").bind(runId),
 );
 statements.push(ctx.db.prepare("UPDATE intelligence_effects SET state=CASE WHEN state='prepared' THEN 'cancelled' ELSE 'uncertain' END,failure_reason='SOURCE_DISCONNECTED' WHERE workspace_id=? AND json_extract(intent_json,'$.connectionId')=? AND state IN ('prepared','dispatched')").bind(ctx.actor.workspaceId,connection.id));
 const grants=(await ctx.db.prepare('SELECT id,subject_id,scope_json FROM intelligence_grants WHERE workspace_id=? AND revoked_at IS NULL').bind(ctx.actor.workspaceId).all<{id:string;subject_id:string;scope_json:string}>()).results;
 for(const grant of grants){const scope=JSON.parse(grant.scope_json);if((grant.subject_id===connection.member_id||scope.audience.includes(connection.member_id))&&(scope.sourceIds.some((id:string)=>affectedSources.has(id))||scope.accounts.includes(connection.account_id)))statements.push(ctx.db.prepare('UPDATE intelligence_grants SET revoked_at=? WHERE id=?').bind(ctx.now,grant.id));}
 return statements;
}
