import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPackage } from '../../../scripts/rer-package.mjs';
import { integrity } from '../../../scripts/rer-package/registry.mjs';
import { readPackage, writePackage } from '../../../global/update/archive.mjs';
import { build } from '../../../default-seed/node_modules/esbuild/lib/main.js';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  canonicalReceiptJson, createReceiptEvidencePort, signImporterVerificationReceipt,
  validateImporters, verifyImporterVerificationReceipt,
} from '../src/index.ts';
import { documentedFixture, digest, verifiedFixture } from './status/fixtures.ts';

async function fixture() {
  const existing = verifiedFixture();
  // Test-only data shaped like a real export; this is no claim of a captured vendor export.
  const tickets = [
    { id: 'synthetic-receipt-1', subject: 'Invoice correction', status: 'closed', updatedAt: '2026-10-05T10:00:00.000Z' },
    { id: 'synthetic-receipt-2', subject: 'Delivery follow-up', status: 'pending', updatedAt: '2026-10-05T11:00:00.000Z' },
  ];
  const attachment = { sourceId: tickets[0].id, name: 'invoice.txt', sha256: digest('Synthetic invoice attachment'), size: Buffer.byteLength('Synthetic invoice attachment') };
  const sourceBytes = Buffer.from(tickets.map((ticket) => JSON.stringify(ticket)).join('\n') + '\n');
  Object.assign(existing.payload.source, { sha256: digest(sourceBytes), size: sourceBytes.byteLength });
  const manifests = {
    rows: tickets,
    provenance: tickets.map(({ id }) => ({ sourceId: id, targetId: id, mappingVersion: existing.payload.mapping.version })),
    attachments: [attachment],
  };
  for (const kind of ['rows', 'provenance', 'attachments'] as const) {
    const manifest = manifests[kind];
    existing.payload.reconciliation[kind] = {
      sourceCount: manifest.length, targetCount: manifest.length,
      sourceManifestSha256: digest(canonicalReceiptJson(manifest)),
      targetManifestSha256: digest(canonicalReceiptJson(structuredClone(manifest))),
    };
  }
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const other = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const policy = {
    environment: 'test',
    keys: {
      test: { publicKey: keys.publicKey, environments: ['test'] },
      other: { publicKey: other.publicKey, environments: ['test'] },
    },
  };
  const receipt = await signImporterVerificationReceipt(existing.payload, 'test', keys.privateKey);
  return { ...existing, keys, policy, receipt };
}

test('public signer and verifier round trip canonical JSON independently of insertion order and host collation', async () => {
  const { receipt, policy, payload, keys } = await fixture();
  const reordered = Object.fromEntries(Object.entries(payload).reverse());
  const signedAgain = await signImporterVerificationReceipt(reordered, 'test', keys.privateKey);
  assert.equal(signedAgain.signature, receipt.signature);
  assert.equal((await verifyImporterVerificationReceipt(receipt, policy)).valid, true);
  assert.equal((await verifyImporterVerificationReceipt({ ...receipt, payload: reordered }, policy)).valid, true);
  const numericKeys = { '2': { z: 1, a: 2 }, '10': ['b', 'a'] };
  assert.equal(canonicalReceiptJson(numericKeys).indexOf('"10"') < canonicalReceiptJson(numericKeys).indexOf('"2"'), true);
  for (const lossy of [undefined, NaN, { field: undefined }, new Date(), [ , 1]]) {
    assert.throws(() => canonicalReceiptJson(lossy));
  }
  // Unmapped items keep code-unit order under any host collation; Danish sorts "aa" after "z".
  const items = [
    { sourceIdentitySha256: 'aa' + '1'.repeat(62), sourceKind: 'ticket', fields: ['tags'] },
    { sourceIdentitySha256: 'b2' + '2'.repeat(62), sourceKind: 'ticket', fields: ['priority'] },
  ];
  const identities = items.map((item) => item.sourceIdentitySha256);
  assert.deepEqual([...identities].sort(), identities);
  const withUnmapped = (ordered) => {
    const unmapped = structuredClone(payload);
    for (const run of [unmapped.runs.dryRun, unmapped.runs.apply]) run.unmapped = ordered.length;
    unmapped.unmapped = { count: ordered.length, itemManifestSha256: digest(canonicalReceiptJson(ordered)), items: ordered };
    return signImporterVerificationReceipt(unmapped, 'test', keys.privateKey);
  };
  const hostCompare = String.prototype.localeCompare;
  const danish = new Intl.Collator('da');
  String.prototype.localeCompare = function (that) { return danish.compare(String(this), String(that)); };
  try {
    assert.deepEqual([...identities].sort((left, right) => left.localeCompare(right)), [...identities].reverse());
    assert.equal((await verifyImporterVerificationReceipt(await withUnmapped(items), policy)).valid, true);
    assert.equal((await verifyImporterVerificationReceipt(await withUnmapped([...items].reverse()), policy)).valid, false);
  } finally {
    String.prototype.localeCompare = hostCompare;
  }
});

