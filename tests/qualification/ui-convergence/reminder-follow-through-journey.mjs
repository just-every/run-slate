import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
export async function reminderFollowThroughJourney(state){
 const {page,context,origin,api,fixtureSql,runScheduled}=state;
 const post=async(path,data)=>{const r=await context.request.post(origin+path,{data:{operationKey:randomUUID(),...data}});assert.ok(r.ok(),await r.text());return(await r.json()).value;};
 const container=await post('/api/containers',{name:'Handover reminders',visibility:'private'});
 const doc=await post('/api/pages',{containerId:container.id,title:'Confirm supplier handover'});
 const past=new Date(Date.now()-600000).toISOString();
 const later=new Date(Date.now()+86400000*2).toISOString().slice(0,10);
 const failed=await post('/api/reminders',{pageId:doc.pageId,date:later,time:'12:00',timezone:'UTC'});
 await fixtureSql([`UPDATE reminders SET due_at='${past}' WHERE id='${failed.id}'`,`CREATE TRIGGER reminder_browser_fault BEFORE INSERT ON notification_outbox WHEN json_extract(NEW.detail_json,'$.reminderId')='${failed.id}' BEGIN SELECT RAISE(FAIL,'synthetic storage interruption'); END`]);
 await runScheduled();await fixtureSql(['DROP TRIGGER reminder_browser_fault']);
 await page.goto(origin+'/app',{waitUntil:'networkidle'});
 const section=page.getByRole('region',{name:'Reminder follow-through',exact:true});
 await expect(section).toContainText('Delivery failed.');await expect(section.getByRole('link',{name:'Confirm supplier handover',exact:true})).toBeVisible();
 await accessible(page,'reminder failure on Home');
 await section.getByRole('button',{name:'Retry reminder',exact:true}).click();await expect(section).toContainText('Queued');await accessible(page,'reminder retry queued on Home');await runScheduled();
 await page.reload({waitUntil:'networkidle'});await expect(section).toContainText('No reminders need follow-through.');
 const notifications=(await api('/api/notifications')).items;assert.equal(notifications.filter(n=>n.detail.reminderId===failed.id).length,1);
 await accessible(page,'reminder retry completes once');
 const stopped=await post('/api/reminders',{pageId:doc.pageId,date:later,time:'12:00',timezone:'UTC'});
 await page.reload({waitUntil:'networkidle'});await expect(section).toContainText('Queued');await section.getByRole('button',{name:'Stop reminder',exact:true}).click();await expect(section).toContainText('No reminders need follow-through.');
 await fixtureSql([`UPDATE reminders SET due_at='${past}' WHERE id='${stopped.id}'`]);await runScheduled();
 assert.equal((await api('/api/notifications')).items.filter(n=>n.detail.reminderId===stopped.id).length,0);
 await accessible(page,'stopped reminder has no pending send');
}
