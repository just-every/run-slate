import {it,expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {sessionFor} from '../../e2e/setup/fixtures';
import {fixture,ids,env,databaseState,seedContainer,previewMove} from './fixture';
it('validates HTTP selectors and confirms the relative preview shape on the real API',async()=>{
 const f=await fixture([null,'','z']),order=await ids(f.containerId),id=order[2],cookie=await sessionFor(f.memberId),api=createApi();
 const post=async(path:string,body:unknown)=>api.request('https://slate.example/api/pages/'+id+'/'+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)},env);
 const selector={containerId:f.containerId,beforeId:order[0]};const response=await post('move-preview',selector);expect(response.status).toBe(200);const preview=await response.json() as Record<string,unknown>;expect(Object.keys(preview).sort()).toEqual(['changes','accessPreviewHash','orderPreviewHash'].sort());
 const before=await databaseState();
 for(const body of [{...selector,treePosition:'x'},{...selector,afterId:order[1]},{containerId:f.containerId,beforeId:null},null]){expect((await post('move-preview',body)).status).toBe(400);}
 const after=await databaseState();const {request_limits:priorLimits,...priorDomain}=before;const {request_limits:afterLimits,...afterDomain}=after;expect(afterDomain).toEqual(priorDomain);expect(afterLimits).not.toEqual(priorLimits);
 const moved=await post('move',{...selector,...preview,operationKey:crypto.randomUUID(),expectedRevisionId:f.pages[2].revisionId});expect(moved.status).toBe(200);expect(await ids(f.containerId)).toEqual([id,...order.slice(0,2)]);
});
it('rejects a visible anchor in the wrong destination and an archived anchor',async()=>{
 const f=await fixture(),[id,anchor]=await ids(f.containerId),other=await seedContainer(f.workspaceId,{ownerMemberId:f.memberId,visibility:'open'});
 await expect(previewMove(f.ctx,id,{containerId:other.containerId,beforeId:anchor})).rejects.toMatchObject({status:404});
 await env.DB.prepare('UPDATE pages SET archived_at=? WHERE id=?').bind(f.ctx.now,anchor).run();const before=await databaseState();await expect(previewMove(f.ctx,id,{containerId:f.containerId,beforeId:anchor})).rejects.toMatchObject({code:'PAGE_READ_ONLY'});expect(await databaseState()).toEqual(before);
});
