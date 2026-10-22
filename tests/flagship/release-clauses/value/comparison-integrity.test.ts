import { env } from 'cloudflare:test';
import { afterEach, expect, test, vi } from 'vitest';
import { refreshSearchIndex } from '../../../../src/core/features/search/index';
import { resolveEvidence } from '../../../../src/core/features/ai/evidence';
import { setModelPolicy } from '../../../../src/core/features/ai/model-policy';
import { revokePreparedSourceGrant, prepareComparison } from './comparison-fixture';
import { assertBoundedAttemptAccounting, comparisonRuns, json, runOnce } from './attempt-accounting';

afterEach(() => vi.unstubAllGlobals());

test('FLAG-003 — frozen comparison pins equal source, question, audience and model limits before policy and index drift', async () => {
  const comparison = await prepareComparison();
  const { f, skill, refs, prepared } = comparison;
  const ctx = f.context();
  const rows = await comparisonRuns(prepared.candidateRunId!, prepared.genericRunId!);
  const frozen = await env.DB.prepare(`SELECT cutoff,cases_json,source_refs_json,created_at,execution_json
    FROM intelligence_evaluation_cases WHERE id=?`).bind(prepared.id).first<{
      cutoff: string;
      cases_json: string;
      source_refs_json: string;
      created_at: string;
      execution_json: string;
    }>();
  expect(frozen).not.toBeNull();
  expect(Number.isFinite(Date.parse(frozen!.cutoff))).toBe(true);

  const candidateInput = json(rows.candidate.input_json);
  const genericInput = json(rows.generic.input_json);
  const frozenRefs = JSON.parse(frozen!.source_refs_json) as unknown[];
  const caseRows = JSON.parse(frozen!.cases_json) as { question: string }[];
  expect(frozenRefs).toEqual(refs);
  expect(JSON.parse(rows.candidate.refs_json)).toEqual(frozenRefs);
  expect(JSON.parse(rows.generic.refs_json)).toEqual(frozenRefs);
  expect(JSON.parse(rows.candidate.audience_json)).toEqual([f.owner]);
  expect(rows.generic.audience_json).toBe(rows.candidate.audience_json);
  expect(candidateInput.question).toBe(caseRows[0]!.question);
  expect(genericInput.question).toBe(candidateInput.question);
  expect(candidateInput.maxOutputTokens).toBe(2048);
  expect(genericInput.maxOutputTokens).toBe(candidateInput.maxOutputTokens);
  expect(candidateInput.route).toEqual(genericInput.route);
  expect(rows.candidate.provider).toBe(rows.generic.provider);
  expect(rows.candidate.model).toBe(rows.generic.model);
  expect(rows.candidate.reserved_micros).toBeGreaterThan(0);
  expect(rows.generic.reserved_micros).toBeGreaterThan(0);
  expect(rows.candidate.reserved_micros).toBeLessThanOrEqual((candidateInput.route as { maxRunMicros: number }).maxRunMicros);
  expect(rows.generic.reserved_micros).toBeLessThanOrEqual((genericInput.route as { maxRunMicros: number }).maxRunMicros);
  expect(rows.candidate.skill_revision_id).toBe(skill.value.revisionId);
  expect(rows.generic.skill_revision_id).toBeNull();

  const skillVersion = await env.DB.prepare('SELECT definition_json FROM intelligence_skill_versions WHERE id=?')
    .bind(skill.value.revisionId).first<{ definition_json: string }>();
  const method = JSON.parse(skillVersion!.definition_json) as { tools: string[]; effects: unknown[] };
  expect(method.tools).toEqual(['read-evidence']);
  expect(method.effects).toEqual([]);

  const caseExecution = json(frozen!.execution_json);
  expect(caseExecution.candidateOwnerSeconds).toBeNull();
  expect(caseExecution.genericOwnerSeconds).toBeNull();
  expect(caseExecution.evaluationId).toBeUndefined();
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM intelligence_evaluations WHERE skill_revision_id=?')
    .bind(skill.value.revisionId).first<number>('count')).toBe(0);

  const exactPacket = await resolveEvidence(ctx, refs, [f.owner], { cutoff: frozen!.cutoff });
  await refreshSearchIndex(ctx);
  const poison = await env.DB.prepare(`UPDATE search_text
    SET text='Future success outcome label',text_fold='future success outcome label',
        title='Future success label',title_fold='future success label' WHERE page_id=?`)
    .bind(f.page.pageId).run();
  expect(poison.meta.changes).toBeGreaterThan(0);
  const poisonedText = await env.DB.prepare('SELECT text FROM search_text WHERE page_id=?')
    .bind(f.page.pageId).first<{ text: string }>();
  expect(poisonedText?.text).toContain('Future success outcome label');
  expect(await resolveEvidence(f.context(), refs, [f.owner], { cutoff: frozen!.cutoff })).toEqual(exactPacket);

  const policyRow = await env.DB.prepare('SELECT policy_json FROM intelligence_model_policy WHERE workspace_id=?')
    .bind(f.workspaceId).first<{ policy_json: string }>();
  const changedPolicy = JSON.parse(policyRow!.policy_json) as {
    attentionBudget: number;
    routes: { evaluationId: string; maxRunMicros: number }[];
  };
  const pinnedRoute = candidateInput.route as { evaluationId: string };
  const changedRoute = changedPolicy.routes.find(route => route.evaluationId === pinnedRoute.evaluationId);
  expect(changedRoute).toBeDefined();
  changedRoute!.maxRunMicros = 1;
  await setModelPolicy(f.context(), {
    operationKey: `${f.workspaceId}:u7-drift-model-ceiling`,
    policy: changedPolicy as Parameters<typeof setModelPolicy>[1]['policy'],
  });

  const fetchCalls = vi.fn(() => { throw new Error('A drifted comparison must refuse before provider transport.'); });
  vi.stubGlobal('fetch', fetchCalls);
  await runOnce(f.workspaceId, prepared.candidateRunId!);
  await runOnce(f.workspaceId, prepared.genericRunId!);
  const after = await comparisonRuns(prepared.candidateRunId!, prepared.genericRunId!);
  for (const run of [after.candidate, after.generic]) {
    expect(run.status).toBe('failed');
    expect(run.failure_reason).toBe('RUN_BUDGET_EXCEEDED');
    expect(run.output_json).toBeNull();
    expect(run.attempts).toBe(1);
  }
  expect(fetchCalls).not.toHaveBeenCalled();
  const stages = (await env.DB.prepare(`SELECT state,result_json FROM intelligence_stages
    WHERE run_id IN (?,?) ORDER BY run_id`).bind(prepared.candidateRunId, prepared.genericRunId).all<{
      state: string;
      result_json: string;
    }>()).results;
  expect(stages).toHaveLength(2);
  for (const stage of stages) {
    expect(stage.state).toBe('failed');
    expect(json(stage.result_json)).toMatchObject({ phase: 'admission', outcome: 'failed', errorCode: 'RUN_BUDGET_EXCEEDED' });
  }
});

