import assert from 'node:assert/strict';
import { buildImportPlan } from '../../src/plan/index.ts';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';
import { encodePlan } from '../../src/d1/plans.ts';
import { SNAPSHOT_BYTES } from '../../src/d1/sets.ts';

// Runs in its own bounded heap so an allocation regression cannot take down
// the native D1 suite or hide behind a developer machine's larger heap.
const bytes = Buffer.alloc(24_000_000, 120);
const plan = buildImportPlan({ records: [], diagnostics: [], artifacts: [{ name: 'large.bin', size: bytes.length, sha256: sha256(bytes), original: { status: 'available', base64: bytes.toString('base64') } }] }, { version: 'v1', map() { throw new Error('no records'); } }, { destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', authorization: { principalId: 'owner' } });
console.error('Validated source and plan; encoding chunks.');
const encoded = encodePlan(plan, 'job'), manifest = JSON.parse(encoded.body);
assert.ok(encoded.chunks.length > 1);
assert.equal(manifest.chunks, encoded.chunks.length);
assert.ok(encoded.chunks.every((chunk, i) => chunk.job_id === 'job' && chunk.ordinal === i && Buffer.byteLength(chunk.body) <= SNAPSHOT_BYTES));
const reconstructed = encoded.chunks.map(chunk => chunk.body).join('');
assert.equal(reconstructed, canonicalJson(plan));
assert.equal(manifest.size, Buffer.byteLength(reconstructed));
assert.equal(manifest.sha256, sha256(reconstructed));
assert.deepEqual(Buffer.from(JSON.parse(reconstructed).source.artifacts[0].original.base64, 'base64'), bytes);
console.log(JSON.stringify({ originalBytes: bytes.length, chunks: encoded.chunks.length, heapUsed: process.memoryUsage().heapUsed }));
