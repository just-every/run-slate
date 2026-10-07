import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {reset} from '../authority/fixture';
import {stagePortabilityJob as stage,runPortabilityJob as run,getPortabilityJob as status} from '../../../src/core/features/portability/jobs';
import {readJob} from '../../../src/core/features/portability/jobs-store';
import {archivedFixture} from './helpers';
beforeEach(reset);
test('PORT-003 committed restore with unreadable acknowledgement cleans the sensitive staged archive past 100 older terminal receipts',async()=>{
 const {source,target,bytes}=await archivedFixture(),ctx=target.context();
 // Test-only older operational receipts do not make the canonical target nonempty.
 await env.DB.batch(Array.from({length:100},(_,n)=>env.DB.prepare("INSERT INTO portability_jobs(id,kind,admission_workspace_id,admission_actor_id,operation_key,request_hash,status_workspace_id,status_actor_id,state,source_ready,created_at,updated_at,expires_at) VALUES(?,'export',?, ?,?,'old',?,?,'completed',1,'2000-01-01','2000-01-01','2999-01-01')").bind(`older-${n}`,target.workspaceId,target.owner,`older-key-${n}`,target.workspaceId,target.owner)));
 const job=await stage(ctx,'restore','restore-backlog-lost-ack',bytes),staged=(await readJob(ctx,job.id))!;let committed=false;
 // Labelled transport double commits the REAL D1 restore and then loses both response and witness.
 const db=new Proxy(ctx.db,{get(database,property){if(property==='batch')return async(statements:D1PreparedStatement[])=>{const result=await database.batch(statements);if(await database.prepare("SELECT id FROM portability_jobs WHERE id=? AND state='completed'").bind(job.id).first()){committed=true;throw new Error('labelled lost restore acknowledgement');}return result;};if(property==='prepare')return(sql:string)=>{if(committed&&sql==='SELECT * FROM portability_jobs WHERE id=?')throw new Error('labelled unavailable witness');return database.prepare(sql);};const value=Reflect.get(database,property);return typeof value==='function'?value.bind(database):value;}});
 await expect(run({...ctx,db},job.id)).rejects.toThrow('witness');expect(await env.FILES.head(staged.source_archive_key!)).not.toBeNull();
 expect(await env.DB.prepare('SELECT storage_key FROM content_media_cleanup WHERE storage_key=?').bind(staged.source_archive_key).first()).not.toBeNull();
 for(let n=0;n<3;n++)expect((await status(source.context(),job.id)).state).toBe('completed');
 expect(await env.FILES.head(staged.source_archive_key!)).toBeNull();expect(await env.DB.prepare('SELECT storage_key FROM content_media_cleanup WHERE storage_key=?').bind(staged.source_archive_key).first()).toBeNull();
 const key=await env.DB.prepare('SELECT archive_key FROM federation_imports LIMIT 1').first<string>('archive_key');expect(await(await env.FILES.get(key!))!.text()).toBe('Portability real original');expect((await run(source.context(),job.id)).state).toBe('completed');
});
