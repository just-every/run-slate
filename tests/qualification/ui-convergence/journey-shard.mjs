import nodeTest from 'node:test';
import { readFileSync } from 'node:fs';

// CI may move whole workspaces by name to balance measured costs. Unlisted new
// registrations retain ordinal partitioning; removed registrations execute nowhere.
const assignments = process.env.SLATE_UI_ASSIGNMENTS
  ? JSON.parse(readFileSync(process.env.SLATE_UI_ASSIGNMENTS, 'utf8')) : {};
if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) throw new Error('Journey assignments must be a name-to-partition object.');

/** Partition top-level journeys; nested steps stay together in their real workspace. */
export function inJourneyShard(ordinal, specification = '1/1', name, routes = {}) {
  const match = /^(\d+)\/(\d+)$/.exec(specification);
  if (!match) throw new Error('SLATE_UI_SHARD must be index/count.');
  const [, index, count] = match.map(Number);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index < 1 || count < 1 || index > count) throw new Error('Invalid SLATE_UI_SHARD partition.');
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error('Invalid journey ordinal.');
  const assigned = Object.hasOwn(routes, name) ? routes[name] : ordinal % count + 1;
  if (!Number.isSafeInteger(assigned) || assigned < 1 || assigned > count) throw new Error('Invalid assigned journey partition.');
  return assigned === index;
}
let ordinal = 0;
export function journeyTest(name, options, run) {
  if (inJourneyShard(ordinal++, process.env.SLATE_UI_SHARD ?? '1/1', name, assignments)) return nodeTest(name, options, run);
}
