import test from 'node:test';
import assert from 'node:assert/strict';
import { planD1Import, createD1ImportJob, resumeD1Import, undoD1Import, readD1PersistedImport, readD1ImportJob, readD1ImportOriginals, retireD1ImportCustody, readD1ErasureJournal, planD1ImportStream, prepareD1ImportStream, publishD1ImportPreparation, readD1ImportFieldMatches, eraseD1ImportTarget, upgradeD1ImportErasureIndex, d1ErasureSchema, canonicalJson, sha256 } from '../../src/d1/index.ts';
import type { D1Database } from '../../src/d1/index.ts';
import { runtime, source, mapping, targets } from './fixtures.ts';
import { meter } from './meter.ts';
import { personTargets, peopleMapping } from '../../../../default-seed/src/core/features/people/imports.server.ts';
import { peopleSource } from './people-fixture.ts';

function normalized(large = false) {
  const bundle = source(3);
  bundle.artifacts[0].original = { status: 'unavailable', reason: 'not-supplied' };
  if (large) {
    bundle.records[0].payload = { email: 'person0@example.test', evidence: 'private-long-answer-'.repeat(10000) };
    bundle.records[0].payloadHash = sha256(canonicalJson(bundle.records[0].payload));
  }
  bundle.diagnostics.push({ severity: 'warning', code: 'SOURCE_NOTE', message: 'person0@example.test', kind: 'contact', sourceId: '0' });
  return bundle;
}
async function retained(db: D1Database) {
  const names = ['ik_jobs', 'ik_d1_plan_chunks', 'ik_provenance', 'ik_d1_history', 'ik_sources', 'ik_d1_entries', 'ik_originals', 'ik_d1_original_chunks', 'ik_stages', 'contacts', 'evidence'];
  return JSON.stringify(await Promise.all(names.map(async name => (await db.prepare(`SELECT * FROM ${name}`).all()).results)));
}
async function create(r: Awaited<ReturnType<typeof runtime>>, large = false) {
  const plan = await planD1Import(normalized(large), mapping, r.context());
  const job = await createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint });
  return { plan, job };
}
const erase = (r: Awaited<ReturnType<typeof runtime>>, id = '0') => eraseD1ImportTarget('contact', id, targets.remove('workspace', 'contact', id), r.context());

