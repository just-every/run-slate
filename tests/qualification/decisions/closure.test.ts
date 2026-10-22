beforeEach(resetDeployment);
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {test,expect,beforeEach} from 'vitest';
import {fixture,env,createUlid} from '../backend/fixture';
import {saveDecision,acceptDecision,getDecision} from '../../../src/core/features/decisions/service';
import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';
import {resolveEvidence} from '../../../src/core/features/ai/evidence';
import type {EvidenceInput} from '../../../src/core/features/ai/contracts';
const key=()=>createUlid();
async function closure(){
 const f=await fixture(),source=await f.page('Nested current source'),decisionPage=await f.page('Accepted source decision'),skillPage=await f.page('Method backing page'),outerPage=await f.page('Outer decision');const grants=new Map<string,string>();
 for(const page of [source,decisionPage,skillPage,outerPage]){const result=await f.request('POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:page.id,principalKind:'member',principalId:f.readerId,level:'view'});if(result.status!==200)throw new Error(JSON.stringify(result));grants.set(page.id,result.data.value.id);}
 const input={operationKey:key(),pageId:decisionPage.id,question:'Underlying decision?',options:['Proceed'],outcome:'Proceed',rationale:'Keep exact source evidence.',ownerId:f.ownerId,decidedAt:null,reviewAt:null,citations:[{kind:'page' as const,sourceId:source.id,revisionId:source.revisionId}]};const draft=await saveDecision(f.ctx,input),accepted=await acceptDecision(f.ctx,{id:draft.value.id,operationKey:key(),expectedRevisionId:draft.value.revisionId});const decisionRef:EvidenceInput={kind:'decision',sourceId:draft.value.id,revisionId:accepted.value.revisionId};
 const skill=await createSkill(f.ctx,{operationKey:key(),pageId:skillPage.id,name:'Retained method',definition:{instructions:'Use the exact accepted source decision.',refs:[decisionRef],audience:[f.ownerId,f.readerId],tools:['read-evidence'],effects:[],preconditions:['Current evidence'],successTests:['Retain exact citations'],escalations:['Unreadable evidence'],maxCostMicros:1000}});
 // Labelled retained evaluation fixture only: this tests closure/currentness, never method usefulness or model quality.
 const evaluationId=key();await env.DB.batch([env.DB.prepare('INSERT INTO intelligence_evaluations(id,workspace_id,skill_revision_id,case_hash,result_json,passed,created_at) VALUES(?,?,?,\'test-only-retained-evaluation\',\'{}\',1,?)').bind(evaluationId,f.workspaceId,skill.value.revisionId,f.ctx.now),env.DB.prepare("UPDATE intelligence_skill_versions SET state='evaluated',evaluation_id=? WHERE id=?").bind(evaluationId,skill.value.revisionId)]);await transitionSkill(f.ctx,{operationKey:key(),revisionId:skill.value.revisionId,action:'activate'});
 const skillRef:EvidenceInput={kind:'skill',sourceId:skill.value.id,revisionId:skill.value.revisionId};const outer=await saveDecision(f.ctx,{...input,operationKey:key(),pageId:outerPage.id,citations:[skillRef]});const outerAccepted=await acceptDecision(f.ctx,{id:outer.value.id,operationKey:key(),expectedRevisionId:outer.value.revisionId});const outerRef:EvidenceInput={kind:'decision',sourceId:outer.value.id,revisionId:outerAccepted.value.revisionId};
 return {...f,source,decisionPage,skillPage,outerPage,decisionRef,skillRef,outerRef,grants,readerContext:{...f.ctx,actor:{...f.ctx.actor,id:f.readerId,role:'member' as const}}};
}
test("Changed, archived and private backing pages retain historical closure but cannot be current evidence",async()=>{
 for(const run of [
  // Original case: Nested page→decision→skill→decision currentness propagates truthfully without rewriting any retained content
  async()=>{
 const f=await closure();const original=await resolveEvidence(f.ctx,[f.outerRef],[f.ownerId],{current:true});expect(original[0].current).toBe(true);
 const change=await f.request('PATCH',`/api/pages/${f.source.id}`,{operationKey:key(),expectedRevisionId:f.source.revisionId,properties:{title:'Changed nested source'}});expect(change.status).toBe(200);
 for(const ref of [f.decisionRef,f.skillRef,f.outerRef]){const historical=await resolveEvidence(f.ctx,[ref],[f.ownerId]);expect(historical[0].current).toBe(false);await expect(resolveEvidence(f.ctx,[ref],[f.ownerId],{current:true})).rejects.toMatchObject({code:'STALE_EVIDENCE'});}
 expect((await resolveEvidence(f.ctx,[f.outerRef],[f.ownerId]))[0].text).toBe(original[0].text);expect((await getDecision(f.ctx,f.outerRef.sourceId)).citationsCurrent).toBe(false);expect((await resolveEvidence(f.readerContext,[f.outerRef],[f.readerId]))[0].current).toBe(false);

  },
  // Original case: Archived backing pages retain authorized decision/skill history but cannot be current evidence
  async()=>{
 const f=await closure();
 for(const [page,ref] of [[f.decisionPage,f.decisionRef],[f.skillPage,f.skillRef]] as const){const archive=await f.request('POST',`/api/archive/${page.id}`,{operationKey:key(),expectedRevisionId:page.revisionId,action:'archive'});expect(archive.status).toBe(200);const historical=await resolveEvidence(f.ctx,[ref],[f.ownerId]);expect(historical[0].current).toBe(false);expect(historical[0].text.length).toBeGreaterThan(0);await expect(resolveEvidence(f.ctx,[ref],[f.ownerId],{current:true})).rejects.toMatchObject({code:'STALE_EVIDENCE'});}
 expect((await resolveEvidence(f.ctx,[f.outerRef],[f.ownerId]))[0].current).toBe(false);

  },
  // Original case: Retained private-draft backing pages are historical for their authorized author, never current grounding
  async()=>{
 const f=await closure();
 // Imported/restored private lifecycle fixture; this does not claim a native unpublish operation.
 await env.DB.prepare("UPDATE pages SET lifecycle='draft',published_revision_id=NULL WHERE id IN (?,?)").bind(f.decisionPage.id,f.skillPage.id).run();
 for(const ref of [f.decisionRef,f.skillRef,f.outerRef]){expect((await resolveEvidence(f.ctx,[ref],[f.ownerId]))[0].current).toBe(false);await expect(resolveEvidence(f.ctx,[ref],[f.ownerId],{current:true})).rejects.toMatchObject({code:'STALE_EVIDENCE'});}

  }
 ]){
  await resetDeployment();
  await run();
 }
});
test('Revoking a nested source grant denies retained closure reads for reader and claimed audience without leaking outer content',async()=>{
 const f=await closure();expect((await resolveEvidence(f.readerContext,[f.outerRef],[f.readerId]))[0].current).toBe(true);
 const revoke=await f.request('POST','/api/sharing',{operationKey:key(),id:f.grants.get(f.source.id),targetKind:'page',targetId:f.source.id,principalKind:'member',principalId:f.readerId,level:'view',revoke:true});expect(revoke.status).toBe(200);
 for(const ref of [f.decisionRef,f.skillRef,f.outerRef]){await expect(resolveEvidence(f.readerContext,[ref],[f.readerId])).rejects.toMatchObject({status:404});await expect(resolveEvidence(f.ctx,[ref],[f.readerId],{current:true})).rejects.toMatchObject({status:404});}
 expect((await f.request('GET',`/api/decisions/${f.outerRef.sourceId}`,undefined,f.readerId)).status).toBe(404);expect((await resolveEvidence(f.ctx,[f.outerRef],[f.ownerId],{current:true}))[0].current).toBe(true);
});