test('FLAG-003 — current source grant revocation blocks both prepared runs before disclosure', async () => {
  const comparison = await prepareComparison(true);
  const { f, source, refs, prepared } = comparison;
  expect(source).not.toBeNull();
  const before = await resolveEvidence(f.context(), refs, [f.owner]);
  expect(before).toHaveLength(1);
  expect(before[0]!.text).toContain('The support handoff remains open.');

  await revokePreparedSourceGrant(f, source!);
  const grant = await env.DB.prepare('SELECT revoked_at FROM page_grants WHERE id=?')
    .bind(source!.ownerGrantId).first<{ revoked_at: string | null }>();
  expect(grant?.revoked_at).not.toBeNull();
  await expect(resolveEvidence(f.context(), refs, [f.owner])).rejects.toMatchObject({ status: 404 });

  const fetchCalls = vi.fn(() => { throw new Error('Revoked-source runs must stop before provider transport.'); });
  vi.stubGlobal('fetch', fetchCalls);
  await runOnce(f.workspaceId, prepared.candidateRunId!);
  await runOnce(f.workspaceId, prepared.genericRunId!);
  const after = await comparisonRuns(prepared.candidateRunId!, prepared.genericRunId!);
  for (const run of [after.candidate, after.generic]) {
    expect(run.status).toBe('failed');
    expect(run.failure_reason).toBe('NOT_FOUND');
    expect(run.output_json).toBeNull();
    expect(run.attempts).toBe(1);
  }
  expect(fetchCalls).not.toHaveBeenCalled();
  const stages = (await env.DB.prepare(`SELECT state,result_json FROM intelligence_stages
    WHERE run_id IN (?,?) ORDER BY run_id`).bind(prepared.candidateRunId, prepared.genericRunId).all<{
      state: string;
      result_json: string;
    }>()).results;
  expect(stages).toHaveLength(2);
  for (const stage of stages) {
    expect(stage.state).toBe('failed');
    expect(json(stage.result_json)).toMatchObject({ phase: 'admission', outcome: 'failed', errorCode: 'NOT_FOUND' });
  }
});

test('FLAG-003 — both comparison arms retain failed and successful attempt timing and cost status',async()=>{
 for(const arm of ['candidate','generic'] as const)await assertBoundedAttemptAccounting(arm);
});