test('real D1: named reaction-user redaction commits with the erasure journal and keeps default-seed peer custody, resume and undo valid', async t => {
  const r = await runtime(t), actor = 'U-ERASE-REACTION-A';
  const census = async () => {
    const { results } = await r.db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%'").all<{ name: string }>();
    return canonicalJson(await Promise.all(results.map(async ({ name }) => (await r.db().prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results)));
  };
  for (const mode of ['partial', 'reused', 'before-image', 'superseded', 'undone', 'native-edit']) {
    await r.reset();
    await r.db().batch([
      'CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,email TEXT,details TEXT,created_at TEXT,import_revision TEXT)',
      'CREATE TABLE privacy_epoch(epoch INTEGER)', 'INSERT INTO privacy_epoch VALUES(0)',
    ].map(sql => r.db().prepare(sql)));
    const context = () => ({ ...r.context(), destination: 'people', namespace: 'people', storage: { database: r.db(), targets: personTargets } });
    const reactions = [{ name: 'thumbsup', count: 2, users: [actor, 'U-B'] }];
    const clean = [{ name: 'thumbsup', count: 2, users: ['U-B'] }];
    if (mode === 'before-image') await r.db().prepare('INSERT INTO people VALUES(?,?,?,?,?,?)').bind('bob', 'Original Bob', 'bob@example.test', canonicalJson({ reactions }), 'then', 'native-original').run();
    const bundle = peopleSource([
      { ref: actor, name: 'Alice', email: 'alice@example.test', details: {} },
      { ref: 'bob', name: 'Bob', email: 'bob@example.test', details: { reactions: mode === 'before-image' ? clean : reactions } },
      { ref: 'carol', name: 'Carol', email: 'carol@example.test', details: { reactions } },
    ]);
    const map = mode === 'before-image' ? { version: 'v1', map: (record: any) => ({ effects: [{ targetKind: 'person', targetId: record.sourceId, value: record.payload, ...(record.sourceId === 'bob' ? { expectedRevision: 'native-original' } : {}) }] }) } : peopleMapping;
    const plan = await planD1Import(bundle, map, context());
    const job = await createD1ImportJob(plan, { ...context(), operationKey: 'reactions', reviewedFingerprint: plan.fingerprint });
    await resumeD1Import(job.id, { ...context(), ...(mode === 'partial' ? { maxBatches: 2 } : {}) });
    let sibling: string | undefined;
    if (mode === 'reused') {
      const copy = await createD1ImportJob(plan, { ...context(), operationKey: 'copy', reviewedFingerprint: plan.fingerprint });
      sibling = copy.id; await resumeD1Import(copy.id, context());
    }
    if (mode === 'superseded') {
      const prior = (await personTargets.read(r.db(), 'people', 'person', 'bob'))!;
      const update = await planD1Import(peopleSource([{ ref: 'bob-update', name: 'Updated Bob', email: 'bob@example.test', details: { reactions } }]),
        { version: 'v1', map: record => ({ effects: [{ targetKind: 'person', targetId: 'bob', value: record.payload, expectedRevision: prior.revision }] }) }, context());
      const copy = await createD1ImportJob(update, { ...context(), operationKey: 'update', reviewedFingerprint: update.fingerprint });
      sibling = copy.id; await resumeD1Import(copy.id, context());
    }
    if (mode === 'undone') await undoD1Import(job.id, context());
    if (mode === 'native-edit') await r.db().prepare("UPDATE people SET name='Native Bob' WHERE id='bob'").run();
    let preparation: string | undefined;
    if (mode === 'partial') {
      const staged = structuredClone(bundle);
      staged.artifacts.forEach(artifact => artifact.original = { status: 'unavailable', reason: 'not-supplied' });
      const reviewed = await planD1ImportStream(staged, map, context());
      preparation = (await prepareD1ImportStream(staged, map, { ...context(), operationKey: 'private-copy', reviewedFingerprint: reviewed.fingerprint })).id;
      assert.ok((await r.db().prepare('SELECT count(*) AS n FROM ik_d1_staging').first())!.n > 0);
    }
    const person = { target: { kind: 'person', id: actor }, related: { fields: [{ path: ['details', 'reactions', '*', 'users', '*'], value: actor }, { path: ['details', 'reactions', '*', 'users', '*'], value: 'absent-alternative' }] } };
    const erasePerson = (extra: { sql: string }[] = []) => retireD1ImportCustody(person, [...personTargets.remove('people', 'person', actor), ...extra], context(), [{ sql: 'UPDATE privacy_epoch SET epoch=epoch+1' }]);
    const before = await census();
    assert.ok(before.includes(actor), `${mode}: the identity exists before erasure`);
    for (const failure of [{ sql: 'INSERT INTO absent_table VALUES(1)' }, { sql: 'UPDATE sessions SET enabled=0' }]) {
      await assert.rejects(erasePerson([failure]));
      assert.equal(await census(), before, 'native/authority failures roll back custody, epoch and journal');
    }
    if (mode === 'partial') {
      for (const fields of [
        [{ path: ['details', 'reactions', '*', 'users_typo', '*'], value: actor }],
        [...person.related.fields, { path: ['details', 'reactions', '*', 'users_typo', '*'], value: actor }],
        [{ path: ['details', 'reactions', '*', 'users', '*'], value: actor.slice(0, -2) }],
      ]) {
        await assert.rejects(retireD1ImportCustody({ ...person, related: { fields } }, personTargets.remove('people', 'person', actor), context(), [{ sql: 'UPDATE privacy_epoch SET epoch=epoch+1' }]), /IMPORT_REDACTION_PATH_UNMATCHED/);
        await assert.rejects(eraseD1ImportTarget('person', actor, personTargets.remove('people', 'person', actor), context(), { fields }), /IMPORT_REDACTION_PATH_UNMATCHED/);
        assert.equal(await census(), before, 'an empty distinct path refuses before native, custody, journal or checkpoint writes');
      }
      assert.deepEqual((await readD1ImportFieldMatches([{ path: ['details', 'reactions', '*', 'users_typo', '*'], value: actor }], context())).fieldMatches, [{ path: ['details', 'reactions', '*', 'users_typo', '*'], matches: 0 }]);
    }
    const { fieldMatches: discovered } = await readD1ImportFieldMatches(person.related.fields, context());
    if (mode === 'partial') assert.deepEqual(discovered, [{ path: ['details', 'reactions', '*', 'users', '*'], matches: 5 }], 'two retained source leaves, two effects and one applied peer leaf; absent alternative adds no match');
    if (mode === 'partial') for (const event of ['INSERT ON ik_d1_erasure_journal', 'DELETE ON ik_d1_assertions']) {
      await r.db().prepare(`CREATE TRIGGER restore_private_field AFTER ${event} BEGIN UPDATE people SET details=json_set(details,'$.reactions[0].users[0]','${actor}') WHERE id='bob'; END`).run();
      await assert.rejects(erasePerson(), 'even journal and final-cleanup triggers cannot restore the erased field');
      assert.equal(await census(), before, 'late mutation rolls back the native values, epoch and journal together');
      await r.db().prepare('DROP TRIGGER restore_private_field').run();
    }
    const journal = await erasePerson();
    assert.deepEqual(journal.fieldMatches, discovered);
    assert.ok(!JSON.stringify(journal).includes(actor));
    if (preparation) {
      assert.equal((await r.db().prepare('SELECT count(*) AS n FROM ik_d1_staging').first())!.n, 0);
      await assert.rejects(publishD1ImportPreparation(preparation, context()), /IMPORT_PREPARATION_NOT_FOUND/);
    }
    const peer = await personTargets.read(r.db(), 'people', 'person', 'bob');
    t.diagnostic(JSON.stringify({ mode, peerPresent: !!peer, reactions: (peer?.value as any)?.details.reactions,
      identityInTables: (await census()).includes(actor), journalRecorded: !!journal.receiptId }));
    assert.ok(journal.stores.some(store => store.store === 'ik_provenance' && store.rows > 0));
    assert.equal((await r.db().prepare('SELECT epoch FROM privacy_epoch').first())?.epoch, 1);
    assert.equal((await createD1ImportJob(plan, { ...context(), operationKey: 'reactions', reviewedFingerprint: plan.fingerprint })).id, job.id, 'the original reviewed operation remains replayable');
    assert.ok(!(await census()).includes(actor), `${mode}: every table and journal is clear`);
    for (const id of [job.id, ...sibling ? [sibling] : []]) for (const original of await readD1ImportOriginals(id, context())) {
      assert.ok(original.original.status !== 'retained' || !Buffer.from(original.original.base64, 'base64').toString().includes(actor));
    }
    if (mode !== 'undone') {
      await r.reopen();
      await resumeD1Import(job.id, context());
      for (const id of ['bob', 'carol']) assert.deepEqual((await personTargets.read(r.db(), 'people', 'person', id))!.value.details.reactions, clean);
      if (sibling) await undoD1Import(sibling, context());
      if (mode === 'native-edit') {
        await assert.rejects(undoD1Import(job.id, context()), /NATIVE_EDIT_CONFLICT/);
        assert.equal((await personTargets.read(r.db(), 'people', 'person', 'bob'))!.value.name, 'Native Bob');
      } else {
        assert.equal((await undoD1Import(job.id, context())).state, 'undone');
        if (mode === 'before-image') assert.deepEqual((await personTargets.read(r.db(), 'people', 'person', 'bob'))!.value.details.reactions, clean);
      }
    }
    assert.ok(!(await census()).includes(actor), `${mode}: resume/undo never restores the identity`);
  }
});

test('real D1: optional field discovery fences late references and cancels staging-only peer copies atomically', async t => {
  const r = await runtime(t), actor = 'PRIVATE-STAGED-IDENTITY';
  for (const mode of ['staging-only', 'late-job', 'late-native']) {
    await r.reset();
    await r.db().batch([
      'CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,email TEXT,details TEXT,created_at TEXT,import_revision TEXT)',
      'CREATE TABLE privacy_epoch(epoch INTEGER)', 'INSERT INTO privacy_epoch VALUES(0)',
      "INSERT INTO people VALUES('native-person','Target','target@example.test','{}','then',NULL)",
    ].map(sql => r.db().prepare(sql)));
    const context = () => ({ ...r.context(), destination: 'people', namespace: 'people', storage: { database: r.db(), targets: personTargets } });
    const fields = [{ path: ['details', 'reactions', '*', 'users', '*'], value: actor }];
    const bundle = peopleSource([{ ref: 'peer', name: 'Peer', email: 'peer@example.test', details: { reactions: [{ count: 2, users: [actor, 'OTHER'] }] } }]);
    bundle.artifacts.forEach(artifact => artifact.original = { status: 'unavailable', reason: 'not-supplied' });
    const review = await planD1ImportStream(bundle, peopleMapping, context());
    const preparation = await prepareD1ImportStream(bundle, peopleMapping, { ...context(), operationKey: 'private', reviewedFingerprint: review.fingerprint });
    const discovered = await readD1ImportFieldMatches(fields, context());
    assert.equal(discovered.fieldMatches[0].matches, 0, 'incomplete private preparations are cancelled, never counted as decoded retained leaves');
    const target = { kind: 'person', id: 'native-person' }, native = personTargets.remove('people', 'person', target.id);
    const checkpoint = [{ sql: 'UPDATE privacy_epoch SET epoch=epoch+1' }];
    await assert.rejects(retireD1ImportCustody({ target, related: { fields, snapshot: discovered.snapshot } }, native, context(), checkpoint), /IMPORT_REDACTION_PATH_UNMATCHED/);
    let job: string | undefined;
    if (mode === 'late-job') {
      const plan = await planD1Import(bundle, peopleMapping, context());
      job = (await createD1ImportJob(plan, { ...context(), operationKey: 'late', reviewedFingerprint: plan.fingerprint })).id;
    }
    if (mode === 'late-native') await r.db().batch(personTargets.write({ destination: 'people', targetKind: 'person', targetId: 'peer', revision: 'native-change', value: bundle.records[0].payload }).map(statement => r.db().prepare(statement.sql).bind(...statement.params!)));
    // An optional reference may match nothing; the snapshot still fences what discovery saw.
    const optional = fields.map(field => ({ ...field, optional: true }));
    if (mode !== 'staging-only') await assert.rejects(retireD1ImportCustody({ target, related: { fields: optional, snapshot: discovered.snapshot } }, native, context(), checkpoint), /IMPORT_REDACTION_SNAPSHOT_CHANGED/);
    const current = await readD1ImportFieldMatches(fields, context());
    const person = { target, related: { fields: optional, snapshot: current.snapshot } };
    await assert.rejects(retireD1ImportCustody(person, [...native, { sql: 'INSERT INTO absent_table VALUES(1)' }], context(), checkpoint));
    assert.ok(await personTargets.read(r.db(), 'people', 'person', target.id));
    assert.equal((await r.db().prepare('SELECT epoch FROM privacy_epoch').first())!.epoch, 0);
    assert.equal((await r.db().prepare('SELECT count(*) AS n FROM ik_d1_staging').first())!.n, 1);
    assert.equal((await r.db().prepare('SELECT count(*) AS n FROM ik_d1_erasure_journal').first())!.n, 0);
    await retireD1ImportCustody(person, native, context(), checkpoint);
    assert.equal((await r.db().prepare('SELECT count(*) AS n FROM ik_d1_staging').first())!.n, 0);
    await assert.rejects(publishD1ImportPreparation(preparation.id, context()), /IMPORT_PREPARATION_NOT_FOUND/);
    if (job) { await resumeD1Import(job, context()); await undoD1Import(job, context()); }
    assert.ok(!JSON.stringify(await personTargets.list(r.db(), 'people')).includes(actor));
    assert.equal((await r.db().prepare('SELECT epoch FROM privacy_epoch').first())!.epoch, 1);
  }
});

for (const partial of [false, true]) test(`real D1: erasure removes normalized ${partial ? 'partially applied chunked' : 'completed'} custody, preserves peers and survives reopen/replay/undo`, async t => {
  const r = await runtime(t), { plan, job } = await create(r, partial);
  const published = await resumeD1Import(job.id, { ...r.context(), ...(partial ? { maxBatches: 1 } : {}) });
  assert.equal(published.state, partial ? 'applying' : 'completed');
  if (partial) assert.ok((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_d1_plan_chunks').first())!.n > 0);
  assert.equal((await erase(r)).erasedRecords, 1);
  assert.equal((await readD1ImportJob(job.id, r.context())).erasedRecords, 1);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test|private-long-answer-/);
  assert.match(await retained(r.db()), /person1@example\.test/);
  await r.reopen();
  assert.equal((await resumeD1Import(job.id, r.context())).state, 'completed');
  assert.equal((await targets.list(r.db(), 'workspace')).length, 2);
  assert.equal((await readD1PersistedImport(r.context())).provenance.length, 2);
  assert.equal((await createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint })).id, job.id);
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'new-key', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'after-undo', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test|private-long-answer-/);
  assert.equal((await targets.list(r.db(), 'workspace')).length, 0);
});

