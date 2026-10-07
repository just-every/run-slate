import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {fixture,insert,canary} from '../data/fixture';
import {seedPage} from '../../e2e/setup/fixtures';
import {archivePage,permanentDeletePage} from '../../../src/core/features/archive/service';

test('erasure reaches the end of a 64-method cycle without a depth cutoff',async()=>{
 const f=await fixture(),host=await seedPage(f.page.containerId,{title:'Independent host',authorMemberId:f.owner});
 for(let i=0;i<64;i++){
  await insert('intelligence_skills',{id:`deep-${i}`,workspace_id:f.workspaceId,page_id:host.pageId,owner_id:f.owner,name:canary,current_revision_id:`deep-version-${i}`,created_at:f.ctx.now,updated_at:f.ctx.now});
  await insert('intelligence_skill_versions',{id:`deep-version-${i}`,skill_id:`deep-${i}`,state:'active',definition_json:JSON.stringify({nested:{refs:i?[{sourceId:`deep-${i-1}`}]:[{sourceId:f.page.pageId},{revisionId:'deep-version-63'}]},text:canary}),created_at:f.ctx.now});
 }
 await archivePage(f.ctx,f.page.pageId,{operationKey:'deep-source-trash',expectedRevisionId:f.page.revisionId,action:'trash'});
 await permanentDeletePage(f.ctx,f.page.pageId,{operationKey:'deep-source-erase',confirmedPageIds:[f.page.pageId]});
 expect(await env.DB.prepare("SELECT count(*) n FROM intelligence_skills WHERE workspace_id=? AND name=''").bind(f.workspaceId).first()).toEqual({n:64});
 expect(await env.DB.prepare("SELECT count(*) n FROM intelligence_skill_versions WHERE skill_id IN (SELECT id FROM intelligence_skills WHERE workspace_id=?) AND state='retired' AND definition_json='{}'").bind(f.workspaceId).first()).toEqual({n:64});
 expect(await env.DB.prepare('SELECT title,deleted_at FROM pages WHERE id=?').bind(host.pageId).first()).toEqual({title:'Independent host',deleted_at:null});
});
