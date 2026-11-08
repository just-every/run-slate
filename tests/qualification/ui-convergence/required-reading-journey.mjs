import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {call,ok,restrictedPage,grant} from './two-people-support.mjs';
import {openPageAction} from './browser-support.mjs';
import {signInWithOutbox} from '../../e2e/outbox-auth.mjs';

/** Send and acknowledge through native controls, then inspect the private report after cron replay and reload. */
export async function requiredReadingJourney(state,people,width){
 const {alice,bob}=people,origin=state.origin,ownerId='browser-owner';
 const evidence=path.resolve('.artifacts/ui-convergence/required-reading',String(width));await mkdir(evidence,{recursive:true});
 const ids={pending:'required-pending',excluded:'required-excluded',owner:'required-other-owner'};
 const now=new Date().toISOString();
 await state.fixtureSql(Object.entries(ids).map(([kind,id])=>`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,created_at,updated_at) VALUES('${id}','browser-workspace','${['synthetic-slate-'+id,'test.invalid'].join('@')}','${kind==='pending'?'Casey Pending':kind==='excluded'?'Taylor Excluded':'Jordan Owner'}','RR','${kind==='owner'?'owner':'member'}','member','active','${now}','${now}')`));
 const {pageId}=await restrictedPage({...alice,origin},'Launch required reading',['Read the deployment checklist before launch.']);
 await grant(alice.context,origin,pageId,bob.id,'view');await grant(alice.context,origin,pageId,ids.pending,'view');await grant(alice.context,origin,pageId,ids.owner,'view');
 const group=(await ok(alice.context,origin,'POST','/api/groups',{operationKey:randomUUID(),name:'Launch required readers',memberIds:[ownerId,bob.id,ids.pending,ids.excluded]})).value.id;
 await alice.page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 await openPageAction(alice.page,'Required reading');
 let dialog=alice.page.getByRole('dialog',{name:'Required reading',exact:true});
 await dialog.getByRole('combobox',{name:'Group',exact:true}).selectOption(group);await dialog.getByLabel('Remind after days',{exact:true}).fill('2');
 await expect(dialog).toContainText('3 readers will receive an inbox item.');await expect(dialog.getByRole('region',{name:'Members who cannot read'})).toContainText('Taylor Excluded');
 await alice.page.screenshot({path:path.join(evidence,'send-preview.png'),fullPage:true});
 const sending=alice.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/required-reading'&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Send required reading',exact:true}).click();
 const response=await sending,sent=await response.json(),sendInput=response.request().postDataJSON();assert.equal(response.status(),200,JSON.stringify(sent));
 const id=sent.value.id;
 assert.deepEqual(await ok(alice.context,origin,'POST','/api/required-reading',sendInput),sent,'Replaying the captured send retains the original receipt.');
 await expect(dialog.getByRole('region',{name:'Required reading reports'})).toContainText('Pending');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 const receipts={send:sent,acknowledgments:[]};
 for(const person of [alice,bob]){
  await person.page.goto(origin+'/app/inbox',{waitUntil:'networkidle'});
  const notices=(await ok(person.context,origin,'GET','/api/notifications?limit=100')).items.filter(n=>n.detail?.requiredReadingId===id&&n.event==='required-reading');assert.equal(notices.length,1);
  const item=person.page.locator('.outcome-list li').filter({hasText:'Launch required reading'}).filter({has:person.page.locator('.outcome-kind').filter({hasText:/^required reading(?: ·|$)/})});await expect(item).toHaveCount(1);
  const receiving=person.page.waitForResponse(r=>new URL(r.url()).pathname===`/api/required-reading/${id}/acknowledge`);
  await item.getByRole('button',{name:'Acknowledge reading',exact:true}).click();
  const ackResponse=await receiving,ack=await ackResponse.json();assert.equal(ackResponse.status(),200);receipts.acknowledgments.push(ack);
  await expect(item.getByRole('status')).toContainText('Acknowledged');
  await person.page.reload({waitUntil:'networkidle'});await expect(person.page.locator('.outcome-list li').filter({hasText:'Launch required reading'}).filter({has:person.page.locator('.outcome-kind').filter({hasText:/^required reading(?: ·|$)/})}).getByRole('status')).toContainText('Acknowledged');
  await person.page.screenshot({path:path.join(evidence,person===alice?'sender-acknowledged.png':'reader-acknowledged.png'),fullPage:true});
 }
 const before=(await ok(alice.context,origin,'GET',`/api/required-reading/page/${pageId}`)).items.length;
 const refused=await call(bob.context,origin,'POST','/api/required-reading',{operationKey:randomUUID(),pageId,groupId:group,reminderDays:2});assert.equal(refused.status,403);assert.equal((await ok(alice.context,origin,'GET',`/api/required-reading/page/${pageId}`)).items.length,before);
 assert.equal((await call(bob.context,origin,'GET',`/api/required-reading/${id}/report`)).status,404);
 assert.deepEqual((await ok(bob.context,origin,'GET','/api/activity?action=required-reading.acknowledge')).items,[]);
 await bob.page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});await bob.page.getByRole('button',{name:'More',exact:true}).click();await expect(bob.page.getByRole('menuitem',{name:'Required reading',exact:true})).toHaveCount(0);
 await bob.page.screenshot({path:path.join(evidence,'member-refused.png'),fullPage:true});await bob.page.keyboard.press('Escape');
 // The controlled native schedule case proves the real interval. The emitted journey moves stored due state past the clock.
 await state.fixtureSql([`UPDATE required_readings SET due_at='2000-01-01T00:00:00.000Z' WHERE id='${id}'`]);
 await Promise.all([state.runScheduled(),state.runScheduled()]);await state.runScheduled();
 const reminders=[];
 for(const kind of ['pending','excluded']){
  const context=await state.context.browser().newContext();
  try{const signIn=await signInWithOutbox(origin,['synthetic-slate-'+ids[kind],'test.invalid'].join('@'));await context.addCookies([{name:'slate_session',value:signIn.cookie.split('=')[1],url:origin}]);const items=(await ok(context,origin,'GET','/api/notifications?limit=100')).items.filter(n=>n.detail?.requiredReadingId===id);assert.equal(items.filter(n=>n.event==='required-reading').length,kind==='pending'?1:0);reminders.push(...items.filter(n=>n.event==='required-reading-reminder').map(n=>({...n,recipientId:ids[kind]})));}finally{await context.close();}
 }
 assert.deepEqual(reminders.map(n=>n.recipientId),[ids.pending]);
 for(const person of [alice,bob])assert.equal((await ok(person.context,origin,'GET','/api/notifications?limit=100')).items.filter(n=>n.detail?.requiredReadingId===id&&n.event==='required-reading-reminder').length,0);
 const report=await ok(alice.context,origin,'GET',`/api/required-reading/${id}/report`);
 assert.deepEqual(report.members.map(m=>[m.displayName,m.state]),[['Alex Owner','acknowledged'],['Casey Pending','reminded'],['Morgan Reader','acknowledged'],['Taylor Excluded','cannot-read']]);
 assert.ok(report.members.filter(m=>m.state==='acknowledged').every(m=>m.acknowledgedAt));assert.ok(report.members.find(m=>m.state==='reminded').remindedAt);
 assert.doesNotMatch(JSON.stringify(report),/readingTime|scrollDepth|viewCount|viewedAt/);
 await alice.page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});await openPageAction(alice.page,'Required reading');dialog=alice.page.getByRole('dialog',{name:'Required reading',exact:true});
 const reportRegion=dialog.getByRole('region',{name:'Required reading reports'});await expect(reportRegion).toContainText('Casey Pending');await expect(reportRegion).toContainText('Reminded');await expect(reportRegion.locator('.outcome-list li').filter({hasText:'Acknowledged'})).toHaveCount(2);
 assert.equal(await alice.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);await alice.page.screenshot({path:path.join(evidence,'sender-report.png'),fullPage:true});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 const other=await state.context.browser().newContext({viewport:{width,height:width===1440?1000:844}});
 try{
  const signIn=await signInWithOutbox(origin,['synthetic-slate-'+ids.owner,'test.invalid'].join('@'));await other.addCookies([{name:'slate_session',value:signIn.cookie.split('=')[1],url:origin}]);
  assert.deepEqual(await ok(other,origin,'GET',`/api/required-reading/${id}/report`),report);
  const page=await other.newPage();await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});await openPageAction(page,'Required reading');await expect(page.getByRole('dialog').getByRole('region',{name:'Required reading reports'})).toContainText('Reminded');await page.screenshot({path:path.join(evidence,'other-owner-report.png'),fullPage:true});
 }finally{await other.close();}
 const activity=(await ok(alice.context,origin,'GET','/api/activity?action=required-reading.acknowledge')).items;assert.equal(activity.filter(a=>a.target.id===id).length,2);
 await writeFile(path.join(evidence,'receipts.json'),JSON.stringify({...receipts,report,reminders,activity,refused},null,2));
 await state.switchIdentity('owner');
}
