import { env } from 'cloudflare:test';
import { expect, vi } from 'vitest';
import { answer, providerResponse } from '../../../qualification/inquiry/fixture';
import type { AppBindings } from '../../../../src/core/app/types';
import { consumeIntelligenceJob } from '../../../../src/core/features/runs/worker';
import { prepareComparison } from './comparison-fixture';

type RunRecord = {
  id: string;
  status: string;
  failure_reason: string | null;
  input_json: string;
  refs_json: string;
  audience_json: string;
  skill_revision_id: string | null;
  provider: string;
  model: string;
  reserved_micros: number;
  cost_micros: number;
  uncertain_cost_micros: number;
  tokens: number;
  attempts: number;
  output_json: string | null;
};

export function json(value: string) {
  return JSON.parse(value) as Record<string, unknown>;
}

export async function comparisonRuns(candidateRunId: string, genericRunId: string) {
  const rows = (await env.DB.prepare('SELECT * FROM intelligence_runs WHERE id IN (?,?)')
    .bind(candidateRunId, genericRunId).all<RunRecord>()).results;
  const candidate = rows.find(row => row.id === candidateRunId);
  const generic = rows.find(row => row.id === genericRunId);
  if (!candidate || !generic) throw new Error('Both persisted evaluation runs must exist.');
  return { candidate, generic };
}

export async function runOnce(workspaceId: string, runId: string) {
  return consumeIntelligenceJob(
    { ...env, AI_API_KEY: 'TEST-ONLY-NO-SEND' } as AppBindings,
    { kind: 'intelligence.run', workspaceId, runId },
  );
}

