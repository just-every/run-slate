import type {FeatureContext} from '../../app/feature-context';
import {requirePageLevel,requireWorkspaceOwner} from '../sharing/current-access';
import {readSkill} from './disclosure';
import {evaluationStatus,requirePreparedEvaluationAssessment} from './evaluation-workflow';
import {ApiProblem} from '../../app/problems';

export async function listPageSkills(ctx:FeatureContext,pageId:string){
 await requirePageLevel(ctx,pageId,'view');
 const canEdit=await permitted(()=>requirePageLevel(ctx,pageId,'edit'));
 const canEvaluate=canEdit&&await permitted(()=>requireWorkspaceOwner(ctx));
 const rows=await ctx.db.prepare('SELECT id FROM intelligence_skills WHERE page_id=? AND workspace_id=? ORDER BY updated_at DESC').bind(pageId,ctx.actor.workspaceId).all<{id:string}>();
 const items=[];
 for(const row of rows.results){
  try{
   // Every version is authorized before exposing any of its metadata or prose.
   const skill=await readSkill(ctx,row.id);
   const versions=[];
   for(const version of skill.versions){
    const typed=version as typeof version&{id:string};
    const evaluations=[];
    if(canEdit){
     const cases=await ctx.db.prepare('SELECT id FROM intelligence_evaluation_cases WHERE skill_revision_id=? AND workspace_id=? ORDER BY created_at DESC,id DESC').bind(typed.id,ctx.actor.workspaceId).all<{id:string}>();
     for(const candidate of cases.results){
      try{
       const status=await evaluationStatus(ctx,candidate.id);
       let state=status.execution.evaluationId?'completed':'prepared';
       if(status.execution.judgeRunId){
        try{await requirePreparedEvaluationAssessment(ctx,candidate.id);}
        catch(error){if(error instanceof ApiProblem&&error.code==='OUTCOME_ASSESSMENT_FAILED')state='failed';else if(!(error instanceof ApiProblem)||!['OUTCOME_ASSESSMENT_REQUIRED','INVALID_OUTCOME_ASSESSMENT','OUTCOME_ASSESSMENT_CHANGED','BASELINES_REQUIRED'].includes(error.code))throw error;}
       }
       evaluations.push({id:candidate.id,state});
      }catch(error){if(!(error instanceof ApiProblem)||!['RESTORED_AUTHORITY_REQUIRED'].includes(error.code))throw error;}
     }
    }
    versions.push({...version,definition:JSON.parse(version.definition_json),evaluations});
   }
   items.push({...skill,versions,canEdit,canEvaluate});
  }catch(error){if(!(error instanceof ApiProblem)||![403,404].includes(error.status))throw error;}
 }
 return {items};
}
async function permitted(check:()=>Promise<unknown>){try{await check();return true;}catch(error){if(error instanceof ApiProblem&&[403,404].includes(error.status))return false;throw error;}}
