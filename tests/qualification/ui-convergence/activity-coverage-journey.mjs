import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {activityCoverageProof} from '../core/activity-coverage-proof.mjs';
import {accessible} from './browser-support.mjs';
import {ok} from './two-people-support.mjs';

/** The desktop checks the whole corpus; the phone records the changed timeline screen once. */
export async function activityCoverageJourney(state,{phone=false}={}){
 const {page,context,origin,api}=state;
 await state.switchIdentity('owner');
 const workspace=await api('/api/workspace');
 if(phone){
  const containers=await api('/api/containers'),container=containers.items.find(item=>item.name==='Handbook');
  const created=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:container.id,title:'synthetic-slate-phone-activity'});
  const exported=await context.request.post(origin+'/api/exports/readable',{headers:{origin},data:{operationKey:randomUUID(),scope:'page',id:created.value.pageId,format:'html'}});
  assert.equal(exported.status(),200);await exported.body();
  const receipt=JSON.parse(exported.headers()['x-slate-receipt']);
  await page.goto(origin+'/app/settings?section=activity',{waitUntil:'networkidle'});
  await page.reload({waitUntil:'networkidle'});
  await page.locator(`[data-activity-id="${receipt.activityId}"]`).scrollIntoViewIfNeeded();
  await accessible(page,'activity readable export phone');
  return;
 }
 const created=await ok(context,origin,'POST','/api/containers',{operationKey:randomUUID(),name:'synthetic-slate-activity-space',visibility:'private'});
 const removableMemberId='synthetic-slate-removable-'+randomUUID(),now=new Date().toISOString();
 const email=['synthetic-slate-removable','test.invalid'].join('@');
 await state.fixtureSql([`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES('${removableMemberId}','browser-workspace','${email}','Removable member','RM','member','member','active',0,'${now}','${now}')`]);
 const result=await activityCoverageProof({
  ownerId:'browser-owner',memberId:'browser-reader',removableMemberId,containerId:created.value.id,workspaceId:'browser-workspace',key:randomUUID,host:new URL(origin).host,
  request:async(method,route,body,actor='browser-owner',headers={})=>{
   await state.switchIdentity(actor==='browser-reader'?'reader':'owner');
   const binary=body instanceof Uint8Array;
   const response=await context.request.fetch(origin+route,{method,headers:{origin,...(binary?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{data:binary?Buffer.from(body):JSON.stringify(body)}),maxRetries:0});
   const responseHeaders=response.headers();
   return {status:response.status(),headers:responseHeaders,...(responseHeaders['content-type']?.includes('application/json')?{data:await response.json()}:{bytes:new Uint8Array(await response.body())})};
  },
  importFixture:async()=>new Uint8Array(await readFile(new URL('../../e2e/imports/fixtures/real/confluence-space-export.zip',import.meta.url))),
  runScheduled:state.runScheduled,
 });
 await state.switchIdentity('owner');
 // Every action is inspected in the real timeline after a fresh document load.
 const rows=[...result.receipts.map(item=>({id:item.receipt.activityId,action:item.action,target:item.target,occurredAt:item.receipt.committedAt,actorId:result.redactedPageIds.includes(item.target.id)&&item.action!=='archive.permanent-delete'?null:item.actorId})),...[...result.automation,result.import,result.workspaceExport].map(row=>({...row,actorId:row.actor?.id}))];
 for(const actorId of ['browser-owner','browser-reader']){
  await state.switchIdentity(actorId==='browser-reader'?'reader':'owner');
  await page.goto(origin+'/app/settings?section=activity',{waitUntil:'networkidle'});
  await page.reload({waitUntil:'networkidle'});
  for(const action of new Set(rows.filter(row=>(row.actorId??'browser-owner')===actorId).map(row=>row.action))){
   console.log('ACTIVITY_TIMELINE',actorId,action);
  await page.getByRole('textbox',{name:'Action',exact:true}).fill(action);
  await page.getByRole('button',{name:'Filter activity',exact:true}).click();
  for(const row of rows.filter(item=>item.action===action&&(item.actorId??'browser-owner')===actorId)){
   const visible=page.locator(`[data-activity-id="${row.id}"]`);
   await expect(visible).toHaveCount(1);
   await expect(visible).toContainText(action.replace(/[._-]/g,' '));
   await expect(visible).toContainText(row.target.kind);await expect(visible).toContainText(row.target.id);
   await expect(visible.locator('time')).toHaveAttribute('dateTime',row.occurredAt);
   if(row.actorId)await expect(visible.locator('strong')).toHaveText(row.actorId==='browser-reader'?'Morgan Reader':'Alex Owner');
  }
  }
 }
 await state.switchIdentity('owner');
 await page.goto(origin+'/app/settings?section=activity',{waitUntil:'networkidle'});
 // One screenshot of the changed populated screen, with the member's actual export.
 await page.getByRole('textbox',{name:'Action',exact:true}).fill('exports.readable');
 await page.getByRole('button',{name:'Filter activity',exact:true}).click();
 await expect(page.locator(`[data-activity-id="${result.receipts.find(item=>item.family==='readable page export').receipt.activityId}"]`)).toBeVisible();
 await accessible(page,'activity native kinds and readable exports desktop');
 const evidence=path.join('.artifacts/ui-convergence/activity');await mkdir(evidence,{recursive:true});
 await writeFile(path.join(evidence,'native-action-receipts.json'),JSON.stringify(result,null,2)+'\n');
 const current=await api('/api/workspace');
 await ok(context,origin,'PUT','/api/workspace',{operationKey:randomUUID(),expectedRevisionId:current.revisionId,name:workspace.name,mark:workspace.mark,description:workspace.description,guestAccess:workspace.guestAccess,publicLinkAccess:workspace.publicLinkAccess,anonymousAccess:workspace.anonymousAccess,policies:workspace.policies});
 console.log('PROBE ACT-002 1: owner and member native action corpus -> exact attributed activity inventory; committed reviewed import and opened readable and workspace archives; refused and unchanged keys absent');
 console.log('PROBE ACT-002 2: operation keys and run identifiers -> one row per committed native action, replay deduplicated, every action visible after timeline reload');
}
