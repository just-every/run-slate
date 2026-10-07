import {pageRow,revisionStatement,snapshot} from '../../../src/core/features/pages/repository';
import {archivePage} from '../../../src/core/features/archive/service';
import {fixture,env,seedContainer,seedContainerGrant,seedPage} from '../tree-order/fixture';
export * from '../tree-order/fixture';
export async function treeFixture() {
 const f=await fixture(),root=f.pages[0].pageId;
 const child=(await seedPage(f.containerId,{title:'Archive child',authorMemberId:f.memberId,parentPageId:root})).pageId;
 const destination=(await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'open'})).containerId;
 await seedContainerGrant(destination,{principalKind:'member',principalId:f.memberId,level:'edit'});
 for(const id of [root,child]){const row=await pageRow(f.ctx,id);await env.DB.batch([await revisionStatement(f.ctx,id,row.working_revision_id,await snapshot(f.ctx,row))]);}
 const archive=async(id:string,action:'archive'|'restore'|'trash'='archive')=>archivePage(f.ctx,id,{operationKey:crypto.randomUUID(),expectedRevisionId:(await pageRow(f.ctx,id)).revision_id,action});
 return {...f,root,child,destination,archive};
}
export async function rows(ids:string[]) {
 const result=[];
 for(const id of ids) result.push({page:await env.DB.prepare('SELECT * FROM pages WHERE id=?').bind(id).first(),revisions:(await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id').bind(id).all()).results,events:(await env.DB.prepare('SELECT * FROM content_events WHERE page_id=? ORDER BY kind,revision_id').bind(id).all()).results});
 return result;
}
