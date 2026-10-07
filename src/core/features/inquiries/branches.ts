import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';

type Admission = { run_id: string | null; state: string | null; reason: string | null };

/** Admission and scientific findings are separate: an unavailable branch is not a falsified hypothesis. */
export async function admitInquiryBranch(
  ctx: FeatureContext,
  hypothesisId: string,
  parentRunId: string,
  start: () => Promise<{ value: { id: string } }>,
) {
  const read = () => ctx.db.prepare(
    'SELECT run_id,state,reason FROM intelligence_hypotheses WHERE id=?',
  ).bind(hypothesisId).first<Admission>();
  const result = (row: Admission) => row.run_id
    ? { hypothesisId, runId: row.run_id }
    : { hypothesisId, state: 'unavailable', reason: row.reason! };
  const existing = await read();
  if (!existing) throw new ApiProblem(404, 'NOT_FOUND', 'Hypothesis not found.');
  // Materialization replay retains its first admission outcome. A continuation is a new inquiry.
  if (existing.run_id || existing.state === 'unavailable') return result(existing);
  let runId: string | null = null;
  let reason: string | null = null;
  try {
    runId = (await start()).value.id;
  } catch (error) {
    reason = error instanceof ApiProblem ? error.code : 'BRANCH_FAILED';
  }
  // Persist failure outside the admission catch: a failed write must fail finalization visibly.
  await ctx.db.prepare(
    'UPDATE intelligence_hypotheses SET run_id=?,state=?,reason=?,parent_run_id=?,attempted_at=? WHERE id=? AND run_id IS NULL AND state IS NULL',
  ).bind(runId, runId ? 'admitted' : 'unavailable', reason, parentRunId, ctx.now, hypothesisId).run();
  return result((await read())!);
}
