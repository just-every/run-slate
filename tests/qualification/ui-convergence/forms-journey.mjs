import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
export async function formsJourney(state){
 const {page,context,origin,api,fixtureSql,switchIdentity,runScheduled}=state;
 await fixtureSql(["UPDATE members SET member_kind='guest' WHERE id='browser-reader'"]);
 const post=async(path,data)=>{const r=await context.request.post(origin+path,{data:{operationKey:randomUUID(),...data}});assert.ok(r.ok(),await r.text());return(await r.json()).value;};
 const space=await post('/api/containers',{name:'Support intake',visibility:'private'}),db=await post('/api/databases',{containerId:space.id,title:'Support requests'});
 for(const [index,field] of [{id:'requires-detail',name:'Needs detail',type:'select',config:{options:['Yes','No']}},{id:'intake-detail',name:'Detail',type:'text',config:{}}].entries()){
  const current=await api(`/api/databases/${db.id}`);await post(`/api/databases/${db.id}/fields`,{expectedRevisionId:current.database.revision_id,field:{...field,position:index}});
 }
 const current=await api(`/api/databases/${db.id}`);
 await post(`/api/databases/${db.id}/views`,{expectedRevisionId:current.database.revision_id,view:{id:randomUUID(),name:'Requests',layout:'table',filters:[],sorts:[],groups:[],calculations:{},display:{},position:0}});
 await post('/api/automation',{name:'Intake acknowledgment',scope:'source',sourceDatabaseId:db.id,trigger:{event:'record-created'},conditions:[],actions:[{type:'comment',body:'Submission received by support.'}]});
 await page.goto(`${origin}/app/databases/${db.id}`,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Forms',exact:true}).click();await page.getByRole('button',{name:'Configure form',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Configure database form',exact:true});
 await dialog.getByRole('textbox',{name:'Form title',exact:true}).fill('Support request intake');
 await dialog.getByRole('checkbox',{name:'Anonymous link',exact:true}).check();
 await dialog.getByRole('listbox',{name:'Named guests',exact:true}).selectOption('browser-reader');
 await accessible(page,'configure database form audiences');
 await dialog.getByRole('checkbox',{name:'Include Needs detail',exact:true}).check();await dialog.getByRole('checkbox',{name:'Include Detail',exact:true}).check();
 const detail=dialog.getByRole('group',{name:'Detail',exact:true});
 await detail.getByRole('checkbox',{name:'Required answer',exact:true}).check();await detail.getByRole('combobox',{name:'Show this question when',exact:true}).selectOption('requires-detail');await detail.getByRole('textbox',{name:'Answer equals',exact:true}).fill('Yes');
 await dialog.getByRole('checkbox',{name:'Publish form',exact:true}).check();
 await accessible(page,'configure conditional database intake form');
 await dialog.getByRole('button',{name:'Save form',exact:true}).click();await expect(dialog).toBeHidden();
 const form=(await api(`/api/databases/${db.id}/form`)).item;assert.ok(form.published);
 await accessible(page,'published database form entry');
 await context.clearCookies();
 await page.goto(origin+form.href,{waitUntil:'networkidle'});await expect(page.locator('[data-form-ready=true]')).toBeVisible();
 await page.getByRole('textbox',{name:'Record title (required)',exact:true}).fill('Anonymous handover');
 await page.getByRole('combobox',{name:'Needs detail',exact:true}).selectOption('No');await expect(page.getByRole('textbox',{name:'Detail (required)',exact:true})).toBeHidden();
 await accessible(page,'anonymous form hides conditional question');
 await page.getByRole('combobox',{name:'Needs detail',exact:true}).selectOption('Yes');await expect(page.getByRole('textbox',{name:'Detail (required)',exact:true})).toBeVisible();await page.getByRole('textbox',{name:'Detail (required)',exact:true}).fill('Supplier delivery moved to Monday.');
 await accessible(page,'anonymous form reveals conditional question');
 await page.getByRole('button',{name:'Submit form',exact:true}).click();await expect(page.getByRole('status')).toContainText('Submission received. Thank you.');await expect(page.locator('[data-database-form]')).toBeHidden();await accessible(page,'anonymous database form submission accepted');
 await switchIdentity('reader');await page.goto(origin+form.href,{waitUntil:'networkidle'});await expect(page.locator('[data-form-ready=true]')).toBeVisible();await page.getByRole('textbox',{name:'Record title (required)',exact:true}).fill('Guest handover');await page.getByRole('combobox',{name:'Needs detail',exact:true}).selectOption('No');await page.getByRole('button',{name:'Submit form',exact:true}).click();await expect(page.getByRole('status')).toContainText('Submission received. Thank you.');await expect(page.locator('[data-database-form]')).toBeHidden();await accessible(page,'named guest database form submission accepted');
 await switchIdentity('owner');await runScheduled();
 const result=await api(`/api/databases/${db.id}`),view=result.views[0];const records=(await api(`/api/databases/${db.id}/views/${view.id}`)).records;assert.equal(records.length,2);
 for(const record of records)assert.equal((await api(`/api/comments/page/${record.pageId}`)).comments.length,1);
 await page.goto(`${origin}/app/databases/${db.id}`,{waitUntil:'networkidle'});await expect(page.getByRole('button',{name:'Anonymous handover',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Guest handover',exact:true})).toBeVisible();await accessible(page,'database retains guest and anonymous submissions');
}
