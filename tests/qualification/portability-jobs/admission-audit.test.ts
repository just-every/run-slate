import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset} from '../authority/fixture';
import {stagePortabilityJob as stage,runPortabilityJob as run,getPortabilityJob as status} from '../../../src/core/features/portability/jobs';
import {requestHash} from '../../../src/core/app/operations';
beforeEach(reset);
test('ACT-002 PORT-003 each admitted export atomically records attributed activity and a hashed identity revision exactly once',async()=>{
 const f=await fixture(),ctx=f.context(),key='export-audit-admission';
 const [job,duplicate]=await Promise.all([stage(ctx,'export',key),stage(f.context(),'export',key)]);expect(duplicate.id).toBe(job.id);
 const activity=await env.DB.prepare('SELECT * FROM activity_entries WHERE operation_key=?').bind(key).all();expect(activity.results).toHaveLength(1);
 expect(activity.results[0]).toMatchObject({workspace_id:f.workspaceId,actor_member_id:f.owner,feature:'exports',action:'exports.workspace',target_kind:'export',target_id:job.id,operation_key:key});
 const exported=await env.DB.prepare('SELECT revision_id,created_at FROM federation_exports WHERE id=?').bind(job.id).first<{revision_id:string;created_at:string}>();
 const revisions=await env.DB.prepare("SELECT * FROM core_entity_revisions WHERE entity_kind='export' AND entity_id=?").bind(job.id).all();expect(revisions.results).toHaveLength(1);
 const revision=revisions.results[0]!;expect(revision).toMatchObject({id:exported!.revision_id,workspace_id:f.workspaceId,entity_kind:'export',entity_id:job.id,author_member_id:f.owner,created_at:exported!.created_at});expect(activity.results[0]!.occurred_at).toBe(exported!.created_at);expect(revision.content_hash).toBe(await requestHash(JSON.parse(String(revision.content_json))));
 await status(f.context(),job.id);await run(f.context(),job.id);await run(f.context(),job.id);await stage(f.context(),'export',key);
 expect((await env.DB.prepare('SELECT id FROM activity_entries WHERE operation_key=?').bind(key).all()).results).toHaveLength(1);expect((await env.DB.prepare("SELECT id FROM core_entity_revisions WHERE entity_kind='export' AND entity_id=?").bind(job.id).all()).results).toHaveLength(1);
});
test('ACT-002 PORT-003 failed audit insertion rolls back export admission, receipt and identity together',async()=>{
 const f=await fixture();await env.DB.prepare("CREATE TRIGGER qualification_export_audit_abort BEFORE INSERT ON activity_entries WHEN NEW.action='exports.workspace' BEGIN SELECT RAISE(ABORT,'labelled audit persistence failure'); END").run();
 try{await expect(stage(f.context(),'export','export-audit-rollback')).rejects.toThrow();expect(await env.DB.prepare('SELECT COUNT(*) n FROM portability_jobs').first<number>('n')).toBe(0);expect(await env.DB.prepare('SELECT COUNT(*) n FROM federation_exports').first<number>('n')).toBe(0);expect(await env.DB.prepare('SELECT COUNT(*) n FROM core_entity_revisions').first<number>('n')).toBe(0);}finally{await env.DB.prepare('DROP TRIGGER qualification_export_audit_abort').run();}
});
test.each(['identity','acl'] as const)('ACT-002 PORT-003 %s changed at admission rolls back receipt, export, revision and audit',async(change)=>{
 const f=await fixture(),ctx=f.context();let altered=false;
 // Labelled race injection, using real D1 mutation immediately before the real admission batch.
 const db=new Proxy(ctx.db,{get(database,property){if(property==='batch')return async(statements:D1PreparedStatement[])=>{if(!altered){altered=true;await (change==='identity'?database.prepare("UPDATE members SET status='historical' WHERE id=?").bind(f.owner):database.prepare('UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1')).run();}return database.batch(statements);};const value=Reflect.get(database,property);return typeof value==='function'?value.bind(database):value;}});
 await expect(stage({...ctx,db},'export','export-atomic-'+change)).rejects.toThrow();
 for(const table of ['portability_jobs','federation_exports','core_entity_revisions','activity_entries'])expect(await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first<number>('n')).toBe(0);
});
