import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {reset,document} from '../authority/fixture';
import {sessionFor,seedMember} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {stagePortabilityJob as stage,runPortabilityJob as run,getPortabilityJob as status} from '../../../src/core/features/portability/jobs';
import {readJob} from '../../../src/core/features/portability/jobs-store';
import {decodeArchive,encodeArchive,byteHash} from '../../../src/core/features/portability/archive';
import {prepareInvalidateExports} from '../../../src/core/features/portability/invalidation';
import {archivedFixture,latchR2,faultR2,lostCompletion} from './helpers';
beforeEach(reset);
test('PORT-003 restore stages, runs, atomically remaps status and resets native sessions',async()=>{
 const {source,target,bytes}=await archivedFixture(),app=createApi(),oldCookie=await sessionFor(target.owner),body=new FormData();body.set('file',new File([bytes as Uint8Array<ArrayBuffer>],'private-archive-name.zip'));body.set('operationKey','restore-api');
 const admitted=await app.request('https://slate.example/api/exports/jobs/restore',{method:'POST',headers:{Cookie:oldCookie,Origin:'https://slate.example'},body},env);expect(admitted.status).toBe(202);const job=await admitted.json() as {id:string;state:string};expect(job.state).toBe('queued');
 const finalResponse=await app.request(`https://slate.example/api/exports/jobs/${job.id}/run`,{method:'POST',headers:{Cookie:oldCookie,Origin:'https://slate.example'}},env);expect(finalResponse.status).toBe(200);const final=await finalResponse.json() as {state:string;reconnect:string[];counts:Record<string,number>};expect(final.state).toBe('completed');expect(final.reconnect.length).toBeGreaterThan(0);expect(Object.keys(final.counts)).toHaveLength(106);
 const get=(cookie?:string)=>app.request('https://slate.example/api/exports/jobs/'+job.id,{headers:cookie?{Cookie:cookie}:{}},env);
 expect((await get(oldCookie)).status).toBe(401);expect((await get()).status).toBe(401);const fresh=await get(await sessionFor(source.owner));expect(fresh.status).toBe(200);expect((await fresh.json() as {state:string}).state).toBe('completed');
 const other=await seedMember(source.workspaceId,{role:'owner',email:'other@restore.test',displayName:'Other'});expect((await get(await sessionFor(other.memberId))).status).toBe(404);
 const row=(await readJob(source.context(),job.id))!;expect(row.admission_actor_id).toBe(target.owner);expect(row.status_actor_id).toBe(source.owner);expect(row.cleanup_json).toBe('[]');expect(await env.FILES.head(row.source_archive_key!)).toBeNull();expect(await env.DB.prepare('SELECT count(*) n FROM search_text').first<number>('n')).toBeGreaterThan(0);
 expect(JSON.stringify(final)).not.toContain('private-archive-name');expect(JSON.stringify(final)).not.toContain('owner@authority');
});
test('PORT-003 restore Running is observable and duplicate stage does not delete winning source',async()=>{
 const {target,bytes}=await archivedFixture();const [a,b]=await Promise.all([stage(target.context(),'restore','restore-race',bytes),stage(target.context(),'restore','restore-race',bytes)]);expect(a.id).toBe(b.id);const staged=(await readJob(target.context(),a.id))!;expect(await env.FILES.head(staged.source_archive_key!)).not.toBeNull();
 const different=bytes.slice();different[0]^=1;await expect(stage(target.context(),'restore','restore-race',different)).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
 const latch=latchR2(target.context(),'federation/restore/'),running=run(latch.ctx,a.id);await latch.started;try{expect((await status(target.context(),a.id)).state).toBe('running');expect((await run(target.context(),a.id)).state).toBe('running');}finally{latch.release();}expect((await running).state).toBe('completed');
});
test('PORT-003 D1 rollback keeps bootstrap and sessions, persists Failed, deletes originals',async()=>{
 const {target,bytes}=await archivedFixture(),cookie=await sessionFor(target.owner),job=await stage(target.context(),'restore','restore-rollback',bytes);const before=(await env.FILES.list({prefix:'federation/restore/'})).objects.map(o=>o.key);
 await env.DB.prepare("CREATE TRIGGER portability_test_restore_abort BEFORE INSERT ON search_text BEGIN SELECT RAISE(ABORT,'labelled D1 failure'); END").run();
 try{const result=await run(target.context(),job.id);expect(result.state).toBe('failed');expect(result.report.code).toBe('RESTORE_FAILED');expect(await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(target.owner).first()).not.toBeNull();expect(await env.DB.prepare('SELECT count(*) n FROM pages').first<number>('n')).toBe(0);expect((await env.FILES.list({prefix:'federation/restore/'})).objects.map(o=>o.key)).toEqual(before);
 const response=await createApi().request('https://slate.example/api/exports/jobs/'+job.id,{headers:{Cookie:cookie}},env);expect(response.status).toBe(200);expect((await response.json() as {state:string}).state).toBe('failed');}finally{await env.DB.prepare('DROP TRIGGER portability_test_restore_abort').run();}
});
test('PORT-003 lost R2 source and original acknowledgements are journaled and cleaned',async()=>{
 const {target,bytes}=await archivedFixture(),staging=await stage(faultR2(target.context(),'put',true),'restore','restore-put-stage',bytes);expect(staging.state).toBe('failed');const stagedRow=(await readJob(target.context(),staging.id))!;expect(await env.FILES.head(stagedRow.source_archive_key!)).toBeNull();
 const job=await stage(target.context(),'restore','restore-put-original',bytes),final=await run(faultR2(target.context(),'put',true),job.id);expect(final.state).toBe('failed');const row=(await readJob(target.context(),job.id))!;expect((JSON.parse(row.cleanup_json) as string[]).length).toBeGreaterThan(0);for(const key of JSON.parse(row.cleanup_json) as string[])expect(await env.FILES.head(key)).toBeNull();
});
test('PORT-003 committed D1 with lost response preserves originals and Completed witness',async()=>{
 const {source,target,bytes}=await archivedFixture(),job=await stage(target.context(),'restore','restore-lost-completion',bytes),result=await run(lostCompletion(target.context()),job.id);expect(result.state).toBe('completed');expect((await status(source.context(),job.id)).state).toBe('completed');const key=await env.DB.prepare('SELECT archive_key FROM federation_imports LIMIT 1').first<string>('archive_key');expect(await(await env.FILES.get(key!))!.text()).toBe('Portability real original');
});
test('PORT-003 unreadable completion witness preserves originals for reconciliation',async()=>{
 const {source,target,bytes}=await archivedFixture(),job=await stage(target.context(),'restore','restore-unreadable',bytes);await expect(run(lostCompletion(target.context(),true),job.id)).rejects.toThrow('witness');expect((await status(source.context(),job.id)).state).toBe('completed');const key=await env.DB.prepare('SELECT archive_key FROM federation_imports LIMIT 1').first<string>('archive_key');expect(await env.FILES.head(key!)).not.toBeNull();
});
test('PORT-003 restore erasure and expired lease fence late original publication',async()=>{
 const {target,bytes}=await archivedFixture(),job=await stage(target.context(),'restore','restore-interrupted',bytes),latch=latchR2(target.context(),'federation/restore/'),running=run(latch.ctx,job.id);await latch.started;
 try{await env.DB.batch(prepareInvalidateExports(target.context()));expect((await status(target.context(),job.id)).report.code).toBe('INVALIDATED');}finally{latch.release();}
 expect((await running).state).toBe('failed');expect(await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(target.owner).first()).not.toBeNull();const row=(await readJob(target.context(),job.id))!;for(const key of JSON.parse(row.cleanup_json) as string[])expect(await env.FILES.head(key)).toBeNull();
});
test('PORT-003 completed restore retention and erasure exclude committed originals',async()=>{
 const {source,target,bytes}=await archivedFixture(),job=await stage(target.context(),'restore','restore-retention',bytes);expect((await run(target.context(),job.id)).state).toBe('completed');const key=await env.DB.prepare('SELECT archive_key FROM federation_imports LIMIT 1').first<string>('archive_key');
 await env.DB.batch(prepareInvalidateExports(source.context()));expect((await status(source.context(),job.id)).state).toBe('failed');expect(await env.FILES.head(key!)).not.toBeNull();await env.DB.prepare("UPDATE portability_jobs SET expires_at='2000-01-01' WHERE id=?").bind(job.id).run();await expect(status(source.context(),job.id)).rejects.toMatchObject({code:'NOT_FOUND'});expect(await env.FILES.head(key!)).not.toBeNull();
});
test('PORT-003 admission rejects corrupt archives and mismatched owner without staged objects',async()=>{
 const {target,bytes}=await archivedFixture();await expect(stage(target.context(),'restore','restore-corrupt',new Uint8Array([1,2]))).rejects.toThrow();const {manifest,entries}=await decodeArchive(bytes);manifest.tables.members!.find(m=>m.is_setup_owner===1)!.email='unmatched@owner.test';const changed=await encodeArchive(manifest,entries);await expect(stage(target.context(),'restore','restore-wrong-owner',changed)).rejects.toMatchObject({code:'RESTORE_OWNER_MISSING'});expect(await env.DB.prepare('SELECT count(*) n FROM portability_jobs').first<number>('n')).toBe(0);
});
test('PORT-003 interrupted source staging stays failed when its original put returns late',async()=>{
 const {target,bytes}=await archivedFixture(),latch=latchR2(target.context(),'federation/staging/'),staging=stage(latch.ctx,'restore','restore-staging-interrupted',bytes);await latch.started;
 const replay=await stage(target.context(),'restore','restore-staging-interrupted',bytes);
 try{expect(replay.state).toBe('queued');await expect(run(target.context(),replay.id)).rejects.toMatchObject({code:'STAGING_IN_PROGRESS'});await env.DB.prepare("UPDATE portability_jobs SET lease_until='2000-01-01' WHERE id=?").bind(replay.id).run();expect((await status(target.context(),replay.id)).report.code).toBe('INTERRUPTED');}finally{latch.release();}
 expect((await staging).state).toBe('failed');const row=(await readJob(target.context(),replay.id))!;expect(await env.FILES.head(row.source_archive_key!)).toBeNull();
});
test('PORT-003 expired restore claim cannot publish or replay after recovery',async()=>{
 const {target,bytes}=await archivedFixture(),job=await stage(target.context(),'restore','restore-expired-claim',bytes),latch=latchR2(target.context(),'federation/restore/'),running=run(latch.ctx,job.id);await latch.started;
 try{await env.DB.prepare("UPDATE portability_jobs SET lease_until='2000-01-01' WHERE id=?").bind(job.id).run();expect((await status(target.context(),job.id)).report.code).toBe('INTERRUPTED');}finally{latch.release();}
 expect((await running).state).toBe('failed');expect((await run(target.context(),job.id)).state).toBe('failed');expect(await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(target.owner).first()).not.toBeNull();
 const row=(await readJob(target.context(),job.id))!;for(const key of JSON.parse(row.cleanup_json) as string[])expect(await env.FILES.head(key)).toBeNull();
});
test('PORT-003 restore revalidates a populated target after staging and persists Failed',async()=>{
 const {target,bytes}=await archivedFixture(),job=await stage(target.context(),'restore','restore-became-nonempty',bytes);
 await document(target,'New target records after staging');
 const result=await run(target.context(),job.id);expect(result.state).toBe('failed');expect(result.report.code).toBe('RESTORE_NOT_EMPTY');
});
test('PORT-003 lost source-ready acknowledgement retains the winning staged archive',async()=>{
 const {target,bytes}=await archivedFixture(),ctx=target.context();
 // Labelled transport fault only: the real local D1 source-ready transaction commits first.
 const db=new Proxy(ctx.db,{get(database,property){if(property==='batch')return async(statements:D1PreparedStatement[])=>{const result=await database.batch(statements);if(await database.prepare("SELECT id FROM portability_jobs WHERE operation_key='restore-stage-ack' AND source_ready=1").first())throw new Error('labelled lost staging acknowledgement');return result;};const value=Reflect.get(database,property);return typeof value==='function'?value.bind(database):value;}});
 const job=await stage({...ctx,db},'restore','restore-stage-ack',bytes);expect(job.state).toBe('queued');const row=(await readJob(ctx,job.id))!;expect(await env.FILES.head(row.source_archive_key!)).not.toBeNull();expect((await run(target.context(),job.id)).state).toBe('completed');
});

