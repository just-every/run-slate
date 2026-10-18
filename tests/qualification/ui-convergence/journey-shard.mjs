import nodeTest from 'node:test';

/** Partition top-level journeys; nested steps stay together in their real workspace. */
export function inJourneyShard(ordinal, specification = '1/1') {
  const match = /^(\d+)\/(\d+)$/.exec(specification);
  if (!match) throw new Error('SLATE_UI_SHARD must be index/count.');
  const [, index, count] = match.map(Number);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index < 1 || count < 1 || index > count) throw new Error('Invalid SLATE_UI_SHARD partition.');
  return ordinal % count === index - 1;
}
let ordinal = 0;
export function journeyTest(name, options, run) {
  if (inJourneyShard(ordinal++, process.env.SLATE_UI_SHARD ?? '1/1')) return nodeTest(name, options, run);
}
