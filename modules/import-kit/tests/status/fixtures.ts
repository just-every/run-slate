import { createHash, generateKeyPairSync, sign } from 'node:crypto';

export interface TestArtifact {
  url: string;
  bytes: Uint8Array;
}

export interface VerifiedFixtureOptions {
  mutatePayload?: (payload: Record<string, any>) => void;
  corruptSignature?: boolean;
  missingReceipt?: boolean;
}

export function digest(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function documentedFixture(link = 'https://docs.example.test/export-format', bytes = Buffer.from('Published parser format: newline-delimited JSON.')) {
  const document = {
    $schema: './schema/importers.schema.json',
    schemaVersion: 1,
    importers: [{
      incumbent: 'ExampleDesk',
      product: 'Lily',
      status: 'documented format',
      evidence: {
        link,
        sha256: digest(bytes),
        size: bytes.byteLength,
        sourceRepository: 'urn:git:commit:d24f3f7b4785863a0438a5fa7fde43d71f772a4b',
        sourceRevision: 'd24f3f7b4785863a0438a5fa7fde43d71f772a4b',
        sourcePath: 'ZENDESK-IMPORT.md',
        sourceSha256: 'f5a89acdab7e3a55f873d8fd12c336d106a370345d94f87117920dc94539f5c5',
        validation: 'synthetic-only',
        realExport: 'not-supplied',
      },
    }],
  };
  const artifacts = new Map([[link, { url: link, bytes } satisfies TestArtifact]]);
  return { document, artifacts, link, bytes };
}

export function noImporterFixture() {
  const link = 'evidence://importers/no-exampledesk';
  const bytes = Buffer.from('No ExampleDesk importer is present in this release.');
  const document = {
    $schema: './schema/importers.schema.json',
    schemaVersion: 1,
    importers: [{
      incumbent: 'ExampleDesk',
      product: 'Lily',
      status: 'none',
      evidence: {
        link,
        sha256: digest(bytes),
        size: bytes.byteLength,
        reason: 'No importer is present for this product and incumbent pair.',
        checkedAt: '2026-10-06T00:00:00.000Z',
      },
    }],
  };
  const artifacts = new Map([[link, { url: link, bytes } satisfies TestArtifact]]);
  return { document, artifacts, link, bytes };
}

export function verifiedFixture(options: VerifiedFixtureOptions = {}) {
  const keyPair = generateKeyPairSync('ed25519');
  const publicKey = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const researchLink = 'https://evidence.example.test/research.md';
  const receiptLink = 'https://evidence.example.test/receipt.json';
  const researchBytes = Buffer.from('Finished research report. No personal data or export rows are included.');
  const manifestSha256 = digest('["identity-1","identity-2"]');
  const emptyManifestSha256 = digest('[]');
  const mappingPolicy = 'Map each source ticket to one inert historical ticket and one provenance row.';
  const payload: Record<string, any> = {
    incumbent: 'ExampleDesk',
    product: 'Lily',
    synthetic: false,
    source: {
      classification: 'authorized-real-export',
      origin: 'https://exampledesk.example.test/account/export',
      exportedAt: '2026-10-05T12:00:00.000Z',
      format: 'ExampleDesk account export NDJSON',
      version: '2026-10',
      sha256: 'c'.repeat(64),
      size: 4096,
    },
    candidate: { repository: 'urn:git:commit:' + 'a'.repeat(40), revision: 'a'.repeat(40) },
    adapter: { repository: 'urn:git:commit:' + 'b'.repeat(40), revision: 'b'.repeat(40) },
    mapping: { version: '1.0', policy: mappingPolicy, policySha256: digest(mappingPolicy) },
    command: 'pnpm run import:exampledesk --offline --apply',
    runs: {
      dryRun: { input: 2, unique: 2, duplicates: 0, mapped: 2, unmapped: 0, rejected: 0, effects: 2, byKind: { ticket: 2 } },
      apply: { input: 2, unique: 2, duplicates: 0, mapped: 2, unmapped: 0, rejected: 0, effects: 2, byKind: { ticket: 2 } },
    },
    reconciliation: {
      rows: { sourceCount: 2, targetCount: 2, sourceManifestSha256: manifestSha256, targetManifestSha256: manifestSha256 },
      provenance: { sourceCount: 2, targetCount: 2, sourceManifestSha256: manifestSha256, targetManifestSha256: manifestSha256 },
      attachments: { sourceCount: 0, targetCount: 0, sourceManifestSha256: emptyManifestSha256, targetManifestSha256: emptyManifestSha256 },
    },
    unmapped: { count: 0, itemManifestSha256: emptyManifestSha256, items: [] },
    research: { state: 'finished', sha256: digest(researchBytes) },
    review: { reviewer: 'review-team-1', reviewedAt: '2026-10-06T00:00:00.000Z', result: 'passed' },
  };
  options.mutatePayload?.(payload);
  const envelope = {
    schemaVersion: 1,
    type: 'runeditrun.importer-verification-receipt',
    keyId: 'test-evidence-key',
    algorithm: 'Ed25519',
    payload,
    signature: sign(null, Buffer.from(canonicalJson(payload)), keyPair.privateKey).toString('base64'),
  };
  if (options.corruptSignature) envelope.signature = Buffer.from('forged-signature').toString('base64');
  const receiptBytes = Buffer.from(JSON.stringify(envelope));
  const document = {
    $schema: './schema/importers.schema.json',
    schemaVersion: 1,
    importers: [{
      incumbent: 'ExampleDesk',
      product: 'Lily',
      status: 'verified',
      evidence: {
        link: receiptLink,
        sha256: digest(receiptBytes),
        size: receiptBytes.byteLength,
        research: { link: researchLink, sha256: digest(researchBytes), size: researchBytes.byteLength },
      },
    }],
  };
  const artifacts = new Map([
    [receiptLink, { url: receiptLink, bytes: receiptBytes } satisfies TestArtifact],
    [researchLink, { url: researchLink, bytes: researchBytes } satisfies TestArtifact],
  ]);
  const receiptPublicKeys = { 'test-evidence-key': publicKey };
  if (options.missingReceipt) artifacts.delete(receiptLink);
  return { document, artifacts, receiptLink, researchLink, receiptBytes, researchBytes, receiptPublicKeys, payload };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}
