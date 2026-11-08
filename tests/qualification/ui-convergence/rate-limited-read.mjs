import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { call } from './two-people-support.mjs';

/** Exhaustive route sweeps share the member's real operator request budget. */
export async function rateLimitedRead(context, origin, route) {
  let result = await call(context, origin, 'GET', route);
  if (result.status === 429 && result.body?.code === 'RATE_LIMITED') {
    const seconds = Number(result.retryAfter);
    assert.ok(Number.isFinite(seconds) && seconds > 0, 'A throttled read must supply a positive Retry-After.');
    console.log(`Operator read ${route}: waiting for Retry-After ${result.retryAfter}s`);
    await delay(seconds * 1000);
    result = await call(context, origin, 'GET', route);
  }
  assert.equal(result.status, 200, `${route}: ${JSON.stringify(result.body).slice(0, 300)}`);
  return result.body;
}
