import {test,expect} from 'vitest';
import {auditFixture,assertAudit,env,createUlid} from './audit-support';
import {saveRule} from '../../../src/core/features/automation/service';
import {enqueueAutomationEvent,processAutomationJob} from '../../../src/core/features/automation/jobs';
import {archivePage} from '../../../src/core/features/archive/service';
import {startImport,runImport} from '../../../src/core/features/imports/jobs';
import {reset} from '../authority/fixture';
import {exportWorkspace} from '../../../src/core/features/portability/service';
test('ACT-002 BASE-OPS-005 automation configuration and real user-reaching comment retain run-linked audit',async()=>{
 const f=await auditFixture(),d=await f.mutation('database for automation','databases.create','POST','/api/databases',{containerId:f.containerId,title:'Automation audit'}),key=createUlid();
 await saveRule(f.ctx,{operationKey:key,name:'Audit comment',scope:'container',containerId:f.containerId,trigger:{event:'record-created'},conditions:[],actions:[{type:'comment',body:'Actual automated audit comment'}]});
 await assertAudit(f.workspaceId,key,'automation.configure',f.ownerId,'automation configuration');
 const p=await f.mutation('record creation','databases.record.create','POST',`/api/databases/${d.value.id}/records`,{title:'Trigger',values:{}});
 const queued=await enqueueAutomationEvent(f.ctx,{key:createUlid(),event:'record-created',databaseId:d.value.id,containerId:f.containerId,pageId:p.value.pageId});expect(queued.jobIds).toHaveLength(1);
 const result=await processAutomationJob(f.ctx,queued.jobIds[0],{archive:(ctx,id,input)=>archivePage(ctx,id,{...input,action:'archive'}),notify:async()=>{throw Error('Unexpected external notification');}});expect(result?.state).toBe('success');if(!result)throw Error('Automation returned no result');
 const entries=(await env.DB.prepare('SELECT action,actor_member_id,feature,automation_run_id,occurred_at FROM activity_entries WHERE automation_run_id=?').bind(result.runId).all()).results;
 expect(entries.map(e=>e.action)).toEqual(expect.arrayContaining(['automation.queued','automation.success']));const receipt=await env.DB.prepare('SELECT state,receipt_json FROM automation_action_receipts WHERE run_id=?').bind(result.runId).first<{state:string;receipt_json:string}>();expect(receipt!.state).toBe('confirmed');await assertAudit(f.workspaceId,`auto:${result.runId}:0:${p.value.pageId}`,'comments.create',f.ownerId,'automated comment effect');for(const e of entries){expect(e.actor_member_id).toBe(f.ownerId);expect(Number.isFinite(Date.parse(String(e.occurred_at)))).toBe(true);}console.info('AUTOMATION_AUDIT',JSON.stringify(entries));
});
test('ACT-002 BASE-OPS-005 real markdown import and native workspace export retain attributed audit',async()=>{
 await reset();const f=await auditFixture(),key=createUlid();
 const staged=await startImport(f.ctx,{operationKey:key,format:'markdown',source:{name:'audit.md',bytes:new TextEncoder().encode('# Audit import\n\nActual imported body.')}});
 await assertAudit(f.workspaceId,key,'imports.stage',f.ownerId,'import admission');const result=await runImport(f.ctx,staged.id);expect(result.state).toBe('completed');
 await assertAudit(f.workspaceId,`import-publish:${staged.id}`,'imports.publish',f.ownerId,'import publication');
 const exportKey=createUlid(),exported=await exportWorkspace(f.ctx,{operationKey:exportKey});expect(exported.state).toBe('completed');await assertAudit(f.workspaceId,exportKey,'exports.workspace',f.ownerId,'workspace export');
});
