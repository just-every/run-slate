import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document} from '../authority/fixture';
import {stagePortabilityJob as stage,runPortabilityJob as run,getPortabilityJob as status} from '../../../src/core/features/portability/jobs';
import {readJob} from '../../../src/core/features/portability/jobs-store';
import {prepareInvalidateExports} from '../../../src/core/features/portability/invalidation';
import {decodeArchive} from '../../../src/core/features/portability/archive';
import {exportWorkspace} from '../../../src/core/features/portability/service';
import {latchR2,faultR2} from './helpers';
beforeEach(reset);
test('PORT-003 committed Queued, concurrent Running, canonical counts, download, and duplicate no-work',async()=>{
 const f=await fixture();await document(f,'Export original');const j=await stage(f.context(),'export','export-life');
 expect(j.state).toBe('queued');expect(j.counts).toEqual({});expect((await status(f.context(),j.id)).state).toBe('queued');
 const latch=latchR2(f.context(),'federation/exports/'),running=run(latch.ctx,j.id);await latch.started;
 try{expect((await status(f.context(),j.id)).state).toBe('running');expect((await run(f.context(),j.id)).state).toBe('running');expect((await stage(f.context(),'export','export-life')).id).toBe(j.id);}finally{latch.release();}
 const final=await running;expect(final.state).toBe('completed');expect(final.counts.pages).toBe(1);expect(Object.keys(final.counts)).toHaveLength(106);expect(final.downloadPath).toBe(`/api/exports/${j.id}/download`);
 const row=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(j.id).first<string>('archive_key');const archive=await decodeArchive(new Uint8Array(await(await env.FILES.get(row!))!.arrayBuffer()));expect(archive.manifest.tables.portability_jobs).toBeUndefined();
 expect(await run(faultR2(f.context(),'put'),j.id)).toEqual(final);expect((await exportWorkspace(faultR2(f.context(),'put'),{operationKey:'export-life'})).state).toBe('completed');
});
test('PORT-003 failed R2 lost acknowledgement cleans tracked put; failed key never reruns',async()=>{
 const f=await fixture(),j=await stage(f.context(),'export','export-failure');const final=await run(faultR2(f.context(),'put',true),j.id);expect(final.state).toBe('failed');expect(final.report.code).toBe('EXPORT_FAILED');expect(await env.FILES.head(`federation/exports/${j.id}/workspace.zip`)).toBeNull();
 expect((await run(f.context(),j.id)).state).toBe('failed');expect((await stage(f.context(),'export','export-failure')).state).toBe('failed');await expect(exportWorkspace(f.context(),{operationKey:'export-failure'})).rejects.toThrow();
});
test('PORT-003 lease recovery fences late put and is idempotent',async()=>{
 const f=await fixture(),j=await stage(f.context(),'export','export-recovery'),latch=latchR2(f.context(),'federation/exports/'),running=run(latch.ctx,j.id);await latch.started;
 try{await env.DB.prepare("UPDATE portability_jobs SET lease_until='2000-01-01' WHERE id=?").bind(j.id).run();expect((await status(f.context(),j.id)).report.code).toBe('INTERRUPTED');expect((await status(f.context(),j.id)).state).toBe('failed');}finally{latch.release();}
 expect((await running).state).toBe('failed');expect(await env.FILES.head(`federation/exports/${j.id}/workspace.zip`)).toBeNull();expect((await readJob(f.context(),j.id))!.state).toBe('failed');
});
test('PORT-003 erasure atomically redacts and fences in-flight export',async()=>{
 const f=await fixture(),j=await stage(f.context(),'export','export-erased'),latch=latchR2(f.context(),'federation/exports/'),running=run(latch.ctx,j.id);await latch.started;
 try{await env.DB.batch(prepareInvalidateExports(f.context()));const receipt=await status(f.context(),j.id);expect(receipt.state).toBe('failed');expect(receipt.report.code).toBe('INVALIDATED');expect(receipt.counts).toEqual({});}finally{latch.release();}
 expect((await running).state).toBe('failed');expect(await env.FILES.head(`federation/exports/${j.id}/workspace.zip`)).toBeNull();expect(await env.DB.prepare('SELECT state FROM federation_exports WHERE id=?').bind(j.id).first<string>('state')).toBe('invalidated');
});
test('PORT-003 retention removes expired receipt and durably retains deletion failures',async()=>{
 const f=await fixture(),j=await stage(f.context(),'export','export-retention');expect((await run(f.context(),j.id)).state).toBe('completed');await env.DB.prepare("UPDATE portability_jobs SET expires_at='2000-01-01' WHERE id=?").bind(j.id).run();
 await expect(status(faultR2(f.context(),'delete'),j.id)).rejects.toMatchObject({code:'NOT_FOUND'});expect(await env.DB.prepare('SELECT storage_key FROM content_media_cleanup WHERE storage_key=?').bind(`federation/exports/${j.id}/workspace.zip`).first()).not.toBeNull();
 await stage(f.context(),'export','drain-cleanup');expect(await env.FILES.head(`federation/exports/${j.id}/workspace.zip`)).toBeNull();expect(await env.DB.prepare('SELECT * FROM content_media_cleanup').first()).toBeNull();
});
test('PORT-003 keys are scoped, validated, payload-bound and racing duplicate admission does one write',async()=>{
 const f=await fixture();await expect(stage(f.context(),'export','unsafe key!')).rejects.toMatchObject({code:'INVALID_OPERATION_KEY'});
 const jobs=await Promise.all([stage(f.context(),'export','same-key-concurrent'),stage(f.context(),'export','same-key-concurrent')]);expect(jobs[0]!.id).toBe(jobs[1]!.id);expect(await env.DB.prepare('SELECT count(*) n FROM portability_jobs').first<number>('n')).toBe(1);
 await expect(stage(f.context(),'restore','same-key-concurrent',new Uint8Array())).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
 await expect(status(f.context(f.reader),jobs[0]!.id)).rejects.toThrow();
});
test('PORT-003 retention fences a late put after its receipt was erased',async()=>{
 const f=await fixture(),j=await stage(f.context(),'export','export-retention-race'),latch=latchR2(f.context(),'federation/exports/'),running=run(latch.ctx,j.id);await latch.started;
 try{await env.DB.prepare("UPDATE portability_jobs SET expires_at='2000-01-01' WHERE id=?").bind(j.id).run();await expect(status(f.context(),j.id)).rejects.toMatchObject({code:'NOT_FOUND'});}finally{latch.release();}
 await expect(running).rejects.toMatchObject({code:'JOB_EXPIRED'});expect(await env.FILES.head(`federation/exports/${j.id}/workspace.zip`)).toBeNull();
});
