import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document} from './fixture';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';
import {search} from '../../../src/core/features/search/service';

beforeEach(reset);
test('PORT-004 — derived search failure rolls back the whole restore and its staged originals before exact retry',async()=>{
 const f=await fixture(),page=await document(f,'Atomic searchable restored original');
 const exported=await exportWorkspace(f.context()),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key'),bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());
 await reset();const target=await fixture(),before=(await env.FILES.list({prefix:'federation/restore/'})).objects.map(o=>o.key);
 await env.DB.prepare("CREATE TRIGGER qualification_index_restore_abort BEFORE INSERT ON search_text BEGIN SELECT RAISE(ABORT,'labelled derived index publication fault'); END").run();
 try{
  await expect(restoreWorkspace(target.context(),bytes)).rejects.toThrow();
  for(const table of ['containers','pages','page_blocks','search_text'])expect(await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<number>('n')).toBe(0);
  expect((await env.FILES.list({prefix:'federation/restore/'})).objects.map(o=>o.key)).toEqual(before);
  expect(await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(target.owner).first()).not.toBeNull();
 }finally{await env.DB.prepare('DROP TRIGGER qualification_index_restore_abort').run();}
 expect((await restoreWorkspace(target.context(),bytes)).state).toBe('completed');
 // Inspect persisted index before any search call can drain a missing derived row.
 expect(await env.DB.prepare('SELECT count(*) AS n FROM search_text WHERE page_id=?').bind(page.id).first<number>('n')).toBeGreaterThan(0);
 expect(await env.DB.prepare('SELECT count(*) AS n FROM search_dirty').first<number>('n')).toBe(0);
 expect((await search(f.context(),{query:'Atomic searchable'})).items.some(item=>item.pageId===page.id)).toBe(true);
 const original=await env.DB.prepare('SELECT archive_key FROM federation_imports LIMIT 1').first<string>('archive_key');expect(await(await env.FILES.get(original!))!.text()).toBe('Atomic searchable restored original');
});
