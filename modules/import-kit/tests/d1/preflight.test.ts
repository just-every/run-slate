import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan } from '../../src/plan/index.ts';
import { preflightD1ImportJob, type D1CreatePreflightContext } from '../../src/d1/index.ts';
import { creationStatements } from '../../src/d1/creation.ts';
import { checkSql } from '../../src/d1/budget.ts';
import { jsonChunks, PACKED_JSON_BYTES } from '../../src/d1/sets.ts';
const context: D1CreatePreflightContext = { destination: 'destination', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner', predicate: () => ({ sql: 'EXISTS(SELECT 1 FROM sessions WHERE id=?)', params: ['current-session'] }) } };
test('pure admission uses actual UTF-8 and JSON escaping, with no database port', () => {
  const message = '\\"🌱漢\ud800'.repeat(60000);
  const plan = buildImportPlan({ records: [], artifacts: [], diagnostics: [{ code: 'unicode', severity: 'warning', message }] }, { version: 'v1', map: () => ({ effects: [] }) }, context);
  const admitted = { ...context, reviewedFingerprint: plan.fingerprint };
  const result = preflightD1ImportJob(plan, admitted);
  assert.ok(result.maxBoundBytes <= 2000000 && result.maxSqlBytes <= 100000 && result.maxParameters <= 100);
  const statements = creationStatements(plan, admitted, '00000000-0000-0000-0000-000000000000', plan.fingerprint);
  statements.forEach(checkSql);
  const chunks = statements.filter(s => s.sql.startsWith('INSERT INTO ik_d1_plan_chunks')).flatMap(s => JSON.parse(s.params![0]));
  assert.equal(JSON.parse(chunks.map(c => c.body).join('')).diagnostics[0].message, message);
  assert.throws(() => preflightD1ImportJob(plan, { ...admitted, reviewedFingerprint: 'changed' }), /REVIEW_FINGERPRINT_MISMATCH/);
  assert.throws(() => preflightD1ImportJob(plan, { ...admitted, authorization: { ...context.authorization, predicate: () => ({ sql: '1=?', params: ['🌱'.repeat(500001)] }) } }), /IMPORT_D1_VALUE_LIMIT/);
});
test('packed JSON exact byte boundaries account for escaped strings and array punctuation', () => {
  const rows = Array.from({ length: 20 }, (_, ordinal) => ({ ordinal, body: '\\"🌱'.repeat(20000) }));
  const chunks = jsonChunks(rows, PACKED_JSON_BYTES);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flatMap(c => JSON.parse(c)), rows);
  assert.ok(chunks.every(c => Buffer.byteLength(c) <= PACKED_JSON_BYTES));
});
