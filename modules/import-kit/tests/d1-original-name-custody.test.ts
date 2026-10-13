import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, source, mapping } from './d1/fixtures.ts';
import { sqliteRuntime, sqliteSource, sqliteMapping } from './d1/sqlite-runtime.ts';
import { planD1Import, createD1ImportJob, readD1ImportOriginals, resumeD1Import, undoD1Import, sha256 } from '../src/d1/index.ts';

for (const [provider, open, input, map] of [
  ['SQLite', sqliteRuntime, sqliteSource, sqliteMapping],
  ['real D1', runtime, source, mapping],
] as const) {
  test(`${provider}: original names retain leading, embedded and trailing NUL across restart and undo`, async t => {
    const r = await open(t), bundle = input(1);
    for (const [i, name] of ['\0leading🌱', '🌱\0"\\\n漢\0tail', 'trailing\0', 'unavailable\0suffix'].entries()) {
      const bytes = i === 0 ? Buffer.alloc(0) : Buffer.from([0, 255, 13, 10, i]);
      bundle.artifacts.push({ name, sha256: sha256(bytes), size: bytes.length, original: i === 3
        ? { status: 'unavailable', reason: 'not-supplied' }
        : { status: 'available', base64: bytes.toString('base64') } });
    }
    const plan = await planD1Import(bundle, map, r.context());
    const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
    const expected = bundle.artifacts.map(a => ({ name: a.name, sha256: a.sha256, size: a.size,
      original: a.original!.status === 'available' ? { status: 'retained', base64: a.original!.base64 } : a.original }));
    const inspect = async () => {
      const originals = await readD1ImportOriginals(job.id, r.context());
      assert.deepEqual(originals.map(({ name, sha256, size, original }) => ({ name, sha256, size, original })), expected);
    };
    await r.reopen();
    await inspect();
    await resumeD1Import(job.id, r.context());
    await undoD1Import(job.id, r.context());
    await r.reopen();
    await inspect();
  });

  test(`${provider}: corruption after a name's NUL rejects read and publication`, async t => {
    const r = await open(t), bundle = input(1);
    bundle.artifacts[0].name = 'prefix\0original';
    bundle.records[0].location.artifact = bundle.artifacts[0].name;
    const plan = await planD1Import(bundle, map, r.context());
    const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
    await r.db().batch([r.db().prepare('UPDATE ik_originals SET name=? WHERE job_id=?').bind('prefix\0tampered', job.id)]);
    await r.reopen();
    await assert.rejects(readD1ImportOriginals(job.id, r.context()), /ORIGINAL_CUSTODY_MISMATCH/);
    await assert.rejects(resumeD1Import(job.id, r.context()), /ORIGINAL_CUSTODY_MISMATCH/);
    assert.equal((await r.db().prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').bind(job.id).first())?.checkpoint, 0);
    assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_provenance').first())?.n, 0);
  });

  test(`${provider}: corruption after a name's NUL during creation rolls back custody`, async t => {
    const r = await open(t), bundle = input(1);
    bundle.artifacts[0].name = 'prefix\0original';
    bundle.records[0].location.artifact = bundle.artifacts[0].name;
    const plan = await planD1Import(bundle, map, r.context());
    await r.db().batch([r.db().prepare("CREATE TRIGGER corrupt_name_suffix AFTER INSERT ON ik_originals BEGIN UPDATE ik_originals SET name='prefix'||char(0)||'tampered' WHERE job_id=NEW.job_id; END")]);
    await assert.rejects(createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint }), /IMPORT_ATOMIC_GUARD/);
    for (const table of ['ik_jobs', 'ik_original_sets', 'ik_originals', 'ik_d1_original_chunks', 'ik_d1_plan_chunks', 'ik_d1_creation_plans']) {
      assert.equal((await r.db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n, 0, table);
    }
  });
}