test('real D1: erasure is atomic with native statements, current authority and exact postconditions', async t => {
  const r = await runtime(t), { job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const before = await retained(r.db());
  for (const extra of [{ sql: 'UPDATE sessions SET enabled=0' }, { sql: 'INSERT INTO missing_table VALUES(1)' }]) {
    await assert.rejects(eraseD1ImportTarget('contact', '0', [...targets.remove('workspace', 'contact', '0'), extra], r.context()));
    assert.equal(await retained(r.db()), before);
  }
  await assert.rejects(eraseD1ImportTarget('contact', '0', [], r.context()), /IMPORT_ATOMIC_GUARD/);
  assert.equal(await retained(r.db()), before);
  await r.db().prepare("UPDATE evidence SET detail='later unrelated edit' WHERE id='1'").run();
  await erase(r);
  await assert.rejects(undoD1Import(job.id, r.context()), /NATIVE_EDIT_CONFLICT/);
  assert.equal((await r.db().prepare("SELECT detail FROM evidence WHERE id='1'").first())?.detail, 'later unrelated edit');
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: erased source reuse reconciles original, reused and previously reversed jobs', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context()); await undoD1Import(job.id, r.context());
  const next = await createD1ImportJob(plan, { ...r.context(), operationKey: 'second', reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(next.id, r.context());
  const reused = await createD1ImportJob(plan, { ...r.context(), operationKey: 'third', reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(reused.id, r.context());
  assert.equal((await erase(r)).erasedRecords, 3);
  assert.equal((await undoD1Import(job.id, r.context())).state, 'undone');
  assert.equal((await undoD1Import(reused.id, r.context())).state, 'undone');
  assert.equal((await undoD1Import(next.id, r.context())).state, 'undone');
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: an apply prepared before erasure loses its atomic boundary and cannot resurrect data', async t => {
  const r = await runtime(t), { job } = await create(r);
  await resumeD1Import(job.id, { ...r.context(), maxBatches: 1 });
  const ctx = r.context(); let erased = false;
  const racing: D1Database = { prepare: query => ctx.storage.database.prepare(query), async batch(statements) {
    if (!erased && statements.length > 2) { erased = true; await erase(r); }
    return ctx.storage.database.batch(statements);
  } };
  await assert.rejects(resumeD1Import(job.id, { ...ctx, storage: { ...ctx.storage, database: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await readD1ImportJob(job.id, r.context())).checkpoint, 1);
  assert.equal((await resumeD1Import(job.id, r.context())).state, 'completed');
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: a create prepared before erasure cannot retain an obsolete private plan', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const ctx = r.context(); let erased = false;
  const racing: D1Database = { prepare: query => ctx.storage.database.prepare(query), async batch(statements) {
    if (!erased && statements.length > 2) { erased = true; await erase(r); }
    return ctx.storage.database.batch(statements);
  } };
  await assert.rejects(createD1ImportJob(plan, { ...ctx, reviewedFingerprint: plan.fingerprint, operationKey: 'racing-new-job', storage: { ...ctx.storage, database: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) AS n FROM ik_jobs').first())?.n, 1);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

test('real D1: unsupported retained artifacts fail before native erasure or plan changes', async t => {
  const r = await runtime(t), plan = await planD1Import(source(1), mapping, r.context());
  const job = await createD1ImportJob(plan, { ...r.context(), reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(job.id, r.context());
  const before = await retained(r.db());
  await assert.rejects(erase(r), /IMPORT_ERASURE_RETAINED_ORIGINAL/);
  assert.equal(await retained(r.db()), before);
});

for (const partial of [false, true]) test(`real D1: additive erasure index upgrades prior ${partial ? 'partial chunked' : 'completed inline'} jobs without changing their plans`, async t => {
  const r = await runtime(t), { plan, job } = await create(r, partial);
  await resumeD1Import(job.id, { ...r.context(), ...(partial ? { maxBatches: 1 } : {}) });
  const before = await r.db().prepare('SELECT plan_json,fingerprint FROM ik_jobs WHERE id=?').bind(job.id).first();
  // Reproduce an installation before the additive schema: all original kit,
  // native rows and chunks remain exactly as the prior APIs stored them.
  await r.db().batch(['ik_d1_plan_index', 'ik_d1_indexed_jobs', 'ik_d1_erased_sources', 'ik_d1_erased_targets'].map(table => r.db().prepare(`DROP TABLE ${table}`)));
  await r.db().batch(d1ErasureSchema.map(statement => r.db().prepare(statement)));
  await assert.rejects(erase(r), /IMPORT_ERASURE_INDEX_UPGRADE_REQUIRED/);
  assert.ok(await targets.read(r.db(), 'workspace', 'contact', '0'));
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context(), 1), { indexed: 1, complete: true });
  assert.deepEqual(await r.db().prepare('SELECT plan_json,fingerprint FROM ik_jobs WHERE id=?').bind(job.id).first(), before);
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context()), { indexed: 0, complete: true });
  await erase(r);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test|private-long-answer-/);
  await resumeD1Import(job.id, r.context());
  assert.equal((await createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint })).id, job.id);
  await undoD1Import(job.id, r.context());
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'after-upgrade', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
});

test('real D1: erasure reconciles completed reused plans within one request and does not load unrelated plans', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const copies = [job.id];
  const count = process.env.IMPORT_KIT_SCALE === '1' ? 50 : 3;
  for (let n = 1; n < count; n++) {
    const copy = await createD1ImportJob(plan, { ...r.context(), operationKey: `copy-${n}`, reviewedFingerprint: plan.fingerprint });
    await resumeD1Import(copy.id, { ...r.context(), batchSize: 100 }); copies.push(copy.id);
  }
  const unrelated = normalized();
  for (const record of unrelated.records) record.sourceId = `other-${record.sourceId}`;
  const otherPlan = await planD1Import(unrelated, mapping, r.context());
  const other = await createD1ImportJob(otherPlan, { ...r.context(), operationKey: 'unrelated', reviewedFingerprint: otherPlan.fingerprint });
  await resumeD1Import(other.id, r.context());
  // A wholly unrelated retained plan is not read during this erase. Its exact
  // row stays intact; ordinary operations on that job still validate its body.
  const untouched = await r.db().prepare('SELECT * FROM ik_jobs WHERE id=?').bind(other.id).first();
  assert.equal((await erase(r)).erasedRecords, copies.length);
  assert.deepEqual(await r.db().prepare('SELECT * FROM ik_jobs WHERE id=?').bind(other.id).first(), untouched);
  for (const id of copies) assert.equal((await readD1ImportJob(id, r.context())).erasedRecords, 1);
  assert.equal((await readD1PersistedImport(r.context())).provenance.filter(row => row.targetId === '0').length, 0);
  await undoD1Import(copies.at(-1)!, r.context());
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'after-many-copies', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  assert.equal((await targets.list(r.db(), 'workspace')).length, 5);
});

test('real D1: erasure removes a queued different-source plan targeting the same native entity', async t => {
  const r = await runtime(t), { job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const other = normalized(); other.records[0].sourceId = 'other-source';
  const remap = { version: 'v1', map: (record: any) => ({ effects: [{ targetKind: 'contact', targetId: record.sourceId === 'other-source' ? '0' : record.sourceId, value: record.payload }] }) };
  const plan = await planD1Import(other, remap, r.context());
  const queued = await createD1ImportJob(plan, { ...r.context(), operationKey: 'pending-replacement', reviewedFingerprint: plan.fingerprint });
  assert.equal((await erase(r)).erasedRecords, 2);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
  await resumeD1Import(queued.id, r.context());
  assert.equal(await targets.read(r.db(), 'workspace', 'contact', '0'), undefined);
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'new-source-after-erase', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
});

test('real D1: index upgrades fence the exact prior plan and current session', async t => {
  const r = await runtime(t), { job } = await create(r);
  await r.db().prepare('DELETE FROM ik_d1_plan_index WHERE job_id=?').bind(job.id).run();
  await r.db().prepare('DELETE FROM ik_d1_indexed_jobs WHERE job_id=?').bind(job.id).run();
  const ctx = r.context(); let changed = false;
  const racing: D1Database = { prepare: query => ctx.storage.database.prepare(query), async batch(statements) {
    if (!changed && statements.length > 2) {
      changed = true;
      await r.db().prepare("UPDATE ik_jobs SET error='changed during upgrade' WHERE id=?").bind(job.id).run();
    }
    return ctx.storage.database.batch(statements);
  } };
  await assert.rejects(upgradeD1ImportErasureIndex({ ...ctx, storage: { ...ctx.storage, database: racing } }), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_d1_indexed_jobs').first())?.n, 0);
  await r.db().prepare('UPDATE sessions SET enabled=0').run();
  await assert.rejects(upgradeD1ImportErasureIndex(r.context()), /IMPORT_ATOMIC_GUARD/);
  assert.equal((await r.db().prepare('SELECT COUNT(*) n FROM ik_d1_plan_index').first())?.n, 0);
  await r.db().prepare('UPDATE sessions SET enabled=1').run();
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context()), { indexed: 1, complete: true });
});

for (const mutation of ['DELETE FROM ik_d1_plan_index WHERE job_id=? AND ordinal=0', "UPDATE ik_d1_plan_index SET target_identity='corrupt' WHERE job_id=? AND ordinal=0"]) test('real D1: changed or missing derived rows invalidate index completeness before erasure', async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  await resumeD1Import(job.id, r.context());
  const pending = await createD1ImportJob(plan, { ...r.context(), operationKey: 'queued-copy', reviewedFingerprint: plan.fingerprint });
  await r.db().prepare(mutation).bind(pending.id).run();
  assert.equal(await r.db().prepare('SELECT * FROM ik_d1_indexed_jobs WHERE job_id=?').bind(pending.id).first(), null);
  const before = await retained(r.db());
  await assert.rejects(erase(r), /IMPORT_ERASURE_INDEX_UPGRADE_REQUIRED/);
  assert.equal(await retained(r.db()), before);
  assert.deepEqual(await upgradeD1ImportErasureIndex(r.context()), { indexed: 1, complete: true });
  assert.equal((await erase(r)).erasedRecords, 2);
  await undoD1Import(job.id, r.context());
  await resumeD1Import(pending.id, r.context());
  assert.equal(await targets.read(r.db(), 'workspace', 'contact', '0'), undefined);
  assert.doesNotMatch(await retained(r.db()), /person0@example\.test/);
});

for (const tombstone of ['source', 'target']) test(`real D1: every retained replay independently refuses an erased ${tombstone}`, async t => {
  const r = await runtime(t), { plan, job } = await create(r);
  const identity = tombstone === 'source' ? plan.entries[0].identity : sha256(canonicalJson(['workspace', 'contact', '0']));
  await r.db().prepare(`INSERT INTO ik_d1_erased_${tombstone}s(destination,identity) VALUES(?,?)`).bind('workspace', identity).run();
  await assert.rejects(resumeD1Import(job.id, r.context()), /IMPORT_SOURCE_ERASED/);
  await assert.rejects(createD1ImportJob(plan, { ...r.context(), operationKey: 'original-file', reviewedFingerprint: plan.fingerprint }), /IMPORT_SOURCE_ERASED/);
  await assert.rejects(upgradeD1ImportErasureIndex(r.context()).then(async () => {
    await r.db().prepare('DELETE FROM ik_d1_indexed_jobs WHERE job_id=?').bind(job.id).run();
    await upgradeD1ImportErasureIndex(r.context());
  }), /IMPORT_SOURCE_ERASED/);
  assert.equal((await targets.list(r.db(), 'workspace')).length, 0);
});

test('real D1: a cancelled invitee sharing an active invitee\'s imported source is erased from custody by fields alone; the active peer keeps resume and undo', async t => {
  const r = await runtime(t), cancelled = 'cancelled-invitee@example.test', active = 'active-invitee@example.test';
  await r.db().batch([
    'CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,email TEXT,details TEXT,created_at TEXT,import_revision TEXT)',
    'CREATE TABLE privacy_epoch(epoch INTEGER)', 'INSERT INTO privacy_epoch VALUES(0)',
  ].map(sql => r.db().prepare(sql)));
  const context = () => ({ ...r.context(), destination: 'people', namespace: 'people', storage: { database: r.db(), targets: personTargets } });
  const census = async () => {
    const { results } = await r.db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%'").all<{ name: string }>();
    return canonicalJson(await Promise.all(results.map(async ({ name }) => (await r.db().prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results)));
  };
  // One booking source names both invitees; it maps to the active invitee's record only.
  const invitees = [{ name: 'Active Ann', email: active, status: 'active' }, { name: 'Cancelled Carl', email: cancelled, status: 'cancelled' }];
  const bundle = peopleSource([
    { ref: 'booking-1', name: 'Active Ann', email: active, details: { invitees } },
    { ref: 'booking-2', name: 'Other booking', email: 'other@example.test', details: { invitees: [{ name: 'Other', email: 'other@example.test', status: 'active' }] } },
  ]);
  const plan = await planD1Import(bundle, peopleMapping, context());
  const job = await createD1ImportJob(plan, { ...context(), operationKey: 'bookings.json', reviewedFingerprint: plan.fingerprint });
  await resumeD1Import(job.id, { ...context(), maxBatches: 1 });
  assert.ok((await census()).includes(cancelled));
  const fields = [{ path: ['details', 'invitees', '*', 'email'], value: cancelled }, { path: ['details', 'invitees', '*', 'name'], value: 'Cancelled Carl' }];
  const checkpoint = [{ sql: 'UPDATE privacy_epoch SET epoch=epoch+1' }];
  // Whole-record erasure binds what it severs to a native target, so it still needs one.
  await assert.rejects(retireD1ImportCustody({ values: [cancelled], related: { fields, source: () => true } }, [], context(), checkpoint), /IMPORT_RETIREMENT_TARGET_REQUIRED/);
  const entry = await retireD1ImportCustody({ values: [cancelled], related: { fields } }, [], context(), checkpoint);
  assert.equal(entry.phase, 'complete');
  assert.deepEqual(entry.retiredJobs, [], 'the shared job is kept for the active invitee');
  assert.equal((await r.db().prepare('SELECT epoch FROM privacy_epoch').first())!.epoch, 1);
  assert.ok(entry.stores.some(store => store.store === 'ik_d1_plan_chunks' || store.store === 'ik_jobs'));
  const after = await census();
  assert.ok(!after.includes(cancelled) && !after.includes('Cancelled Carl'), 'no plan, original, provenance, before-image or native row keeps the cancelled invitee');
  assert.ok(after.includes(active));
  const kept = [{ name: 'Active Ann', email: active, status: 'active' }, { status: 'cancelled' }];
  assert.deepEqual((await personTargets.read(r.db(), 'people', 'person', 'booking-1'))!.value.details.invitees, kept);
  await r.reopen();
  assert.equal((await resumeD1Import(job.id, context())).state, 'completed', 'the shared job resumes');
  assert.equal((await undoD1Import(job.id, context())).state, 'undone', 'and undoes');
  assert.equal(await personTargets.read(r.db(), 'people', 'person', 'booking-1'), undefined);
  assert.ok(!(await census()).includes(cancelled));
});

test('real D1: shared-source reimport keeps the active claim owner through invitee erasure and resumed undo', async t => {
  const r = await runtime(t), cancelled = 'cancelled-invitee@example.test', cancelledName = 'Cancelled Carl', active = 'active-invitee@example.test';
  await r.db().batch([
    'CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,email TEXT,details TEXT,created_at TEXT,import_revision TEXT)',
    'CREATE TABLE privacy_epoch(epoch INTEGER)', 'INSERT INTO privacy_epoch VALUES(0)',
  ].map(sql => r.db().prepare(sql)));
  const context = () => ({ ...r.context(), destination: 'people', namespace: 'people', storage: { database: r.db(), targets: personTargets } });
  const census = async () => {
    const { results } = await r.db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%'").all<{ name: string }>();
    return canonicalJson(await Promise.all(results.map(async ({ name }) => (await r.db().prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results)));
  };
  const assertErased = async () => {
    const contents = await census();
    assert.ok(!contents.includes(cancelled) && !contents.includes(cancelledName), 'every table remains free of the cancelled invitee name and email');
  };
  const invitees = [{ name: 'Active Ann', email: active, status: 'active' }, { name: cancelledName, email: cancelled, status: 'cancelled' }];
  const bundle = peopleSource([
    { ref: 'booking-1', name: 'Active Ann', email: active, details: { invitees } },
    { ref: 'booking-2', name: 'Other booking', email: 'other@example.test', details: {} },
  ]);
  const imports = [];
  for (const edition of ['first mapping', 'second mapping']) {
    const plan = await planD1Import(bundle, { version: 'v1', map: record => ({ effects: [{ targetKind: 'person', targetId: record.sourceId, value: { ...record.payload as any, details: { ...(record.payload as any).details, edition } } }] }) }, context());
    const job = await createD1ImportJob(plan, { ...context(), operationKey: edition, reviewedFingerprint: plan.fingerprint });
    imports.push({ job, plan, edition });
  }
  // Queue both reviewed plans before applying either. Apply/undo the first job
  // in custody scan order, then import the other: UUID randomness cannot choose
  // whether the old identity-only update overwrites the active owner's hashes.
  imports.sort((a, b) => a.job.id < b.job.id ? -1 : 1);
  const [earlier, current] = imports;
  assert.equal(earlier.plan.entries[0].identity, current.plan.entries[0].identity, 'both imports use the same source identity');
  assert.notEqual(canonicalJson(earlier.plan.entries[0].effects), canonicalJson(current.plan.entries[0].effects), 'each job keeps its own mapped effects');
  assert.equal((await resumeD1Import(earlier.job.id, context())).state, 'completed');
  assert.equal((await undoD1Import(earlier.job.id, context())).state, 'undone');
  assert.equal((await resumeD1Import(current.job.id, context())).state, 'completed');
  assert.equal((await r.db().prepare('SELECT job_id FROM ik_sources WHERE identity=?').bind(current.plan.entries[0].identity).first())!.job_id, current.job.id);
  assert.ok((await census()).includes(cancelled));
  const fields = [{ path: ['details', 'invitees', '*', 'email'], value: cancelled }, { path: ['details', 'invitees', '*', 'name'], value: cancelledName }];
  const entry = await retireD1ImportCustody({ values: [cancelled], related: { fields } }, [], context(), [{ sql: 'UPDATE privacy_epoch SET epoch=epoch+1' }]);
  assert.equal(entry.phase, 'complete');
  assert.deepEqual(entry.retiredJobs, [], 'both jobs retain their shared-source custody');
  assert.equal((await r.db().prepare('SELECT epoch FROM privacy_epoch').first())!.epoch, 1);
  await assertErased();
  const kept = [{ name: 'Active Ann', email: active, status: 'active' }, { status: 'cancelled' }];
  assert.deepEqual((await personTargets.read(r.db(), 'people', 'person', 'booking-1'))!.value, { name: 'Active Ann', email: active, details: { invitees: kept, edition: current.edition } });
  for (const { job } of imports) for (const original of await readD1ImportOriginals(job.id, context())) {
    if (original.original.status === 'retained') {
      const decoded = Buffer.from(original.original.base64, 'base64').toString();
      assert.ok(!decoded.includes(cancelled) && !decoded.includes(cancelledName), 'decoded retained originals are also clear');
    }
  }
  t.diagnostic('erasure complete; peer data and all-table/original privacy checks passed; reopening before active peer undo');
  await r.reopen();
  assert.equal((await undoD1Import(current.job.id, { ...context(), maxBatches: 1 })).state, 'undoing', 'the active peer starts a bounded undo after erasure');
  await r.reopen();
  assert.equal((await resumeD1Import(current.job.id, context())).state, 'undone', 'cold resume finishes the active peer undo');
  assert.equal(await personTargets.read(r.db(), 'people', 'person', 'booking-1'), undefined);
  assert.equal(await personTargets.read(r.db(), 'people', 'person', 'booking-2'), undefined);
  await assertErased();
  assert.equal((await undoD1Import(current.job.id, context())).state, 'undone', 'repeated undo is safe');
  await assertErased();
});

test('real D1: a resumable redaction whose one import job is more than a request finishes in metered steps, each inside the request limit, and the job still undoes', { timeout: 10 * 60_000 }, async t => {
  const r = await runtime(t), actor = 'U-ERASE-ONE-LARGE-JOB', people = 1100;
  await r.db().batch(['CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT,email TEXT,details TEXT,created_at TEXT,import_revision TEXT)', 'CREATE TABLE privacy_epoch(epoch INTEGER)', 'INSERT INTO privacy_epoch VALUES(0)'].map(sql => r.db().prepare(sql)));
  // The seed's own redaction scope, writing each redacted row with its own statement:
  // erasing one person from 1,100 people's reactions in one upload needs more than one request.
  const perRow = { ...personTargets, redaction: async (db: D1Database, destination: string, fields: any) => ({ ...await personTargets.redaction!(db, destination, fields), write: (rows: any[]) => rows.flatMap(row => personTargets.write(row)) }) };
  const context = (database: D1Database = r.db()) => ({ ...r.context(), destination: 'people', namespace: 'people', storage: { database, targets: perRow } });
  const census = async () => {
    const { results } = await r.db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%'").all<{ name: string }>();
    return canonicalJson(await Promise.all(results.map(async ({ name }) => (await r.db().prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results)));
  };
  const reactions = [{ name: 'eyes', count: 2, users: [actor, 'U-KEPT'] }];
  const plan = await planD1Import(peopleSource(Array.from({ length: people }, (_, i) => ({ ref: `reacted-${i}`, name: `Reacted ${i}`, email: `reacted-${i}@example.test`, details: { reactions } }))), peopleMapping, context());
  const job = await createD1ImportJob(plan, { ...context(), operationKey: 'one-large-upload', reviewedFingerprint: plan.fingerprint });
  while ((await resumeD1Import(job.id, { ...context(), batchSize: 100, maxBatches: 50 })).state !== 'completed');
  const fields = [{ path: ['details', 'reactions', '*', 'users', '*'], value: actor }];
  const steps: { statements: number; phase: string; jobsPending?: number }[] = [];
  let continuation: string | undefined, result: any;
  do {
    // Each call has the paid query budget and the existing 1,000-statement
    // erasure work ceiling, including every member of a batch.
    const m = meter(r.db());
    result = await m.request(`step-${steps.length + 1}`, () => retireD1ImportCustody({ values: [actor], related: { fields } }, [], context(m.database), [{ sql: 'UPDATE privacy_epoch SET epoch=epoch+1' }], { resumable: true, continuation }));
    assert.ok(m.snapshots[0].statements <= 1000, 'the erasure statement work ceiling is preserved');
    steps.push({ statements: m.snapshots[0].statements, phase: result.phase, jobsPending: result.jobsPending });
    continuation = result.continuation;
    assert.ok(steps.length <= 10, `the erasure finishes: ${JSON.stringify(steps)}`);
  } while (result.phase !== 'complete');
  t.diagnostic(`one job, ${people} reacted people: ${JSON.stringify(steps)}`);
  assert.ok(steps.filter(step => step.phase === 'redacting' && step.jobsPending === 1).length >= 1, 'the job was redacted in pages of its entries');
  assert.deepEqual(result.fieldMatches, [{ path: fields[0].path, matches: people * 3 }], 'every source, effect and native copy counted once');
  assert.ok((await readD1ErasureJournal(context())).length >= 2, 'each committed page and the final step leave a journal row');
  assert.ok(!(await census()).includes(actor), 'no plan, provenance, before-image or native row keeps the person');
  assert.equal((await r.db().prepare("SELECT count(*) AS n FROM people WHERE details LIKE '%U-KEPT%'").first<{ n: number }>())!.n, people, 'every peer keeps its other reactions');
  let undo; do undo = await undoD1Import(job.id, { ...context(), batchSize: 100, maxBatches: 50 }); while (undo.state === 'undoing');
  assert.equal(undo.state, 'undone', 'the redacted job still undoes');
  assert.equal((await r.db().prepare('SELECT count(*) AS n FROM people').first<{ n: number }>())!.n, 0);
});
