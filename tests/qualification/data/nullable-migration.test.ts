import {env,applyD1Migrations} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {fixture} from './fixture';
import {seedPage,seedPageGrant} from '../../e2e/setup/fixtures';
import {archivePage} from '../../../src/core/features/archive/service';
test('BASE-DATA-003 0015 preserves every existing archive column and native null/non-null restore position',async()=>{
 const {ctx,page,owner}=await fixture();await archivePage(ctx,page.pageId,{operationKey:'before-upgrade-archive',expectedRevisionId:page.revisionId,action:'archive',reason:'Existing retained personal reason'});
 const before=(await env.DB.prepare('SELECT * FROM content_archive_locations ORDER BY page_id').all()).results;expect(before).toHaveLength(1);expect(before[0]!.prior_position).toBe(page.pageId);
 await applyD1Migrations(env.DB,(env as unknown as {TEST_UPGRADE:Parameters<typeof applyD1Migrations>[1]}).TEST_UPGRADE);
 expect((await env.DB.prepare('SELECT * FROM content_archive_locations ORDER BY page_id').all()).results).toEqual(before);
 expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
 await archivePage(ctx,page.pageId,{operationKey:'after-upgrade-restore',expectedRevisionId:page.revisionId,action:'restore'});expect(await env.DB.prepare('SELECT tree_position FROM pages WHERE id=?').bind(page.pageId).first()).toEqual({tree_position:page.pageId});
 const nullable=await seedPage(page.containerId,{title:'Nullable position',authorMemberId:owner});await seedPageGrant(nullable.pageId,{principalKind:'member',principalId:owner,level:'full'});await env.DB.prepare('UPDATE pages SET tree_position=NULL WHERE id=?').bind(nullable.pageId).run();
 await archivePage(ctx,nullable.pageId,{operationKey:'after-upgrade-null-trash',expectedRevisionId:nullable.revisionId,action:'trash'});expect(await env.DB.prepare('SELECT prior_position FROM content_archive_locations WHERE page_id=?').bind(nullable.pageId).first()).toEqual({prior_position:null});
 await archivePage(ctx,nullable.pageId,{operationKey:'after-upgrade-null-restore',expectedRevisionId:nullable.revisionId,action:'restore'});expect(await env.DB.prepare('SELECT tree_position,parent_page_id,container_id FROM pages WHERE id=?').bind(nullable.pageId).first()).toEqual({tree_position:null,parent_page_id:null,container_id:page.containerId});expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
