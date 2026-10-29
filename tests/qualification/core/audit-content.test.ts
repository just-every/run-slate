import {auditExportProof} from './audit-export-proof';
import {test,expect} from 'vitest';
import {auditFixture,env,createUlid} from './audit-support';
test('ACT-002 BASE-OPS-005 audit content, publication, archive and version mutations once with actor and time',async()=>{
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
 const erasedTitle='Erase audit',erasedBody='synthetic-slate-1401';
 const p=await f.page(erasedTitle);
 const write={operationKey:createUlid(),expectedRevisionId:await f.revision(p.id),blocks:[{id:createUlid(),blockType:'paragraph',treePosition:'1',content:{text:[{text:erasedBody}]}}]};
 expect((await f.request('PUT',`/api/pages/${p.id}/blocks`,write)).status).toBe(200);
 expect((await f.request('POST',`/api/pages/${p.id}/publish`,{operationKey:createUlid(),expectedRevisionId:await f.revision(p.id)})).status).toBe(200);
 const grant=await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'container',targetId:f.containerId,principalKind:'member',principalId:f.readerId,level:'view'});expect(grant.status).toBe(200);
 for(const action of ['archive','restore','trash'] as const)await f.mutation(action,`archive.${action}`,'POST',`/api/archive/${p.id}`,{expectedRevisionId:await f.revision(p.id),action,reason:'Explicit qualification action'});
 const before=await f.request('GET',`/api/activity?kind=page&containerId=${f.containerId}`);expect(before.status).toBe(200);
 const original=before.data.items.filter((item:any)=>item.target.id===p.id);expect(original.length).toBeGreaterThan(0);
 const old=(await env.DB.prepare('SELECT id FROM activity_entries WHERE target_id=?').bind(p.id).all<{id:string}>()).results;
 await f.mutation('permanent deletion','archive.permanent-delete','POST',`/api/archive/${p.id}/permanent-delete`,{confirmedPageIds:[p.id]});
 for(const row of old){const kept=await env.DB.prepare('SELECT actor_member_id,target_id,occurred_at FROM activity_entries WHERE id=?').bind(row.id).first();expect(kept).toMatchObject({actor_member_id:null});expect(Number.isFinite(Date.parse(String(kept!.occurred_at)))).toBe(true);}
 const retained=await f.request('GET',`/api/activity?kind=page&containerId=${f.containerId}`);expect(retained.status).toBe(200);
 for(const entry of original){const kept=retained.data.items.find((item:any)=>item.id===entry.id);expect(kept).toMatchObject({target:entry.target,occurredAt:entry.occurredAt,action:entry.action,deleted:true,actor:null,context:{}});expect(kept.context).toEqual({});}
 expect(JSON.stringify(retained.data)).not.toContain(erasedTitle);expect(JSON.stringify(retained.data)).not.toContain(erasedBody);
 expect((await f.request('PUT',`/api/pages/${p.id}/blocks`,write)).status).toBe(404);
 const erased=await f.request('GET',`/api/pages/${p.id}`);expect(erased.status).toBe(404);expect(JSON.stringify(erased.data)).not.toContain(erasedBody);
 const afterReplay=await f.request('GET',`/api/activity?kind=page&containerId=${f.containerId}`);
 expect(afterReplay.data.items.filter((item:any)=>item.target.id===p.id)).toEqual(retained.data.items.filter((item:any)=>item.target.id===p.id));
 const visible=await f.request('GET','/api/activity',undefined,f.readerId);expect(visible.status).toBe(200);expect(visible.data.items.some((item:any)=>item.target.id===p.id)).toBe(true);
 expect((await f.request('POST','/api/sharing',{operationKey:createUlid(),targetKind:'container',targetId:f.containerId,id:grant.data.value.id,principalKind:'member',principalId:f.readerId,level:'view',revoke:true})).status).toBe(200);
 const refused=await f.request('GET','/api/activity',undefined,f.readerId);expect(refused.status).toBe(200);expect(refused.data.items.some((item:any)=>item.target.id===p.id)).toBe(false);
}
{

 await f.profile({'page.version.v1':'labelled','page.lifecycle.v1':'draft-then-publish'});const p=await f.page('Version audit'),initial=p.revisionId;
 await f.request('PATCH',`/api/pages/${p.id}`,{operationKey:createUlid(),expectedRevisionId:await f.revision(p.id),properties:{title:'Second revision'}});
 await f.mutation('version restores','pages.restore','POST',`/api/revisions/${p.id}/${initial}/restore`,{expectedRevisionId:await f.revision(p.id)});
 await f.mutation('version deletions','versions.delete','DELETE',`/api/revisions/${p.id}/${initial}`,{});
}
await auditExportProof(f);
});
