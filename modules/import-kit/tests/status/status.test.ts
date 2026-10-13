import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImporters, type ImporterEvidencePort } from '../../src/status/index.ts';
import { canonicalJson, documentedFixture, digest, noImporterFixture, verifiedFixture } from './fixtures.ts';

function portFor(artifacts: Map<string, { url: string; bytes: Uint8Array }>, options: Partial<ImporterEvidencePort> = {}): ImporterEvidencePort {
  return {
    resolve: (link) => artifacts.get(link),
    trustedHosts: ['docs.example.test', 'evidence.example.test'],
    ...options,
  };
}

test('documented-format evidence resolves to pinned bytes and is accepted as synthetic-only', async () => {
  const fixture = documentedFixture();
  const result = await validateImporters(fixture.document, portFor(fixture.artifacts));
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.deepEqual(result.evidence, { required: 1, resolved: 1, verifiedReceipts: 0 });
});

test('none is accepted only with a resolved, hashed absence record', async () => {
  const fixture = noImporterFixture();
  const result = await validateImporters(fixture.document, portFor(fixture.artifacts));
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  fixture.document.importers[0].evidence.reason = '   ';
  const malformed = await validateImporters(fixture.document, portFor(fixture.artifacts));
  assert.equal(malformed.valid, false);
  assert.ok(malformed.issues.some((issue) => issue.code === 'SCHEMA_ONE_OF'));
});

test('a finished research report and signed real-export receipt can establish verified status', async () => {
  const fixture = verifiedFixture();
  const result = await validateImporters(fixture.document, portFor(fixture.artifacts, { receiptPublicKeys: fixture.receiptPublicKeys }));
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.deepEqual(result.evidence, { required: 2, resolved: 2, verifiedReceipts: 1 });
});

test('synthetic receipts and sources without a real export cannot establish verified status', async () => {
  const fixtures = [
    verifiedFixture({ mutatePayload: (payload) => { payload.synthetic = true; } }),
    verifiedFixture({ mutatePayload: (payload) => { payload.source.classification = 'synthetic'; } }),
  ];
  for (const fixture of fixtures) {
    const result = await validateImporters(fixture.document, portFor(fixture.artifacts, { receiptPublicKeys: fixture.receiptPublicKeys }));
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === 'SCHEMA_CONST'));
    assert.equal(result.evidence.verifiedReceipts, 0);
  }
});

test('missing receipts, wrong hashes, and untrusted receipt keys fail closed', async () => {
  const missing = verifiedFixture({ missingReceipt: true });
  const missingResult = await validateImporters(missing.document, portFor(missing.artifacts, { receiptPublicKeys: missing.receiptPublicKeys }));
  assert.ok(missingResult.issues.some((issue) => issue.code === 'EVIDENCE_NOT_FOUND'));

  const changed = verifiedFixture();
  changed.document.importers[0].evidence.sha256 = '0'.repeat(64);
  const changedResult = await validateImporters(changed.document, portFor(changed.artifacts, { receiptPublicKeys: changed.receiptPublicKeys }));
  assert.ok(changedResult.issues.some((issue) => issue.code === 'EVIDENCE_HASH_MISMATCH'));

  const untrusted = verifiedFixture();
  const untrustedResult = await validateImporters(untrusted.document, portFor(untrusted.artifacts));
  assert.ok(untrustedResult.issues.some((issue) => issue.code === 'RECEIPT_KEY_UNTRUSTED'));
});

test('signed but inconsistent row/provenance receipts are rejected', async () => {
  const fixture = verifiedFixture({
    mutatePayload: (payload) => {
      payload.reconciliation.rows.targetManifestSha256 = '0'.repeat(64);
    },
  });
  const result = await validateImporters(fixture.document, portFor(fixture.artifacts, { receiptPublicKeys: fixture.receiptPublicKeys }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === 'RECONCILIATION_MISMATCH'));
  assert.equal(result.evidence.verifiedReceipts, 0);
});

test('verified receipts retain a redacted, hashed manifest of unmapped source items', async () => {
  const fixture = verifiedFixture({
    mutatePayload: (payload) => {
      const items = [{ sourceIdentitySha256: 'd'.repeat(64), sourceKind: 'ticket', fields: ['custom_field:priority'] }];
      payload.runs.dryRun.unmapped = 1;
      payload.runs.apply.unmapped = 1;
      payload.unmapped = { count: 1, items, itemManifestSha256: digest(canonicalJson(items)) };
    },
  });
  const result = await validateImporters(fixture.document, portFor(fixture.artifacts, { receiptPublicKeys: fixture.receiptPublicKeys }));
  assert.equal(result.valid, true, JSON.stringify(result.issues));
});

