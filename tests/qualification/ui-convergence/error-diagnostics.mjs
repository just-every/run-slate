/** Preserve only stable, nonsecret guard diagnostics beside the original response. */
export function apiErrorDiagnostics(body) {
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return {}; }
  }
  const details = body?.details;
  if (!details || typeof details !== 'object') return {};
  const diagnostic = {};
  if (['page_revision', 'revision_tuple', 'acl_epoch', 'membership'].includes(details.guard)) diagnostic.guard = details.guard;
  const compared = {};
  for (const field of ['expected', 'current']) {
    const value = details.compared?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) compared[field] = value;
  }
  if (Object.keys(compared).length) diagnostic.compared = compared;
  return diagnostic;
}

/** No query strings, hostnames, arbitrary route values, bodies or credentials. */
const routeWords = new Set(('api app auth health assets pages blocks revisions sharing inheritance workspace first-run session members containers navigation databases tasks assignees status requests queue inbox notifications activity publish publish-preview open people invitations accept presence locks comments synced archive permanent-delete verify search settings signin setup history').split(' '));
export function diagnosticPath(url) {
  const path = new URL(url, 'http://diagnostic.invalid').pathname;
  return path.split('/').map(part => {
    if (!part || routeWords.has(part)) return part;
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(part) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(part)) return `${part.slice(0, 6)}…${part.slice(-4)}`;
    return '<id>';
  }).join('/');
}

export function apiResponseDiagnostics(body) {
  return apiErrorDiagnostics(body);
}

export function transportFailure(error) {
  const code = String(error ?? '').match(/\bnet::ERR_[A-Z_]+\b/)?.[0];
  return code === 'net::ERR_ABORTED' ? 'aborted' : `failed: ${code ?? 'transport error'}`;
}
