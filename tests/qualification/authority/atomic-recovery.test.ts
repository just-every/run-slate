import {env} from 'cloudflare:test';
import {test,expect,beforeEach} from 'vitest';
import {fixture,reset,document} from './fixture';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';
beforeEach(reset);
test('PORT-006 — a late D1 restore failure rolls back prior records and staged R2 originals, then the exact archive retries successfully',async()=>{
 const f=await fixture();await document(f,'Atomic recovery original');const exported=await exportWorkspace(f.context()),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key'),archive=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());
 await reset();const target=await fixture({withReader:false}),before=(await env.FILES.list({prefix:'federation/restore/'})).objects.map(o=>o.key);
 await env.DB.prepare("CREATE TRIGGER qualification_restore_abort BEFORE INSERT ON page_blocks BEGIN SELECT RAISE(ABORT,'labelled late recovery fault'); END").run();
 try{await expect(restoreWorkspace(target.context(),archive)).rejects.toThrow();expect(await env.DB.prepare('SELECT count(*) AS n FROM pages').first<number>('n')).toBe(0);expect(await env.DB.prepare('SELECT count(*) AS n FROM containers').first<number>('n')).toBe(0);expect((await env.FILES.list({prefix:'federation/restore/'})).objects.map(o=>o.key)).toEqual(before);expect(await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(target.owner).first()).not.toBeNull();}finally{await env.DB.prepare('DROP TRIGGER qualification_restore_abort').run();}
 expect((await restoreWorkspace(target.context(),archive)).state).toBe('completed');expect(await env.DB.prepare('SELECT count(*) AS n FROM pages').first<number>('n')).toBe(1);expect((await env.FILES.list({prefix:'federation/restore/'})).objects.length).toBeGreaterThan(before.length);
});