test('verification refuses tampering, unknown, wrong or misrestricted keys, synthetic data and noncanonical signatures', async () => {
  const { receipt, policy, keys } = await fixture();
  const unsortedBytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(receipt.payload).reverse())));
  assert.notEqual(new TextDecoder().decode(unsortedBytes), canonicalReceiptJson(receipt.payload));
  const signature = await crypto.subtle.sign('Ed25519', keys.privateKey, unsortedBytes);
  const altered = [
    { ...receipt, payload: { ...receipt.payload, command: receipt.payload.command + 'x' } },
    { ...receipt, keyId: 'unknown' },
    { ...receipt, keyId: 'other' },
    { ...receipt, payload: { ...receipt.payload, synthetic: true } },
    { ...receipt, payload: { ...receipt.payload, source: { ...receipt.payload.source, classification: 'synthetic' } } },
    { ...receipt, signature: Buffer.from(signature).toString('base64') },
  ];
  for (const value of altered) {
    assert.equal((await verifyImporterVerificationReceipt(value, policy)).valid, false);
  }
  for (const outsidePolicy of [{ ...policy, keys: {} }, { ...policy, environment: 'production' }]) {
    assert.equal((await verifyImporterVerificationReceipt(receipt, outsidePolicy)).valid, false);
  }
  // Only an omitted list or an array naming the environment admits a key; any other restriction fails closed.
  const production = (environments, environment = 'production') => ({ environment, keys: { test: { publicKey: keys.publicKey, environments } } });
  const misrestricted = ['non-production', 'preproduction', null, false, 0, '', {}, new Set(['production'])].map((environments) => production(environments));
  for (const odd of [...misrestricted, production(undefined, ['production'])]) {
    assert.equal((await verifyImporterVerificationReceipt(receipt, odd)).valid, false);
  }
  assert.equal((await verifyImporterVerificationReceipt(receipt, production(['test', 'review'], 'review'))).valid, true);
  await assert.rejects(signImporterVerificationReceipt({ ...receipt.payload, synthetic: true }, 'test', keys.privateKey));
  await assert.rejects(signImporterVerificationReceipt({ ...receipt.payload, source: { ...receipt.payload.source, classification: 'synthetic' } }, 'test', keys.privateKey));
});

test('signed receipts must include source digest and all schema counts, and nothing outside the schema', async () => {
  const { receipt, policy, keys } = await fixture();
  for (const remove of [
    (payload) => { delete payload.source.sha256; },
    (payload) => { delete payload.runs.apply.byKind; },
    (payload) => { delete payload.runs.dryRun.input; },
  ]) {
    const payload = structuredClone(receipt.payload);
    remove(payload);
    const bytes = new TextEncoder().encode(canonicalReceiptJson(payload));
    const signature = Buffer.from(await crypto.subtle.sign('Ed25519', keys.privateKey, bytes)).toString('base64');
    assert.equal((await verifyImporterVerificationReceipt({ ...receipt, payload, signature }, policy)).valid, false);
  }
  // Members named after Object.prototype properties are unknown members too, in the envelope and in a payload.
  for (const name of ['constructor', '__proto__', 'toString']) {
    const published = JSON.parse(JSON.stringify(receipt).replace('{', `{${JSON.stringify(name)}:{"synthetic":true},`));
    const result = await verifyImporterVerificationReceipt(published, policy);
    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), ['SCHEMA_ADDITIONAL_PROPERTY']);
    const payload = JSON.parse(canonicalReceiptJson(receipt.payload).replace('"source":{', `"source":{${JSON.stringify(name)}:"outside the schema",`));
    await assert.rejects(signImporterVerificationReceipt(payload, 'test', keys.privateKey), /SCHEMA_ADDITIONAL_PROPERTY/);
  }
});

