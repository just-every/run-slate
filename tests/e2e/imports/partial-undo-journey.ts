import {expect} from 'vitest';
import {env} from 'cloudflare:test';
import {createApi} from '../../../src/core/app/hono';
import {seedWorkspace,seedMember,seedContainer,sessionFor} from '../setup/fixtures';

/** Reverse real staged batches before atomic publication, preserving native work. */
export async function partialUndoJourney() {
 const {workspaceId}=await seedWorkspace();
 const owner=await seedMember(workspaceId,{email:['synthetic-slate-5','example.test'].join('@'),displayName:'Synthetic Slate owner',role:'owner',isSetupOwner:true});
 const container=await seedContainer(workspaceId,{ownerMemberId:owner.memberId,visibility:'open'});
 const cookie=await sessionFor(owner.memberId),app=createApi();
 const call=async(path:string,body?:unknown)=>{
  const response=await app.request(`https://slate.example${path}`,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})},env);
  const data=await response.json() as any;expect(response.status,JSON.stringify(data)).toBe(200);return data;
 };
 await call('/api/sharing',{operationKey:crypto.randomUUID(),targetKind:'container',targetId:container.containerId,principalKind:'member',principalId:owner.memberId,level:'full'});
 const native=await call('/api/pages',{operationKey:crypto.randomUUID(),containerId:container.containerId,title:'Native page before partial import'});
 const before=await call(`/api/pages/${native.value.pageId}`);
 const name='notion-workspace-export.zip',bytes=await (await (env as typeof env&{TEST_IMPORT_FIXTURES:Fetcher}).TEST_IMPORT_FIXTURES.fetch(`https://fixtures/${name}`)).arrayBuffer();
 const form=new FormData();form.set('file',new File([bytes],name));form.set('format','notion-workspace');form.set('operationKey',crypto.randomUUID());
 let job=await call('/api/imports',form);job=await call(`/api/imports/${job.id}/preview`,{});
 job=await call(`/api/imports/${job.id}/apply`,{fingerprint:job.report.fingerprint});
 let staged:string[]=[];
 for(let n=0;n<100;n++){
  job=await call(`/api/imports/${job.id}/resume`,{});
  staged=(await env.DB.prepare('SELECT id FROM pages WHERE id!=? ORDER BY id').bind(native.value.pageId).all<{id:string}>()).results.map(row=>row.id);
  if(job.state==='running'&&staged.length)break;
 }
 expect(job.state).toBe('running');expect(staged.length).toBeGreaterThan(0);
 expect(await env.DB.prepare('SELECT native_published FROM federation_imports WHERE id=?').bind(job.id).first('native_published')).toBe(0);
 expect((await app.request(`https://slate.example/api/pages/${staged[0]}`,{headers:{Cookie:cookie}},env)).status).toBe(404);
 job=await call(`/api/imports/${job.id}/undo`,{});
 for(let n=0;job.state!=='undone'&&n<150;n++)job=await call(`/api/imports/${job.id}/resume`,{});
 expect(job.state).toBe('undone');
 expect((await env.DB.prepare('SELECT id FROM pages ORDER BY id').all()).results).toEqual([{id:native.value.pageId}]);
 expect((await env.DB.prepare('SELECT id FROM containers ORDER BY id').all()).results).toEqual([{id:container.containerId}]);
 expect(await env.DB.prepare('SELECT count(*) n FROM files').first('n')).toBe(0);
 expect(await call(`/api/pages/${native.value.pageId}`)).toEqual(before);
 const original=await app.request(`https://slate.example/api/imports/${job.id}/original`,{headers:{Cookie:cookie}},env);
 expect(original.status).toBe(200);expect(new Uint8Array(await original.arrayBuffer())).toEqual(new Uint8Array(bytes));
}
