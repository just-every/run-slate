import assert from 'node:assert/strict';
import test from 'node:test';
import {tsImport} from 'tsx/esm/api';
import {restoreDatabase} from './restore-database.mjs';

const {requireEmptyRestoreTarget,emptyTargetSelects}=await tsImport('../../src/core/features/portability/restore-plan.ts',import.meta.url);
const {mutationGuard}=await tsImport('../../src/core/app/operations.ts',import.meta.url);
const {bootstrapOwner}=await tsImport('../../src/core/features/workspace/bootstrap.ts',import.meta.url);

async function bootstrap(h,statuses){
  const email='restore-owner@example.invalid';
  await bootstrapOwner(h.db,{setupOwnerEmail:email},email);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS count FROM status_entries').get().count,4);
  if(!statuses)h.sql.exec('DELETE FROM status_entries');
}

const identityCases=[
  ['second member',h=>h.sql.exec(`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,created_at,updated_at)
    SELECT 'extra',id,'extra@example.invalid','Extra','EX','member','member','active',created_at,updated_at FROM workspaces`)],
  ['guest',h=>h.sql.exec(`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,created_at,updated_at)
    SELECT 'guest',id,'guest@example.invalid','Guest','GU','member','guest','active',created_at,updated_at FROM workspaces`)],
  ['second workspace',h=>h.sql.exec(`INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id)
    SELECT 'second','Existing workspace','',created_at,updated_at,'second-revision' FROM workspaces`)],
  ['non-setup owner',h=>h.sql.exec('UPDATE members SET is_setup_owner=0')],
  ['setup member without owner role',h=>h.sql.exec("UPDATE members SET role='member'")],
  ['setup guest',h=>h.sql.exec("UPDATE members SET member_kind='guest'")],
  ['historical setup owner',h=>h.sql.exec("UPDATE members SET status='historical'")],
  ['removed setup owner',h=>h.sql.exec("UPDATE members SET status='removed'")],
  ['workspace without an owner',h=>h.sql.exec('DELETE FROM members')],
  ['mismatched member workspace',h=>{
    // A previously inconsistent identity must fail closed as well.
    h.sql.exec("PRAGMA foreign_keys=OFF; UPDATE members SET workspace_id='missing-workspace'; PRAGMA foreign_keys=ON");
  }],
];

const retainedDataCases=[
  ['identity binding',h=>h.sql.exec(`INSERT INTO member_identity_bindings(issuer,subject,member_id,created_at)
    SELECT 'https://provider.example.org','retained-subject',id,created_at FROM members LIMIT 1`)],
  ['product records',h=>h.sql.exec(`INSERT INTO groups(id,workspace_id,name,created_at,updated_at,revision_id)
    SELECT 'existing-group',id,'Keep this group',created_at,updated_at,'group-revision' FROM workspaces`)],
];

async function assertRejectedWithoutDeletion(h){
  const before=h.snapshot();
  await assert.rejects(requireEmptyRestoreTarget({db:h.db}),error=>error.status===409&&error.code==='RESTORE_NOT_EMPTY');
  assert.deepEqual(h.snapshot(),before,'Preflight preserves every table.');
  const selections=await h.db.batch(emptyTargetSelects.map(query=>h.db.prepare(query)));
  assert.ok(selections.some(result=>result.results[0].empty===0),'At least one real transactional selector refuses the target.');
  // Use every production selector and the production mutationGuard. A mutation
  // ahead of the guard proves atomic rollback; deletes after it model replacement.
  await assert.rejects(h.db.batch([
    h.db.prepare('PRAGMA defer_foreign_keys=ON'),
    h.db.prepare("UPDATE workspaces SET name='Must roll back'"),
    ...emptyTargetSelects.map(query=>mutationGuard(h.db,query,[])),
    ...['status_entries','members','workspace_policies','workspaces'].map(name=>h.db.prepare(`DELETE FROM "${name}"`)),
  ]),/CHECK constraint failed/);
  assert.deepEqual(h.snapshot(),before,'Failed in-transaction guards roll back all writes and preserve every table.');
}

test('restore accepts empty and pristine legacy or native bootstrap targets in preflight and every transactional selector',async()=>{
  for(const mode of ['empty','legacy zero-status bootstrap','native four-status bootstrap']){
    const h=restoreDatabase();
    try{
      if(mode!=='empty')await bootstrap(h,mode==='native four-status bootstrap');
      const before=h.snapshot();
      await requireEmptyRestoreTarget({db:h.db});
      const selections=await h.db.batch(emptyTargetSelects.map(query=>h.db.prepare(query)));
      assert.ok(selections.every(result=>result.results[0].empty===1));
      await h.db.batch(emptyTargetSelects.map(query=>mutationGuard(h.db,query,[])));
      assert.deepEqual(h.snapshot(),before,'Successful emptiness checks have no data side effects.');
    }finally{h.close();}
  }
});

test('restore preserves every target without exactly one active setup owner in its sole workspace with either bootstrap vocabulary',async()=>{
  for(const statuses of [false,true])for(const [name,alter] of identityCases){
    const h=restoreDatabase();
    try{await bootstrap(h,statuses);alter(h);await assertRejectedWithoutDeletion(h);}
    finally{h.close();}
  }
});

for(const [name,alter] of retainedDataCases){
  test(`restore preserves ${name} with either bootstrap vocabulary`,async()=>{
    for(const statuses of [false,true]){
      const h=restoreDatabase();
      try{await bootstrap(h,statuses);alter(h);await assertRejectedWithoutDeletion(h);}
      finally{h.close();}
    }
  });
}

test('restore preserves every customized or incomplete bootstrap status vocabulary',async()=>{
  for(const [name,query] of [
    ['custom label',"UPDATE status_entries SET label='Owner vocabulary' WHERE key='rough-draft'"],
    ['custom color',"UPDATE status_entries SET color='#123456' WHERE key='rough-draft'"],
    ['custom verification',"UPDATE status_entries SET requires_verification=1 WHERE key='rough-draft'"],
    ['custom key',"UPDATE status_entries SET key='custom' WHERE key='rough-draft'"],
    ['retired entry',"UPDATE status_entries SET retired_at='2026-10-09T00:00:00Z' WHERE key='rough-draft'"],
    ['changed timestamp',"UPDATE status_entries SET updated_at='2000-01-01T00:00:00Z' WHERE key='rough-draft'"],
    ['non-bootstrap creation',"UPDATE status_entries SET created_at='2000-01-01T00:00:00Z',updated_at='2000-01-01T00:00:00Z'"],
    ['partial vocabulary',"DELETE FROM status_entries WHERE key='rough-draft'"],
  ]){
    const h=restoreDatabase();
    try{await bootstrap(h,true);h.sql.exec(query);await assertRejectedWithoutDeletion(h);}
    finally{h.close();}
  }
});

test('restore preserves completed first run',async()=>{
  const h=restoreDatabase();
  try{await bootstrap(h,true);h.sql.exec("UPDATE workspaces SET first_run_completed_at=created_at");await assertRejectedWithoutDeletion(h);}
  finally{h.close();}
});
