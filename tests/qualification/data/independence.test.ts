import {env,SELF} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {fixture} from './fixture';
import {createPage,updatePage} from '../../../src/core/features/pages/service';
import {seedContainerGrant} from '../../e2e/setup/fixtures';
import {search} from '../../../src/core/features/search/service';
import {readPage} from '../../../src/core/features/pages/service';
const log=()=> (env as unknown as {DATA_PROOF_LOG:Fetcher}).DATA_PROOF_LOG;
test('BASE-DATA-005 ordinary local operation remains usable while all author, marketplace and external HTTP is denied',async()=>{
 await log().fetch('https://boundary.invalid',{method:'DELETE'});
 await expect.poll(async()=>(await SELF.fetch('http://localhost:8787/health')).status).toBe(200);
 const health=await SELF.fetch('http://localhost:8787/health');expect(health.status).toBe(200);
 const {ctx,page}=await fixture();await seedContainerGrant(page.containerId,{principalKind:'member',principalId:ctx.actor.id,level:'full'});
 const created=await createPage(ctx,{operationKey:'data-offline-create',containerId:page.containerId,title:'Offline independence canary'});
 const updated=await updatePage(ctx,created.value.pageId,{operationKey:'data-offline-update',expectedRevisionId:created.receipt.revisionId,properties:{title:'Offline owner edit'}});
 expect(updated.receipt.activityId).toBeTruthy();expect((await readPage(ctx,created.value.pageId)).properties.title).toBe('Offline owner edit');
 expect((await search(ctx,{query:'Offline owner edit'})).items.some(r=>r.id===created.value.pageId)).toBe(true);
 expect(await(await log().fetch('https://boundary.invalid')).json()).toEqual([]);
});
