import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requirePageLevel} from '../sharing/current-access';
import {requireSkillDefinitionDisclosure,readSkill} from './disclosure';
export async function requireSkill(ctx:FeatureContext,id:string){
 const row=await ctx.db.prepare('SELECT s.*,v.definition_json FROM intelligence_skills s JOIN intelligence_skill_versions v ON v.id=s.current_revision_id WHERE s.id=? AND s.workspace_id=?').bind(id,ctx.actor.workspaceId).first<{page_id:string;definition_json:string}>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');await requirePageLevel(ctx,row.page_id,'view');await requireSkillDefinitionDisclosure(ctx,JSON.parse(row.definition_json));await readSkill(ctx,id);return row;
}