test('the evidence port admits verified only with a verifying receipt and preserves documented format', async () => {
  const f = await fixture();
  const documented = documentedFixture();
  const document = { ...f.document, importers: [...f.document.importers, ...documented.document.importers.map((row) => ({ ...row, incumbent: 'OtherDesk' }))] };
  const artifacts = new Map([...f.artifacts, ...documented.artifacts]);
  const port = createReceiptEvidencePort({ resolve: (link) => artifacts.get(link), trustedHosts: ['evidence.example.test', 'docs.example.test'] }, f.policy);
  const publish = (receipt) => {
    const bytes = new TextEncoder().encode(JSON.stringify(receipt));
    artifacts.set(f.receiptLink, { url: f.receiptLink, bytes });
    Object.assign(document.importers[0].evidence, { sha256: digest(bytes), size: bytes.length });
  };
  publish(f.receipt);
  const before = structuredClone(document);
  const accepted = await validateImporters(document, port);
  assert.equal(accepted.valid, true, JSON.stringify(accepted.issues));
  assert.equal(accepted.evidence.verifiedReceipts, 1);
  assert.deepEqual(document, before);
  publish({ ...f.receipt, keyId: 'other' });
  const refused = await validateImporters(document, port);
  assert.equal(refused.valid, false);
  assert.equal(refused.evidence.verifiedReceipts, 0);
  assert.equal((await validateImporters(documented.document, port)).valid, true);
  publish(f.receipt);
  const production = createReceiptEvidencePort(port, { ...f.policy, environment: 'production' });
  const outsideEnvironment = await validateImporters(document, production);
  assert.equal(outsideEnvironment.valid, false);
  assert.equal(outsideEnvironment.evidence.verifiedReceipts, 0);
  assert.ok(outsideEnvironment.issues.some((issue) => issue.code === 'RECEIPT_KEY_UNTRUSTED'));

  const refuses = async (evidencePort, code) => {
    const result = await validateImporters(document, evidencePort);
    assert.equal(result.valid, false);
    assert.equal(result.evidence.verifiedReceipts, 0);
    assert.ok(result.issues.some((issue) => issue.code === code), JSON.stringify(result.issues));
  };
  // Check resolver and byte pins through the environment-scoped port, without changing the signed claims.
  for (const link of [f.receiptLink, f.researchLink]) {
    await refuses(createReceiptEvidencePort({ ...port, resolve: (requested) => requested === link ? undefined : artifacts.get(requested) }, f.policy), 'EVIDENCE_NOT_FOUND');
    await refuses(createReceiptEvidencePort({ ...port, resolve: (requested) => {
      const artifact = artifacts.get(requested);
      return requested === link ? { ...artifact, url: link + '/redirected' } : artifact;
    } }, f.policy), 'EVIDENCE_URL_MISMATCH');
    const original = artifacts.get(link)!;
    const changed = new Uint8Array(original.bytes);
    changed[0] ^= 1;
    artifacts.set(link, { ...original, bytes: changed });
    await refuses(port, 'EVIDENCE_HASH_MISMATCH');
    artifacts.set(link, original);
  }
  await refuses(createReceiptEvidencePort({ ...port, trustedHosts: ['docs.example.test'] }, f.policy), 'EVIDENCE_PUBLISHER_UNTRUSTED');
  publish({ ...f.receipt, payload: { ...f.receipt.payload, command: f.receipt.payload.command + ' changed' } });
  await refuses(port, 'RECEIPT_SIGNATURE_INVALID');
  // A valid signature and updated artifact pins cannot repair inconsistent signed claims.
  for (const [mutate, code] of [
    [(payload) => { payload.mapping.policy += ' changed'; }, 'RECEIPT_MAPPING_HASH_MISMATCH'],
    [(payload) => { payload.research.sha256 = digest('Other finished research'); }, 'RESEARCH_HASH_MISMATCH'],
    ...['rows', 'provenance', 'attachments'].map((kind) => [
      (payload) => { payload.reconciliation[kind].targetManifestSha256 = digest('Different persisted manifest'); },
      'RECONCILIATION_MISMATCH',
    ]),
  ]) {
    const payload = structuredClone(f.payload);
    mutate(payload);
    publish(await signImporterVerificationReceipt(payload, 'test', f.keys.privateKey));
    await refuses(port, code);
  }
  // Bypass the signer's schema guard to model a trusted issuer wrongly labelling a synthetic source as real.
  const syntheticPayload = { ...f.payload, source: { ...f.payload.source, classification: 'synthetic' } };
  const signature = await crypto.subtle.sign('Ed25519', f.keys.privateKey, new TextEncoder().encode(canonicalReceiptJson(syntheticPayload)));
  publish({ ...f.receipt, payload: syntheticPayload, signature: Buffer.from(signature).toString('base64') });
  await refuses(port, 'SCHEMA_CONST');
  publish(f.receipt);
  assert.equal((await validateImporters(document, port)).valid, true);
});

