import {test,expect} from 'vitest';
import {fixture,env,createUlid} from '../backend/fixture';
import {saveDecision,acceptDecision,getDecision,reviewDecision,removeDecision,listDecisions,decisionHistory} from '../../../src/core/features/decisions/service';
import {resolveEvidence} from '../../../src/core/features/ai/evidence';
import {notifyOverdueDecisions} from '../../../src/core/features/decisions/scheduler';
import type {AppBindings} from '../../../src/core/app/types';
async function setup(){const f=await fixture(),p=await f.page('Decision source');const input={operationKey:createUlid(),pageId:p.id,question:'Which option?',options:['Continue','Pause'],outcome:'Pause',rationale:'Evidence supports a pause.',ownerId:f.ownerId,decidedAt:null,reviewAt:null,citations:[]};return {...f,p,input};}
const key=()=>createUlid();
test('DEC-001/006 editable proposal, strict CAS including no-op, no duplicate active layer, readable exact history',async()=>{
 const f=await setup(),saved=await saveDecision(f.ctx,f.input);const next={...f.input,id:saved.value.id,expectedRevisionId:saved.value.revisionId,operationKey:key(),question:'New question',options:['A','B'],outcome:'B',rationale:'New rationale',decidedAt:'2026-09-10T00:00:00.000Z',reviewAt:'2026-10-10T00:00:00.000Z'};
 const edited=await saveDecision(f.ctx,next);const unchanged=await saveDecision(f.ctx,{...next,operationKey:key(),expectedRevisionId:edited.value.revisionId});expect(unchanged.receipt.unchanged).toBe(true);expect(unchanged.receipt.activityId).toBeNull();expect(unchanged.value.revisionId).toBe(edited.value.revisionId);
 await expect(saveDecision(f.ctx,{...next,operationKey:key()})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const history=await decisionHistory(f.ctx,saved.value.id);expect(history.items).toHaveLength(2);expect(history.items.map(x=>x.content.question)).toEqual(expect.arrayContaining(['Which option?','New question']));expect(history.items.every(x=>x.actor_id===f.ownerId&&x.created_at)).toBe(true);
 const original=await getDecision(f.ctx,saved.value.id,saved.value.revisionId);expect(original.content.question).toBe('Which option?');expect(original.viewedRevisionId).toBe(saved.value.revisionId);
 const duplicate=await f.request('POST','/api/decisions',{...f.input,operationKey:key()});expect(duplicate.status).toBe(409);
 expect((await f.request('GET',`/api/decisions/${saved.value.id}/history`,undefined,f.readerId)).status).toBe(404);
 const races=await Promise.allSettled(['First','Second'].map(question=>saveDecision({...f.ctx},{...next,question,operationKey:key(),expectedRevisionId:edited.value.revisionId})));expect(races.filter(x=>x.status==='fulfilled')).toHaveLength(1);
});
test('DEC-002/003/005 accepted revision is immutable through review and supersession, named owner only accepts',async()=>{
 const f=await setup();await f.request('POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:f.p.id,principalKind:'member',principalId:f.readerId,level:'edit'});
 const saved=await saveDecision(f.ctx,f.input);expect((await f.request('POST',`/api/decisions/${saved.value.id}/accept`,{operationKey:key(),expectedRevisionId:saved.value.revisionId},f.readerId)).status).toBe(403);
 const acceptance={id:saved.value.id,operationKey:key(),expectedRevisionId:saved.value.revisionId};const accepted=await acceptDecision(f.ctx,acceptance);expect(await acceptDecision(f.ctx,acceptance)).toEqual(accepted);
 const original=(await getDecision(f.ctx,saved.value.id)).content;expect(original.acceptedAt).toBe(f.ctx.now);expect(original.decidedAt).toBe(f.ctx.now);
 await expect(saveDecision(f.ctx,{...f.input,id:saved.value.id,operationKey:key(),expectedRevisionId:accepted.value.revisionId,outcome:'Continue'})).rejects.toMatchObject({code:'IMMUTABLE_DECISION'});
 const reviewed=await f.request('POST',`/api/decisions/${saved.value.id}/review`,{operationKey:key(),expectedRevisionId:accepted.value.revisionId,note:'Completed evidence review',nextReviewAt:'2099-01-01T00:00:00.000Z'},f.readerId);expect(reviewed.status).toBe(200);
 const after=await getDecision(f.ctx,saved.value.id);expect(after.content).toEqual(original);expect(after.acceptedRevisionId).toBe(accepted.value.revisionId);expect(after.revision_id).toBe(reviewed.data.value.revisionId);
 const reviews=await f.request('GET',`/api/decisions/${saved.value.id}/reviews`);expect(reviews.data.items[0]).toMatchObject({reviewed_by_member_id:f.readerId,note:'Completed evidence review',next_review_at:'2099-01-01T00:00:00.000Z'});
 const successor=await f.request('POST',`/api/decisions/${saved.value.id}/propose-successor`,{operationKey:key()});expect(successor.status).toBe(200);const proposed=await getDecision(f.ctx,successor.data.value.id);expect(proposed.content.supersedesId).toBe(saved.value.id);
 const edited=await saveDecision(f.ctx,{...f.input,id:proposed.id,pageId:proposed.page_id,operationKey:key(),expectedRevisionId:proposed.revision_id,outcome:'Continue'});await acceptDecision(f.ctx,{id:edited.value.id,operationKey:key(),expectedRevisionId:edited.value.revisionId});
 const prior=await getDecision(f.ctx,saved.value.id);expect(prior.state).toBe('superseded');expect(prior.superseded_by_decision_id).toBe(proposed.id);expect(prior.content).toEqual(original);expect((await decisionHistory(f.ctx,prior.id)).items.some(x=>x.entity_kind==='decision-supersession'&&x.content.supersededBy===proposed.id)).toBe(true);
 expect((await env.DB.prepare("SELECT actor_member_id,occurred_at FROM activity_entries WHERE target_id=? AND action='decisions.supersede'").bind(prior.id).first())).toMatchObject({actor_member_id:f.ownerId,occurred_at:f.ctx.now});
 await expect(reviewDecision(f.ctx,{id:prior.id,operationKey:key(),expectedRevisionId:prior.revision_id,note:'Cannot reopen',nextReviewAt:null})).rejects.toMatchObject({code:'IMMUTABLE_DECISION'});
});
test('DEC-003/004 exact citation currentness filters and stale acceptance refusal',async()=>{
 const f=await setup();const pub=await f.request('POST',`/api/pages/${f.p.id}/publish`,{operationKey:key(),expectedRevisionId:f.p.revisionId});expect(pub.status).toBe(200);
 const page=await f.request('GET',`/api/pages/${f.p.id}`);const refs=[{kind:'page' as const,sourceId:f.p.id,revisionId:page.data.page.revisionId}];
 const saved=await saveDecision(f.ctx,{...f.input,citations:refs});const accepted=await acceptDecision(f.ctx,{id:saved.value.id,operationKey:key(),expectedRevisionId:saved.value.revisionId});
 const changed=await f.request('PATCH',`/api/pages/${f.p.id}`,{operationKey:key(),expectedRevisionId:page.data.page.revisionId,properties:{title:'Changed source'}});expect(changed.status).toBe(200);
 const result=await getDecision(f.ctx,saved.value.id);expect(result.citationsCurrent).toBe(false);expect(result.content.rationale).toBe(f.input.rationale);expect(result.content.citations).toEqual(refs);expect((await listDecisions(f.ctx,{citationsCurrent:'false'})).items.map(x=>x.id)).toContain(saved.value.id);expect((await listDecisions(f.ctx,{citationsCurrent:'true'})).items).toHaveLength(0);
 const other=await f.page('Stale proposal');const stale=await saveDecision(f.ctx,{...f.input,pageId:other.id,operationKey:key(),citations:refs});await expect(acceptDecision(f.ctx,{id:stale.value.id,operationKey:key(),expectedRevisionId:stale.value.revisionId})).rejects.toMatchObject({code:'STALE_EVIDENCE'});expect(result.acceptedRevisionId).toBe(accepted.value.revisionId);
});
test('DEC-001 removal retains page, body, children, grants, comments, revisions and links and allows one new active layer',async()=>{
 const f=await setup();await f.page('Original child',f.p.id);const comment=await f.request('POST',`/api/comments/page/${f.p.id}`,{operationKey:key(),body:[{text:'Keep this comment'}]});expect(comment.status).toBe(200);
 const snapshot=async()=>{const tables=['pages','page_blocks','page_grants','page_revisions','comment_threads','comments','content_published_revisions'];const output=[];for(const table of tables)output.push((await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results);return output;};
 await f.request('POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:f.p.id,principalKind:'member',principalId:f.readerId,level:'view'});
 const body=await f.request('PUT',`/api/pages/${f.p.id}/blocks`,{operationKey:key(),expectedRevisionId:f.p.revisionId,blocks:[{id:key(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Original body with persistent link',link:{href:'https://example.test/decision'}}]}}]});expect(body.status).toBe(200);
 const before=await snapshot();const saved=await saveDecision(f.ctx,f.input);const accepted=await acceptDecision(f.ctx,{id:saved.value.id,operationKey:key(),expectedRevisionId:saved.value.revisionId});const frozen=(await getDecision(f.ctx,saved.value.id)).content;
 expect((await f.request('POST',`/api/decisions/${saved.value.id}/remove`,{operationKey:key(),expectedRevisionId:accepted.value.revisionId},f.readerId)).status).toBe(404);
 await expect(removeDecision(f.ctx,{id:saved.value.id,operationKey:key(),expectedRevisionId:saved.value.revisionId})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const input={id:saved.value.id,operationKey:key(),expectedRevisionId:accepted.value.revisionId};const removed=await removeDecision(f.ctx,input);expect(await removeDecision(f.ctx,input)).toEqual(removed);expect(await snapshot()).toEqual(before);
 expect((await listDecisions(f.ctx,{pageId:f.p.id})).items).toHaveLength(0);const historical=await getDecision(f.ctx,saved.value.id);expect(historical.removed_at).toBe(f.ctx.now);expect(historical.content).toEqual(frozen);expect(historical.overdue).toBe(false);
 await expect(reviewDecision(f.ctx,{id:saved.value.id,operationKey:key(),expectedRevisionId:removed.value.revisionId,note:'Removed',nextReviewAt:null})).rejects.toMatchObject({code:'REMOVED_DECISION'});
 const replacements=await Promise.allSettled([1,2].map(()=>saveDecision({...f.ctx},{...f.input,operationKey:key()})));expect(replacements.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect((await listDecisions(f.ctx,{pageId:f.p.id})).items).toHaveLength(1);expect((await decisionHistory(f.ctx,saved.value.id)).items.map(x=>x.entity_kind)).toContain('decision-removal');
});
test('DEC-004 all filter axes use inclusive UTC dates and exact accepted revision after review',async()=>{
 const f=await setup(),draft=await saveDecision(f.ctx,{...f.input,decidedAt:'2026-09-15T23:59:59Z',reviewAt:'2026-10-15T00:00:00.000Z'});const accepted=await acceptDecision(f.ctx,{id:draft.value.id,operationKey:key(),expectedRevisionId:draft.value.revisionId});
 const query=`state=accepted&ownerId=${f.ownerId}&containerId=${f.containerId}&pageId=${f.p.id}&decidedFrom=2026-09-15&decidedTo=2026-09-15&reviewFrom=2026-10-15&reviewTo=2026-10-15&citationsCurrent=true`;
 const result=await f.request('GET','/api/decisions?'+query);expect(result.status).toBe(200);expect(result.data.items).toHaveLength(1);expect(result.data.items[0].acceptedRevisionId).toBe(accepted.value.revisionId);
 for(const filter of [{state:'proposed' as const},{ownerId:f.readerId},{containerId:'another'},{decidedTo:'2026-09-14'},{decidedFrom:'2026-09-16'},{reviewTo:'2026-10-14'},{reviewFrom:'2026-10-16'},{citationsCurrent:'false' as const}])expect((await listDecisions(f.ctx,filter)).items).toHaveLength(0);
 expect((await f.request('GET','/api/decisions?citationsCurrent=banana')).status).toBe(400);expect((await f.request('GET',`/api/decisions/${draft.value.id}?revision=nonexistent`)).status).toBe(404);
});
test('DEC-005 overdue native notice is coalesced, review resets it, removal stops scheduler',async()=>{
 const f=await setup(),draft=await saveDecision(f.ctx,{...f.input,reviewAt:'2000-01-01T00:00:00.000Z'});const accepted=await acceptDecision(f.ctx,{id:draft.value.id,operationKey:key(),expectedRevisionId:draft.value.revisionId});expect((await getDecision(f.ctx,draft.value.id)).overdue).toBe(true);
 const count=async()=>Number((await env.DB.prepare("SELECT count(*) AS n FROM notifications WHERE recipient_member_id=? AND json_extract(detail_json,'$.decisionId')=?").bind(f.ownerId,draft.value.id).first<{n:number}>())!.n);
 await notifyOverdueDecisions(env as AppBindings,f.ctx.now);expect(await count()).toBe(1);await notifyOverdueDecisions(env as AppBindings,f.ctx.now);expect(await count()).toBe(1);
 const review=await reviewDecision(f.ctx,{id:draft.value.id,operationKey:key(),expectedRevisionId:accepted.value.revisionId,note:'Reviewed; revisit later',nextReviewAt:'2099-01-01T00:00:00.000Z'});expect((await getDecision(f.ctx,draft.value.id)).overdue).toBe(false);expect((await getDecision(f.ctx,draft.value.id)).state).toBe('accepted');
 await removeDecision(f.ctx,{id:draft.value.id,operationKey:key(),expectedRevisionId:review.value.revisionId});await notifyOverdueDecisions(env as AppBindings,'2099-01-02T00:00:00.000Z');expect(await count()).toBe(1);
});

test('DEC-003 current citations and nested accepted decisions are bound atomically at acceptance',async()=>{
 const f=await setup();await f.request('POST',`/api/pages/${f.p.id}/publish`,{operationKey:key(),expectedRevisionId:f.p.revisionId});const current=await f.request('GET',`/api/pages/${f.p.id}`),sourceRevision=current.data.page.revisionId;
 const decisionPage=await f.page('Decision with citation'),draft=await saveDecision(f.ctx,{...f.input,pageId:decisionPage.id,citations:[{kind:'page',sourceId:f.p.id,revisionId:sourceRevision}]});
 let injected=false;const db=new Proxy(env.DB,{get(target,property){if(property==='batch')return async(statements:D1PreparedStatement[])=>{if(!injected){injected=true;const changed=await f.request('PATCH',`/api/pages/${f.p.id}`,{operationKey:key(),expectedRevisionId:sourceRevision,properties:{title:'Changed between validation and acceptance'}});expect(changed.status).toBe(200);}return target.batch(statements);};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 await expect(acceptDecision({...f.ctx,db},{id:draft.value.id,operationKey:key(),expectedRevisionId:draft.value.revisionId})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect((await getDecision(f.ctx,draft.value.id)).state).toBe('proposed');
 const basePage=await f.page('Authority decision'),base=await saveDecision(f.ctx,{...f.input,pageId:basePage.id,operationKey:key()});const accepted=await acceptDecision(f.ctx,{id:base.value.id,operationKey:key(),expectedRevisionId:base.value.revisionId});
 const nestedPage=await f.page('Dependent decision'),nested=await saveDecision(f.ctx,{...f.input,pageId:nestedPage.id,operationKey:key(),citations:[{kind:'decision',sourceId:base.value.id,revisionId:accepted.value.revisionId}]});
 let removed=false;const db2=new Proxy(env.DB,{get(target,property){if(property==='batch')return async(statements:D1PreparedStatement[])=>{if(!removed){removed=true;await removeDecision(f.ctx,{id:base.value.id,operationKey:key(),expectedRevisionId:accepted.value.revisionId});}return target.batch(statements);};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 await expect(acceptDecision({...f.ctx,db:db2},{id:nested.value.id,operationKey:key(),expectedRevisionId:nested.value.revisionId})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect((await getDecision(f.ctx,nested.value.id)).state).toBe('proposed');
});

test('DEC-001 removed accepted references stay historical only and proposal history remains readable',async()=>{
 const f=await setup(),saved=await saveDecision(f.ctx,f.input),accepted=await acceptDecision(f.ctx,{id:saved.value.id,operationKey:key(),expectedRevisionId:saved.value.revisionId});const refs=[{kind:'decision' as const,sourceId:saved.value.id,revisionId:accepted.value.revisionId}];
 expect((await resolveEvidence(f.ctx,refs,[f.ownerId],{current:true}))[0].current).toBe(true);
 await removeDecision(f.ctx,{id:saved.value.id,operationKey:key(),expectedRevisionId:accepted.value.revisionId});const historical=await resolveEvidence(f.ctx,refs,[f.ownerId]);expect(historical[0].current).toBe(false);expect(JSON.parse(historical[0].text).rationale).toBe(f.input.rationale);await expect(resolveEvidence(f.ctx,refs,[f.ownerId],{current:true})).rejects.toMatchObject({code:'STALE_EVIDENCE'});
 const newLayer=await saveDecision(f.ctx,{...f.input,operationKey:key(),question:'New proposal'});await removeDecision(f.ctx,{id:newLayer.value.id,operationKey:key(),expectedRevisionId:newLayer.value.revisionId});const proposal=await getDecision(f.ctx,newLayer.value.id);expect(proposal.content.question).toBe('New proposal');expect(proposal.content.options).toEqual(f.input.options);expect(proposal.removed_at).toBe(f.ctx.now);expect(proposal.viewedRevisionId).toBe(newLayer.value.revisionId);
 const unauthorized={...f.ctx,actor:{...f.ctx.actor,id:f.readerId,role:'member' as const}};await expect(resolveEvidence(unauthorized,refs,[f.readerId])).rejects.toMatchObject({status:404});
});

test('DEC-006 page editor may appoint a different owner; only the appointed owner accepts',async()=>{
 const f=await setup();const grant=await f.request('POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:f.p.id,principalKind:'member',principalId:f.readerId,level:'edit'});expect(grant.status).toBe(200);
 const saved=await saveDecision(f.ctx,f.input);const edited=await f.request('POST','/api/decisions',{...f.input,id:saved.value.id,operationKey:key(),expectedRevisionId:saved.value.revisionId,ownerId:f.readerId,question:'Editor-owned question',options:['Wait','Proceed'],outcome:'Proceed',rationale:'Editor supplied rationale',decidedAt:'2026-09-12T10:00:00.000Z',reviewAt:'2026-10-12T10:00:00.000Z'},f.readerId);expect(edited.status).toBe(200);
 const record=await getDecision(f.ctx,saved.value.id);expect(record.content).toMatchObject({ownerId:f.readerId,question:'Editor-owned question',options:['Wait','Proceed'],outcome:'Proceed',rationale:'Editor supplied rationale',decidedAt:'2026-09-12T10:00:00.000Z',reviewAt:'2026-10-12T10:00:00.000Z',citations:[]});
 expect((await f.request('POST',`/api/decisions/${saved.value.id}/accept`,{operationKey:key(),expectedRevisionId:edited.data.value.revisionId})).status).toBe(403);const accepted=await f.request('POST',`/api/decisions/${saved.value.id}/accept`,{operationKey:key(),expectedRevisionId:edited.data.value.revisionId},f.readerId);expect(accepted.status).toBe(200);expect((await getDecision(f.ctx,saved.value.id)).content.acceptedBy).toBe(f.readerId);const history=await decisionHistory(f.ctx,saved.value.id);expect(history.items.find(x=>x.id===edited.data.value.revisionId)?.actor_id).toBe(f.readerId);
});
