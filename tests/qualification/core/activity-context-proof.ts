import {expect} from 'vitest';
import {env,createUlid,auditFixture} from './audit-support';

/** Native commits, current reads and retained bytes share the existing audit journey. */
export async function activityContextProof(f:Awaited<ReturnType<typeof auditFixture>>) {
 const p=await f.page('Context original');
 const change=await f.mutation('referenced revision','pages.update','PATCH',`/api/pages/${p.id}`,{expectedRevisionId:p.revisionId,properties:{title:'Context changed'}});
 const created=await f.mutation('referenced comment','comments.create','POST',`/api/comments/page/${p.id}`,{body:[{text:'Context comment'}]});
 const edited=await f.mutation('referenced comment edit','comments.edit','PATCH',`/api/comments/${created.value.id}`,{expectedRevisionId:created.value.revisionId,body:[{text:'Context edited'}]});
 const reaction=await f.mutation('referenced comment reaction','comments.reaction','POST',`/api/comments/page/${p.id}/reaction`,{commentId:created.value.id,emoji:'👍'});
 const resolved=await f.mutation('referenced thread','comments.resolve','POST',`/api/comments/thread/${created.value.threadId}/resolve`,{expectedRevisionId:edited.value.revisionId,resolved:true});
 const grant=await f.mutation('referenced grant','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:p.id,principalKind:'member',principalId:f.readerId,level:'view'});
 const retained=async()=> (await env.DB.prepare('SELECT * FROM activity_entries WHERE workspace_id=? ORDER BY id').bind(f.workspaceId).all()).results;
 const before=JSON.stringify(await retained());
 const timeline=await f.request('GET','/api/activity?limit=100');expect(timeline.status).toBe(200);
 const context=(receipt:{receipt:{activityId:string}})=>timeline.data.items.find((item:{id:string})=>item.id===receipt.receipt.activityId)?.context;
 expect(context(change)).toMatchObject({pageId:p.id,revisionId:change.value.revisionId});
 for(const mutation of [created,edited]) {
  expect(context(mutation)).toMatchObject({pageId:p.id,threadId:created.value.threadId,commentId:created.value.id});
  expect(context(mutation)).not.toHaveProperty('revisionId');
 }
 expect(context(reaction)).toMatchObject({pageId:p.id,commentId:created.value.id});expect(context(reaction)).not.toHaveProperty('revisionId');
 expect(context(resolved)).toMatchObject({pageId:p.id,threadId:created.value.threadId});expect(context(resolved)).not.toHaveProperty('revisionId');
 expect(context(grant)).toMatchObject({pageId:p.id,grantId:grant.value.id});expect(context(grant)).not.toHaveProperty('revisionId');
 const revision=await f.request('GET',`/api/revisions/${p.id}/${change.value.revisionId}`);expect(revision.status).toBe(200);expect(revision.data.properties.title).toBe('Context changed');
 const comments=await f.request('GET',`/api/comments/page/${p.id}`);expect(comments.status).toBe(200);expect(comments.data.comments.find((item:{id:string})=>item.id===created.value.id).body).toEqual([{text:'Context edited'}]);
 const grants=await f.request('GET',`/api/sharing/pages/${p.id}`);expect(grants.status).toBe(200);expect(grants.data.items.find((item:{id:string})=>item.id===grant.value.id)).toMatchObject({principalId:f.readerId,level:'view'});
 expect(JSON.stringify(await retained())).toBe(before);
 expect((await f.request('GET',`/api/pages/${p.id}`,undefined,f.readerId)).status).toBe(200);
 await f.mutation('revoked grant context','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:p.id,id:grant.value.id,principalKind:'member',principalId:f.readerId,level:'view',revoke:true});
 const revokedBefore=JSON.stringify(await retained());
 const denied=await f.request('GET','/api/activity?limit=100',undefined,f.readerId);expect(denied.status).toBe(200);expect(denied.data.items.some((item:{context:{pageId?:string}})=>item.context.pageId===p.id)).toBe(false);
 for(const path of [`/api/pages/${p.id}`,`/api/comments/page/${p.id}`,`/api/revisions/${p.id}/${change.value.revisionId}`,`/api/sharing/pages/${p.id}`]) {const result=await f.request('GET',path,undefined,f.readerId);expect(result.status).toBeGreaterThanOrEqual(400);expect(JSON.stringify(result.data)).not.toMatch(/Context original|Context changed|Context edited/);}
 expect(JSON.stringify(await retained())).toBe(revokedBefore);
 const space=await f.request('POST','/api/containers',{operationKey:createUlid(),name:'Context grant space',visibility:'private'});expect(space.status).toBe(200);
 const spaceId=space.data.value.id;
 const spaceGrant=await f.mutation('referenced space grant','sharing.grant','POST','/api/sharing',{targetKind:'container',targetId:spaceId,principalKind:'member',principalId:f.readerId,level:'view'});
 const spaceBefore=JSON.stringify(await retained());
 const spaceTimeline=await f.request('GET','/api/activity?limit=100');expect(spaceTimeline.status).toBe(200);
 expect(spaceTimeline.data.items.find((item:{id:string})=>item.id===spaceGrant.receipt.activityId)).toMatchObject({target:{kind:'container',id:spaceId},context:{grantId:spaceGrant.value.id}});
 expect((await f.request('GET',`/api/containers/${spaceId}`,undefined,f.readerId)).status).toBe(200);
 expect(JSON.stringify(await retained())).toBe(spaceBefore);
 await f.mutation('revoked space grant','sharing.grant','POST','/api/sharing',{targetKind:'container',targetId:spaceId,id:spaceGrant.value.id,principalKind:'member',principalId:f.readerId,level:'view',revoke:true});
 const refused=await f.request('GET',`/api/containers/${spaceId}`,undefined,f.readerId);expect(refused.status).toBe(404);expect(JSON.stringify(refused.data)).not.toContain('Context grant space');
 const readerTimeline=await f.request('GET','/api/activity?limit=100',undefined,f.readerId);expect(readerTimeline.status).toBe(200);expect(readerTimeline.data.items.some((item:{target:{id:string}})=>item.target.id===spaceId)).toBe(false);
}
