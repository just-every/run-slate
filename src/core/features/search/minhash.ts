/** Bottom-k MinHash over the current revision's normalized five-word shingles.
 * Keeping the 128 least hashes bounds index size independently of page length.
 * For smaller sets this is the exact hashed Jaccard, rather than a noisy sample. */
export interface ShingleMinHash { version: 1; hashes: number[] }
const sampleSize = 128;
function hash(value: string) {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  n = Math.imul(n ^ n >>> 16, 0x85ebca6b);
  n = Math.imul(n ^ n >>> 13, 0xc2b2ae35);
  return (n ^ n >>> 16) >>> 0;
}
export function minHashShingles(text: string): ShingleMinHash {
  const words = text.normalize('NFC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const values = new Set<number>();
  for (let i = 0; i + 5 <= words.length; i++) values.add(hash(words.slice(i, i + 5).join(' ')));
  return { version: 1, hashes: [...values].sort((a, b) => a - b).slice(0, sampleSize) };
}
export function minHashSimilarity(left: ShingleMinHash, right: ShingleMinHash): number {
  if (!left.hashes.length || !right.hashes.length) return 0;
  let a = 0, b = 0, shared = 0, union = 0;
  while (union < sampleSize && (a < left.hashes.length || b < right.hashes.length)) {
    const x = left.hashes[a] ?? Infinity, y = right.hashes[b] ?? Infinity;
    if (x === y) { shared++; a++; b++; }
    else if (x < y) a++;
    else b++;
    union++;
  }
  return shared / union;
}

/** Input order chooses the representative, so ranking and grouping agree.
 * Shared-hash postings avoid an all-pairs scan; a qualifying pair necessarily
 * shares at least threshold * max(sketch lengths) hashes. */
export function groupNearDuplicates<T extends { key: string; kind: string; minHash?: ShingleMinHash }>(rows: T[], threshold: number): string[][] {
  const groups: string[][] = [], representatives: T[] = [], postings = new Map<number, number[]>();
  for (const row of rows) {
    const signature = row.kind === 'page' ? row.minHash : undefined;
    let group: number | undefined;
    if (signature?.hashes.length) {
      const counts = new Map<number, number>();
      for (const value of signature.hashes) for (const index of postings.get(value) ?? []) counts.set(index, (counts.get(index) ?? 0) + 1);
      for (const [index, count] of [...counts].sort((a, b) => a[0] - b[0])) {
        const other = representatives[index]!.minHash!;
        if (count >= Math.ceil(threshold * Math.max(signature.hashes.length, other.hashes.length)) && minHashSimilarity(signature, other) >= threshold) { group = index; break; }
      }
    }
    if (group !== undefined) { groups[group]!.push(row.key); continue; }
    const index = groups.length;
    groups.push([row.key]); representatives.push(row);
    for (const value of signature?.hashes ?? []) {
      const members = postings.get(value) ?? [];
      members.push(index); postings.set(value, members);
    }
  }
  return groups;
}
