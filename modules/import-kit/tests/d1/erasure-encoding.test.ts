import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';
import { canonicalChunks, canonicalHash } from '../../src/provenance/canonical-stream.ts';
import { retainPlan } from '../../src/d1/plans.ts';
import { buildImportPlan } from '../../src/plan/index.ts';
import { checkSql } from '../../src/d1/budget.ts';

test('streamed canonical encoding and fingerprints equal existing JSON for Unicode, nested values and chunk boundaries', () => {
  for (const character of ['a', 'é', '漢', '🌱', '\ud800', '\udfff', '"', '\\']) {
    const value = { z: [null, false, 0, -0, 1.5, character.repeat(150000)], a: { nested: true } };
    const chunks = [...canonicalChunks(value)];
    assert.equal(chunks.join(''), canonicalJson(value));
    assert.equal(canonicalHash(value), sha256(canonicalJson(value)));
    assert.ok(chunks.every(chunk => Buffer.byteLength(chunk) <= 128 * 1024 && Buffer.from(chunk).toString('utf8') === chunk));
  }
});

test('large plans retain exact chunk order with bounded packed SQL instead of one statement per storage chunk', () => {
  const plan = buildImportPlan({ records: [], artifacts: [], diagnostics: [{ severity: 'warning', code: 'SOURCE_NOTE', message: 'quoted " Unicode 🌱'.repeat(100000) }] }, { version: 'v1', map() { throw new Error('No records'); } }, { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
  const retained = retainPlan(plan, 'job'), manifest = JSON.parse(retained.body);
  assert.ok(retained.statements.length < manifest.chunks);
  const chunks = retained.statements.flatMap(statement => { checkSql(statement); return JSON.parse(statement.params![0]); });
  assert.deepEqual(chunks.map(chunk => chunk.ordinal), Array.from({ length: manifest.chunks }, (_, ordinal) => ordinal));
  assert.equal(chunks.map(chunk => chunk.body).join(''), canonicalJson(plan));
});
