import assert from 'node:assert/strict';
import { api, browserUsesApiTransport, countUnroutedBrowserRequest } from './journey-api.mjs';

/**
 * The proposal matrix's native JSON requests use the same actor queue as its
 * independent snapshots. Dispatch each genuine request once; deliver its native
 * status and decoded JSON, including refusals. No product response is invented
 * and no failed request is retried. Documents and assets remain browser traffic.
 */
export async function routeJourneyApi(context, origin) {
  const pattern = origin + '/api/**', pending = new Set(), pages = new Map();
  // api() owns a separate request context. Respect this browser's intentional
  // network-loss fixture before any request enters that independent transport.
  let offline = false;
  const originalSetOffline = context.setOffline;
  const setOffline = async value => { offline = value; await originalSetOffline.call(context, value); };
  context.setOffline = setOffline;
  const dispatch = async route => {
    const request = route.request(), url = new URL(request.url());
    const input = request.postData();
    if (offline) return route.abort('internetdisconnected');
    // Binary doors retain the browser's exact bytes and download headers. They
    // still count against this actor; the large JSON matrices use api() below.
    if (/^\/api\/(files|exports|imports)(?:\/|$)/.test(url.pathname)
      || /(?:\/download|\/original|\/export|\.csv)$/.test(url.pathname)
      || (input !== null && !request.headers()['content-type']?.includes('application/json'))) {
      await countUnroutedBrowserRequest(context, origin, request);
      return route.continue();
    }
    const result = await api(context, origin, request.method(), url.pathname + url.search,
      input ? JSON.parse(input) : undefined, { headers: await request.allHeaders() });
    assert.ok(result.body === undefined || typeof result.body === 'object', 'The proposal journey uses native JSON API doors only');
    if (request.failure()) return;
    await route.fulfill({
      status: result.status,
      headers: { 'cache-control': 'no-store', ...(result.retryAfter === undefined ? {} : { 'retry-after': result.retryAfter }) },
      ...(result.body === undefined ? { body: '' } : { json: result.body }),
    });
  };
  const handler = route => {
    const work = dispatch(route);
    pending.add(work);
    work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  };
  // Keep timing fixtures and this transport in one page route chain. A context
  // route can otherwise be continued/handled by a page fixture independently.
  const install = page => {
    const ready = page.route(pattern, handler);
    pages.set(page, ready);
    return ready;
  };
  context.on('page', install);
  await Promise.all(context.pages().map(install));
  browserUsesApiTransport(context, true);
  return async () => {
    context.off('page', install);
    for (const [page, ready] of pages) {
      await ready;
      if (!page.isClosed()) await page.unroute(pattern, handler);
    }
    browserUsesApiTransport(context, false);
    if (context.setOffline === setOffline) context.setOffline = originalSetOffline;
    await Promise.all([...pending]);
  };
}
