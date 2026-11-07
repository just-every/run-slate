import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {runtime,signIn,api,root} from '../../portability/runtime.mjs';
import {accessible} from './browser-evidence.mjs';
import {sourceIdentity} from '../../../scripts/build/source-identity.mjs';

/** One real admitted firing survives a process kill at commit-before-confirm. */
export async function automationRestartJourney(state) {
  const sourceIdentityAtRun=await sourceIdentity(root);
  const artifact=JSON.parse(await readFile(path.join(root,'.cache/slate/build-source.json'),'utf8'));
  const scratch=await mkdtemp(path.join(root,'.artifacts/automation-restart-'));
  let instance,context;
  try {
    instance=await runtime(scratch);await instance.start();
    const cookie=await signIn(instance);
    const read=async route=>(await api(instance,cookie,route)).json();
    const mutate=async(route,data,method='POST')=>{
      const response=await fetch(instance.origin+route,{
        method,headers:{cookie,origin:instance.origin,'content-type':'application/json'},body:JSON.stringify({operationKey:randomUUID(),...data}),
      });
      const body=await response.json();
      assert.equal(response.status,method==='POST'&&(['/api/databases','/api/automation'].includes(route)||route.endsWith('/records'))?201:200,JSON.stringify(body));
      return body;
    };
    await mutate('/api/workspace/first-run',{workspaceName:'Restart operations',containerName:'Recovery space',pageTitle:'Recovery notes'});
    const owner=(await read('/api/session')).member;
    const containerId=(await read('/api/containers')).items[0].id;
    const source=(await mutate('/api/databases',{containerId,title:'Restart intake'})).value;
    await mutate(`/api/databases/${source.id}/fields`,{expectedRevisionId:source.revisionId,field:{id:'recovery-stage',name:'Recovery stage',type:'text',config:{},position:0}});
    const structure=await read(`/api/databases/${source.id}`);
    const viewId=randomUUID();
    await mutate(`/api/databases/${source.id}/views`,{expectedRevisionId:structure.database.revision_id,view:{id:viewId,name:'Recovery inventory',layout:'table',filters:[],sorts:[],groups:[],calculations:{},display:{},position:0}});
    const initial=(await mutate(`/api/databases/${source.id}/records`,{title:'Interrupted intake',values:{'recovery-stage':'pending'}})).value;
    const rule=(await mutate('/api/automation',{
      name:'Recover committed intake',scope:'source',sourceDatabaseId:source.id,
      trigger:{event:'record-updated'},conditions:[],actions:[
        {type:'create-record',databaseId:source.id,title:'One recovered record',values:{}},
        {type:'comment',body:'One recovered comment.'},
        {type:'notify',recipientMemberIds:[owner.id],message:'One recovered inbox outcome.'},
      ],
    })).value;
    const submitted={operationKey:randomUUID(),expectedRevisionId:initial.revisionId,values:{'recovery-stage':'admitted'}};
    const triggerRoute=`/api/databases/${source.id}/records/${initial.pageId}`;
    const trigger=(await mutate(triggerRoute,submitted,'PATCH')).value;
    await instance.automationGate('arm',2);
    // The pending request is settled after SIGKILL; its error cannot stand in for a kill.
    const draining=instance.scheduled().then(()=>({completed:true}),()=>({interrupted:true}));
    let point;
    await expect.poll(async()=>{point=(await instance.automationGate('status')).reached;return !!point;},{timeout:20000}).toBe(true);
    const runId=point.runId;
    assert.equal(point.targetId,trigger.pageId);
    const snapshot=async()=>({
      jobs:await instance.read('SELECT id,run_id,event_key,state,cursor,lease_until FROM automation_jobs WHERE rule_id=?',rule.id),
      runs:await instance.read("SELECT id,state,started_at,finished_at FROM automation_runs WHERE rule_id=? AND state!='configuration-changed'",rule.id),
      actions:await instance.read('SELECT action_index,target_id,state,receipt_json FROM automation_action_receipts WHERE run_id=? ORDER BY action_index',runId),
      operations:await instance.read('SELECT operation_key,target_kind,target_id,response_json FROM operation_receipts WHERE operation_key LIKE ? ORDER BY operation_key',`auto:${runId}:%`),
      activity:await instance.read('SELECT id,action,target_id,operation_key,automation_run_id FROM activity_entries WHERE operation_key LIKE ? OR automation_run_id=? ORDER BY id',`auto:${runId}:%`,runId),
      records:await instance.read('SELECT r.page_id,p.title FROM database_records r JOIN pages p ON p.id=r.page_id WHERE r.database_id=? AND r.page_id!=?',source.id,trigger.pageId),
      comments:await instance.read('SELECT c.id,c.body_json FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=?',trigger.pageId),
      outbox:await instance.read("SELECT id,detail_json FROM notification_outbox WHERE page_id=? AND event='maintenance'",trigger.pageId),
    });
    const interrupted=await snapshot();
    assert.equal(interrupted.jobs.length,1);assert.equal(interrupted.runs.length,1);
    const job=interrupted.jobs[0];
    assert.equal(job.run_id,runId);assert.equal(job.state,'running');assert.equal(job.cursor,1);
    assert.deepEqual(interrupted.runs,[{id:runId,state:'running',started_at:interrupted.runs[0].started_at,finished_at:null}]);
    assert.ok(interrupted.runs[0].started_at);
    assert.deepEqual(interrupted.actions.map(row=>row.state),['confirmed','confirmed','prepared']);
    assert.deepEqual(interrupted.operations.map(row=>row.operation_key),[0,1,2].map(index=>`auto:${runId}:${index}:${trigger.pageId}`));
    assert.deepEqual(interrupted.records.map(row=>row.title),['One recovered record']);
    assert.deepEqual(interrupted.comments.map(row=>JSON.parse(row.body_json)),[[{text:'One recovered comment.'}]]);
    assert.deepEqual(interrupted.outbox.map(row=>JSON.parse(row.detail_json)),[{outcome:'One recovered inbox outcome.'}]);
    assert.equal(interrupted.activity.filter(row=>row.operation_key).length,3);
    const killed=await instance.crash();
    assert.equal(killed.signal,'SIGKILL');assert.ok((await draining).interrupted);
    const persist=instance.persist;
    await instance.start();
    assert.equal(instance.persist,persist);
    assert.ok(Date.now()<Date.parse(job.lease_until),'The restarted runtime reaches the still-live lease.');
    await instance.scheduled();
    assert.deepEqual(await snapshot(),interrupted,'A drain before lease expiry neither reclaims the job nor changes effects.');
    const remaining=Date.parse(job.lease_until)-Date.now()+100;
    assert.ok(remaining>0&&remaining<=60100);
    // Wait on the genuine production lease. Never modify the job, receipt or clock.
    await new Promise(resolve=>setTimeout(resolve,remaining));
    for(let attempt=0;attempt<3;attempt++)await instance.scheduled();
    const recovered=await snapshot();
    assert.deepEqual(recovered.jobs,[{...job,state:'success',cursor:2,lease_until:null}]);
    assert.equal(recovered.runs.length,1);assert.equal(recovered.runs[0].id,runId);
    assert.equal(recovered.runs[0].state,'success');assert.ok(recovered.runs[0].finished_at);
    assert.equal(recovered.runs[0].started_at,interrupted.runs[0].started_at);
    assert.deepEqual(recovered.actions.map(row=>row.state),['confirmed','confirmed','confirmed']);
    for(const key of ['records','comments','operations','outbox'])assert.deepEqual(recovered[key],interrupted[key],`${key} retain exactly their committed identities and bytes.`);
    assert.deepEqual(recovered.activity.filter(row=>row.operation_key),interrupted.activity.filter(row=>row.operation_key));
    assert.deepEqual(recovered.activity.filter(row=>row.automation_run_id).map(row=>row.action).sort(),['automation.queued','automation.success']);
    const logs=(await read(`/api/automation/${rule.id}/runs`)).items.filter(row=>row.id===runId);
    assert.equal(logs.length,1);const log=logs[0];
    assert.equal(log.state,'success');assert.equal(log.actor.id,owner.id);
    assert.equal(log.trigger.pageId,trigger.pageId);
    assert.deepEqual(log.records.map(record=>record.id).sort(),[trigger.pageId,recovered.records[0].page_id].sort());
    assert.deepEqual(log.receipts.map(receipt=>receipt.state),['confirmed','confirmed','confirmed']);
    for(const [index,receipt] of log.receipts.entries()) {
      assert.equal(receipt.actionIndex,index);assert.equal(receipt.targetId,trigger.pageId);
      assert.deepEqual(receipt.receipt,JSON.parse(recovered.operations[index].response_json));
    }
    assert.deepEqual((await read(`/api/comments/page/${trigger.pageId}`)).comments.map(comment=>comment.body),[[{text:'One recovered comment.'}]]);
    assert.deepEqual((await read(`/api/databases/${source.id}/views/${viewId}`)).records.map(record=>record.pageId).sort(),[trigger.pageId,recovered.records[0].page_id].sort());
    const notices=(await read('/api/notifications')).items.filter(item=>item.event==='maintenance');
    assert.deepEqual(notices.map(item=>({pageId:item.pageId,detail:item.detail})),[{pageId:trigger.pageId,detail:{outcome:'One recovered inbox outcome.'}}]);
    const timeline=(await read('/api/activity?limit=100')).items;
    assert.deepEqual(timeline.filter(item=>item.operationKey?.startsWith(`auto:${runId}:`)).map(item=>item.operationKey).sort(),recovered.operations.map(row=>row.operation_key));
    assert.equal(timeline.filter(item=>item.automationRunId===runId&&item.action==='automation.success').length,1);
    // Replay the actual authenticated trigger command, then repeatedly drain again.
    const replay=(await mutate(triggerRoute,submitted,'PATCH')).value;
    assert.deepEqual(replay,trigger);
    for(let attempt=0;attempt<3;attempt++)await instance.scheduled();
    assert.deepEqual(await snapshot(),recovered,'Repeated drains and trigger replay cannot duplicate effects or completion.');
    context=await state.context.browser().newContext({viewport:{width:1440,height:1000},locale:'en-US'});
    await context.addCookies([{name:'slate_session',value:cookie.split('=')[1],url:instance.origin}]);
    const page=await context.newPage();
    await page.goto(`${instance.origin}/app/databases/${source.id}`,{waitUntil:'networkidle'});
    await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Automations',exact:true}).click();
    const card=page.locator('.settings-list > li').filter({has:page.getByText('Recover committed intake',{exact:true})});
    await card.getByRole('button',{name:'Run log',exact:true}).click();
    const row=page.getByRole('heading',{name:'Run log',exact:true}).locator('..').locator('ol > li').filter({has:page.getByText('success',{exact:true})});
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Trigger: record updated');
    await expect(row).toContainText(`Actor: ${owner.displayName}`);
    await expect(row.getByRole('link',{name:'Interrupted intake',exact:true})).toHaveAttribute('href',`/app/pages/${trigger.pageId}`);
    await expect(row.getByRole('link',{name:'One recovered record',exact:true})).toHaveAttribute('href',`/app/pages/${recovered.records[0].page_id}`);
    for(const index of [1,2,3])await expect(row).toContainText(`Action ${index}: confirmed`);
    await accessible(page,'automation recovered run log 1440');
    await page.setViewportSize({width:390,height:844});
    await accessible(page,'automation recovered run log 390');
    const receipt={source:sourceIdentityAtRun,artifact,killed,persistedStoreReused:true,leaseUntil:job.lease_until,interrupted,recovered,run:log,notices};
    const evidence=path.join(root,'.artifacts/ui-convergence/automation-restart');
    await mkdir(evidence,{recursive:true});
    await writeFile(path.join(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log(`PROBE AUTO-008 1: authenticated rule and committed record -> SIGKILL pid=${killed.pid}; genuine lease ${job.lease_until}; same store, one job and run, one record, comment and inbox effect; three confirmed action and operation receipts; one success activity; replay unchanged; recovered log at 1440 and 390`);
    return receipt;
  } finally {await context?.close();await instance?.close();await rm(scratch,{recursive:true,force:true});}
}
