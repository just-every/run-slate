import { apiResponseDiagnostics, diagnosticPath, transportFailure } from './error-diagnostics.mjs';

const monitors = new WeakMap();
const now = () => performance.now();

/** Context-local ring: browser traffic and that person's native helper calls. */
export function requestTimeline(context) {
  if (monitors.has(context)) return monitors.get(context);
  const rows = [], requests = new WeakMap();
  let failure, failureAt, publication;
  const start = (method, url, page) => {
    const row = { method, path: diagnosticPath(url), start: now(), status: 'pending' };
    if (publication?.page === page && method === 'POST' && new URL(url, 'http://diagnostic.invalid').pathname === publication.path) publication.row = row;
    rows.push(row);
    if (rows.length > 40) rows.shift();
    return row;
  };
  const answered = (row, status, body) => {
    if (!row) return;
    row.status = status;
    row.end = now();
    Object.assign(row, apiResponseDiagnostics(body));
  };
  const failed = (row, error) => {
    if (!row) return;
    row.end = now();
    row.status = transportFailure(error);
  };
  const snapshot = (at = now()) => {
    const first = rows[0]?.start ?? at;
    return rows.map(({ method, path, start, end, status, guard, compared }) => ({
      method, path, startMs: Math.round(start - first), durationMs: Math.round((end ?? at) - start), status,
      ...(guard ? { guard } : {}), ...(compared ? { compared: { ...compared } } : {}),
    }));
  };
  context.on('request', request => {
    let page;
    try { page = request.frame().page(); } catch { /* Service-worker request has no frame. */ }
    requests.set(request, start(request.method(), request.url(), page));
  });
  context.on('response', response => {
    const row = requests.get(response.request());
    answered(row, response.status());
    // Only guard JSON carries ACL epochs in the current API. Successful
    // responses need no body read; never retain arbitrary response metadata.
    if (row && response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')
      && response.headers()['content-type']?.includes('application/json')) {
      void response.json().then(body => Object.assign(row, apiResponseDiagnostics(body)), () => {});
    }
  });
  context.on('requestfinished', request => {
    const row = requests.get(request);
    if (row) row.end = now();
  });
  context.on('requestfailed', request => failed(requests.get(request), request.failure()?.errorText));
  const monitor = {
    start, answered, failed, snapshot,
    get failure() { return failure; },
    get failureOffsetMs() { return failureAt === undefined ? undefined : Math.round(failureAt - (rows[0]?.start ?? failureAt)); },
    publication(page, path) {
      const observation = { page, path };
      publication = observation;
      return {
        async failed() {
          if (failure) return;
          const at = now();
          const row = observation.row;
          failureAt = at;
          // Freeze BEFORE the journey's finally restores workspace policy. The
          // outer dump also prints the live ring, exposing subsequent cleanup.
          failure = {
            waitingFor: { method: 'POST', path: diagnosticPath(path), sent: !!row,
              state: !row ? 'not sent' : typeof row.status === 'number' ? 'answered' : row.status,
              ...(row ? { status: row.status } : {}) },
            visibleDialogTitle: 'unavailable', failureOffsetMs: Math.round(at - (rows[0]?.start ?? at)), requests: snapshot(at),
          };
          const title = await page.locator('dialog[open]:visible').evaluateAll(dialogs => dialogs[0]?.getAttribute('aria-label') ?? null).catch(() => null);
          // This observation is scoped to the publication dialog, whose title
          // is static. Do not copy page titles, input values or arbitrary text.
          failure.visibleDialogTitle = title === 'Publish this revision' ? title : title ? '[other dialog]' : null;
        },
      };
    },
  };
  monitors.set(context, monitor);
  return monitor;
}

export function timelineContext(context) {
  const monitor = requestTimeline(context);
  return { ...(monitor.failure ? { atFailure: monitor.failure } : {}), failureOffsetMsAtDump: monitor.failureOffsetMs, requestsAtDump: monitor.snapshot() };
}
