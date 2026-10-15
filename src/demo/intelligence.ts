import type { FeatureContext } from '../core/app/feature-context';
import { commitOperation } from '../core/app/operations';
import { readPage } from '../core/features/pages/service';
import { recordRouteEvaluation } from '../core/features/ai/route-evaluation';
import { setModelPolicy } from '../core/features/ai/model-policy';
import { prepareAiEnableStatements } from '../core/features/workspace/settings';

/** Configure the isolated demo's grounded provider simulation through domain commands. */
export async function seedIntelligence(ctx: FeatureContext) {
  const page = await readPage(ctx, 'demo-launch');
  const tasks = ['answer', 'summary', 'difference', 'edit', 'investigation', 'procedure', 'routing'];
  const routes = [];
  for (const task of tasks) {
    const evaluation = await recordRouteEvaluation(ctx, {
      operationKey: `demo:model-evaluation:${task}`, provider: 'openai', model: 'slate-demo', task,
      cutoff: ctx.now, expiresAt: new Date(Date.parse(ctx.now) + 86400000).toISOString(), minimumFit: 1,
      cases: [{ caseId: `demo-${task}`, heldOut: true, observedAt: ctx.now, passed: true, costMicros: 0, elapsedMs: 0,
        receipt: 'demo-model-success', refs: [{ kind: 'page', sourceId: 'demo-launch', revisionId: page.page.revisionId }] }],
    });
    routes.push({ provider: 'openai' as const, model: 'slate-demo', role: 'frontier' as const,
      inputMicrosPerMillion: 1, outputMicrosPerMillion: 1, maxRunMicros: 10000, monthlyMicros: 1000000,
      tasks: [task], evaluationId: evaluation.value.id });
  }
  await setModelPolicy(ctx, { operationKey: 'demo:model-policy', policy: { routes, attentionBudget: 120 } });
  await commitOperation(ctx, { operationKey: 'demo:model-budget', action: 'ai.demo-budget', request: {},
    authorize: async () => { await prepareAiEnableStatements(ctx, true); },
    prepare: async ({revisionId}) => ({ entity: { id: ctx.actor.workspaceId, kind: 'workspace', revisionId },
      value: { enabled: true }, statements: [...await prepareAiEnableStatements(ctx, true),
        ctx.db.prepare('UPDATE workspaces SET ai_monthly_budget_micros=? WHERE id=?').bind(1000000, ctx.actor.workspaceId)] }),
  });
}
