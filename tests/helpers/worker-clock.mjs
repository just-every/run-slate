import path from 'node:path';

/** Test-only clock boundary; native handlers, storage and responses run unchanged. */
export function workerClock(main, Response) {
  let now = null;
  return {
    module: { type: 'ESModule', path: path.join(path.dirname(main), 'controlled-clock.mjs'), contents: `
      import worker from './${path.basename(main)}';
      export * from './${path.basename(main)}';
      const RealDate = Date;
      async function clock(env) {
        const now = await (await env.TEST_CLOCK.fetch('https://clock.test/')).json();
        globalThis.Date = now === null ? RealDate : class extends RealDate {
          constructor(...args) { super(...(args.length ? args : [now])); }
          static now() { return now; }
        };
      }
      export default {
        ...worker,
        async fetch(request, env, context) { await clock(env); return worker.fetch(request, env, context); },
        async scheduled(event, env, context) { await clock(env); return worker.scheduled(event, env, context); }
      };
    ` },
    service: () => new Response(JSON.stringify(now), { headers: { 'content-type': 'application/json' } }),
    set(value) {
      if (value !== null && !Number.isFinite(value)) throw Error('Clock requires an instant or null.');
      now = value;
    },
  };
}

export async function setWorkerClock(child, now) {
  const id = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); child.off('message', receive); error ? reject(error) : resolve(); };
    const timer = setTimeout(() => finish(Error('Worker clock control timed out')), 10000);
    const receive = message => { if (message?.type === 'fixture.clock.result' && message.id === id) finish(message.error ? Error(message.error) : undefined); };
    child.on('message', receive);
    child.send({ type: 'fixture.clock', id, now }, error => { if (error) finish(error); });
  });
}
