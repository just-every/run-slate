import type { ImportPlan, Json, PlanEntry } from '../../src/types.ts';

/** Exactly `bytes` JSON bytes using fewer than 54 distinct arrays, even near
 * 2^53. [v,v] costs 2*size(v)+3; [v,v,""] costs 2*size(v)+6.
 * Only the small test oracle may serialize these graphs. */
export function logicalValue(bytes: bigint): Json {
  if (bytes < 1n) throw new Error('positive fixture size required');
  if (bytes === 1n) return 0;
  if (bytes < 10n) return 'x'.repeat(Number(bytes - 2n));
  const odd = bytes % 2n === 1n;
  const child = logicalValue((bytes - (odd ? 3n : 6n)) / 2n);
  return odd ? [child, child] : [child, child, ''];
}

export function entry(payload: Json = '', kind = 'item'): PlanEntry {
  return {
    source: {
      namespace: 'archive', kind, sourceId: '1', payload, payloadHash: 'a'.repeat(64),
      artifactHash: 'b'.repeat(64), location: { artifact: 'test.json', row: 1 },
    },
    identity: 'c'.repeat(64), effects: [], unmapped: [],
  };
}

export function emptyPlan(): ImportPlan {
  return {
    version: 1, destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', principalId: 'owner',
    source: { records: [entry().source], artifacts: [], diagnostics: [] },
    entries: [], diagnostics: [],
    counts: { input: 1, unique: 0, duplicates: 0, mapped: 0, unmapped: 0, rejected: 0, effects: 0, byKind: {} },
    fingerprint: '',
  };
}

/** Independent native-serialization oracle, used only on physically small plans. */
export function serializedContentBytes(plan: ImportPlan): bigint {
  const { fingerprint: _, ...content } = plan;
  return BigInt(Buffer.byteLength(JSON.stringify(content)));
}
