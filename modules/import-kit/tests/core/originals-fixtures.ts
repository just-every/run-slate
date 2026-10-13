import type { SourceBundle } from '../../src/types.ts';
import { canonicalJson, sha256 } from '../../src/provenance/identity.ts';

export function exactSource(): { bytes: Buffer; source: SourceBundle } {
  // Whitespace and unmapped wrapper content cannot be recovered from payloads.
  const bytes = Buffer.from('{\r\n  "wrapper": {"marker":"retain me", "unsupported":[3, 2, 1]},\n  "items": [ {"n":0}, {"n":1}, {"n":2} ]\r\n}\n');
  const payloads = JSON.parse(bytes.toString()).items, hash = sha256(bytes), name = 'exact-export.json';
  return { bytes, source: { artifacts: [{ name, sha256: hash, size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }], diagnostics: [], records: payloads.map((payload, i) => ({ namespace: 'archive', kind: 'item', sourceId: String(i), payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: { artifact: name, row: i + 1 } })) } };
}