export async function assertBoundedAttemptAccounting(peer: 'candidate' | 'generic') {
  const comparison = await prepareComparison();
  const { f, refs, prepared } = comparison;
  const frozen = await env.DB.prepare('SELECT cutoff FROM intelligence_evaluation_cases WHERE id=?')
    .bind(prepared.id).first<{ cutoff: string }>();
  const initial = await comparisonRuns(prepared.candidateRunId!, prepared.genericRunId!);
  const targetRunId = peer === 'candidate' ? prepared.candidateRunId! : prepared.genericRunId!;
  const target = initial[peer];
  const other = initial[peer === 'candidate' ? 'generic' : 'candidate'];
  const targetInput = json(target.input_json) as {
    question: string;
    maxOutputTokens: number;
    route: { model: string; inputMicrosPerMillion: number; outputMicrosPerMillion: number; accountingUnit?: string };
  };
  const otherInput = json(other.input_json) as typeof targetInput;
  expect(targetInput.question).toBe(otherInput.question);
  expect(JSON.parse(target.refs_json)).toEqual(JSON.parse(other.refs_json));
  expect(target.audience_json).toBe(other.audience_json);
  expect(targetInput.maxOutputTokens).toBe(otherInput.maxOutputTokens);
  expect(targetInput.route).toEqual(otherInput.route);
  const records: {
    startedAt: string;
    endedAt: string;
    status: number;
    providerQuestion: string;
    evidence: unknown[];
    model: string;
    outputLimit: number;
    authorization: string | null;
  }[] = [];
  const unmatched: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== 'https://api.openai.com/v1/responses' || init?.method !== 'POST') {
      unmatched.push(`${init?.method ?? 'GET'} ${url}`);
      throw new Error('Unmatched provider request in U7 controlled transport.');
    }
    const request = JSON.parse(String(init.body)) as {
      model: string;
      max_output_tokens: number;
      input: string;
    };
    const prompt = JSON.parse(request.input) as { question: string; evidence: unknown[] };
    if (!prompt.question.startsWith(targetInput.question)) {
      throw new Error('A comparison transport did not carry its frozen question.');
    }
    const startedAt = new Date().toISOString();
    const ordinal = records.length;
    const status = ordinal < 2 ? 503 : 200;
    const endedAt = new Date().toISOString();
    records.push({
      startedAt,
      endedAt,
      status,
      providerQuestion: prompt.question,
      evidence: prompt.evidence,
      model: request.model,
      outputLimit: request.max_output_tokens,
      authorization: new Headers(init.headers).get('authorization'),
    });
    return status === 200
      ? providerResponse(answer)
      : new Response('controlled transient provider response', { status });
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    await env.DB.prepare('UPDATE intelligence_runs SET next_at=NULL WHERE id=?').bind(targetRunId).run();
    await runOnce(f.workspaceId, targetRunId);
  }
  expect(unmatched).toEqual([]);
  expect(records).toHaveLength(3);

  const after = await comparisonRuns(prepared.candidateRunId!, prepared.genericRunId!);
  const run = after[peer];
  expect(run.status).toBe('completed');
  expect(run.attempts).toBe(3);
  expect(records.map(record => record.status)).toEqual([503, 503, 200]);
  expect(records.every(record => record.model === targetInput.route.model)).toBe(true);
  expect(records.every(record => record.outputLimit === targetInput.maxOutputTokens)).toBe(true);
  expect(records.every(record => record.authorization === 'Bearer TEST-ONLY-NO-SEND')).toBe(true);
  expect(records.every(record => record.evidence.length === refs.length)).toBe(true);
  expect(records.every(record => record.providerQuestion.startsWith(targetInput.question))).toBe(true);

  const stages = (await env.DB.prepare(`SELECT id,state,started_at,completed_at,result_json
    FROM intelligence_stages WHERE run_id=? AND stage='generation'
    ORDER BY json_extract(result_json,'$.ordinal')`).bind(targetRunId).all<{
      id: string;
      state: string;
      started_at: string;
      completed_at: string | null;
      result_json: string;
    }>()).results;
  expect(stages).toHaveLength(3);
  expect(stages.map(stage => stage.state)).toEqual(['failed', 'failed', 'completed']);
  const reservation = run.reserved_micros;
  const uncertainPerFailure = Math.ceil(reservation / 3);
  const successCost = Math.ceil((10 * targetInput.route.inputMicrosPerMillion + 10 * targetInput.route.outputMicrosPerMillion) / 1_000_000);
  for (const [index, stage] of stages.entries()) {
    const actual = records[index]!;
    const result = json(stage.result_json) as {
      attemptId: string;
      ordinal: number;
      phase: string;
      dispatchStartedAt: string | null;
      providerEndedAt: string | null;
      outcome: string;
      errorCode: string | null;
      retryScheduled: boolean;
      nextEligibleAt: string | null;
      accountingUnit: string;
      knownCost: number | null;
      knownTokens: number | null;
      uncertainUpperBound: number;
      providerReceipt: string | null;
    };
    expect(Number.isFinite(Date.parse(stage.started_at))).toBe(true);
    expect(Number.isFinite(Date.parse(stage.completed_at ?? ''))).toBe(true);
    expect(Date.parse(stage.completed_at!) - Date.parse(stage.started_at)).toBeGreaterThanOrEqual(0);
    expect(result.attemptId).toBe(stage.id);
    expect(result.ordinal).toBe(index + 1);
    expect(result.phase).toBe('dispatched');
    expect(result.dispatchStartedAt).not.toBeNull();
    expect(result.providerEndedAt).not.toBeNull();
    expect(Date.parse(result.dispatchStartedAt!)).toBeLessThanOrEqual(Date.parse(actual.startedAt));
    expect(Date.parse(result.providerEndedAt!)).toBeGreaterThanOrEqual(Date.parse(actual.endedAt));
    expect(Date.parse(stage.completed_at!)).toBeGreaterThanOrEqual(Date.parse(result.providerEndedAt!));
    expect(result.accountingUnit).toBe(targetInput.route.accountingUnit ?? 'usd-micros');
    expect(result.outcome).toBe(actual.status === 200 ? 'completed' : 'failed');
    expect(result.retryScheduled).toBe(actual.status !== 200);
    expect(result.nextEligibleAt === null).toBe(actual.status === 200);
    if (actual.status === 503) {
      expect(result.errorCode).toBe('Provider HTTP 503.');
      expect(result.knownCost).toBeNull();
      expect(result.knownTokens).toBeNull();
      expect(result.uncertainUpperBound).toBe(uncertainPerFailure);
      expect(result.providerReceipt).toBeNull();
    } else {
      expect(result.errorCode).toBeNull();
      expect(result.knownCost).toBe(successCost);
      expect(result.knownTokens).toBe(20);
      expect(result.uncertainUpperBound).toBe(0);
      expect(result.providerReceipt).toBe('test-only-provider-receipt');
    }
  }

  expect(run.cost_micros).toBe(successCost);
  expect(run.tokens).toBe(20);
  expect(run.uncertain_cost_micros).toBe(2 * uncertainPerFailure);
  const budget = await env.DB.prepare(`SELECT reserved_micros,charged_micros,uncertain_micros,released_at
    FROM intelligence_budgets WHERE run_id=?`).bind(targetRunId).first<{
      reserved_micros: number;
      charged_micros: number;
      uncertain_micros: number;
      released_at: string | null;
    }>();
  expect(budget).toMatchObject({
    reserved_micros: reservation,
    charged_micros: successCost,
    uncertain_micros: 2 * uncertainPerFailure,
  });
  expect(budget?.released_at).not.toBeNull();

  const executionRow = await env.DB.prepare('SELECT execution_json FROM intelligence_evaluation_cases WHERE id=?')
    .bind(prepared.id).first<{ execution_json: string }>();
  const execution = json(executionRow!.execution_json);
  expect(execution.candidateOwnerSeconds).toBeNull();
  expect(execution.genericOwnerSeconds).toBeNull();
  expect(execution.expertRunId).toBeNull();
  expect(execution.evaluationId).toBeUndefined();
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM intelligence_evaluations WHERE skill_revision_id=?')
    .bind(after.candidate.skill_revision_id).first<number>('count')).toBe(0);
  expect(frozen).not.toBeNull();
  const retainedNativeRows = JSON.stringify({
    run: {
      id: run.id,
      status: run.status,
      failure_reason: run.failure_reason,
      attempts: run.attempts,
      reserved_micros: run.reserved_micros,
      cost_micros: run.cost_micros,
      uncertain_cost_micros: run.uncertain_cost_micros,
      tokens: run.tokens,
    },
    stages: stages.map(stage => ({
      id: stage.id,
      state: stage.state,
      started_at: stage.started_at,
      completed_at: stage.completed_at,
      result: json(stage.result_json),
    })),
    budget,
  });
  expect(run.failure_reason,
    `A successful retry must clear any obsolete failure reason; completed-run durable rows: ${retainedNativeRows}`)
    .toBeNull();
}
