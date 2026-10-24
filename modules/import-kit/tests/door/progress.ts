import assert from 'node:assert/strict';
import type { ImportJob } from '../../src/types.ts';

type Result = {status: number; body: any};

/** Bound journeys by durable work, independent of scheduling or batch size. */
export async function finishJob(action: 'apply' | 'undo', planId: string, call: () => Promise<Result>, effects?: (jobId: string) => Promise<number>) {
  let previous: ImportJob | undefined, limit = 0;
  for (let iteration = 1; ; iteration++) {
    const result = await call(), job = result.body.job as ImportJob;
    const context = `${action} plan ${planId}, request ${iteration}: ${JSON.stringify(result.body)}`;
    assert.equal(result.status,200,context);
    assert.ok(job && Number.isSafeInteger(job.total) && job.total >= 0 && Number.isSafeInteger(job.checkpoint) && job.checkpoint >= 0 && job.checkpoint <= job.total && Number.isSafeInteger(job.fence),context);
    if (!previous) {
      // Creation can return queued before its first apply; reversal has intent
      // and finalization work in addition to one step per provenance effect.
      const work = action === 'apply' ? job.total : await effects!(job.id);
      assert.ok(Number.isSafeInteger(work) && work >= 0,context);
      limit = work + 2;
    } else {
      assert.equal(job.id,previous.id,context);
      assert.equal(job.total,previous.total,context);
    }
    const complete = action === 'apply' ? job.state === 'completed' : ['undone','rolled_back'].includes(job.state);
    if (complete) return result;
    assert.ok((action === 'apply' ? ['queued','applying'] : ['undoing','rolling_back']).includes(job.state),context);
    if (previous) assert.ok(action === 'apply' ? job.checkpoint > previous.checkpoint : job.fence > previous.fence,`stalled ${context}`);
    assert.ok(iteration < limit,`iteration limit ${context}`);
    previous = job;
  }
}
