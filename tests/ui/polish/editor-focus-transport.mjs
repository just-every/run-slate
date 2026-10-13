import assert from 'node:assert/strict';

/** Hold one genuine Worker response until the journey has exercised the pending UI. */
export async function withHeldResponse(page, pathname, method, run, { disconnect = false } = {}) {
  const arrived = Promise.withResolvers(), release = Promise.withResolvers(), finished = Promise.withResolvers();
  let taken = false;
  const matches = url => url.pathname === pathname;
  const handler = async route => {
    if (taken || route.request().method() !== method) return route.continue();
    taken = true;
    try {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      arrived.resolve(await response.json());
      await release.promise;
      if (disconnect) await route.abort('failed');
      else await route.fulfill({ response });
      finished.resolve();
    } catch (cause) {
      arrived.reject(cause);
      finished.reject(cause);
    }
  };
  // A failure before the journey reaches either barrier is still collected below.
  arrived.promise.catch(() => {});
  finished.promise.catch(() => {});
  await page.route(matches, handler);
  try {
    await run({ arrived: arrived.promise, release: () => release.resolve(), finished: finished.promise });
  } finally {
    release.resolve();
    if (taken) await finished.promise;
    await page.unroute(matches, handler);
  }
}

/** Pause polling transport so a failed mutation settles before the saved document arrives. */
export async function withPausedCollaboration(page, pageId, run) {
  const release = Promise.withResolvers();
  const matches = url => url.pathname === `/api/collaboration/${pageId}`;
  const handler = async route => { await release.promise; await route.continue(); };
  await page.route(matches, handler);
  try { await run(() => release.resolve()); }
  finally {
    release.resolve();
    await page.unroute(matches, handler);
  }
}