test('PORT-003 archive rejects unreferenced originals before they can become orphaned restore blobs',async()=>{
 const {target,bytes}=await archivedFixture(),{manifest,entries}=await decodeArchive(bytes),extra=new TextEncoder().encode('unreferenced test-only original'),entry=`blobs/${manifest.blobs.length}`;
 manifest.blobs.push({key:'unreferenced-original',entry,hash:await byteHash(extra),size:extra.length});
 await expect(stage(target.context(),'restore','restore-extra-blob',await encodeArchive(manifest,{...entries,[entry]:extra}))).rejects.toMatchObject({code:'CORRUPT_ARCHIVE'});
 expect(await env.DB.prepare('SELECT count(*) n FROM portability_jobs').first<number>('n')).toBe(0);
});
test('PORT-003 run rejects a staged object that changed after content-bound admission',async()=>{
 const {target,bytes}=await archivedFixture(),job=await stage(target.context(),'restore','restore-source-changed',bytes),row=(await readJob(target.context(),job.id))!;
 await env.FILES.put(row.source_archive_key!,'labelled changed R2 original');
 const result=await run(target.context(),job.id);expect(result.state).toBe('failed');expect(result.report.code).toBe('STAGED_ARCHIVE_CHANGED');expect(await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(target.owner).first()).not.toBeNull();
});
