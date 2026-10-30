import {auditRetrievalProof} from './audit-retrieval-proof';
import {auditExportProof} from './audit-export-proof';
import {test,expect} from 'vitest';
import {auditFixture,env,createUlid} from './audit-support';
test('ACT-002 BASE-OPS-005 audit content, publication, archive and version mutations once with actor/time',async()=>{
 const f=await auditFixture();
{
 const p=await f.mutation('page creation','pages.create','POST','/api/pages',{containerId:f.containerId,title:'Audit original'}),id=p.value.pageId;
 await f.mutation('body changes','pages.blocks.replace','PUT',`/api/pages/${id}/blocks`,{expectedRevisionId:await f.revision(id),blocks:[{id:createUlid(),blockType:'paragraph',treePosition:'1',content:{text:[{text:'Audit body'}]}}]});
 await f.mutation('property changes','pages.update','PATCH',`/api/pages/${id}`,{expectedRevisionId:await f.revision(id),properties:{title:'Audit changed'}});
 const destination=await f.request('POST','/api/containers',{operationKey:createUlid(),name:'Audit destination',visibility:'private'});expect(destination.status).toBe(200);
 const preview=await f.request('POST',`/api/pages/${id}/move-preview`,{containerId:destination.data.value.id});expect(preview.status).toBe(200);
 await f.mutation('page moves','pages.move','POST',`/api/pages/${id}/move`,{expectedRevisionId:await f.revision(id),containerId:destination.data.value.id,treePosition:"1",accessPreviewHash:preview.data.accessPreviewHash});
}
{
 await f.profile({'page.lifecycle.v1':'draft-then-publish'});const p=await f.page('Publication audit');
 await f.mutation('publish','pages.publish','POST',`/api/pages/${p.id}/publish`,{expectedRevisionId:await f.revision(p.id)});
}
{
 const p=await f.page('Erase audit');
 for(const action of ['archive','restore','trash'] as const)await f.mutation(action,`archive.${action}`,'POST',`/api/archive/${p.id}`,{expectedRevisionId:await f.revision(p.id),action,reason:'Explicit qualification action'});
 const old=(await env.DB.prepare('SELECT id FROM activity_entries WHERE target_id=?').bind(p.id).all<{id:string}>()).results;
 await f.mutation('permanent deletion','archive.permanent-delete','POST',`/api/archive/${p.id}/permanent-delete`,{confirmedPageIds:[p.id]});
 for(const row of old){const kept=await env.DB.prepare('SELECT actor_member_id,target_id,occurred_at FROM activity_entries WHERE id=?').bind(row.id).first();expect(kept).toMatchObject({actor_member_id:null});expect(Number.isFinite(Date.parse(String(kept!.occurred_at)))).toBe(true);}
}
{

 await f.profile({'page.version.v1':'labelled','page.lifecycle.v1':'draft-then-publish'});const p=await f.page('Version audit'),initial=p.revisionId;
 await f.request('PATCH',`/api/pages/${p.id}`,{operationKey:createUlid(),expectedRevisionId:await f.revision(p.id),properties:{title:'Second revision'}});
 await f.mutation('version restores','pages.restore','POST',`/api/revisions/${p.id}/${initial}/restore`,{expectedRevisionId:await f.revision(p.id)});
 await f.mutation('version deletions','versions.delete','DELETE',`/api/revisions/${p.id}/${initial}`,{});
}
await auditExportProof(f);
await auditRetrievalProof();
});