test('Worker and Node exchange packed receipts using WebCrypto without nodejs_compat and judge export origins alike', async (t) => {
  const f = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'receipt-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = fileURLToPath(new URL('../../../', import.meta.url));
  const tarball = await buildPackage(base, root);
  const installed = join(root, 'node_modules/@runeditrun/rer');
  await mkdir(join(root, 'node_modules/@runeditrun'), { recursive: true });
  const packedBytes = await readFile(tarball);
  await writePackage(readPackage(packedBytes, { integrity: integrity(packedBytes) }), installed);
  const nodeBundle = await build({
    stdin: { resolveDir: root, contents: "export * from '@runeditrun/rer/modules/import-kit/receipt';" },
    bundle: true, platform: 'node', format: 'esm', write: false,
  });
  const { signImporterVerificationReceipt, verifyImporterVerificationReceipt } = await import('data:text/javascript;base64,' + Buffer.from(nodeBundle.outputFiles[0].text).toString('base64'));
  // Origins whose URL/IDNA parse differs by runtime get the one verdict of the module's ASCII grammar in Node and the Worker.
  // So does a path of 2^23 + 1 characters, more than V8's regexp backtrack stack holds for a grouped path pattern.
  const origins = new Map([
    ['https://exampledesk.example.test/account/export', true], ['https://xn--a.test/export', true],
    ['https://xn--abc-.test/export', false], ['https://\u04c0.test/export', false],
    [`https://exampledesk.example.test/${'a'.repeat(2 ** 23)}`, true],
  ]);
  const originReceipts = await Promise.all([...origins.keys()].map((origin) => signImporterVerificationReceipt(
    { ...f.payload, source: { ...f.payload.source, origin } }, 'test', f.keys.privateKey)));
  const bundle = await build({
    stdin: { resolveDir: root, contents: `
      import { signImporterVerificationReceipt, verifyImporterVerificationReceipt, createReceiptEvidencePort } from '@runeditrun/rer/modules/import-kit/receipt';
      import { validateImporters } from '@runeditrun/rer/modules/import-kit/status';
      export default { async fetch(request) {
        const input = await request.json();
        const publicKey = await crypto.subtle.importKey('raw', new Uint8Array(input.publicKey), 'Ed25519', false, ['verify']);
        const policy = { environment: 'test', keys: { test: { publicKey, environments: ['test'] } } };
        const accepted = await verifyImporterVerificationReceipt(input.receipt, policy);
        const refused = await verifyImporterVerificationReceipt(input.receipt, { ...policy, environment: 'production' });
        const evidence = createReceiptEvidencePort({ trustedHosts: ['evidence.example.test'], resolve(link) {
          const artifact = input.artifacts.find(([url]) => url === link)?.[1];
          return artifact && { url: artifact.url, bytes: new Uint8Array(artifact.bytes) };
        } }, policy);
        const registry = await validateImporters(input.document, evidence);
        const origins = await Promise.all(input.originReceipts.map(async (receipt) => (await verifyImporterVerificationReceipt(receipt, policy)).valid));
        const keys = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
        const receipt = await signImporterVerificationReceipt(input.receipt.payload, 'worker', keys.privateKey);
        return Response.json({ accepted, refused, registry, origins, receipt, publicKey: Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))) });
      } };
    ` },
    bundle: true, platform: 'browser', format: 'esm', write: false,
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-01' }));
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(f.receipt));
    const document = structuredClone(f.document);
    Object.assign(document.importers[0].evidence, { sha256: digest(bytes), size: bytes.length });
    const artifacts = new Map(f.artifacts);
    artifacts.set(f.receiptLink, { url: f.receiptLink, bytes });
    const response = await mf.dispatchFetch('https://receipt.test', {
      method: 'POST', body: JSON.stringify({ receipt: f.receipt, originReceipts, document, artifacts: [...artifacts].map(([url, artifact]) => [url, { url: artifact.url, bytes: [...artifact.bytes] }]), publicKey: Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', f.keys.publicKey))) }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.accepted.valid, true, JSON.stringify(result.accepted.issues));
    assert.equal(result.refused.valid, false);
    assert.equal(result.registry.valid, true, JSON.stringify(result.registry.issues));
    assert.equal(result.registry.evidence.verifiedReceipts, 1);
    const node = await Promise.all(originReceipts.map(async (receipt) => (await verifyImporterVerificationReceipt(receipt, f.policy)).valid));
    assert.deepEqual({ node, worker: result.origins }, { node: [...origins.values()], worker: [...origins.values()] });
    const publicKey = await crypto.subtle.importKey('raw', new Uint8Array(result.publicKey), 'Ed25519', false, ['verify']);
    assert.equal((await verifyImporterVerificationReceipt(result.receipt, { environment: 'test', keys: { worker: { publicKey } } })).valid, true);
  } finally {
    await mf.dispose();
  }
});
