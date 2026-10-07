import {env} from 'cloudflare:test';
import {test, expect} from 'vitest';
import {fixture} from './measured-fixture';
import {startRun} from '../../../src/core/features/runs/service';
import {chooseRoute} from '../../../src/core/features/ai/model-policy';
import {resolveEvidence} from '../../../src/core/features/ai/evidence';
import {maximumCost} from '../../../src/core/features/ai/provider';

test('AI-012 budget fixture admits one real conservative reservation but cannot fit two', async () => {
  const f = await fixture(), ctx = f.context();
  const {route} = await chooseRoute(ctx, f.ask.kind, true);
  const evidence = await resolveEvidence(ctx, f.refs, f.ask.audience);
  const first = maximumCost(route, f.ask.question, evidence, f.ask.maxOutputTokens);
  const second = maximumCost(route, 'Which support handoff remains incomplete?', evidence, f.ask.maxOutputTokens);
  expect(first).toBeLessThanOrEqual(110000);
  expect(second).toBeLessThanOrEqual(110000);
  expect(first + second).toBeGreaterThan(110000);
});
test('INQ-005 identical concurrent authorized intents retain one run and one reservation', async () => {
  const f = await fixture();
  await env.DB.prepare('UPDATE workspaces SET ai_monthly_budget_micros=110000 WHERE id=?').bind(f.workspaceId).run();
  const [first, second] = await Promise.all([
    startRun(f.context(), {...f.ask, operationKey: 'same-intent-first'}, {apiKey: 'test-only'}),
    startRun(f.context(), {...f.ask, operationKey: 'same-intent-second'}, {apiKey: 'test-only'}),
  ]);
  expect(first.value.id).toBe(second.value.id);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_runs WHERE workspace_id=?').bind(f.workspaceId).first<number>('n')).toBe(1);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_budgets WHERE run_id=? AND released_at IS NULL').bind(first.value.id).first<number>('n')).toBe(1);
});
