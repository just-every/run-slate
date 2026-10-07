import {env} from 'cloudflare:test';
import {vi} from 'vitest';
import {fixture,document} from '../../../qualification/authority/fixture';
import {seedContainerGrant} from '../../../e2e/setup/fixtures';
import {connect} from '../../../../src/core/features/connectors/service';
import {createInquiry,recordFinding,inquiryView} from '../../../../src/core/features/inquiries/service';
import {createDatabase,saveField,createRecord} from '../../../../src/core/features/databases/service';
import {prepareTrial,approveTrial,requireTrial} from '../../../../src/core/features/experiments/service';
import {prepareEffect} from '../../../../src/core/features/effects/service';
import {transport} from './transport';

/** Synthetic local clock; never prospective customer evidence. Only Date is controlled, not test deadlines. */
export async function nativeTrial(values=[1,1,8,8], treatmentCount=2, includeReader=false) {
  vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2028-01-01T00:00:00.000Z'));
  const base=await fixture(), host=await document(base,'U6 trial source');
  const f={...base,page:{pageId:host.id,workingRevisionId:host.ref.revisionId},refs:[host.ref]}, wire=transport(), secret='u6-test-only-secret-with-32-characters';
  await env.DB.prepare('UPDATE workspaces SET ai_enabled=1 WHERE id=?').bind(f.workspaceId).run();
  const context=(member=f.owner)=>({...f.context(member),sourceSecret:secret});
  const connection=await connect(context(),{operationKey:'u6-connect',provider:'orbit',accountId:'account',token:'test-only',nativeConfig:{origin:'https://u6-native.test',accountId:'account',clientId:'slate',allowLoopback:false}},secret);
  const inquiry=await createInquiry(context(),{operationKey:'u6-inquiry',pageId:f.page.pageId,question:'Does handoff reduce measured work?',refs:f.refs,audience:includeReader?[f.owner,f.reader]:[f.owner],hypotheses:[{statement:'The handoff reduces work',disconfirmation:'A precise null'},{statement:'Instrumentation changed',disconfirmation:'The same field definitions'}]});
  const hypothesis=(await inquiryView(context(),inquiry.value.id)).hypotheses[1]!;
  await recordFinding(context(),{id:inquiry.value.id,operationKey:'u6-falsification',hypothesisId:String(hypothesis.id),status:'disconfirmed',finding:'The field definitions remain identical.',kind:'observation',refs:f.refs});
  const containerId=(await env.DB.prepare('SELECT container_id FROM pages WHERE id=?').bind(f.page.pageId).first<string>('container_id'))!;
  await seedContainerGrant(containerId,{principalKind:'member',principalId:f.owner,level:'full'});
  if(includeReader)await seedContainerGrant(containerId,{principalKind:'member',principalId:f.reader,level:'full'});
  const db=await createDatabase(context(),{operationKey:'u6-measurement-db',containerId,title:'Synthetic measurement records'}); let fieldRevision=db.receipt.revisionId!;
  const valueField=f.workspaceId+'-minutes', supportField=f.workspaceId+'-support';
  for(const [position,id] of [valueField,supportField].entries()) {const field=await saveField(context(),db.value.id,{operationKey:'u6-field-'+position,expectedRevisionId:fieldRevision,field:{id,name:position?'Support':'Minutes',type:'number',config:{},position}});fieldRevision=field.receipt.revisionId!;}
  const assignment=values.map((_,i)=>({subjectId:i<treatmentCount?'opportunities/o/handoffs/'+i:'comparison-'+i,arm:i<treatmentCount?'treatment' as const:'comparison' as const})), subjects=[];
  for(const [i,a] of assignment.entries()) {const record=await createRecord(context(),db.value.id,{operationKey:'u6-record-'+i,title:a.subjectId,values:{[valueField]:values[i]!,[supportField]:0}});subjects.push({subjectId:a.subjectId,pageId:record.value.pageId,valueFieldId:valueField,supportFieldId:supportField});}
  const plan={eligibility:'Named synthetic record cohort',assignment,assignmentMethod:'observational' as const,seed:'u6-local-only',confounding:['Synthetic values, controlled clock and provider transport; no empirical efficacy'],baseline:'Original workflow records',metric:'Minutes',meaningfulEffect:2,maximumHalfWidth:1,startsAt:'2028-01-01T00:01:00.000Z',endsAt:'2028-01-01T00:02:00.000Z',supportGuardrail:10,contactLimit:0,maximumCostMicros:0,forecast:'A reduction of at least two minutes',instrumentationRevision:'service-computes-hash',measurement:{observeAfter:'2028-01-01T00:01:10.000Z',subjects},refs:f.refs,effects:assignment.filter(a=>a.arm==='treatment').map(a=>({subjectId:a.subjectId,target:a.subjectId,connectionId:connection.value.id,operation:'orbit.handoff.upsert' as const,accountId:'account',expectedRevision:'before',expectedAudienceRevision:'audience',content:{title:'Bounded task',description:'Exact handoff',assigneeId:null,dueAt:null,status:'open' as const},audience:[f.owner],acceptNonAtomicProvider:false}))};
  const input={operationKey:'u6-prepare',inquiryId:inquiry.value.id,plan};
  const prepared=await prepareTrial(context(),input), trialId=prepared.value.id;
  const storedPlan=JSON.parse((await requireTrial(context(),trialId)).plan_json) as typeof plan;
  const advance=(stamp:string)=>vi.setSystemTime(new Date(stamp));
  const approve=()=>approveTrial(context(),{id:trialId,operationKey:'u6-approve',expectedRevisionId:prepared.value.revisionId});
  async function declaredIntent(runId:string,index:number) {const effect=storedPlan.effects[index]!, grant=await env.DB.prepare("SELECT id FROM intelligence_grants WHERE workspace_id=? AND kind='effect' AND json_extract(scope_json,'$.targets[0]')=?").bind(f.workspaceId,effect.target).first<{id:string}>();const {subjectId:_,audience:__,acceptNonAtomicProvider:___,...body}=effect;return {...body,operationKey:`trial-effect:${trialId}:${index}`,runId,grantId:grant!.id,costMicros:0 as const};}

  return {...f,context,wire,connection,plan:storedPlan,input,prepared,trialId,inquiryId:inquiry.value.id,dbId:db.value.id,fieldRevision,valueField,advance,approve,declaredIntent};
}
export async function effects(trialId:string) {return (await env.DB.prepare("SELECT e.* FROM intelligence_effects e JOIN intelligence_runs r ON r.id=e.run_id WHERE json_extract(r.input_json,'$.trialId')=? ORDER BY e.operation_key").bind(trialId).all<{id:string;state:string;receipt_json:string|null;intent_json:string;grant_id:string;run_id:string;dispatched_at:string|null}>()).results;}
export {prepareEffect};
