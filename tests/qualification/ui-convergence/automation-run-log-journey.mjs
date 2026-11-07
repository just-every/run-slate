import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {tap,checkpoint} from './touch-controls.mjs';
import {automationRestartJourney} from './automation-restart-journey.mjs';

/** Real content events and D1 failures exercise the emitted automation worker. */
export async function automationRunLogJourney(state,touch) {
  if(touch.page.viewportSize().width===1440)await automationRestartJourney(state);
  const {page,context,origin,api,containerId}=touch;
  const mutate=(route,data)=>ok(context,origin,'POST',route,{operationKey:randomUUID(),...data});
  const database=(await mutate('/api/databases',{containerId,title:'Run log inspection'})).value;
  const rule=(await mutate('/api/automation',{
    name:'Inspect intake outcomes',scope:'source',sourceDatabaseId:database.id,
    trigger:{event:'record-created'},conditions:[],actions:[{type:'comment',body:'Intake recorded once.'}],
  })).value;
  const record=(await mutate(`/api/databases/${database.id}/records`,{title:'Inspected intake',values:{}})).value;
  await state.runScheduled();
  const read=async()=>(await api(`/api/automation/${rule.id}/runs`)).items;
  const list=async()=>(await api('/api/automation')).items.find(item=>item.id===rule.id);
  const open=async(log=false)=>{
    await page.goto(`${origin}/app/databases/${database.id}`,{waitUntil:'networkidle'});
    await tap(page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Automations',exact:true}));
    if(log)await tap(card().getByRole('button',{name:'Run log',exact:true}));
  };
  const card=()=>page.locator('.settings-list > li').filter({has:page.getByText('Inspect intake outcomes',{exact:true})});
  const log=()=>page.getByRole('heading',{name:'Run log',exact:true}).locator('..');
  await open(true);
  const success=(await read()).find(run=>run.state==='success');
  assert.ok(success);
  const actor=(await api('/api/members/current')).displayName;
  const row=log().locator('ol > li').filter({has:page.getByText('success',{exact:true})});
  await expect(row).toContainText('Trigger: record created');
  await expect(row).toContainText(`Actor: ${actor}`);
  await expect(row.getByRole('link',{name:'Inspected intake',exact:true})).toHaveAttribute('href',`/app/pages/${record.pageId}`);
  await expect(row).toContainText(new Date(success.created_at).toLocaleString('en-US'));
  await expect(row).toContainText('Action 1: confirmed');
  assert.deepEqual((await api(`/api/comments/page/${record.pageId}`)).comments.map(comment=>comment.body),[[{text:'Intake recorded once.'}]]);
  await checkpoint(page,'automation trigger actor time and touched record');
  // A native storage fault aborts the action transaction. Only the retry clock moves.
  await state.fixtureSql(["CREATE TRIGGER synthetic_slate_browser_fault BEFORE INSERT ON comments BEGIN SELECT RAISE(ABORT,'synthetic-slate-2'); END"]);
  try {
    for(let failure=0;failure<3;failure++) {
      await mutate(`/api/databases/${database.id}/records`,{title:`Faulted intake ${failure}`,values:{}});
      await state.runScheduled();
      const error=(await read()).find(run=>run.state==='error');
      assert.ok(error);assert.equal(error.finished_at,null);
      await open(true);
      await expect(card()).toContainText('Error · Retry pending');
      await expect(log()).toContainText('Retry pending; committed actions will not repeat.');
      if(failure===0)await checkpoint(page,'automation error retains durable retry');
      for(let retry=0;retry<2;retry++) {
        await state.fixtureSql([`UPDATE automation_jobs SET lease_until='2000-01-01T00:00:00.000Z' WHERE rule_id='${rule.id}' AND state='running'`]);
        await state.runScheduled();
      }
      assert.equal((await read()).find(run=>run.id===error.id).state,'failure');
      await open();
      await expect(card()).toContainText('Failed run');
      await expect(card()).toContainText('An action failed; retained receipts identify committed work.');
      if(failure===0)await checkpoint(page,'automation failure beside rule without log search');
    }
  } finally {await state.fixtureSql(['DROP TRIGGER synthetic_slate_browser_fault']);}
  const disabled=await list();
  assert.ok(disabled.disabled_at);
  assert.equal(disabled.disabled_reason,'Disabled after repeated failures.');
  await open();
  await expect(card()).toContainText('Disabled after repeated failures.');
  await mutate(`/api/databases/${database.id}/records`,{title:'Intake after disable',values:{}});
  await state.runScheduled();
  await open(true);
  await expect(log()).toContainText('Disabled after repeated failures.');
  assert.equal((await read()).find(run=>run.state==='disabled').detail.reason,disabled.disabled_reason);
  assert.equal((await api(`/api/comments/page/${record.pageId}`)).comments.length,1);
  await checkpoint(page,'automation repeated failure disable reason persisted');
  console.log(`PROBE AUTO-003 browser ${page.viewportSize().width}: native database Automations -> trigger, actor, readable touched record and time; error retries, visible failure beside rule and persisted disable reason`);
}
