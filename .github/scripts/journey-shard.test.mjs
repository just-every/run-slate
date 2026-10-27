import assert from 'node:assert/strict';
import test from 'node:test';
import { inJourneyShard } from '../../tests/qualification/ui-convergence/journey-shard.mjs';

test('named moves and new ordinal registrations each execute once', () => {
  const names = ['ordinary', 'moved', 'new registration'];
  const routes = { moved: 2, 'removed registration': 1 };
  for (const [ordinal, name] of names.entries()) {
    const selected = Array.from({ length: 3 }, (_, i) => inJourneyShard(ordinal, `${i + 1}/3`, name, routes));
    assert.equal(selected.filter(Boolean).length, 1);
    if (name === 'moved') assert.equal(selected[1], true);
    else assert.equal(selected[ordinal % 3], true);
  }
});
test('ordinary partitioning covers every registration across arbitrary widths', () => {
  for (let count = 1; count <= 7; count++) for (let ordinal = 0; ordinal < 23; ordinal++) {
    assert.equal(Array.from({ length: count }, (_, i) => inJourneyShard(ordinal, `${i + 1}/${count}`)).filter(Boolean).length, 1);
  }
});
test('malformed assignments fail closed instead of silently losing a journey', () => {
  for (const value of [0, -1, 4, 1.5, '2']) assert.throws(() => inJourneyShard(0, '1/3', 'moved', { moved: value }), /Invalid assigned/);
  for (const spec of ['0/3', '4/3', '1/0', 'invalid']) assert.throws(() => inJourneyShard(0, spec));
});
