import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember,seedContainerGrant,sessionFor} from '../e2e/setup/fixtures';
import {scheduledDiscovery} from '../../src/core/features/notifications/jobs';
import {scheduledAutomation} from '../../src/core/features/automation/events';

/** Native rules use committed content events and the configured production adapters. */
export async function automationJourney(api:ReturnType<typeof createApi>,containerId:string,workspaceId:string,ownerCookie:string) {
  const editor=await seedMember(workspaceId,{role:'member',displayName:'Automation editor',email:['synthetic-slate-214','test.invalid'].join('@')});
  await seedContainerGrant(containerId,{principalKind:'member',principalId:editor.memberId,level:'full'});
  const removed=await seedMember(workspaceId,{role:'member',displayName:'Removed recipient',status:'removed',email:['synthetic-slate-215','test.invalid'].join('@')});
  const cookie=await sessionFor(editor.memberId), origin=new URL(String(env.APP_URL)).origin;
  const request=(path:string,method='GET',body?:unknown,as=cookie)=>api.request(origin+path,{method,headers:{cookie:as,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},env);
  const ok=async(path:string,method='GET',body?:unknown,as=cookie)=>{
    const response=await request(path,method,body,as), result=await response.json<any>();
    expect(response.status,`${method} ${path}: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(200);
    expect(response.status,`${method} ${path}: ${JSON.stringify(result)}`).toBeLessThan(300);
    return result;
  };
  const command=(path:string,body:object,as=cookie,method='POST')=>ok(path,method,{operationKey:crypto.randomUUID(),...body},as);
  const drain=async()=>{await scheduledAutomation(env);await scheduledDiscovery(env);};
  const owner=(await ok('/api/members/current','GET',undefined,ownerCookie)).id;
  const page=async(id:string)=>ok(`/api/pages/${id}`);
  const comments=async(id:string)=>(await ok(`/api/comments/page/${id}`)).comments;
  const database=(await command('/api/databases',{containerId,title:'Native automation intake'})).value;
  let revisionId=database.revisionId;
  for(const [position,field] of [
    {id:'stage',name:'Stage',type:'text',config:{}},
    {id:'score',name:'Score',type:'number',config:{}},
    {id:'related',name:'Related',type:'relation',config:{databaseId:database.id}},
  ].entries()) {
    revisionId=(await command(`/api/databases/${database.id}/fields`,{expectedRevisionId:revisionId,field:{...field,position}})).receipt.revisionId;
  }
  const record=async(title:string,values:object)=>(await command(`/api/databases/${database.id}/records`,{title,values},ownerCookie)).value;
  const targetA=await record('Related first',{stage:'Target',score:0});
  const targetB=await record('Related second',{stage:'Target',score:0});
  const destination=(await command('/api/pages',{containerId,title:'Moved pages'},ownerCookie)).value.pageId;
  // Existing content predates the rules. It must never be mistaken for a new event.
  await drain();
  const definitions:any[]=[];
  const save=async(definition:any)=>{
    const saved=await command('/api/automation',definition);
    expect(await env.DB.prepare('SELECT actor_member_id FROM activity_entries WHERE id=?').bind(saved.receipt.activityId).first()).toEqual({actor_member_id:editor.memberId});
    definitions.push({...definition,id:saved.value.id});return saved.value.id as string;
  };
  const createdId=await save({name:'Native page arrival',scope:'container',containerId,trigger:{event:'created'},conditions:[],actions:[{type:'comment',body:'Page arrived'}]});
  const moveId=await save({name:'Native property movement',scope:'container',containerId,trigger:{event:'properties'},conditions:[],actions:[{type:'move',containerId,parentPageId:destination}]});
  const blocksId=await save({name:'Native body follow-up',scope:'container',containerId,trigger:{event:'blocks'},conditions:[],actions:[{type:'create-page',containerId,title:'Body follow-up'}]});
  const publishedId=await save({name:'Native publication archive',scope:'container',containerId,trigger:{event:'published'},conditions:[],actions:[{type:'archive',reason:'Published procedure retained'}]});
  const conditions=[{field:'stage',op:'eq',value:'Ready'},{field:'score',op:'gte',value:2}];
  const actions=[
    {type:'edit-fields',values:{stage:'First'}},
    {type:'comment',body:'First ordered comment'},
    {type:'edit-fields',values:{stage:'Processed',score:7}},
    {type:'create-record',databaseId:database.id,title:'Created by intake',values:{stage:'Produced',score:3}},
    {type:'comment',body:'Second ordered comment'},
    {type:'notify',recipientMemberIds:[owner,removed.memberId],message:'Intake processed'},
  ];
  const intakeId=await save({name:'Native ordered intake',scope:'source',sourceDatabaseId:database.id,trigger:{event:'record-created'},conditions,actions});
  const branchId=await save({name:'Native related update',scope:'source',sourceDatabaseId:database.id,trigger:{event:'record-updated'},conditions:[{field:'stage',op:'eq',value:'Fan out'}],branch:{relationField:'related'},actions:[{type:'comment',body:'Related update'},{type:'edit-fields',values:{score:11}}]});
  // This source is a genuinely committed record, not a fabricated event or run row.
  const scheduledSource=await record('Scheduled source',{stage:'Scheduled',score:1,related:[targetA.pageId,targetB.pageId]});
  const scheduleId=await save({name:'Native related schedule',scope:'source',sourceDatabaseId:database.id,trigger:{event:'schedule',startsAt:new Date(Date.now()-60000).toISOString(),intervalMinutes:60},conditions:[{field:'stage',op:'eq',value:'Scheduled'}],branch:{relationField:'related'},actions:[{type:'comment',body:'Scheduled relation'}]});
  const denied=await request('/api/automation','POST',{operationKey:crypto.randomUUID(),name:'Member workspace rule',scope:'site',trigger:{event:'created'},conditions:[],actions:[]});
  expect(denied.status).toBe(403);
  const site=(await command('/api/automation',{name:'Owner workspace rule',scope:'site',trigger:{event:'created'},conditions:[],actions:[],disabled:true},ownerCookie)).value;
  expect((await ok('/api/automation', 'GET',undefined,ownerCookie)).items.find((r:any)=>r.id===site.id)).toMatchObject({scope:'site',disabled_at:expect.any(String)});
  const rules=(await ok('/api/automation')).items;
  for(const definition of definitions) {
    const stored=rules.find((r:any)=>r.id===definition.id);
    expect(stored).toMatchObject({name:definition.name,scope:definition.scope,actor_member_id:editor.memberId});
    expect(JSON.parse(stored.trigger_json)).toEqual(definition.trigger);
    expect(JSON.parse(stored.conditions_json)).toEqual(definition.conditions);
    expect(JSON.parse(stored.actions_json)).toEqual(definition.actions);
    expect(stored.branch_json?JSON.parse(stored.branch_json):undefined).toEqual(definition.branch);
    if(definition.scope==='source')expect(stored.source_database_id).toBe(database.id);
    else expect(stored.container_id).toBe(containerId);
  }
  const logs=async(id:string)=>(await ok(`/api/automation/${id}/runs`)).items;
  const success=async(id:string,event:string,target?:string)=>{
    const run=(await logs(id)).find((r:any)=>r.state==='success'&&r.trigger.event===event&&(!target||r.trigger.pageId===target));
    expect(run,`success for ${event}`).toBeTruthy();
    expect(run.actor).toEqual({id:editor.memberId,name:'Automation editor'});
    expect(run.receipts.every((r:any)=>r.state==='confirmed')).toBe(true);
    return run;
  };
  const created=(await command('/api/pages',{containerId,title:'Native event procedure'},ownerCookie)).value.pageId;
  await drain();
  const createdRun=await success(createdId,'created',created);
  expect((await comments(created)).map((c:any)=>c.body)).toEqual([[{text:'Page arrived'}]]);
  await command(`/api/pages/${created}`,{expectedRevisionId:(await page(created)).page.revisionId,properties:{title:'Changed event procedure'}},ownerCookie,'PATCH');
  await drain();
  const moveRun=await success(moveId,'properties',created);
  expect((await page(created)).parentPageId).toBe(destination);
  expect((await page(created)).page.containerId).toBe(containerId);
  await command(`/api/pages/${created}/blocks`,{expectedRevisionId:(await page(created)).page.revisionId,blocks:[{id:crypto.randomUUID(),blockType:'paragraph',content:{text:[{text:'Committed native body'}]},treePosition:'a0'}]},ownerCookie,'PUT');
  await drain();
  const blocksRun=await success(blocksId,'blocks',created);
  const followup=await env.DB.prepare('SELECT id FROM pages WHERE workspace_id=? AND title=?').bind(workspaceId,'Body follow-up').all<{id:string}>();
  expect(followup.results).toHaveLength(1);
  expect((await page(followup.results[0].id)).properties.title).toBe('Body follow-up');
  const body=(await page(created)).blocks[0];
  await command(`/api/pages/${created}/blocks/${body.id}`,{expectedRevisionId:body.revisionId,content:{text:[{text:'Edited native body'}]}},ownerCookie,'PATCH');
  await drain();
  const bodyRuns=(await logs(blocksId)).filter((r:any)=>r.state==='success'&&r.trigger.pageId===created);
  expect(bodyRuns).toHaveLength(2);
  expect((await env.DB.prepare('SELECT id FROM pages WHERE workspace_id=? AND title=?').bind(workspaceId,'Body follow-up').all()).results).toHaveLength(2);
  const publishing=await page(created), expectedRevisionId=publishing.page.revisionId;
  const preview=await ok(`/api/pages/${created}/publish-preview`,'POST',{expectedRevisionId},ownerCookie);
  await command(`/api/pages/${created}/publish`,{expectedRevisionId,previewFingerprint:preview.previewFingerprint},ownerCookie);
  await drain();
  const publishedRun=await success(publishedId,'published',created);
  expect((await page(created)).page.lifecycle).toBe('archived');
  const intake=await record('Accepted intake',{stage:'Ready',score:2});
  const unmet=await record('Unmet intake',{stage:'Ready',score:1});
  await drain();
  const intakeRun=await success(intakeId,'record-created',intake.pageId);
  expect((await ok(`/api/databases/${database.id}/records/${intake.pageId}`)).values).toMatchObject({stage:'Processed',score:7});
  const intakeComments=await comments(intake.pageId);
  expect(intakeComments.map((c:any)=>c.body[0].text).sort()).toEqual(['First ordered comment','Second ordered comment']);
  for(const [index,text] of [[1,'First ordered comment'],[4,'Second ordered comment']] as const) {
    const receipt=intakeRun.receipts.find((r:any)=>r.actionIndex===index).receipt;
    expect(intakeComments.find((c:any)=>c.id===receipt.value.id).body).toEqual([{text}]);
  }
  const produced=await env.DB.prepare('SELECT page_id FROM database_records r JOIN pages p ON p.id=r.page_id WHERE r.database_id=? AND p.title=?').bind(database.id,'Created by intake').all<{page_id:string}>();
  expect(produced.results).toHaveLength(1);
  expect((await ok(`/api/databases/${database.id}/records/${produced.results[0].page_id}`)).values).toMatchObject({stage:'Produced',score:3});
  const notifications=await env.DB.prepare("SELECT * FROM notifications WHERE recipient_member_id=? AND source_page_id=? AND event='maintenance'").bind(owner,intake.pageId).all<any>();
  expect(notifications.results).toHaveLength(1);
  expect(JSON.parse(notifications.results[0].detail_json)).toEqual({outcome:'Intake processed'});
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE recipient_member_id=?').bind(removed.memberId).first()).toEqual({n:0});
  expect(JSON.stringify(await ok('/api/notifications','GET',undefined,ownerCookie))).toContain('Intake processed');
  const unmetRun=(await logs(intakeId)).find((r:any)=>r.trigger.pageId===unmet.pageId&&r.state==='condition-not-met');
  expect(unmetRun).toBeTruthy();expect(unmetRun.receipts).toEqual([]);
  expect((await ok(`/api/databases/${database.id}/records/${unmet.pageId}`)).values).toMatchObject({stage:'Ready',score:1});
  expect(await comments(unmet.pageId)).toEqual([]);
  expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE source_page_id=? AND event='maintenance'").bind(unmet.pageId).first()).toEqual({n:0});
  await command(`/api/databases/${database.id}/records/${unmet.pageId}`,{expectedRevisionId:(await page(unmet.pageId)).page.revisionId,values:{stage:'Fan out',related:[targetA.pageId,targetB.pageId]}},ownerCookie,'PATCH');
  await drain();
  const branchRun=await success(branchId,'record-updated',unmet.pageId);
  const scheduledRun=await success(scheduleId,'schedule',scheduledSource.pageId);
  expect(branchRun.receipts.map((r:any)=>[r.targetId,r.actionIndex])).toEqual([0,1].flatMap(index=>[targetA.pageId,targetB.pageId].sort().map(id=>[id,index])));
  expect(scheduledRun.receipts.map((r:any)=>r.targetId).sort()).toEqual([targetA.pageId,targetB.pageId].sort());
  for(const target of [targetA,targetB]) {
    expect((await ok(`/api/databases/${database.id}/records/${target.pageId}`)).values.score).toBe(11);
    expect((await comments(target.pageId)).map((c:any)=>c.body).flat()).toEqual(expect.arrayContaining([{text:'Scheduled relation'},{text:'Related update'}]));
    expect(await comments(target.pageId)).toHaveLength(2);
  }
  const runs=[createdRun,moveRun,blocksRun,publishedRun,intakeRun,branchRun,scheduledRun];
  for(const run of runs) {
    const receipts=await env.DB.prepare('SELECT actor_member_id,operation_key FROM operation_receipts WHERE operation_key LIKE ? ORDER BY operation_key').bind(`auto:${run.id}:%`).all<any>();
    expect(receipts.results.length).toBe(run.receipts.length);
    expect(receipts.results.every(r=>r.actor_member_id===editor.memberId)).toBe(true);
    for(const receipt of receipts.results) {
      const activity=await env.DB.prepare('SELECT actor_member_id FROM activity_entries WHERE operation_key=?').bind(receipt.operation_key).all<any>();
      expect(activity.results.length).toBeGreaterThan(0);
      expect(activity.results.every(r=>r.actor_member_id===editor.memberId)).toBe(true);
    }
  }
  const before=await env.DB.prepare('SELECT COUNT(*) AS n FROM operation_receipts WHERE operation_key LIKE ?').bind('auto:%').first();
  await drain();await drain();
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM operation_receipts WHERE operation_key LIKE ?').bind('auto:%').first()).toEqual(before);
  expect((await logs(scheduleId)).filter((r:any)=>r.state==='success')).toHaveLength(1);
  const cursor=await env.DB.prepare('SELECT sequence FROM automation_event_cursors WHERE workspace_id=?').bind(workspaceId).first<{sequence:number}>();
  expect(cursor!.sequence).toBe((await env.DB.prepare('SELECT MAX(e.sequence) AS n FROM content_events e JOIN pages p ON p.id=e.page_id WHERE p.workspace_id=?').bind(workspaceId).first<{n:number}>())!.n);
  console.log('AUTO001_NATIVE_RECEIPT '+JSON.stringify({
    profile:(await ok('/api/profile')).profile,actorId:editor.memberId,
    rules:definitions.map(({id,name,scope,trigger,conditions,branch,actions})=>({id,name,scope,trigger,conditions,branch,actions})),
    runs:runs.map(({id,state,actor,trigger,receipts}:any)=>({id,state,actor,trigger,receipts})),
    unmet:{id:unmetRun.id,state:unmetRun.state,receipts:unmetRun.receipts},
    relatedIds:[targetA.pageId,targetB.pageId],notificationId:notifications.results[0].id,
    bodyRunIds:bodyRuns.map((run:any)=>run.id),cursor:cursor!.sequence,
  }));
  console.log('PROBE AUTO-001 1: native member rule HTTP and committed page and record mutations -> all seven triggers, all seven exact canonical action effects, configured inbox adapter and saving actor in effects and activity');
  console.log('PROBE AUTO-001 2: native ordered conditions and actions, related record event and schedule -> exact stored order, two related targets, unmet condition has no effect, repeated real outbox and schedule drains are duplicate-safe');
}
