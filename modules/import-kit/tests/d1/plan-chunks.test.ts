import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildImportPlan } from '../../src/plan/index.ts';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';
import { encodePlan } from '../../src/d1/plans.ts';
import { SNAPSHOT_BYTES } from '../../src/d1/sets.ts';

test('plan encoding retains a large exact original within a 512 MB heap', async () => {
  const result = await promisify(execFile)(process.execPath, ['--max-old-space-size=512', fileURLToPath(new URL('./plan-memory-probe.ts', import.meta.url))], { timeout: 120000, maxBuffer: 100000 });
  const stats = JSON.parse(result.stdout.trim());
  assert.equal(stats.originalBytes, 24000000); assert.ok(stats.chunks > 1);
  console.log(JSON.stringify({ boundedPlanEncoding: stats }));
});

test('plan chunks preserve UTF-8 code points, exact digests and chunk boundaries', () => {
  for (const character of ['a', 'é', '漢', '🌱', '\ud800', '\udfff']) for (let offset = 0; offset < 5; offset++) {
    const message = 'x'.repeat(SNAPSHOT_BYTES - 256 + offset) + character.repeat(SNAPSHOT_BYTES);
    const plan = buildImportPlan({ records: [], artifacts: [], diagnostics: [{ severity: 'warning', code: 'SOURCE_NOTE', message }] }, { version: 'v1', map() { throw new Error('no records'); } }, { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
    const encoded = encodePlan(plan, 'job'), body = canonicalJson(plan), manifest = JSON.parse(encoded.body);
    assert.equal(encoded.chunks.map(c => c.body).join(''), body);
    assert.ok(encoded.chunks.every((c, i) => c.ordinal === i && Buffer.byteLength(c.body) <= SNAPSHOT_BYTES && Buffer.from(c.body).toString('utf8') === c.body));
    assert.equal(manifest.size, Buffer.byteLength(body)); assert.equal(manifest.sha256, sha256(body)); assert.equal(manifest.chunks, encoded.chunks.length);
    assert.equal(JSON.parse(encoded.chunks.map(c => c.body).join('')).diagnostics[0].message, message);
  }
});
