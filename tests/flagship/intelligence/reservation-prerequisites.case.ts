import {env} from 'cloudflare:test';
import {test, expect} from 'vitest';
import {fixture} from './measured-fixture';
import {startRun} from '../../../src/core/features/runs/service';

export async function reservationPrerequisitesCase() {
  const f = await fixture();
  await env.DB.prepare('UPDATE workspaces SET ai_monthly_budget_micros=110000 WHERE id=?').bind(f.workspaceId).run();
  const [first, second] = await Promise.all([
    startRun(f.context(), {...f.ask, operationKey: 'same-intent-first'}, {apiKey: 'test-only'}),
    startRun(f.context(), {...f.ask, operationKey: 'same-intent-second'}, {apiKey: 'test-only'}),
  ]);
  expect(first.value.id).toBe(second.value.id);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_runs WHERE workspace_id=?').bind(f.workspaceId).first<number>('n')).toBe(1);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_budgets WHERE run_id=? AND released_at IS NULL').bind(first.value.id).first<number>('n')).toBe(1);
}
