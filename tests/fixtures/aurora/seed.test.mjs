import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import test from 'node:test';
import {seedAurora} from './seed.mjs';

test('Aurora test fixture retains original workspace and all three members on migrated D1 schema',async()=>{
 const db=new DatabaseSync(':memory:');
 try {
  for(const name of (await readdir('migrations/core')).filter(name=>name.endsWith('.sql')).sort())db.exec(await readFile('migrations/core/'+name,'utf8'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n,0);
  await seedAurora(sql=>db.exec(sql));
  assert.deepEqual(db.prepare('SELECT id,name FROM workspaces').all().map(row=>({...row})),[{id:'01JBF2JH4M0D3S8ZJ1TQW7K0A1',name:'Aurora Android Launch'}]);
  assert.deepEqual(db.prepare('SELECT email,role,is_setup_owner FROM members ORDER BY id').all().map(row=>({...row})),[{email:'jamie@aurora.example',role:'owner',is_setup_owner:1},{email:'maya@aurora.example',role:'member',is_setup_owner:0},{email:'priya@aurora.example',role:'member',is_setup_owner:0}]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
 } finally {db.close();}
});
