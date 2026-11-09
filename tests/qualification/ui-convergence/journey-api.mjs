import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JourneyRequestBudget } from './journey-request-budget.mjs';
import { request } from '@playwright/test';
import { requestTimeline } from './request-timeline.mjs';

const actors = new Map(), queues = new Map();

function queueFor(origin, ip) {
  const key = origin + '\n' + ip;
  if (!queues.has(key)) queues.set(key, { tail: Promise.resolve(), budget: new JourneyRequestBudget() });
  return queues.get(key);
}

/** Keep one person's native session on one synthetic documentation address. */
export function registerActor(origin, cookie, memberId) {
  actors.set(origin + '\n' + cookie.split('=')[1], address(memberId));
}

function address(identity) {
  const hex = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return '2001:db8:' + hex.match(/.{4}/g).join(':');
}

async function actor(context, origin, headers = {}) {
  const supplied = new Headers(headers).get('cookie');
  const cookie = supplied === null
    ? (await context.cookies(origin)).find(item => item.name === 'slate_session')?.value ?? 'anonymous'
    : supplied.match(/(?:^|;\s*)slate_session=([^;]*)/)?.[1] ?? 'anonymous';
  return actors.get(origin + '\n' + cookie) ?? address(cookie);
}

/** Native browser traffic and probes carry the same actor IP, including identity switches. */
export async function useActor(context, origin) {
  const ip = await actor(context, origin);
  await context.setExtraHTTPHeaders({ 'cf-connecting-ip': ip });
}

/** The extended matrix unmounts its owner; retain 100 requests of headroom even then. */
export async function idleActorBudget(context, origin) {
  assert.ok(context.pages().every(page => page.url() === 'about:blank'), 'The larger diagnostic budget requires an unmounted actor');
  const budget = queueFor(origin, await actor(context, origin)).budget;
  const previous = budget.refillEveryMs;
  budget.refillEveryMs = 150; // 100 burst + 400/minute = at most 500 probes.
  return () => { budget.refillEveryMs = previous; };
}

/**
 * One transport for journey probes, including call()/ok() and snapshot reads.
 * Serialize each actor's probes so snapshot fan-out is one. A burst of 100
 * plus five refills/second allows at most 400 probes in any rolling minute,
 * leaving 200 of the native 600 requests for that actor's browser work.
 * Light traffic is immediate; a spent budget waits before dispatch, never after
 * a 429. No response is retried and the product limiter is unchanged.
 */
export async function api(context, origin, method, route, data, options = {}) {
  await useActor(context, origin);
  const ip = await actor(context, origin, options.headers);
  const queue = queueFor(origin, ip);
  const run = queue.tail.then(async () => {
    // Own the transport: an idle pooled socket may have been closed by the
    // local proxy. Retain real cookies and dispose it after this one request.
    const transport = await request.newContext({ storageState: await context.storageState() });
    await queue.budget.reserve();
    const timeline = requestTimeline(context), observation = timeline.start(method, origin + route);
    try {
      const response = await transport.fetch(origin + route, {
        ...options, method,
        headers: { origin, 'content-type': 'application/json', ...Object.fromEntries(new Headers(options.headers)), 'cf-connecting-ip': ip },
        ...(data === undefined ? {} : { data: JSON.stringify(data) }), maxRetries: 0,
      });
      timeline.answered(observation, response.status());
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
      timeline.answered(observation, response.status(), body);
      const retryAfter = response.headers()['retry-after'];
      return { status: response.status(), body, ...(retryAfter === undefined ? {} : { retryAfter }) };
    } catch (cause) {
      if (observation.status === 'pending') timeline.failed(observation, cause);
      throw cause;
    } finally {
      await transport.dispose();
    }
  });
  // A refused or failed probe must not poison later independent assertions.
  queue.tail = run.then(() => {}, () => {});
  return run;
}
