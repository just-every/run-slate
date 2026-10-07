import {env} from 'cloudflare:test';
import {beforeEach, test, expect} from 'vitest';
import {fixture, reset, document, definition} from '../authority/fixture';
import {createSkill} from '../../../src/core/features/skills/service';
import {freezeCases} from '../../../src/core/features/skills/cases';
import {evaluationStatus, completeEvaluation} from '../../../src/core/features/skills/evaluation-workflow';
import {evaluateSkill} from '../../../src/core/features/skills/evaluations';

beforeEach(reset);
async function legacy(restored: boolean) {
  const f = await fixture(), host = await document(f, 'Retained evaluation source'), ctx = f.context();
  const skill = await createSkill(ctx, {operationKey: crypto.randomUUID(), pageId: host.id, name: 'Retained evaluation', definition: {...definition(f, [host.ref]), audience: [f.owner]}});
  const expected = {name: 'Retained case', question: 'Use the retained source', requiredEvidenceIds: ['E1'], requiredStatements: [], forbiddenStatements: [], maximumOwnerSeconds: 60};
  const cases = await freezeCases(ctx, {operationKey: crypto.randomUUID(), revisionId: skill.value.revisionId, cutoff: ctx.now, refs: [host.ref], cases: [expected]});
  // Labelled historical execution input, never a provider/qualification result.
  const execution = {candidateRunId: 'historical-candidate', candidateOwnerSeconds: 4, ...(restored ? {recoveryPausedAt: ctx.now} : {})};
  await env.DB.prepare('UPDATE intelligence_evaluation_cases SET execution_json=? WHERE id=?').bind(JSON.stringify(execution), cases.value.id).run();
  const input = {operationKey: crypto.randomUUID(), revisionId: skill.value.revisionId, caseSetId: cases.value.id, cutoff: ctx.now, cases: [{name: expected.name, requiredEvidenceIds: expected.requiredEvidenceIds, requiredStatements: [], forbiddenStatements: [], maximumOwnerSeconds: 60, candidateRunId: 'historical-candidate', genericRunId: 'absent-generic', expertRunId: 'absent-expert', candidateOwnerSeconds: 4, genericOwnerSeconds: 5, expertOwnerSeconds: 6}]};
  const calls = (actor = f.owner) => [() => evaluationStatus(f.context(actor), cases.value.id), () => completeEvaluation(f.context(actor), cases.value.id), () => evaluateSkill(f.context(actor), input)];
  return {...f, host, execution, caseId: cases.value.id, calls};
}
async function unchanged(f: Awaited<ReturnType<typeof legacy>>) {
  expect(JSON.parse((await env.DB.prepare('SELECT execution_json FROM intelligence_evaluation_cases WHERE id=?').bind(f.caseId).first<string>('execution_json'))!)).toEqual(f.execution);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_runs').first<number>('n')).toBe(0);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_effects').first<number>('n')).toBe(0);
  expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_evaluations').first<number>('n')).toBe(0);
}
test('FLAG-004 SKILL-002 — restored legacy criteria cannot obscure the execution authority refusal', async () => {
  const f = await legacy(true);
  for (const call of f.calls()) await expect(call()).rejects.toMatchObject({status: 409, code: 'RESTORED_AUTHORITY_REQUIRED'});
  await unchanged(f);
});
test('SKILL-002 — non-restored historical execution still requires fresh immutable criteria', async () => {
  const f = await legacy(false);
  for (const call of f.calls()) await expect(call()).rejects.toMatchObject({status: 409, code: 'FRESH_EVALUATION_REQUIRED'});
  await unchanged(f);
});
test('BASE-ACCESS-002 FLAG-004 — missing and revoked actors cannot discover restored execution state', async () => {
  const f = await legacy(true);
  for (const call of f.calls('missing-member')) await expect(call()).rejects.toMatchObject({status: 401, code: 'UNAUTHENTICATED'});
  await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(f.owner).run();
  for (const call of f.calls()) await expect(call()).rejects.toMatchObject({status: 401, code: 'UNAUTHENTICATED'});
  await unchanged(f);
});
test('SKILL-001 FLAG-004 — page edit access cannot reveal a restored private skill definition', async () => {
  const f = await legacy(true);
  await env.DB.prepare("UPDATE page_grants SET level='edit' WHERE id=?").bind(f.host.grantId).run();
  for (const call of f.calls(f.reader)) await expect(call()).rejects.toMatchObject({status: 404, code: 'NOT_FOUND'});
  await unchanged(f);
});
