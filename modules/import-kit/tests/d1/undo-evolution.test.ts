import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from '../../../container/adapters/d1-sqlite.mjs';
import { sqlitePort, sqliteTargets } from './sqlite-runtime.ts';
import { buildImportPlan } from '../../src/plan/index.ts';
import { d1Schema, preservedUndoEvolution, initializeD1ImportStorage, readD1ImportJob, readD1ImportUndoReport, applyD1ImportBatches, undoD1Import, canonicalJson } from '../../src/d1/index.ts';

test('evolution preserves existing strict jobs and is idempotent through setup', async t => {
  const native = new DatabaseSync(':memory:'); t.after(() => native.close());
  const db = sqlitePort(native);
  native.exec(d1Schema.slice(0, -preservedUndoEvolution.length).join(';'));
  native.exec('CREATE TABLE native_records(destination TEXT,kind TEXT,id TEXT,revision TEXT,value_json TEXT,PRIMARY KEY(destination,kind,id))');
  const ctx = { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', storage: { database: db, targets: sqliteTargets }, authorization: { principalId: 'owner', predicate: () => ({ sql: '1' }) } };
  const plan = buildImportPlan({ artifacts: [], records: [], diagnostics: [] }, { version: 'v1', map: () => ({ effects: [] }) }, ctx);
  native.prepare("INSERT INTO ik_jobs(id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,plan_json,state,total) VALUES('legacy','workspace','archive','v1','owner',?,?,?,'queued',0)").run(plan.fingerprint, plan.fingerprint, canonicalJson(plan));
  native.exec("INSERT INTO ik_original_sets VALUES('legacy',3)");
  await initializeD1ImportStorage(db); await initializeD1ImportStorage(db);
  assert.equal((await readD1ImportJob('legacy', ctx)).state, 'queued');
  assert.equal((await readD1ImportUndoReport('legacy', ctx)).policy, 'strict');
  await assert.rejects(undoD1Import('legacy', { ...ctx, reversalPolicy: 'preserve-conflicts' }), /REVERSAL_POLICY_CONFLICT/);
  await applyD1ImportBatches('legacy', ctx);
  assert.equal((await undoD1Import('legacy', ctx)).state, 'undone');
});
test('partial evolution fails clearly instead of accepting missing integrity columns', async t => {
  const native = new DatabaseSync(':memory:'); t.after(() => native.close());
  native.exec(d1Schema.slice(0, -preservedUndoEvolution.length).join(';'));
  native.exec(preservedUndoEvolution[0]);
  await assert.rejects(initializeD1ImportStorage(sqlitePort(native)), /IMPORT_SCHEMA_EVOLUTION_INCOMPLETE/);
});
test('setup rejects a partially removed creation-integrity evolution', async t => {
  const native = new DatabaseSync(':memory:'); t.after(() => native.close());
  const db = sqlitePort(native); await initializeD1ImportStorage(db);
  native.exec('DROP TRIGGER ik_d1_creation_plan_capture');
  await assert.rejects(initializeD1ImportStorage(db), /IMPORT_SCHEMA_EVOLUTION_INCOMPLETE/);
});
