import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, source } from './fixtures.ts';
import { sqliteTargets } from '../../src/storage/sqlite.ts';
import { planImport } from '../../src/plan/index.ts';
import { createImportJob,applyImportBatches,undoImport } from '../../src/engine/index.ts';

test('native adapter rows, child relations and journal share real SQLite rollback and reverse insertion order',async t=>{
  const adapter={...sqliteTargets,
    write(db,row){if(row.targetKind==='parent')db.prepare('INSERT INTO native_parent(id,label) VALUES(?,?)').run(row.targetId,row.value.label);else db.prepare('INSERT INTO native_child(id,parent_id) VALUES(?,?)').run(row.targetId,row.value.parent);sqliteTargets.write(db,row);},
    remove(db,destination,kind,id){db.prepare(kind==='parent'?'DELETE FROM native_parent WHERE id=?':'DELETE FROM native_child WHERE id=?').run(id);sqliteTargets.remove(db,destination,kind,id);}
  };
  const {ctx}=setup(t,adapter);ctx.storage.database.exec('CREATE TABLE native_parent(id TEXT PRIMARY KEY,label TEXT); CREATE TABLE native_child(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES native_parent(id));');
  const plan=planImport(source(1),{version:'v1',map:()=>({effects:[{targetKind:'parent',targetId:'p',value:{label:'original'}},{targetKind:'child',targetId:'c',value:{parent:'p'}}]})},ctx);ctx.reviewedFingerprint=plan.fingerprint;const job=await createImportJob(plan,ctx);
  ctx.storage.database.exec("CREATE TRIGGER native_child_fail BEFORE INSERT ON native_child BEGIN SELECT RAISE(ABORT,'relation rejected'); END;");
  await assert.rejects(applyImportBatches(job,ctx),/relation rejected/);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM native_parent').get().n,0);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_provenance').get().n,0);
  ctx.storage.database.exec('DROP TRIGGER native_child_fail');await applyImportBatches(job,ctx);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM native_child').get().n,1);
  await undoImport(job.id,ctx);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM native_parent').get().n,0);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM native_child').get().n,0);
});
