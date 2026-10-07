import type {FeatureContext} from '../../app/feature-context';
import type {RunRow} from '../ai/contracts';
import type {EffectInput} from '../effects/contracts';
import {ApiProblem} from '../../app/problems';
import {mutationGuard,requestHash} from '../../app/operations';
import {requireTrial,trialPlanSchema} from './service';
import {requireGrant} from '../effects/grants';
export async function trialEffectAdmission(ctx:FeatureContext,run:RunRow,input:EffectInput){
 const trialId=JSON.parse(run.input_json).trialId;if(!trialId)return undefined;
 const trial=await requireTrial(ctx,trialId,true),plan=trialPlanSchema.parse(JSON.parse(trial.plan_json));
 if(trial.state!=='active'||ctx.now<plan.startsAt||ctx.now>=plan.endsAt||!trial.grant_id)throw new ApiProblem(409,'TRIAL_NOT_EXECUTABLE','The trial is not active inside its approved window.');
 const declared=plan.effects.find(effect=>effect.target===input.target&&effect.operation===input.operation&&effect.accountId===input.accountId&&effect.connectionId===input.connectionId&&effect.expectedRevision===input.expectedRevision&&('expectedAudienceRevision'in effect?effect.expectedAudienceRevision===('expectedAudienceRevision'in input?input.expectedAudienceRevision:undefined):true));
 if(!declared||await requestHash(declared.content)!==await requestHash(input.content))throw new ApiProblem(403,'TRIAL_EFFECT_MISMATCH','This effect is outside the predeclared trial.');
 await requireGrant(ctx,trial.grant_id,{kind:'trial',operation:'trial.execute',target:trial.id,sourceIds:plan.refs.map(ref=>ref.sourceId),audience:JSON.parse(run.audience_json),costMicros:plan.maximumCostMicros,contentHash:await requestHash(plan),conditions:{contactLimit:String(plan.contactLimit),endsAt:plan.endsAt}});
 return mutationGuard(ctx.db,"SELECT t.state='active' AND t.grant_id=? AND json_extract(t.plan_json,'$.startsAt')<=? AND t.ends_at>? AND g.revoked_at IS NULL AND g.expires_at>? FROM intelligence_experiments t JOIN intelligence_grants g ON g.id=t.grant_id WHERE t.id=?",[trial.grant_id,ctx.now,ctx.now,ctx.now,trial.id]);
}
