import { canonicalJson, sha256 } from '../../src/d1/index.ts';
import type { Json, SourceBundle } from '../../src/d1/index.ts';

type Person = { ref: string; name: string; email: string; details: Record<string, unknown> };

/** Synthetic engine-test custody. Production people now enter only through the door. */
export function peopleSource(people: Person[]): SourceBundle {
  const payloads = people.map(({ name, email, details }) => ({ name, email, details: details as Record<string, Json> }));
  const bytes = canonicalJson(payloads), hash = sha256(bytes), encoded = Buffer.from(bytes);
  return {
    diagnostics: [],
    artifacts: [{ name: 'people.json', sha256: hash, size: encoded.byteLength, original: { status: 'available', base64: encoded.toString('base64') } }],
    records: payloads.map((payload, index) => ({ namespace: 'people', kind: 'person', sourceId: people[index].ref,
      payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash,
      location: { artifact: 'people.json', row: index + 1 } })),
  };
}