test('signed receipt mapping and research hashes must bind to resolved artifacts', async () => {
  const badPolicy = verifiedFixture({ mutatePayload: (payload) => { payload.mapping.policy += ' altered'; } });
  const policyResult = await validateImporters(badPolicy.document, portFor(badPolicy.artifacts, { receiptPublicKeys: badPolicy.receiptPublicKeys }));
  assert.ok(policyResult.issues.some((issue) => issue.code === 'RECEIPT_MAPPING_HASH_MISMATCH'));

  const badResearch = verifiedFixture({ mutatePayload: (payload) => { payload.research.sha256 = '0'.repeat(64); } });
  const researchResult = await validateImporters(badResearch.document, portFor(badResearch.artifacts, { receiptPublicKeys: badResearch.receiptPublicKeys }));
  assert.ok(researchResult.issues.some((issue) => issue.code === 'RESEARCH_HASH_MISMATCH'));
});

test('links, hashes, strict properties, and duplicate pairs are enforced', async () => {
  const fixture = documentedFixture();
  fixture.document.importers[0].evidence.size += 1;
  const badSize = await validateImporters(fixture.document, portFor(fixture.artifacts));
  assert.ok(badSize.issues.some((issue) => issue.code === 'EVIDENCE_SIZE_MISMATCH'));

  const untrustedFixture = documentedFixture('https://attacker.example.test/export-format');
  const untrusted = await validateImporters(untrustedFixture.document, portFor(untrustedFixture.artifacts));
  assert.ok(untrusted.issues.some((issue) => issue.code === 'EVIDENCE_PUBLISHER_UNTRUSTED'));

  const unknownStatus = documentedFixture();
  unknownStatus.document.importers[0].status = 'synthetic';
  const unknown = await validateImporters(unknownStatus.document, portFor(unknownStatus.artifacts));
  assert.ok(unknown.issues.some((issue) => issue.code === 'SCHEMA_ONE_OF'));

  const duplicate = documentedFixture();
  duplicate.document.importers.push({ ...duplicate.document.importers[0], incumbent: 'exampledesk' });
  const duplicateResult = await validateImporters(duplicate.document, portFor(duplicate.artifacts));
  assert.ok(duplicateResult.issues.some((issue) => issue.code === 'DUPLICATE_PAIR'));

  const unknownProperty = documentedFixture();
  (unknownProperty.document.importers[0] as Record<string, unknown>).claim = 'verified';
  const propertyResult = await validateImporters(unknownProperty.document, portFor(unknownProperty.artifacts));
  assert.ok(propertyResult.issues.some((issue) => issue.code === 'SCHEMA_ONE_OF'));
});

test('resolved bytes must come from the requested URL and match the declared digest', async () => {
  const fixture = documentedFixture();
  const redirectingPort = portFor(fixture.artifacts, {
    resolve: (link) => ({ url: `${link}/redirected`, bytes: fixture.bytes }),
  });
  const redirected = await validateImporters(fixture.document, redirectingPort);
  assert.ok(redirected.issues.some((issue) => issue.code === 'EVIDENCE_URL_MISMATCH'));

  const wrongBytes = Buffer.from('different bytes');
  const hashMismatchPort = portFor(new Map([[fixture.link, { url: fixture.link, bytes: wrongBytes }]]));
  const hashMismatch = await validateImporters(fixture.document, hashMismatchPort);
  assert.ok(hashMismatch.issues.some((issue) => issue.code === 'EVIDENCE_SIZE_MISMATCH' || issue.code === 'EVIDENCE_HASH_MISMATCH'));
});

test('an invalid receipt signature is rejected even when artifact hashes are consistent', async () => {
  const fixture = verifiedFixture({ corruptSignature: true });
  const result = await validateImporters(fixture.document, portFor(fixture.artifacts, { receiptPublicKeys: fixture.receiptPublicKeys }));
  assert.ok(result.issues.some((issue) => issue.code === 'RECEIPT_SIGNATURE_INVALID'));
});

test('evidence metadata does not accept secret-bearing command text', async () => {
  const fixture = verifiedFixture({ mutatePayload: (payload) => { payload.command += ' --token=test-secret-value'; } });
  const result = await validateImporters(fixture.document, portFor(fixture.artifacts, { receiptPublicKeys: fixture.receiptPublicKeys }));
  assert.ok(result.issues.some((issue) => issue.code === 'RECEIPT_UNSAFE_TEXT'));
  assert.equal(digest(fixture.receiptBytes).length, 64);
});
