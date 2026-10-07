import {test,expect} from 'vitest';
import {env} from 'cloudflare:test';
import {fixture} from './fixture';
import {createInquiry,recordFinding,inquiryView} from '../../../src/core/features/inquiries/service';
import {prepareTrial,approveTrial,concludeTrial} from '../../../src/core/features/experiments/service';
import {prepareLearnedSkill} from '../../../src/core/features/experiments/learning';
import {transitionSkill} from '../../../src/core/features/skills/service';
test('Retained trial learning prepares one inactive draft with failed hypotheses, forecast and evaluation boundary',async()=>{
 const f=await fixture(),ctx=f.context();const inquiry=await createInquiry(ctx,{operationKey:'learning-inquiry',pageId:f.page.pageId,question:'Why did support load change?',refs:f.refs,audience:[f.owner],hypotheses:[{statement:'Instrumentation changed',disconfirmation:'Same event definition'},{statement:'Handoff changed',disconfirmation:'Unchanged handoff'}]});
 const hypothesis=(await inquiryView(f.context(),inquiry.value.id)).hypotheses[0]!;
 await recordFinding(f.context(),{id:inquiry.value.id,operationKey:'learning-finding',hypothesisId:hypothesis.id as string,status:'disconfirmed',finding:'The event definition was unchanged.',kind:'observation',refs:f.refs});
 const begins=new Date(Date.parse(ctx.now)+1000).toISOString(),ends=new Date(Date.parse(ctx.now)+3000).toISOString();
 const prepared=await prepareTrial(f.context(),{operationKey:'learning-trial',inquiryId:inquiry.value.id,plan:{eligibility:'Named support cohort',assignment:[{subjectId:'a',arm:'treatment'},{subjectId:'b',arm:'treatment'},{subjectId:'c',arm:'comparison'},{subjectId:'d',arm:'comparison'}],assignmentMethod:'observational',seed:'retained',confounding:['Unmeasured team differences'],baseline:'Original workflow',metric:'Support minutes',meaningfulEffect:2,maximumHalfWidth:1,startsAt:begins,endsAt:ends,supportGuardrail:20,contactLimit:0,maximumCostMicros:1000,forecast:'Handoff changes may reduce support work',instrumentationRevision:'instrument-v1',refs:f.refs,effects:[]}});
 await expect(prepareLearnedSkill(f.context(),{id:prepared.value.id,operationKey:'learning-draft',expectedRevisionId:prepared.value.revisionId})).rejects.toMatchObject({code:'CONCLUDED_TRIAL_REQUIRED'});
 const active=await approveTrial(f.context(),{id:prepared.value.id,operationKey:'learning-approve',expectedRevisionId:prepared.value.revisionId});
 // This clock is a test fixture only. Missing exposure must produce inconclusive, never benefit.
 const conclusion=await concludeTrial({...f.context(),now:new Date(Date.parse(ends)+1).toISOString()},{id:prepared.value.id,operationKey:'learning-conclude',expectedRevisionId:active.value.revisionId,instrumentationRevision:'instrument-v1'});
 expect(conclusion.value.outcome.classification).toBe('inconclusive');
 const input={id:prepared.value.id,operationKey:'learning-draft',expectedRevisionId:conclusion.value.methodRevision};
 const learned=await prepareLearnedSkill(f.context(),input),again=await prepareLearnedSkill(f.context(),input);expect(again.value).toEqual(learned.value);
 const version=await env.DB.prepare('SELECT state,definition_json FROM intelligence_skill_versions WHERE id=?').bind(learned.value.skillRevisionId).first<{state:string;definition_json:string}>();expect(version!.state).toBe('draft');const definition=JSON.parse(version!.definition_json),instructions=JSON.parse(definition.instructions);expect(instructions.originalForecast).toBe('Handoff changes may reduce support work');expect(instructions.outcome.classification).toBe('inconclusive');expect(instructions.hypotheses.some((h:{status:string})=>h.status==='disconfirmed')).toBe(true);expect(definition.effects).toEqual([]);expect(definition.tools).not.toContain('granted-effect');await expect(transitionSkill(f.context(),{operationKey:'learning-activate',revisionId:learned.value.skillRevisionId,action:'activate'})).rejects.toMatchObject({code:'EVALUATION_REQUIRED'});
});
