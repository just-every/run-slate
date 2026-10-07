import {fieldChecks} from './fields.mjs';
import assert from 'node:assert/strict';
export async function structuredChecks({page,context,runtime,id,check}) {
 const read=async path=>await(await context.request.get(runtime.origin+path)).json();
 const containerId=(await read('/api/pages/'+id)).page.containerId;
 await page.goto(runtime.origin+'/app');await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByRole('navigation',{name:'Create content'}).getByRole('button',{name:'Database',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Name',{exact:true}).fill('Routed qualification database');await dialog.locator('select[name=containerId]').selectOption(containerId);await dialog.getByRole('button',{name:'Create database',exact:true}).click();await page.waitForURL(/\/app\/databases\//);const databaseId=page.url().split('/').at(-1);
 for(const [name,type,options] of [['State','select','Ready\nDone'],['Due','date'],['Effort','number']]){
  await page.getByRole('button',{name:'Add field',exact:true}).click();await dialog.locator('input[name=name]').fill(name);await dialog.getByLabel('Type').selectOption(type);if(options)await dialog.locator('textarea[name=options]').fill(options);await dialog.getByRole('button',{name:'Save field',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }
 await page.getByRole('button',{name:'New record',exact:true}).first().click();await dialog.getByLabel('Name',{exact:true}).fill('Routed record');await dialog.getByRole('button',{name:'Create record',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const database=await read('/api/databases/'+databaseId),viewId=database.views[0].id;const records=await read(`/api/databases/${databaseId}/views/${viewId}`),recordId=records.records[0].pageId;
 await page.goto(runtime.origin+`/app/databases/${databaseId}/records/${recordId}`);
 for(const [name,value] of [['State','Ready'],['Due','2026-09-30T12:00'],['Effort','7']]){
  const field=page.locator('.record-field').filter({has:page.getByText(name,{exact:true})});await field.getByRole('button',{name:'Edit',exact:true}).click();if(name==='State')await dialog.locator('[name=value]').selectOption(value);else await dialog.locator('[name=value]').fill(value);await dialog.getByRole('button',{name:'Save value',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }
 const dateEditor=page.locator('.record-field').filter({has:page.getByText('Due',{exact:true})});await dateEditor.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await dialog.locator('[name=value]').inputValue(),'2026-09-30T12:00');await dialog.getByRole('button',{name:'Save value',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const saved=await read(`/api/databases/${databaseId}/records/${recordId}`);assert.equal(saved.values[database.fields.find(f=>f.name==='Effort').id],7);
 await page.goto(runtime.origin+`/app/databases/${databaseId}`);
 for(const layout of ['table','board','list','gallery','calendar','timeline']){
  await page.getByRole('button',{name:'View settings',exact:true}).click();await dialog.getByLabel('Layout').selectOption(layout);if(layout==='board')await dialog.locator('select[name=groupField]').selectOption(database.fields.find(f=>f.name==='State').id);if(['calendar','timeline'].includes(layout))await dialog.locator('select[name=dateField]').selectOption(database.fields.find(f=>f.name==='Due').id);await dialog.getByRole('button',{name:'Save view',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal((await read('/api/databases/'+databaseId)).views[0].layout,layout);await page.reload();await page.getByRole('heading',{name:'Routed qualification database',exact:true}).waitFor();await page.getByRole('button',{name:'Routed record',exact:true}).first().waitFor();await page.waitForFunction(()=>!document.querySelector('.request-loading'));await page.setViewportSize({width:390,height:900});await page.screenshot({path:`${runtime.directory}/database-${layout}-390.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),layout+' overflows phone');await page.setViewportSize({width:1440,height:1000});
 }
 check(['NAV-005','DB-001','DB-003','DB-004','DB-005','NAV-006'],'Global create, database fields and row values commit; six saved layouts survive reload and render at 390px');
 await page.getByRole('button',{name:'View settings',exact:true}).click();await dialog.getByLabel('Layout').selectOption('table');await dialog.getByRole('button',{name:'Save view',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const recordButton=page.getByRole('button',{name:'Routed record',exact:true});await recordButton.click();await page.getByRole('dialog',{name:'Record preview'}).waitFor();await page.getByRole('button',{name:'Centre peek',exact:true}).click();assert.ok(await page.locator('.record-peek-center').count());await page.getByRole('button',{name:'Side peek',exact:true}).click();await page.getByRole('link',{name:'Open full page',exact:true}).click();await page.waitForURL(/\/records\//);check(['DB-010'],'Page parity opens actual record in side peek, centre peek and full permanent route');
 await fieldChecks({page,context,runtime,databaseId,recordId,check});
 return {databaseId,recordId};
}
