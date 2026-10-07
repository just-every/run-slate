import type {FeatureContext} from '../../app/feature-context';
import {referenceValues} from './erasure-references';

/** Dependency edges point from evidence to its derivative, never back to a host page.
 * UNION (not UNION ALL) in affected reaches a fixed point even for cycles/diamonds.
 * Read the complete graph before any erasure statement can clear its references. */
export async function intelligenceErasureClosure(ctx:FeatureContext,sourceIds:string[],memberId?:string){
 const nodes:string[]=[],edges:string[]=[],seeds:string[]=[];
 const entity=(table:string,kind:string,columns:string[],jsonColumns:string[],owner?:string)=>{
  nodes.push(`SELECT id,'${kind}' kind FROM ${table} WHERE workspace_id=?1`);
  const refs=[...columns.flatMap(c=>[`'${c}'`,`t.${c}`]),...jsonColumns.flatMap(c=>[`'${c}'`,`json(t.${c})`])];
  edges.push(`SELECT j.value source,t.id target FROM ${table} t,json_each((SELECT json_group_array(value) FROM (${referenceValues(`json_object(${refs.join(',')})`)}))) j WHERE t.workspace_id=?1`);
  if(owner)seeds.push(`SELECT id FROM ${table} WHERE workspace_id=?1 AND ${owner}=?3`);
 };
 const retained=(table:string,parent:string,jsonColumns:string[],columns:string[]=[])=>{
  // Retained child stores are inseparable from their owning derivative.
  edges.push(`SELECT ${parent} source,id target FROM ${table}`,`SELECT id source,${parent} target FROM ${table}`);
  const refs=[...columns.flatMap(c=>[`'${c}'`,`t.${c}`]),...jsonColumns.flatMap(c=>[`'${c}'`,`json(t.${c})`])];
  if(refs.length)edges.push(`SELECT j.value source,t.id target FROM ${table} t,json_each((SELECT json_group_array(value) FROM (${referenceValues(`json_object(${refs.join(',')})`)}))) j`);
 };
 entity('intelligence_skills','skills',['page_id','current_revision_id'],[],'owner_id');
 retained('intelligence_skill_versions','skill_id',['definition_json']);
 entity('intelligence_inquiries','inquiries',['page_id','method_revision_id'],['refs_json','interim_json'],'owner_id');
 retained('intelligence_hypotheses','inquiry_id',['evidence_json'],['run_id']);
 retained('intelligence_analyses','inquiry_id',['refs_json','inputs_json','result_json']);
 retained('intelligence_artifacts','inquiry_id',['refs_json','content_json']);
 retained('intelligence_experiments','inquiry_id',['plan_json','outcome_json']);
 retained('intelligence_observations','experiment_id',['refs_json'],['effect_id']);
 entity('intelligence_runs','runs',['page_id','skill_revision_id','parent_id'],['refs_json','input_json','output_json'],'requester_id');
 retained('intelligence_stages','run_id',['result_json']);
 retained('intelligence_effects','run_id',['intent_json','receipt_json','observed_json']);
 retained('intelligence_reviews','run_id',['detail_json']);
 retained('intelligence_evaluations','skill_revision_id',['result_json']);
 retained('intelligence_evaluation_cases','skill_revision_id',['source_refs_json','cases_json','execution_json']);
 entity('intelligence_ambient_scopes','scopes',['page_id'],['refs_json'],'owner_id');
 retained('intelligence_ambient_events','scope_id',['refs_json','assessment_json'],['run_id']);
 entity('knowledge_decisions','decisions',['page_id'],['accepted_snapshot_json']);
 retained('decision_reviews','decision_id',[]);
 edges.push('SELECT page_revision_id source,decision_id target FROM decision_citations');
 entity('intelligence_guided_tasks','tasks',['page_id','run_id'],[],'owner_id');
 retained('intelligence_guided_steps','task_id',['source_refs_json','verification_json','receipt_json']);
 // Immutable snapshots may hold older dependencies no longer present on the current row.
 retained('intelligence_revisions','entity_id',['content_json']);
 retained('record_revisions','entity_id',['content_json']);
 // Grant targets are local entities only for these authority kinds. Effect
 // targets and expectedRevision name remote provider objects, not local IDs.
 entity('intelligence_grants','grants',[],['scope_json']);
 edges.push("SELECT j.value source,g.id target FROM intelligence_grants g,json_each(g.scope_json,'$.targets') j WHERE g.workspace_id=?1 AND g.kind IN ('skill','trial','continuation') AND j.type='text'");
 edges.push('SELECT page_id source,id target FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE workspace_id=?1)');
 edges.push('SELECT source_id source,target_id target FROM intelligence_dependencies WHERE workspace_id=?1','SELECT source_revision_id source,target_id target FROM intelligence_dependencies WHERE workspace_id=?1');
 edges.push('SELECT source_id source,id target FROM federation_revisions');
 // D1 permits only a small number of compound SELECT terms. Build bounded
 // materialized unions without limiting the graph depth or number of entities.
 const ctes:string[]=[];let group=0;
 const union=(name:string,columns:string,terms:string[]):string=>{
  if(terms.length>4)terms=Array.from({length:Math.ceil(terms.length/4)},(_,i)=>`SELECT * FROM ${union(`${name}_group_${group++}`,columns,terms.slice(i*4,(i+1)*4))}`);
  if(terms.length>4)return union(name,columns,terms);
  ctes.push(`${name}(${columns}) AS MATERIALIZED (${terms.join(' UNION ALL ')})`);return name;
 };
 union('nodes','id,kind',nodes);union('edges','source,target',edges);union('roots','id',['SELECT value FROM json_each(?2)',...seeds]);
 const rows=await ctx.db.prepare(`WITH RECURSIVE ${ctes.join(',')},affected(id) AS (SELECT id FROM roots UNION SELECT e.target FROM edges e JOIN affected a ON e.source=a.id WHERE e.target IS NOT NULL) SELECT a.id,n.kind FROM affected a LEFT JOIN nodes n ON n.id=a.id`).bind(ctx.actor.workspaceId,JSON.stringify(sourceIds),memberId??null).all<{id:string;kind:string|null}>();
 const kind=(name:string)=>JSON.stringify(rows.results.filter(r=>r.kind===name).map(r=>r.id));
 return {skills:kind('skills'),inquiries:kind('inquiries'),runs:kind('runs'),scopes:kind('scopes'),decisions:kind('decisions'),tasks:kind('tasks'),all:JSON.stringify([...new Set(rows.results.map(r=>r.id))])};
}
