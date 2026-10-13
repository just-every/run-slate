import test from 'node:test';
import { effectCount } from './scale-size.ts';
import assert from 'node:assert/strict';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';
import { atomicStatements } from '../../src/d1/database.ts';
import { checkSql } from '../../src/d1/budget.ts';
import { policyHash, reportHash, reversalGuards } from '../../src/d1/undo-state.ts';
import type { D1UndoDisposition } from '../../src/d1/undo-types.ts';
import { classification } from './preserved-native-set.ts';
import { classifyUndo } from '../../src/d1/undo-snapshot.ts';

test('production reversal guards pack distinct dispositions with bounded SQL and bindings', () => {
  const jobId = "job'); DROP TABLE ik_jobs; --";
  const evidence = { revision: null, valueHash: null, attachmentHash: null, ownedHash: null, ownedValue: null };
  const dispositions: D1UndoDisposition[] = Array.from({ length: effectCount }, (_, i) => ({
    jobId, effectId: sha256(String(i)), targetKind: 'record', targetId: String(i), entity: { table: 'records', recordId: String(i) },
    disposition: 'retained', reason: 'edited', expected: evidence, observed: evidence, protectedBy: [], evidence: null,
  }));
  const rows = dispositions.map((d, position) => ({ job_id: jobId, effect_id: d.effectId, position, record_json: canonicalJson(d) }));
  const state = { policy: 'preserve-conflicts' as const, binding: policyHash(jobId, sha256('plan'), 'preserve-conflicts'), cursor: rows.length, hash: reportHash(rows), rows, dispositions };
  const packed = atomicStatements({ destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner', predicate: () => ({ sql: '1' }) } }, 'undo', reversalGuards(jobId, state));
  assert.ok(packed.length < rows.length, 'reversal guards are packed rather than expanded per disposition');
  for (const statement of packed) { checkSql(statement); assert.ok(!statement.sql.includes(jobId)); }
  console.log(JSON.stringify({ accumulatedGuardBudget: { rows: rows.length, statements: packed.length, maxBindings: Math.max(...packed.map(s => s.params?.length ?? 0)), maxSqlBytes: Math.max(...packed.map(s => Buffer.byteLength(s.sql))) } }));
});

for (const presence of ['all', 'mixed', 'none']) test(`production first undo snapshot packs effects without per-observation SQL (present=${presence})`, () => {
  const { effects, snapshot, context } = classification(effectCount);
  // Use mixed edited/absent effects so every observation has a disposition,
  // including SQL NULL-sensitive evidence, without any native mutation batch.
  snapshot.observations.forEach((o, i) => { o.current = presence === 'none' || (presence === 'mixed' && i % 2) ? null : { ...o.current!, value: { number: i, nullable: 'edited' } }; });
  snapshot.nativeRows = snapshot.observations.flatMap(o => o.current ? [o.current] : []);
  context.storage.targets = { ...context.storage.targets, matches() { assert.fail('bulk native snapshot must not expand individual matches'); } };
  const decision = classifyUndo(effects, snapshot, context), packed = atomicStatements(context, 'undo', decision.guards);
  assert.equal(decision.ordered.length, effects.length); assert.ok(decision.ordered.every(d => d.disposition === 'retained'));
  assert.ok(packed.length < effects.length, 'snapshots are packed rather than expanded per observation');
  packed.forEach(checkSql);
  console.log(JSON.stringify({ firstSnapshotBudget: { effects: effects.length, present: snapshot.nativeRows.length, statements: packed.length, maxBindings: Math.max(...packed.map(s => s.params?.length ?? 0)), maxSqlBytes: Math.max(...packed.map(s => Buffer.byteLength(s.sql))) } }));
});
