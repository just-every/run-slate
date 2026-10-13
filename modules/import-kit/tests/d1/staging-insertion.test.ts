import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteMapping, sqliteSource } from './sqlite-runtime.ts';
import { planD1ImportStream, createD1ImportStream } from '../../src/d1/index.ts';
const tables = ['ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_d1_plan_chunks','ik_d1_plan_index','ik_originals','ik_original_sets','ik_d1_creation_plans','ik_d1_publication_fences','ik_d1_staging','ik_d1_staging_pages','ik_d1_staging_chunks','ik_d1_staging_index','ik_d1_staging_originals','native_records'];
for (const [name, trigger] of [
  ['same-count wrong target identity', `CREATE TRIGGER replace_stage_index BEFORE INSERT ON ik_d1_staging_index WHEN NEW.target_identity<>'' AND NEW.target_identity<>'${'f'.repeat(64)}' BEGIN INSERT INTO ik_d1_staging_index(stage_id,page_ordinal,ordinal,source_identity,target_identity) VALUES(NEW.stage_id,NEW.page_ordinal,NEW.ordinal,NEW.source_identity,'${'f'.repeat(64)}'); SELECT RAISE(IGNORE); END`],
  ['same-size wrong chunk body', `CREATE TRIGGER replace_stage_chunk BEFORE INSERT ON ik_d1_staging_chunks WHEN substr(NEW.body,1,1)<>'!' BEGIN INSERT INTO ik_d1_staging_chunks(stage_id,page_ordinal,ordinal,body,body_hash,body_size) VALUES(NEW.stage_id,NEW.page_ordinal,NEW.ordinal,'!'||substr(NEW.body,2),NEW.body_hash,NEW.body_size); SELECT RAISE(IGNORE); END`],
]) test(`stored insertion verification rejects ${name} before publication`, async t => {
  const r = await sqliteRuntime(t), source = sqliteSource(5);
  source.artifacts.forEach(a => { a.original = { status: 'unavailable', reason: 'not-supplied' }; });
  const plan = await planD1ImportStream(source, sqliteMapping, r.context());
  r.native().exec(trigger);
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint }), /IMPORT_STAGE_CONTENT_CHANGED/);
  for (const table of tables) assert.equal(r.native().prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0, table);
});
for (const boundary of ['ik_d1_creation_plans', 'ik_d1_staging']) for (const mutation of ["UPDATE ik_jobs SET plan_json='{}'", 'DELETE FROM ik_d1_plan_index']) test(`publication cleanup at ${boundary} cannot mutate exact custody: ${mutation}`, async t => {
  const r = await sqliteRuntime(t), source = sqliteSource(5, 'large'.repeat(30000));
  source.artifacts.forEach(a => { a.original = { status: 'unavailable', reason: 'not-supplied' }; });
  const plan = await planD1ImportStream(source, sqliteMapping, r.context());
  r.native().exec(`CREATE TRIGGER corrupt_publication AFTER DELETE ON ${boundary} BEGIN ${mutation}; END`);
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint }), /IMPORT_PUBLICATION_CHANGED/);
  for (const table of tables) assert.equal(r.native().prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0, table);
});

test('stream activation is verified before cleanup and its trigger cannot corrupt a published plan', async t => {
  const r = await sqliteRuntime(t), source = sqliteSource(5);
  source.artifacts.forEach(a => { a.original = { status: 'unavailable', reason: 'not-supplied' }; });
  const plan = await planD1ImportStream(source, sqliteMapping, r.context());
  r.native().exec("CREATE TRIGGER corrupt_activation AFTER UPDATE ON ik_d1_streams WHEN NEW.state='applying' BEGIN UPDATE ik_jobs SET plan_json='{}'; END");
  await assert.rejects(createD1ImportStream(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint }), /IMPORT_ATOMIC_GUARD/);
  for (const table of tables) assert.equal(r.native().prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0, table);
});

for(const mutation of ["UPDATE ik_jobs SET plan_json='{}'",'DELETE FROM ik_d1_plan_index',"UPDATE ik_d1_streams SET state='undoing'","UPDATE native_authority SET enabled=0 WHERE id='owner'"])test(`stream publication checks state after fence release: ${mutation}`,async t=>{
  const r=await sqliteRuntime(t),source=sqliteSource(2);source.artifacts.forEach(a=>a.original={status:'unavailable',reason:'not-supplied'});
  const plan=await planD1ImportStream(source,sqliteMapping,r.context());
  r.native().exec(`CREATE TRIGGER corrupt_release AFTER DELETE ON ik_d1_publication_fences BEGIN ${mutation};END`);
  await assert.rejects(createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint}),/PUBLICATION_CHANGED|IMPORT_ATOMIC_GUARD|malformed JSON/);
  for(const table of [...tables,'ik_d1_custody_revisions'])assert.equal(r.native().prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
  assert.equal(r.native().prepare("SELECT enabled FROM native_authority WHERE id='owner'").get()!.enabled,1);
  r.native().exec('DROP TRIGGER corrupt_release');
  assert.equal((await createD1ImportStream(plan,{...r.context(),reviewedFingerprint:plan.fingerprint})).state,'applying');
});
