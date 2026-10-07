// Recorded provider output is a labelled test double; this proves audit mechanics, never inference quality.
import {test,expect,vi,afterEach} from 'vitest';
import {fixture,answer,providerResponse} from '../inquiry/fixture';
import {assertAudit,env,createUlid} from './audit-support';
import {replaceBlocks} from '../../../src/core/features/editor/service';
import {startRun,reviewRun} from '../../../src/core/features/runs/service';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import {requireRun} from '../../../src/core/features/runs/repository';
import {acceptRunChanges} from '../../../src/core/features/runs/acceptance';
import type {AppBindings} from '../../../src/core/app/types';
afterEach(()=>vi.unstubAllGlobals());
for(const outcome of ['accepted','discarded'] as const)test(`ACT-002 BASE-OPS-005 AI start and ${outcome} proposal retain attributed audit`,async()=>{
 const f=await fixture();await env.DB.prepare('DELETE FROM page_grants WHERE id=?').bind(f.readerGrant).run();
 const blockId=createUlid(),page=await replaceBlocks(f.context(),f.page.pageId,{operationKey:createUlid(),expectedRevisionId:f.page.revisionId,blocks:[{id:blockId,blockType:'paragraph',treePosition:'0',content:{text:[{text:'Original sentence'}]}}]});
 const key=createUlid(),run=await startRun(f.context(),{...f.ask,operationKey:key,kind:'edit',audience:[f.owner],refs:[{kind:'page',sourceId:f.page.pageId,revisionId:page.value.revisionId}],selection:{pageId:f.page.pageId,revisionId:page.value.revisionId,blockId,start:0,end:17,text:'Original sentence',action:'improve'}},{apiKey:'TEST-ONLY-NO-SEND'});
 await assertAudit(f.workspaceId,key,'runs.start',f.owner,'AI run start');
 vi.stubGlobal('fetch',async()=>providerResponse({...answer,proposedChanges:[{targetId:blockId,text:'Revised sentence',evidenceIds:['E1']}]}));
 await consumeIntelligenceJob({...env,AI_API_KEY:'TEST-ONLY-NO-SEND'} as AppBindings,{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});const row=await requireRun(f.context(),run.value.id);expect(row.status).toBe('needs-review');const reviewKey=createUlid();
 if(outcome==='discarded'){await reviewRun(f.context(),{id:row.id,operationKey:reviewKey,expectedRevisionId:row.revision_id,outcome});await assertAudit(f.workspaceId,reviewKey,'runs.review',f.owner,'AI rejection');}
 else {await acceptRunChanges(f.context(),row.id,{operationKey:reviewKey,expectedRevisionId:row.revision_id,selections:[{index:0,pageId:f.page.pageId,expectedPageRevisionId:page.value.revisionId,mode:'replace',blockId}]});await assertAudit(f.workspaceId,reviewKey,'runs.accept-changes',f.owner,'AI acceptance');}
});
