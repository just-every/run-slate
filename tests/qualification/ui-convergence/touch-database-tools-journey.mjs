import {automationRunLogJourney} from "./automation-run-log-journey.mjs";
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {tap,type,checkpoint} from './touch-controls.mjs';

/** The database's remaining modes use the same member and records as its six layouts. */
export async function touchDatabaseToolsJourney(state,touch){
 const {page,origin,api}=touch;
 const database=(await api('/api/databases')).items.find(item=>item.title==='Response planning');
 assert.ok(database);
 const base=`/api/databases/${database.id}`,document=await api(base);
 const stage=document.fields.find(field=>field.name==='Stage');
 await page.goto(`${origin}/app/databases/${database.id}`,{waitUntil:'networkidle'});
 await tap(page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Chart',exact:true}));
 await tap(page.getByRole('combobox',{name:'Group',exact:true}));
 await page.getByRole('combobox',{name:'Group',exact:true}).selectOption(stage.id);
 const chart=page.getByRole('figure',{name:'Chart of the current filtered view',exact:true});
 await expect(chart.locator('.chart-row').filter({hasText:'Open'}).locator('strong')).toHaveText('1');
 await checkpoint(page,'database chart configured');
 await tap(page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Templates',exact:true}));
 await tap(page.getByRole('button',{name:'New template',exact:true}));
 const template=page.getByRole('dialog',{name:'New record template',exact:true});
 await type(page,template.getByRole('textbox',{name:'Template name',exact:true}),'Duty response');
 await type(page,template.getByRole('textbox',{name:'New record name',exact:true}),'Response from a touch template');
 await type(page,template.getByRole('textbox',{name:'Body',exact:true}),'Confirm the response checklist.');
 await checkpoint(page,'database template editor');
 await tap(template.getByRole('button',{name:'Save template',exact:true}));
 await expect(template).toBeHidden();
 const card=page.locator('.record-template-list > li').filter({has:page.getByRole('heading',{name:'Duty response',exact:true})});
 await tap(card.getByRole('button',{name:'Use template',exact:true}));
 const view=document.views[0];
 await expect.poll(async()=>(await api(`${base}/views/${view.id}`)).records.some(record=>record.title==='Response from a touch template')).toBe(true);
 await checkpoint(page,'database template used');
 await tap(page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Automations',exact:true}));
 await tap(page.getByRole('button',{name:'New automation',exact:true}));
 const automation=page.getByRole('dialog',{name:'Create automation',exact:true});
 await type(page,automation.getByRole('textbox',{name:'Name',exact:true}),'Confirm response intake');
 await tap(automation.getByRole('combobox',{name:'When',exact:true}));
 await automation.getByRole('combobox',{name:'When',exact:true}).selectOption('record-created');
 await tap(automation.getByRole('button',{name:'Add action',exact:true}));
 await type(page,automation.getByRole('textbox',{name:'Comment',exact:true}),'The duty team should review this response.');
 await checkpoint(page,'database automation editor');
 await tap(automation.getByRole('button',{name:'Save automation',exact:true}));
 await expect(automation).toBeHidden();
 const rule=page.locator('.settings-list > li').filter({hasText:'Confirm response intake'});
 await expect(rule).toContainText('Enabled');
 await tap(page.getByRole('button',{name:'New record',exact:true}));
 const record=page.getByRole('dialog',{name:'New record',exact:true});
 await type(page,record.getByRole('textbox',{name:'Name',exact:true}),'Touch automation intake');
 await tap(record.getByRole('button',{name:'Create record',exact:true}));
 await expect(record).toBeHidden();
 await state.runScheduled();
 await tap(rule.getByRole('button',{name:'Run log',exact:true}));
 await expect(page.getByRole('heading',{name:'Run log',exact:true}).locator('..')).toContainText('success');
 const created=(await api(`${base}/views/${view.id}`)).records.find(item=>item.title==='Touch automation intake');
 assert.ok(created);
 const comments=await api(`/api/comments/page/${created.pageId}`);
 assert.equal(comments.comments.filter(comment=>JSON.stringify(comment.body).includes('The duty team should review this response.')).length,1);
 await checkpoint(page,'database automation completed');
 await automationRunLogJourney(state,touch);
 await standaloneChartJourney(state);
 console.log('NAV-006 touch database charts, templates and automations passed');
}

/** A standalone saved-view chart, exercised through native controls and current member sessions. */
export async function standaloneChartJourney(state, { proofOnly = false } = {}) {
 const {randomUUID} = await import('node:crypto');
 const {ok,call,grant,withSecondPerson} = await import('./two-people-support.mjs');
 const {accessible} = await import('./browser-evidence.mjs');
 const {page,context,origin,api} = state;
 const mutate = async(method,path,data) => (await ok(context,origin,method,path,{operationKey:randomUUID(),...data})).value;
 const workspace=await api('/api/workspace');
 const setPolicy=async policies=>{
  const current=await api('/api/workspace');
  const {name,mark,description,guestAccess,publicLinkAccess,anonymousAccess}=current;
  await mutate('PUT','/api/workspace',{expectedRevisionId:current.revisionId,name,mark,description,guestAccess,publicLinkAccess,anonymousAccess,policies});
 };
 await setPolicy({...workspace.policies,'page.lifecycle.v1':'always-live'});
 try {
  const container=(await api('/api/containers')).items.find(item=>item.name==='Handbook');
  const database=await mutate('POST','/api/databases',{containerId:container.id,title:'Saved-view chart reconciliation'});
  const base=`/api/databases/${database.id}`;
  const definitions=[
   {id:randomUUID(),name:'Stage',type:'status',config:{options:['Open','Closed']},position:0},
   {id:randomUUID(),name:'Region',type:'select',config:{options:['North','South']},position:1},
   {id:randomUUID(),name:'Amount',type:'number',config:{},position:2},
   {id:randomUUID(),name:'Included',type:'checkbox',config:{},position:3},
  ];
  const [stage,region,amount,included]=definitions;
  let revision=database.revisionId;
  for(const field of definitions)revision=(await mutate('POST',base+'/fields',{expectedRevisionId:revision,field})).revisionId;
  const view={id:randomUUID(),name:'Included work',layout:'table',filters:[{field:included.id,op:'eq',value:true}],sorts:[{field:'$title',direction:'asc'}],groups:[],calculations:{},display:{},position:0};
  revision=(await mutate('POST',base+'/views',{expectedRevisionId:revision,view})).revisionId;
  const other={...view,id:randomUUID(),name:'Southern work',filters:[...view.filters,{field:region.id,op:'eq',value:'South'}],position:1};
  await mutate('POST',base+'/views',{expectedRevisionId:revision,view:other});
  const rows=[];
  for(const [title,status,area,value,keep,restricted] of [
   ['A shared open','Open','North',10,true,false],['B shared open','Open','South',20,true,false],
   ['C shared closed','Closed','North',30,true,false],['D excluded','Closed','South',40,false,false],
   ['E owner only','Open','North',100,true,true],['F empty amount','Closed','South',null,true,false],
   ['G no stage',null,'South',15,true,false],
  ]) {
   const values={[stage.id]:status,[region.id]:area,[amount.id]:value,[included.id]:keep};
   const record=await mutate('POST',base+'/records',{title,values});
   if(restricted){
    await grant(context,origin,record.pageId,'browser-owner','full');
    const document=await api(`/api/pages/${record.pageId}`);
    await mutate('PUT',`/api/sharing/pages/${record.pageId}/inheritance`,{expectedRevisionId:document.page.revisionId,restricted:true});
   }
   rows.push({...record,title,values,restricted});
  }
  const memberGrant=await grant(context,origin,database.pageId,'browser-reader','view');
  let minimum=null;
  const expectedRows=(source,reader)=>rows.filter(row=>row.values[included.id]&&(!reader||!row.restricted)&&(source.id!==other.id||row.values[region.id]==='South')&&(source.id!==view.id||minimum==null||(row.values[amount.id]!=null&&row.values[amount.id]>=minimum)));
  const figure=visitor=>visitor.getByRole('figure',{name:'Chart of the current filtered view',exact:true});
  async function open(visitor,source) {
   await visitor.goto(`${origin}/app/databases/${database.id}?view=${source.id}`,{waitUntil:'networkidle'});
   await visitor.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Chart',exact:true}).click();
   await expect(figure(visitor)).toContainText(source.name);
  }
  async function reconcile(visitor,actor,source,reader,group,numeric,calculation) {
   await visitor.getByRole('combobox',{name:'Group',exact:true}).selectOption(group.id);
   await visitor.getByRole('combobox',{name:'Measure',exact:true}).selectOption(numeric?amount.id:'');
   if(numeric)await visitor.getByRole('combobox',{name:'Calculation',exact:true}).selectOption(calculation);
   const saved=await ok(actor,origin,'GET',`${base}/views/${source.id}`);
   const expected=expectedRows(source,reader);
   assert.deepEqual(saved.records.map(record=>record.pageId),expected.map(row=>row.pageId),'The saved view contains exactly the independently seeded filtered and permitted records.');
   const buckets=new Map();
   for(const record of saved.records){
    const label=JSON.stringify(record.values[group.id]??null);
    const values=buckets.get(label)??[];values.push(record.values[amount.id]);buckets.set(label,values);
   }
   const series=[...buckets].map(([label,values])=>{
    const numbers=values.filter(value=>typeof value==='number');
    const sum=numbers.reduce((total,value)=>total+value,0);
    const value=!numeric||calculation==='count'?values.length:calculation==='sum'?sum:calculation==='average'?(numbers.length?sum/numbers.length:null):calculation==='minimum'?(numbers.length?Math.min(...numbers):null):(numbers.length?Math.max(...numbers):null);
    return {label:JSON.parse(label),value};
   });
   const native=await ok(actor,origin,'GET',`${base}/views/${source.id}/chart?group=${group.id}&numeric=${numeric?amount.id:''}&calculation=${numeric?calculation:'count'}`);
   assert.equal(native.viewId,source.id);assert.equal(native.viewName,source.name);
   assert.deepEqual(native.series,series,'Every native chart series is independently reconciled with this reader’s saved-view response.');
   await expect(figure(visitor).locator('.chart-row')).toHaveCount(series.length);
   await expect.poll(()=>figure(visitor).locator('.chart-row').evaluateAll(elements=>elements.map(element=>({label:element.querySelector('span').textContent,value:element.querySelector('strong').textContent})))).toEqual(series.map(item=>({label:item.label==null?'No value':String(item.label),value:item.value==null?'No value':item.value.toLocaleString('en-US')})));
   await expect(figure(visitor)).toContainText(source.name);
  }
  await open(page,view);
  if(proofOnly){
   await page.getByRole('combobox',{name:'Measure',exact:true}).selectOption(amount.id);
   await page.getByRole('combobox',{name:'Calculation',exact:true}).selectOption('sum');
   await expect(figure(page).locator('.chart-row')).toHaveCount(3);
   await accessible(page,'DB-008 named saved-view chart');
   return;
  }
  await reconcile(page,context,view,false,stage,false,'count');
  for(const calculation of ['sum','average','minimum','maximum'])await reconcile(page,context,view,false,stage,true,calculation);
  await reconcile(page,context,view,false,region,true,'sum');
  // Editing the selected saved view keeps the chart mounted; its source name
  // and series must both refresh from the new authoritative view revision.
  await page.getByRole('button',{name:'View options',exact:true}).click();
  await page.getByRole('menuitem',{name:'View settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'View settings',exact:true});
  await settings.getByRole('textbox',{name:'Name',exact:true}).fill('Approved included work');
  await settings.getByRole('button',{name:'Add condition',exact:true}).click();
  const condition=settings.locator('fieldset').filter({has:page.locator('legend').filter({hasText:/^Condition$/})}).last();
  await condition.getByRole('combobox',{name:'Field',exact:true}).selectOption(amount.id);
  await condition.getByRole('combobox',{name:'Condition',exact:true}).selectOption('gte');
  await condition.getByRole('spinbutton',{name:'Value',exact:true}).fill('15');
  await settings.getByRole('button',{name:'Save view',exact:true}).click();
  await expect(settings).toBeHidden();
  view.name='Approved included work';
  minimum=15;
  await reconcile(page,context,view,false,stage,true,'sum');
  await accessible(page,'DB-008 named saved-view chart');
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Chart',exact:true}).click();
  await reconcile(page,context,view,false,stage,false,'count');
  await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:other.name,exact:true}).click();
  await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Chart',exact:true}).click();
  // The extra source-view criterion does not change the other saved view.

  await reconcile(page,context,other,false,region,true,'average');
  await withSecondPerson(state,page.viewportSize().width,async({bob})=>{
   await open(bob.page,other);
   await reconcile(bob.page,bob.context,other,true,stage,false,'count');
   await open(bob.page,view);

   await reconcile(bob.page,bob.context,view,true,stage,true,'sum');
   const before=await api(`${base}/views/${view.id}`);
   await mutate('POST','/api/sharing',{id:memberGrant.id,targetKind:'page',targetId:database.pageId,principalKind:'member',principalId:'browser-reader',level:'view',revoke:true});
   for(const path of [`${base}/views/${view.id}`,`${base}/views/${view.id}/chart?group=${stage.id}&numeric=${amount.id}&calculation=sum`]){
    const denied=await call(bob.context,origin,'GET',path);
    assert.equal(denied.status,404);assert.ok(!JSON.stringify(denied.body).includes('Approved included work'));
   }
   await bob.page.getByRole('combobox',{name:'Calculation',exact:true}).selectOption('average');
   await expect(figure(bob.page)).toBeHidden();
   await expect(bob.page.getByRole('alert')).toContainText('Content unavailable');
   assert.deepEqual((await api(`${base}/views/${view.id}`)).records,before.records,'Revoked reads change no source records.');
  });
  console.log('DB-008 native chart counts, numeric aggregates, filtered source names, fewer grants and revocation passed');
 } finally {await setPolicy(workspace.policies);}
}
