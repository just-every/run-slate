import test from 'node:test';
import { notionExport } from './door/notion.ts';
import { doorPlanCap } from './door/plan-cap.ts';
import { largeSourceJourney } from './door/large-source.ts';

// Slate's real Notion export is 6.6 MB; this one is synthetic and generated here.
test('HTTP door plans, creates in bounded resumable steps, applies and undoes a 6.6 MB Notion export within D1 request limits', async t => {
  await largeSourceJourney(t, notionExport(6.6 * 1024 * 1024), 1000);
  await doorPlanCap(t);
});
