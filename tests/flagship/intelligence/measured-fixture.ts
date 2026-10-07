// Controlled test-only route prerequisites, never live model-quality evidence.
// The original fixture remains unmeasured for refusal tests.
import {fixture as base} from './fixture';
import {recordRouteEvaluation} from '../../../src/core/features/ai/route-evaluation';
import {setModelPolicy} from '../../../src/core/features/ai/model-policy';
export async function fixture() {
  const f = await base();
  const routes = [];
  for (const task of ['answer', 'summary', 'investigation', 'procedure']) {
    const ctx = f.context();
    const evaluation = await recordRouteEvaluation(ctx, {
      operationKey: `mechanics-route-${task}`, provider: 'openai', model: 'test-fixture-model', task,
      cutoff: '2020-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', minimumFit: 1,
      cases: [{caseId: `controlled-${task}`, heldOut: true, observedAt: ctx.now,
        passed: true, costMicros: 100, elapsedMs: 1,
        receipt: 'controlled-protocol-only-no-provider-measurement', refs: f.refs}],
    });
    routes.push({provider: 'openai' as const, model: 'test-fixture-model', role: 'frontier' as const,
      inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 1000000,
      maxRunMicros: 1000000, monthlyMicros: 1000000, tasks: [task], evaluationId: evaluation.value.id});
  }
  await setModelPolicy(f.context(), {operationKey: 'mechanics-qualified-policy', policy: {attentionBudget: 100, routes}});
  return f;
}
