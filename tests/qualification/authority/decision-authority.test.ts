import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document} from './fixture';
import {retainStatementClaim,readClaim,reviseClaim} from '../../../src/core/features/claims/service';
import {saveDecision,acceptDecision,reviewDecision,removeDecision} from '../../../src/core/features/decisions/service';
import {updatePage} from '../../../src/core/features/pages/service';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';

beforeEach(reset);
test('SOURCE-003 — claims keep accepted authority through review, withdraw it when nested citations change or layer is removed, and preserve exact history through restore',async()=>{
 const f=await fixture(),host=await document(f,'Exact scoped claim evidence'),decisionSource=await document(f,'Independent decision source'),ctx=f.context();
 // Labelled retained-answer fixture; no generated answer or provider acceptance is claimed.
 const answer={statements:[{text:'The scope remains unknown.',kind:'observation',evidenceIds:['E1'],limitations:['Local test record only.']}],unresolved:[],proposedChanges:[],researchPlan:null,hypothesisAssessment:null,procedurePlan:null,evaluationAssessment:null,ambientAssessment:null};
 await env.DB.prepare("INSERT INTO intelligence_runs(id,workspace_id,requester_id,page_id,kind,status,revision_id,input_json,refs_json,audience_json,output_json,created_at,updated_at) VALUES('claim-history-run',?,?,?,'answer','completed','claim-run-r1','{}',?,?,?,?,?)").bind(f.workspaceId,f.owner,host.id,JSON.stringify([host.ref]),JSON.stringify([f.owner]),JSON.stringify({answer}),ctx.now,ctx.now).run();
 const claim=await retainStatementClaim(ctx,{operationKey:'claim-original',runId:'claim-history-run',statementIndex:0}),original=await readClaim(ctx,claim.value.revisionId);
 const decision=await saveDecision(ctx,{operationKey:'claim-authority-decision',pageId:host.id,question:'Approve this internal scope?',options:['Approve','Defer'],outcome:'Approve',rationale:'Internal scope only.',ownerId:f.owner,decidedAt:null,reviewAt:null,citations:[decisionSource.ref]});
 const accepted=await acceptDecision(ctx,{id:decision.value.id,operationKey:'claim-authority-accept',expectedRevisionId:decision.value.revisionId});
 const authority={kind:'accepted-decision' as const,decisionId:decision.value.id,revisionId:accepted.value.revisionId,applicability:'The exact internal scope only.',delegatedOffice:null};
 const revised=await reviseClaim(ctx,{operationKey:'claim-accept-authority',revisionId:claim.value.revisionId,scope:original.scope,authority,conflicts:[],unknowns:['External entitlement unknown.']});
 const reviewed=await reviewDecision(ctx,{id:decision.value.id,operationKey:'claim-review-authority',expectedRevisionId:accepted.value.revisionId,note:'The internal scope is unchanged.',nextReviewAt:null});
 expect((await readClaim(ctx,revised.value.revisionId)).authorityCurrent).toBe(true);
 await updatePage(ctx,decisionSource.id,{operationKey:'change-independent-authority-source',expectedRevisionId:decisionSource.ref.revisionId,properties:{title:'Changed independent decision scope'}});
 expect((await readClaim(ctx,revised.value.revisionId)).authorityCurrent).toBe(false);
 await expect(reviseClaim(ctx,{operationKey:'reuse-stale-nested-authority',revisionId:revised.value.revisionId,scope:original.scope,authority,conflicts:[],unknowns:[]})).rejects.toMatchObject({code:'STALE_EVIDENCE'});
 await removeDecision(ctx,{id:decision.value.id,operationKey:'claim-remove-authority',expectedRevisionId:reviewed.value.revisionId});
 expect((await readClaim(ctx,revised.value.revisionId)).authorityCurrent).toBe(false);
 await expect(reviseClaim(ctx,{operationKey:'reuse-removed-authority',revisionId:revised.value.revisionId,scope:original.scope,authority,conflicts:[],unknowns:[]})).rejects.toMatchObject({code:'STALE_EVIDENCE'});
 const prior=await env.DB.prepare('SELECT * FROM knowledge_decisions WHERE id=?').bind(decision.value.id).first();
 const exported=await exportWorkspace(ctx),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key'),bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());
 await reset();const target=await fixture();await restoreWorkspace(target.context(),bytes);
 expect(await env.DB.prepare('SELECT * FROM knowledge_decisions WHERE id=?').bind(decision.value.id).first()).toEqual(prior);
 expect((await readClaim(f.context(),revised.value.revisionId)).authorityCurrent).toBe(false);
 expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
