import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelD1ImportStaging, createD1ImportStream, readD1ImportStream,
  eraseD1ImportTarget, prepareD1ImportStream, publishD1ImportPreparation,
} from '../../src/d1/index.ts';
import { sqliteRuntime, sqliteMapping } from './sqlite-runtime.ts';
import { planD1ImportStream } from '../../src/d1/index.ts';
import { normalizedPreparation, emptyPreparationTables, publicPreparationTables } from './preparation-fixture.ts';
import { returnFixture, returnObserver, isPublication, assertPublishedOnly, type ReturnPath } from './published-return-fixture.ts';

for (const path of ['fresh', 'cold'] as ReturnPath[]) {
  test(`${path} publication returns a create-authorized job and exact replay survives stale cancellation`, async t => {
    const r = await returnFixture(t, path), actions: string[] = [];
    const context = { ...r.context(), authorization: { ...r.context().authorization,
      predicate(action: any, destination: string) {
        actions.push(action);
        return action === 'read' ? { sql: '0' } : r.context().authorization.predicate(action, destination);
      },
    } };
    const job = await r.invoke(context);
    assert.equal(job.total, r.plan.header.counts.unique);
    assert.equal(job.fingerprint, r.plan.fingerprint);
    assert.equal(job.checkpoint, 0);
    assert.equal(job.error, null);
    assert.ok(actions.every(action => action === 'create'));
    assertPublishedOnly(r);
    assert.equal((await createD1ImportStream(r.plan, { ...context, reviewedFingerprint: r.plan.fingerprint })).id, job.id);
    await assert.rejects(readD1ImportStream(job.id, context));
    await cancelD1ImportStaging(r.plan.fingerprint, r.context());
    assert.equal((await readD1ImportStream(job.id, r.context())).id, job.id);
    assertPublishedOnly(r);
  });

  test(`${path} publication cannot return success after current authority is revoked`, async t => {
    const r = await returnFixture(t, path);
    let revoked = false;
    const observer = returnObserver(r.db(), (phase, queries) => {
      if (phase === 'after' && isPublication(queries)) {
        revoked = true;
        r.native().exec('UPDATE native_authority SET enabled=0');
      }
    });
    await assert.rejects(r.invoke({ ...r.context(), storage: { ...r.context().storage, database: observer.database } }));
    assert.equal(revoked, true);
    assertPublishedOnly(r);
    const winner = r.native().prepare('SELECT id FROM ik_d1_streams').get()!;
    await assert.rejects(readD1ImportStream(String(winner.id), r.context()));
  });
}

test('erasure removes a private preparation and prevents cold publication or a new import of the same source', async t => {
  const r = await sqliteRuntime(t), source = normalizedPreparation(3);
  const plan = await planD1ImportStream(source, sqliteMapping, r.context());
  const context = { ...r.context(), reviewedFingerprint: plan.fingerprint };
  const preparation = await prepareD1ImportStream(source, sqliteMapping, context);
  await eraseD1ImportTarget('record', '1', [], r.context());
  emptyPreparationTables(r.native());
  emptyPreparationTables(r.native(), publicPreparationTables);
  await assert.rejects(publishD1ImportPreparation(preparation.id, r.context()));
  await assert.rejects(prepareD1ImportStream(source, sqliteMapping, context), /IMPORT_SOURCE_ERASED|IMPORT_ATOMIC_GUARD/);
  await assert.rejects(createD1ImportStream(plan, context), /IMPORT_SOURCE_ERASED|IMPORT_ATOMIC_GUARD/);
  emptyPreparationTables(r.native());
  emptyPreparationTables(r.native(), publicPreparationTables);
});
