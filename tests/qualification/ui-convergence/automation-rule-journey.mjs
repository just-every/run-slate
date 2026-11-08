import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {tap,checkpoint} from './touch-controls.mjs';

/** The native member form saves ordered conditions and actions, then reopens them. */
export async function automationRuleJourney(state,touch) {
  const {page,context,origin,api,containerId}=touch;
  const mutate=(route,data,method='POST')=>ok(context,origin,method,route,{operationKey:randomUUID(),...data});
  const database=(await mutate('/api/databases',{containerId,title:'Rule form intake'})).value;
  let revisionId=database.revisionId;
  for(const [position,field] of [
    {id:'form-stage',name:'Intake stage',type:'text',config:{}},
    {id:'form-score',name:'Intake score',type:'number',config:{}},
  ].entries())revisionId=(await mutate(`/api/databases/${database.id}/fields`,{expectedRevisionId:revisionId,field:{...field,position}})).receipt.revisionId;
  const actor=await api('/api/members/current');assert.equal(actor.role,'member');
  const open=async()=>{
    await page.goto(`${origin}/app/databases/${database.id}`,{waitUntil:'networkidle'});
    await tap(page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Automations',exact:true}));
  };
  await open();await tap(page.getByRole('button',{name:'New automation',exact:true}));
  const dialog=page.getByRole('dialog',{name:'Create automation',exact:true});
  await dialog.getByLabel('Name',{exact:true}).fill('Member intake sequence');
  await dialog.getByRole('combobox',{name:/^When/}).selectOption('record-created');
  for(const [index,field,op,value] of [[0,'form-stage','eq','Ready'],[1,'form-score','gte','2']]) {
    await tap(dialog.getByRole('button',{name:'Add condition',exact:true}));
    const row=dialog.locator('.filter-builder > fieldset').nth(index);
    await row.getByRole('combobox',{name:'Field',exact:true}).selectOption(field);
    await row.getByRole('combobox',{name:'Condition',exact:true}).selectOption(op);
    await row.getByLabel('Value',{exact:true}).fill(value);
  }
  for(let index=0;index<3;index++) {
    await tap(dialog.getByRole('button',{name:'Add action',exact:true}));
    await dialog.getByLabel(`Action ${index+1} type`,{exact:true}).selectOption(index===1?'edit-fields':'comment');
    const row=dialog.locator('fieldset').filter({has:page.locator('legend').filter({hasText:new RegExp(`^Action ${index+1}$`)})}).last();
    if(index===1) {
      await row.getByRole('checkbox',{name:'Intake stage',exact:true}).check();
      await row.locator('input[type="text"]').fill('Processed');
    } else await row.getByLabel('Comment',{exact:true}).fill(index===0?'Before field edit':'After field edit');
  }
  await checkpoint(page,'AUTO-001 native member rule form');
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/automation')&&response.request().method()==='POST');
  await tap(dialog.getByRole('button',{name:'Save automation',exact:true}));
  const receipt=await saved;assert.equal(receipt.status(),201);
  const ruleId=(await receipt.json()).value.id;
  await expect(dialog).toBeHidden();
  const card=()=>page.locator('.settings-list > li').filter({has:page.getByText('Member intake sequence',{exact:true})});
  await open();await tap(card().getByRole('button',{name:'Edit',exact:true}));
  const edit=page.getByRole('dialog',{name:'Edit automation',exact:true});
  await expect(edit.getByLabel('Name',{exact:true})).toHaveValue('Member intake sequence');
  await expect(edit.getByRole('combobox',{name:/^When/})).toHaveValue('record-created');
  await expect(edit.locator('.filter-builder > fieldset').nth(0).getByLabel('Value',{exact:true})).toHaveValue('Ready');
  await expect(edit.locator('.filter-builder > fieldset').nth(1).getByLabel('Value',{exact:true})).toHaveValue('2');
  const rule=(await api('/api/automation')).items.find(item=>item.id===ruleId);
  assert.equal(rule.actor_member_id,actor.id);
  assert.deepEqual(JSON.parse(rule.conditions_json),[{field:'form-stage',op:'eq',value:'Ready'},{field:'form-score',op:'gte',value:2}]);
  assert.deepEqual(JSON.parse(rule.actions_json),[{type:'comment',body:'Before field edit'},{type:'edit-fields',values:{'form-stage':'Processed'}},{type:'comment',body:'After field edit'}]);
  await checkpoint(page,'AUTO-001 reopened saved member rule');
  await tap(edit.getByRole('button',{name:'Cancel',exact:true}));
  const record=(await mutate(`/api/databases/${database.id}/records`,{title:'Native form accepted',values:{'form-stage':'Ready','form-score':2}})).value;
  const refused=(await mutate(`/api/databases/${database.id}/records`,{title:'Native form condition unmet',values:{'form-stage':'Ready','form-score':1}})).value;
  await state.runScheduled();
  const runs=(await api(`/api/automation/${ruleId}/runs`)).items;
  const run=runs.find(item=>item.state==='success'&&item.trigger.pageId===record.pageId);
  assert.ok(run);assert.equal(run.actor.id,actor.id);
  assert.deepEqual(run.receipts.map(item=>[item.actionIndex,item.state]),[[0,'confirmed'],[1,'confirmed'],[2,'confirmed']]);
  assert.equal((await api(`/api/databases/${database.id}/records/${record.pageId}`)).values['form-stage'],'Processed');
  const comments=(await api(`/api/comments/page/${record.pageId}`)).comments;
  assert.deepEqual(comments.map(item=>item.body[0].text).sort(),['After field edit','Before field edit']);
  for(const [index,text] of [[0,'Before field edit'],[2,'After field edit']]) {
    const receipt=run.receipts.find(item=>item.actionIndex===index).receipt;
    assert.deepEqual(comments.find(item=>item.id===receipt.value.id).body,[{text}]);
  }
  assert.ok(runs.some(item=>item.state==='condition-not-met'&&item.trigger.pageId===refused.pageId));
  assert.equal((await api(`/api/databases/${database.id}/records/${refused.pageId}`)).values['form-stage'],'Ready');
  assert.deepEqual((await api(`/api/comments/page/${refused.pageId}`)).comments,[]);
  const activity=(await api(`/api/activity?actorId=${actor.id}&limit=100`)).items;
  const effects=activity.filter(item=>item.operationKey?.startsWith(`auto:${run.id}:`));
  assert.deepEqual(effects.map(item=>item.action).sort(),['comments.create','comments.create','databases.record.update'].sort());
  assert.ok(effects.every(item=>item.actor?.id===actor.id));
  assert.ok(activity.some(item=>item.target.id===run.id&&item.action==='automation.success'&&item.actor?.id===actor.id));
  console.log('AUTO001_FORM_RECEIPT '+JSON.stringify({width:page.viewportSize().width,ruleId,actorId:actor.id,triggerRecordId:record.pageId,run,conditions:JSON.parse(rule.conditions_json),actions:JSON.parse(rule.actions_json),effects,unmetRecordId:refused.pageId}));
  await open();await tap(card().getByRole('button',{name:'Run log',exact:true}));
  await expect(page.getByRole('heading',{name:'Run log',exact:true}).locator('..')).toContainText(`Actor: ${actor.displayName}`);
  await checkpoint(page,'AUTO-001 saved rule canonical outcome');
  console.log(`PROBE AUTO-001 form ${page.viewportSize().width}: non-owner RuleForm -> saved and reopened ordered rule, committed record trigger, exact fields and comments, saving actor, condition-unmet refusal`);
}
