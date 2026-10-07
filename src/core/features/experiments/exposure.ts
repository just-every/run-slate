import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard,requestHash} from '../../app/operations';
import type {trialPlanSchema} from './service';
import type {z} from 'zod';
/** A confirmed write to the same record is not, by itself, this trial's exposure. */
export async function requireTrialExposure(ctx:FeatureContext,trialId:string,plan:z.infer<typeof trialPlanSchema>,subjectId:string,effectId:string,observedAt:string){
 const row=await ctx.db.prepare('SELECT e.*,r.input_json AS run_input FROM intelligence_effects e JOIN intelligence_runs r ON r.id=e.run_id WHERE e.id=? AND e.workspace_id=? AND r.workspace_id=?').bind(effectId,ctx.actor.workspaceId,ctx.actor.workspaceId).first<{state:string;intent_json:string;receipt_json:string|null;confirmed_at:string|null;run_input:string;operation_key:string}>();
 const deny=()=>new ApiProblem(409,'TRIAL_EXPOSURE_MISMATCH','Exposure needs this trial’s exact approved effect and owning-system receipt inside its declared window.');
 if(!row||row.state!=='confirmed'||!row.receipt_json||JSON.parse(row.run_input).trialId!==trialId)throw deny();
 const intent=JSON.parse(row.intent_json),receipt=JSON.parse(row.receipt_json),declared=plan.effects.find(effect=>effect.subjectId===subjectId&&effect.target===intent.target&&effect.operation===intent.operation&&effect.accountId===intent.accountId&&effect.connectionId===intent.connectionId&&effect.expectedRevision===intent.expectedRevision&&('expectedAudienceRevision'in effect?effect.expectedAudienceRevision===intent.expectedAudienceRevision:true));
 if(!declared||await requestHash(declared.content)!==await requestHash(intent.content)||receipt.accountId!==declared.accountId||receipt.operationKey!==row.operation_key)throw deny();
 const committed=typeof receipt.committedAt==='number'?receipt.committedAt:Date.parse(receipt.committedAt??receipt.revision),confirmed=Date.parse(row.confirmed_at??'');
 if(!Number.isFinite(committed)||!Number.isFinite(confirmed)||committed<Date.parse(plan.startsAt)||committed>Date.parse(observedAt)||committed>=Date.parse(plan.endsAt)||confirmed<Date.parse(plan.startsAt)||confirmed>Date.parse(observedAt)||confirmed>=Date.parse(plan.endsAt))throw deny();
 return mutationGuard(ctx.db,"SELECT e.state='confirmed' AND e.receipt_json=? AND e.intent_json=? AND json_extract(r.input_json,'$.trialId')=? FROM intelligence_effects e JOIN intelligence_runs r ON r.id=e.run_id WHERE e.id=?",[row.receipt_json,row.intent_json,trialId,effectId]);
}
