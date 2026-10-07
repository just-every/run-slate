import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const migration=n=>readFileSync(new URL(`../../../migrations/core/${n}`,import.meta.url),'utf8');
test('0003 reconciles nullable-target duplicates without losing prior reaction events',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(migration('0001_knowledge_foundation.sql'));db.exec(migration('0002_core_runtime.sql'));
 db.exec("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES ('w','w','W','n','n','r'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES ('m','w','m@x.invalid','M','M','owner','n','n'); INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES ('c','w','c','open','n','n','r'); INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,lifecycle,working_revision_id,published_revision_id,tree_position,created_at,updated_at,revision_id) VALUES ('p','w','c','p','m','live','r','r','1','n','n','r'); INSERT INTO comment_threads(id,workspace_id,page_id,kind,created_at,updated_at,revision_id) VALUES ('t','w','p','page','n','n','r'); INSERT INTO comments(id,thread_id,author_member_id,body_json,created_at,updated_at,revision_id) VALUES ('comment','t','m','[]','n','n','r');");
 for(const [id,p,c] of [['a','p',null],['b','p',null],['c',null,'comment'],['d',null,'comment']])db.prepare('INSERT INTO reactions VALUES (?,?,?,?,?,?)').run(id,p,c,'m','smile','n');
 const before=db.prepare('SELECT * FROM reactions ORDER BY id').all();db.exec(migration('0003_content_collaboration.sql'));
 assert.equal(db.prepare('SELECT count(*) n FROM reactions').get().n,2);
 assert.deepEqual(db.prepare('SELECT * FROM reactions UNION ALL SELECT * FROM content_legacy_reactions ORDER BY id').all(),before);
 assert.throws(()=>db.prepare('INSERT INTO reactions VALUES (?,?,?,?,?,?)').run('e','p',null,'m','smile','n'),/UNIQUE/);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.exec("UPDATE pages SET working_revision_id='secret'; UPDATE pages SET working_revision_id=published_revision_id; UPDATE pages SET published_revision_id='next';");
 assert.deepEqual(db.prepare('SELECT revision_id FROM content_published_revisions ORDER BY revision_id').all().map(x=>x.revision_id),['next','r']);db.close();
});
