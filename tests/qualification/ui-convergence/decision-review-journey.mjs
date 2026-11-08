import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
import {call,grant,ok,restrictedPage} from './two-people-support.mjs';

/** Native decision review, with only the persisted due dates advanced by the fixture.
 * Desktop asserts the lifecycle; the phone caller repeats its controls and captures.
 */
export async function decisionReviewJourney(state,people,width) {
  const {alice,bob}=people,{origin,fixtureSql,runScheduled}=state;
  const verify=async run=>{if(width===1440)await run();};
  const read=(route,person=alice)=>ok(person.context,origin,'GET',route);
  const post=(route,data,person=alice)=>ok(person.context,origin,'POST',route,{operationKey:randomUUID(),...data});
  const notices=async(person,id)=>(await read('/api/notifications?limit=100',person)).items.filter(item=>item.event==='decision-required'&&item.detail.decisionId===id);
  const today=async id=>(await read('/api/notifications/today')).decisions.filter(item=>item.detail.decisionId===id);
  const {pageId}=await restrictedPage(state,'Support rota decision',['The team reviews the support rota at each review date.']);
  await grant(alice.context,origin,pageId,bob.id,'edit');
  const draft=(await post('/api/decisions',{pageId,question:'Keep the support rota?',options:['Keep rota','Replace rota'],outcome:'Keep rota',rationale:'The current rota covers each shift.',ownerId:'browser-owner',decidedAt:null,reviewAt:'2099-01-01T00:00:00.000Z',citations:[]})).value;
  const decisionUrl=origin+'/app/decisions/'+draft.id;
  const open=async(person=alice)=>person.page.goto(decisionUrl,{waitUntil:'networkidle'});
  await open();
  await alice.page.getByRole('button',{name:'Accept decision',exact:true}).click();
  await alice.page.getByText('Record a review',{exact:true}).waitFor();
  const accepted=await read('/api/decisions/'+draft.id);
  const baseline=(await notices(alice,draft.id)).length;
  await runScheduled();
  await verify(async()=>{
    assert.equal((await notices(alice,draft.id)).length,baseline,'No notice before the saved review date.');
    assert.deepEqual(await today(draft.id),[]);
  });

  // Another owner accepts while authorized, then loses their actual page grant.
  const deniedPage=await restrictedPage(state,'Revoked review ownership',['This decision must not notify an owner after access is removed.']);
  const access=await grant(alice.context,origin,deniedPage.pageId,bob.id,'edit');
  const denied=(await post('/api/decisions',{pageId:deniedPage.pageId,question:'Review private rota?',options:['Retain'],outcome:'Retain',rationale:'Private decision',ownerId:bob.id,decidedAt:null,reviewAt:'2099-01-01T00:00:00.000Z',citations:[]},bob)).value;
  await post('/api/decisions/'+denied.id+'/accept',{expectedRevisionId:denied.revisionId},bob);
  await grant(alice.context,origin,deniedPage.pageId,bob.id,'edit',{id:access.value.id,revoke:true});
  const deniedBefore=(await notices(bob,denied.id)).length;
  const refused=await call(bob.context,origin,'GET','/api/decisions/'+denied.id);
  await verify(async()=>assert.ok([403,404].includes(refused.status),'The former owner cannot read the decision.'));

  // The emitted scheduled handler sees real accepted decisions; only their clock inputs move.
  await fixtureSql([`UPDATE knowledge_decisions SET review_at='2000-01-01T00:00:00.000Z' WHERE id IN ('${draft.id}','${denied.id}')`]);
  await runScheduled();await runScheduled();
  const first=await notices(alice,draft.id);
  await verify(async()=>{
    assert.equal(first.length,baseline+1,'Repeated default-profile processing delivers exactly one overdue notice.');
    assert.equal((await notices(bob,draft.id)).length,0,'Other members receive no owner notice.');
    assert.equal((await notices(bob,denied.id)).length,deniedBefore,'Revoked owners receive no overdue notice.');
    assert.equal((await notices(alice,denied.id)).length,0,'Workspace ownership does not redirect another decision owner notice.');
    assert.equal((await today(draft.id)).length,first.length);
    assert.equal((await read('/api/decisions/'+draft.id)).state,'accepted');
  });
  await open();
  const card=alice.page.locator('#decision-'+draft.id);
  await card.getByText('accepted · Review due',{exact:true}).waitFor();
  await accessible(alice.page,'decision review overdue accepted');
  await alice.page.goto(origin+'/app',{waitUntil:'networkidle'});
  const notice=alice.page.getByRole('main').locator('.outcome-list li').filter({hasText:'Support rota decision'}).filter({hasText:'decision required'});
  await verify(async()=>await expect(notice).toHaveCount(first.length));
  await accessible(alice.page,'decision review Today notice');

  // A member with edit access completes the review from the actual decision card.
  await open(bob);
  await bob.page.getByText('Record a review',{exact:true}).click();
  const note='Reviewed the rota with all shift leads; retain it until the next review.';
  await bob.page.getByLabel('What did you conclude?').fill(note);
  await bob.page.getByLabel('Next review date').fill('2099-02-01');
  const started=Date.now();
  const saved=bob.page.waitForResponse(response=>response.url().endsWith('/api/decisions/'+draft.id+'/review')&&response.request().method()==='POST');
  await bob.page.getByRole('button',{name:'Record review',exact:true}).click();
  const response=await saved,finished=Date.now();
  await verify(async()=>assert.equal(response.status(),200));
  await open();
  await verify(async()=>{
    await expect(card).not.toContainText('Review due');
    const current=await read('/api/decisions/'+draft.id);
    assert.equal(current.state,'accepted');assert.equal(current.overdue,false);
    assert.equal(current.acceptedRevisionId,accepted.acceptedRevisionId);
    assert.deepEqual(current.content,accepted.content,'Completed reviews preserve the accepted decision.');
    assert.equal(current.review_at,'2099-02-01T00:00:00.000Z');
    const reviews=(await read('/api/decisions/'+draft.id+'/reviews')).items;
    assert.equal(reviews.length,1);
    assert.equal(reviews[0].note,note);assert.equal(reviews[0].reviewed_by_member_id,bob.id);
    assert.equal(reviews[0].next_review_at,current.review_at);
    assert.ok(Date.parse(reviews[0].created_at)>=started&&Date.parse(reviews[0].created_at)<=finished,'The committed review time belongs to this request.');
    assert.deepEqual(await today(draft.id),[]);
  });
  await alice.page.getByText('Decision history and reviews',{exact:true}).click();
  const reviewRow=alice.page.locator('li').filter({hasText:note});
  await reviewRow.waitFor();
  await verify(async()=>await expect(reviewRow).toContainText('Morgan Reader'));
  await accessible(alice.page,'decision review recorded and cleared');
  await alice.page.goto(origin+'/app',{waitUntil:'networkidle'});
  await verify(async()=>await expect(alice.page.getByRole('main').locator('.outcome-list li').filter({hasText:'Support rota decision'})).toHaveCount(0));
  await accessible(alice.page,'decision review Today cleared');
  await runScheduled();await runScheduled();
  await verify(async()=>assert.equal((await notices(alice,draft.id)).length,baseline+1));

  // The next saved review period passes, then a genuine replacement supersedes it.
  await fixtureSql([`UPDATE knowledge_decisions SET review_at='2000-02-01T00:00:00.000Z' WHERE id='${draft.id}'`]);
  await runScheduled();await runScheduled();
  await verify(async()=>{
    assert.equal((await notices(alice,draft.id)).length,baseline+2,'A passed next review date delivers one further notice.');
    assert.equal((await notices(bob,denied.id)).length,deniedBefore);
    assert.equal((await today(draft.id)).length,1,'Only the current overdue period remains on Today.');
  });
  await open();
  await card.getByText('accepted · Review due',{exact:true}).waitFor();
  await alice.page.getByRole('button',{name:'Prepare a replacement decision',exact:true}).click();
  await alice.page.waitForURL(url=>url.pathname.startsWith('/app/decisions/')&&url.pathname!==new URL(decisionUrl).pathname);
  const replacementId=new URL(alice.page.url()).pathname.split('/').at(-1);
  await alice.page.getByPlaceholder('Which outcome should this decision record?').fill('Replace the rota with weekly handover.');
  await alice.page.getByRole('button',{name:'Save proposed decision',exact:true}).click();
  await alice.page.getByRole('button',{name:'Accept decision',exact:true}).click();
  await alice.page.getByText('Record a review',{exact:true}).waitFor();
  await open();
  await card.getByText('superseded',{exact:true}).waitFor();
  await verify(async()=>{
    await expect(card).not.toContainText('Review due');
    const previous=await read('/api/decisions/'+draft.id);
    assert.equal(previous.state,'superseded');assert.equal(previous.superseded_by_decision_id,replacementId);
    assert.equal(previous.overdue,false);assert.deepEqual(await today(draft.id),[]);
  });
  await accessible(alice.page,'decision review superseded');
  await runScheduled();await runScheduled();
  await verify(async()=>assert.equal((await notices(alice,draft.id)).length,baseline+2,'Supersession ends overdue processing.'));
  await alice.page.goto(origin+'/app',{waitUntil:'networkidle'});
  await verify(async()=>await expect(alice.page.getByRole('main').locator('.outcome-list li').filter({hasText:'Support rota decision'})).toHaveCount(0));
  console.log('DEC-005_BROWSER_RECEIPT',JSON.stringify({width,decisionId:draft.id,ownerNoticeCounts:[baseline,first.length,(await notices(alice,draft.id)).length],otherMemberNotices:(await notices(bob,draft.id)).length,revokedOwnerNewNotices:(await notices(bob,denied.id)).length-deniedBefore,decision:await read('/api/decisions/'+draft.id),reviews:(await read('/api/decisions/'+draft.id+'/reviews')).items,todayAfterSupersession:await today(draft.id)}));
  state.assertNoConsoleErrors();
}
