import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,document,reset} from '../authority/fixture';
import {seedMember,seedWorkspace,sessionFor} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {stagePortabilityJob as stage,runPortabilityJob as run,getPortabilityJob as status} from '../../../src/core/features/portability/jobs';
import {latchR2} from './helpers';
beforeEach(reset);
test('PORT-003 guessed jobs and downloads never disclose to anonymous, wrong member or workspace',async()=>{
 const f=await fixture(),job=await stage(f.context(),'export','export-auth');expect((await run(f.context(),job.id)).state).toBe('completed');
 const other=await seedMember(f.workspaceId,{role:'owner',email:'other@port.test',displayName:'Other'}),foreign=await seedWorkspace(),outsider=await seedMember(foreign.workspaceId,{role:'owner',email:'foreign@port.test',displayName:'Foreign'}),app=createApi();
 for(const member of [undefined,f.reader,other.memberId,outsider.memberId]){const headers:Record<string,string>=member?{Cookie:await sessionFor(member)}:{};for(const path of [`jobs/${job.id}`,`${job.id}/download`]){const response=await app.request('https://slate.example/api/exports/'+path,{headers},env);expect([401,403,404]).toContain(response.status);expect(await response.text()).not.toContain('counts');}}
});
test('PORT-003 current owner revocation prevents run and download; private working coverage has no owner bypass',async()=>{
 const f=await fixture(),page=await document(f,'Private working content'),job=await stage(f.context(),'export','export-privileges');
 await env.DB.prepare("UPDATE pages SET author_member_id=?,lifecycle='draft',access_inheritance='restricted' WHERE id=?").bind(f.reader,page.id).run();await env.DB.prepare('DELETE FROM page_grants WHERE page_id=?').bind(page.id).run();
 await expect(stage(f.context(),'export','export-no-bypass')).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});await expect(run(f.context(),job.id)).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});await expect(status(f.context(),job.id)).rejects.toMatchObject({code:'EXPORT_SCOPE_INCOMPLETE'});
 await env.DB.prepare("UPDATE members SET role='member' WHERE id=?").bind(f.owner).run();await expect(run(f.context(),job.id)).rejects.toMatchObject({code:'FORBIDDEN'});
});
test('PORT-003 mid-run privilege revocation prevents publication even with a loaded owner context',async()=>{
 const f=await fixture(),job=await stage(f.context(),'export','export-mid-revoke'),latch=latchR2(f.context(),'federation/exports/'),running=run(latch.ctx,job.id);await latch.started;
 try{await env.DB.prepare("UPDATE members SET role='member' WHERE id=?").bind(f.owner).run();}finally{latch.release();}
 expect((await running).state).toBe('failed');expect(await env.FILES.head(`federation/exports/${job.id}/workspace.zip`)).toBeNull();const response=await createApi().request(`https://slate.example/api/exports/${job.id}/download`,{headers:{Cookie:await sessionFor(f.owner)}},env);expect(response.status).toBe(403);
});
