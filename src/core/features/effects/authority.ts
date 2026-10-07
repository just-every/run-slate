import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requireRun,reauthorizeRun,requiresFreshRunAuthority} from '../runs/repository';

/** Historical disclosure is checked first; a restored run conveys no effect authority. */
export async function requireEffectRun(ctx:FeatureContext,runId:string){
 const run=await requireRun(ctx,runId,true);
 if(requiresFreshRunAuthority(run))throw new ApiProblem(403,'RESTORED_AUTHORITY_REQUIRED','Restored work requires a fresh authorized successor before external effects.');
 // Classify intrinsically read-only work before model-route checks. This denial
 // needs no current provider qualification and can never dispatch an effect.
 if(['answer','summary','difference','edit','investigation','routing'].includes(run.kind))throw new ApiProblem(403,'INQUIRY_IS_NOT_AUTHORITY','An answer or inquiry never authorizes an operational effect. Start an explicitly granted procedure.');
 await reauthorizeRun(ctx,run);
 return run;
}
