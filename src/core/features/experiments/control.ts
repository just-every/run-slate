import {trialStopStatements} from './stop-propagation';
import type {FeatureContext} from '../../app/feature-context';
import {commitOperation,mutationGuard} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {requireTrial} from './service';
import {revision} from '../ai/persistence';
export async function stopTrial(ctx:FeatureContext,input:{id:string;operationKey:string;expectedRevisionId:string;reason:string}){const trial=await requireTrial(ctx,input.id,true);if(!['prepared','active'].includes(trial.state))throw new ApiProblem(409,'TRIAL_STOPPED','This trial is already stopped or completed.');return commitOperation(ctx,{operationKey:input.operationKey,action:'experiments.stop',request:input,authorize:async()=>{await requireTrial(ctx,input.id,true);},prepare:async({revisionId})=>({entity:{id:input.id,kind:'experiment',revisionId},value:{id:input.id,state:'stopped',revisionId},statements:[mutationGuard(ctx.db,"SELECT revision_id=? AND state IN ('prepared','active') FROM intelligence_experiments WHERE id=?",[input.expectedRevisionId,input.id]),...trialStopStatements(ctx,input.id,revisionId,input.reason),revision(ctx,revisionId,'experiment-stop',input.id,input)]})});}
