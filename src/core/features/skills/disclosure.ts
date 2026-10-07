import type {EvidenceInput} from '../ai/contracts';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {resolveEvidence} from '../ai/evidence';
import {requirePageLevel} from '../sharing/current-access';
import {skillDefinitionSchema} from './definition';

type EvidenceOptions = {current?:boolean;cutoff?:string;extraRefs?:EvidenceInput[]};
/** A method's prose depends on its entire definition, not just the sources used by one run. */
export async function requireSkillDefinitionDisclosure(ctx:FeatureContext,definition:unknown,audience:string[]=[ctx.actor.id],options:EvidenceOptions={}){
 const def=skillDefinitionSchema.parse(definition);
 if([ctx.actor.id,...audience].some(memberId=>!def.audience.includes(memberId)))throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await resolveEvidence(ctx,[...def.refs,...options.extraRefs??[]],audience,options);
 return def;
}
export async function requireSkillRevisionDisclosure(ctx:FeatureContext,revisionId:string,audience:string[]=[ctx.actor.id],options:EvidenceOptions={}){
 const row=await ctx.db.prepare('SELECT v.definition_json,s.page_id FROM intelligence_skill_versions v JOIN intelligence_skills s ON s.id=v.skill_id WHERE v.id=? AND s.workspace_id=?').bind(revisionId,ctx.actor.workspaceId).first<{definition_json:string;page_id:string}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await requirePageLevel(ctx,row.page_id,'view');
 return requireSkillDefinitionDisclosure(ctx,JSON.parse(row.definition_json),audience,options);
}
/** An all-versions response is indivisible: an unreadable older version cannot leak through it. */
export async function readSkill(ctx:FeatureContext,id:string){
 const row=await ctx.db.prepare('SELECT * FROM intelligence_skills WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<{id:string;page_id:string}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await requirePageLevel(ctx,row.page_id,'view');
 const versions=(await ctx.db.prepare('SELECT * FROM intelligence_skill_versions WHERE skill_id=? ORDER BY created_at DESC').bind(row.id).all<{id:string;skill_id:string;state:string;evaluation_id:string|null;definition_json:string;created_at:string}>()).results;
 for(const version of versions)await requireSkillDefinitionDisclosure(ctx,JSON.parse(version.definition_json));
 return {...row,versions};
}
