import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {fixture,insert} from '../data/fixture';
import {seedPage} from '../../e2e/setup/fixtures';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';

test('decision succession erases copied successor content without following a reverse supersededBy annotation',async()=>{
 const f=await fixture(),now=f.ctx.now;
 for(const [id,pageId,content]of [
  ['prior',f.page.pageId,{question:'Original decision'}],
  ['successor',(await seedPage(f.page.containerId,{title:'Moved successor',authorMemberId:f.owner})).pageId,{question:'Copied decision',supersedesId:'prior'}],
  ['independent',(await seedPage(f.page.containerId,{title:'Independent prior decision',authorMemberId:f.owner})).pageId,{question:'Independent history',supersededBy:'prior'}],
 ] as const){
  await insert('knowledge_decisions',{id,workspace_id:f.workspaceId,page_id:pageId,question:content.question,created_at:now,updated_at:now,revision_id:`decision-${id}`});
  await insert('intelligence_revisions',{id:`decision-${id}`,workspace_id:f.workspaceId,entity_kind:'decision',entity_id:id,content_json:JSON.stringify(content),actor_id:f.owner,created_at:now});
 }
 await archivePage(f.ctx,f.page.pageId,{operationKey:'decision-chain-trash',expectedRevisionId:f.page.revisionId,action:'trash'});
 await permanentDeletePage(f.ctx,f.page.pageId,{operationKey:'decision-chain-erase',confirmedPageIds:[f.page.pageId]});
 expect(await env.DB.prepare("SELECT question,removed_at FROM knowledge_decisions WHERE id='successor'").first()).toEqual({question:'',removed_at:now});
 expect(await env.DB.prepare("SELECT content_json FROM intelligence_revisions WHERE id='decision-successor'").first()).toEqual({content_json:'{}'});
 expect(await env.DB.prepare("SELECT question,removed_at FROM knowledge_decisions WHERE id='independent'").first()).toEqual({question:'Independent history',removed_at:null});
});
