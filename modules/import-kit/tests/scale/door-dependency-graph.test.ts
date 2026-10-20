import test from 'node:test';
import { dependencyGraph } from '../door/notion.ts';
import { largeSourceJourney } from '../door/large-source.ts';

// 3,000 synthetic pages, each depending on its parent and up to six earlier pages.
test('HTTP door plans, creates in bounded resumable steps, applies and undoes a 3,000-page dependency graph within D1 request limits', async t => {
  await largeSourceJourney(t, dependencyGraph(3000, 6, 2), 3000);
});
