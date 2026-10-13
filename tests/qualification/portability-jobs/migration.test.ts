import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import migration from '../../../migrations/core/0016_portability_jobs.sql?raw';
import {fixture,document,reset} from '../authority/fixture';
import {schema} from '../../../src/core/features/portability/archive';
import {portableTables} from '../../../src/core/features/portability/tables';
beforeEach(reset);
test('PORT-003 additive migration applies over all originals with populated canonical data unchanged',async()=>{
 const f=await fixture();await document(f,'Populated forward migration');
 const before=await env.DB.prepare('SELECT * FROM pages').all();
 await env.DB.prepare('DROP TABLE portability_jobs').run();
 // New migration re-applied over the original schema, populated with actual product writes.
 await env.DB.batch(migration.replace(/^--.*$/gm,'').split(';').filter(sql=>sql.trim()).map(sql=>env.DB.prepare(sql)));
 expect((await env.DB.prepare('SELECT * FROM pages').all()).results).toEqual(before.results);
 expect(Object.keys(await schema(env.DB)).sort()).toEqual([...portableTables].sort());
 expect((await env.DB.prepare('PRAGMA foreign_key_list(portability_jobs)').all()).results).toEqual([]);
 await env.DB.prepare('CREATE TABLE portability_unregistered_probe(id TEXT)').run();
 try{await expect(schema(env.DB)).rejects.toMatchObject({code:'UNREGISTERED_PORTABLE_TABLE'});}finally{await env.DB.prepare('DROP TABLE portability_unregistered_probe').run();}
});
