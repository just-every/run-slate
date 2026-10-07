import {interruptSelectedAttempts} from '../runs/attempt-interruption';
import type {FeatureContext} from '../../app/feature-context';
import {commitOperation,mutationGuard} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {requireInquiry,inquiryView} from './service';
import {askInquiry} from './planner';
import {revision} from '../ai/persistence';
import type {EvidenceInput} from '../ai/contracts';
export async function continueInquiry(ctx:FeatureContext,inquiryId:string,input:{operationKey:string;instruction:string},config:{apiKey?:string;localUrl?:string;localToken?:string}){
 const inquiry=await requireInquiry(ctx,inquiryId,true),view=await inquiryView(ctx,inquiryId);const refs=JSON.parse(inquiry.refs_json) as EvidenceInput[];
 const started=await askInquiry(ctx,{operationKey:input.operationKey,pageId:inquiry.page_id,question:`Continue inquiry ${inquiryId}: ${inquiry.question}\nCurrent recorded findings and analysis (not permission): ${JSON.stringify(view)}\nRequested adjustment: ${input.instruction}`,kind:'investigation',refs,audience:JSON.parse(inquiry.audience_json),frontier:true,maxOutputTokens:4096},config,inquiryId);
 return {...started,parentInquiryId:inquiryId};
}
export async function stopInquiry(ctx:FeatureContext,inquiryId:string,input:{operationKey:string;expectedRevisionId:string;reason:string}){
 const inquiry=await requireInquiry(ctx,inquiryId,true);const runSelect="SELECT id FROM intelligence_runs WHERE workspace_id=? AND (id IN (SELECT run_id FROM intelligence_hypotheses WHERE inquiry_id=?) OR json_extract(output_json,'$.inquiryId')=? OR json_extract(input_json,'$.parentInquiryId')=? OR json_extract(input_json,'$.trialId') IN (SELECT id FROM intelligence_experiments WHERE inquiry_id=?))";const values=[ctx.actor.workspaceId,inquiryId,inquiryId,inquiryId,inquiryId];
 return commitOperation(ctx,{operationKey:input.operationKey,action:'inquiries.stop',request:{inquiryId,...input},authorize:async()=>{await requireInquiry(ctx,inquiryId,true);},prepare:async({revisionId})=>({entity:{id:inquiryId,kind:'inquiry',revisionId},value:{id:inquiryId,state:'stopped',revisionId},statements:[...interruptSelectedAttempts(ctx.db,runSelect,values,ctx.now,'INQUIRY_STOPPED'),mutationGuard(ctx.db,'SELECT revision_id=? FROM intelligence_inquiries WHERE id=?',[input.expectedRevisionId,inquiryId]),ctx.db.prepare("UPDATE intelligence_inquiries SET interim_json=json_set(COALESCE(interim_json,'{}'),'$.stopped',json('true')),revision_id=?,updated_at=? WHERE id=?").bind(revisionId,ctx.now,inquiryId),ctx.db.prepare("UPDATE intelligence_experiments SET state='stopped' WHERE inquiry_id=? AND state IN ('prepared','active')").bind(inquiryId),ctx.db.prepare(`UPDATE intelligence_budgets SET released_at=? WHERE released_at IS NULL AND run_id IN (${runSelect})`).bind(ctx.now,...values),ctx.db.prepare(`UPDATE intelligence_effects SET state='cancelled',failure_reason='Inquiry stopped' WHERE state='prepared' AND run_id IN (${runSelect})`).bind(...values),ctx.db.prepare(`UPDATE intelligence_runs SET status='cancelled',failure_reason='Inquiry stopped',settled_at=?,deadline_at=NULL,lease_id=NULL WHERE id IN (${runSelect}) AND status IN ('queued','running','needs-review','paused')`).bind(ctx.now,...values),revision(ctx,revisionId,'inquiry-control',inquiryId,input)]})});
}
