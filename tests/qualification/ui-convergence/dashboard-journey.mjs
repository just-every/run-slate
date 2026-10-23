import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';

export async function dashboardJourney(state) {
  const {page,context,origin,api,switchIdentity}=state;
  const mutate=async(route,data,method='POST')=>{
    const response=await context.request.fetch(origin+route,{method,data:{operationKey:randomUUID(),...data}});
    assert.ok(response.ok(),await response.text());return (await response.json()).value;
  };
  const space=(await api('/api/containers')).items.find(item=>item.name==='Handbook');
  const db=await mutate('/api/databases',{containerId:space.id,title:'Service delivery'});
  let revision=db.revisionId;
  for(const field of [{id:randomUUID(),name:'Delivery date',type:'date',config:{},position:0},{id:randomUUID(),name:'Stage',type:'text',config:{},position:1}]){
    revision=(await mutate(`/api/databases/${db.id}/fields`,{expectedRevisionId:revision,field})).revisionId;
  }
  const fields=(await api(`/api/databases/${db.id}`)).fields;
  const date=fields.find(field=>field.type==='date').id,group=fields.find(field=>field.type==='text').id;
  const view={id:randomUUID(),name:'Delivery overview',layout:'table',filters:[],sorts:[],groups:[],calculations:{},display:{},position:0};
  await mutate(`/api/databases/${db.id}/views`,{expectedRevisionId:revision,view});
  const records=[];
  for(const [index,title] of ['Earlier delivery','Current delivery','Restricted acquisition'].entries()){
    const record=await mutate(`/api/databases/${db.id}/records`,{title,values:{[date]:index===0?'2026-09-01':'2026-10-20',[group]:index===2?'Restricted acquisition':'Open'}});
    records.push(record);
  }
  await mutate('/api/sharing',{targetKind:'page',targetId:records[2].pageId,principalKind:'member',principalId:'browser-owner',level:'full'});
  await mutate(`/api/sharing/pages/${records[2].pageId}/inheritance`,{expectedRevisionId:records[2].revisionId,restricted:true},'PUT');
  const host=await mutate('/api/pages',{containerId:space.id,title:'Delivery dashboard'});
  for(const pageId of [db.pageId,host.pageId])await mutate('/api/sharing',{targetKind:'page',targetId:pageId,principalKind:'member',principalId:'browser-reader',level:'view'});
  await page.goto(`${origin}/app/pages/${host.pageId}`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/Add block/}).click();
  await page.getByPlaceholder('Type to search').fill('Dashboard');
  await page.getByRole('option',{name:'Dashboard',exact:true}).click();
  const dashboard=page.getByRole('region',{name:'Dashboard',exact:true});
  await dashboard.getByRole('button',{name:'Edit tiles',exact:true}).click();
  const editor=dashboard.getByRole('group',{name:'Add dashboard tile'});
  await editor.getByRole('combobox',{name:'Tile database',exact:true}).selectOption(db.id);
  for(let index=0;index<4;index++){
    await editor.getByRole('textbox',{name:'Tile title',exact:true}).fill(index===3?'Delivery records':`Delivery chart ${index+1}`);
    await editor.getByRole('combobox',{name:'Tile kind',exact:true}).selectOption(index===3?'view':'chart');
    await editor.getByRole('combobox',{name:'Tile view',exact:true}).selectOption(view.id);
    if(index!==3)await editor.getByRole('combobox',{name:'Chart group',exact:true}).selectOption(group);
    await editor.getByRole('combobox',{name:'Date filter field',exact:true}).selectOption(date);
    await editor.getByRole('button',{name:'Add tile',exact:true}).click();
    await expect.poll(async()=>(await api(`/api/pages/${host.pageId}`)).blocks.find(block=>block.blockType==='dashboard')?.content.definition.tiles.length).toBe(index+1);
  }
  await dashboard.getByRole('button',{name:'Close tile editor',exact:true}).click();
  await expect(dashboard.locator('[data-dashboard-count]')).toHaveText('3');
  await expect(dashboard.locator('[data-dashboard-value]')).toHaveText(['2','1','2','1','2','1']);
  await accessible(page,'dashboard all records');
  await dashboard.getByLabel('Dashboard from date',{exact:true}).fill('2026-10-01');
  await expect(dashboard.locator('[data-dashboard-count]')).toHaveText('2');
  await expect(dashboard.locator('[data-dashboard-value]')).toHaveText(['1','1','1','1','1','1']);
  await accessible(page,'dashboard shared date filter');
  // A reader has two grants and no trace of the restricted record or its chart label.
  await switchIdentity('reader');
  await page.reload({waitUntil:'networkidle'});
  await expect(dashboard.locator('[data-dashboard-count]')).toHaveText('2');
  await expect(dashboard.locator('[data-dashboard-value]')).toHaveText(['2','2','2']);
  await expect(dashboard).not.toContainText('Restricted acquisition');
  await dashboard.getByLabel('Dashboard from date',{exact:true}).fill('2026-10-01');
  await expect(dashboard.locator('[data-dashboard-count]')).toHaveText('1');
  await expect(dashboard.locator('[data-dashboard-value]')).toHaveText(['1','1','1']);
  await accessible(page,'dashboard restricted reader');
  await switchIdentity('owner');
}
